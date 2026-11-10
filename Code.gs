/**
 * Hệ thống điểm danh nhân viên bằng QR + selfie nâng cấp hệ thống Admin Dashboard
 * Công Ty Cổ Phần Liwayway VN
 */

var TZ = 'Asia/Ho_Chi_Minh';
var SHEET_LOG = 'ChamCong';        // Sheet chấm công, mỗi ca một dòng
var SHEET_STAFF = 'NhanVien';      // Sheet danh sách nhân viên
var FOLDER_NAME = 'DiemDanh_Anh';  // Thư mục Drive chứa ảnh selfie
var SPREADSHEET_ID = '';           // Dán ID Google Sheet vào đây (đoạn giữa /d/ và /edit trong URL). Để trống = dùng sheet gắn với script.

// Mở Google Sheet theo ID; không có ID thì dùng sheet đang gắn với script.
function getSS_() {
  var id = SPREADSHEET_ID || PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(String(id).trim());
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error('Chưa cấu hình SPREADSHEET_ID trong Code.gs.');
  return active;
}
var STALE_SECONDS = 180;           // Ảnh chụp cũ hơn mức này bị gắn cờ
var MIN_GAP_SECONDS = 60;          // Chặn bấm gửi trùng trong khoảng này
var MAX_SHIFT_HOURS = 16;          // Ca dài tối đa
var BREAK_MINUTES = 0;             // Phút nghỉ trừ khỏi mỗi ca
var SHIFT_START_TIME = '08:00';

// Chỉ số cột cấu hình (Bắt đầu từ 1)
var C = { DATE:1, CODE:2, NAME:3, IN:4, OUT:5, HOURS:6, PHOTO_IN:7, PHOTO_OUT:8, WARN:9, DEV_IN:10, DEV_OUT:11, LAT:12, LNG:13, ACCURACY:14, DISTANCE:15, LAT_IN:16, LNG_IN:17, ACC_IN:18, DIST_IN:19, LAT_OUT:20, LNG_OUT:21, ACC_OUT:22, DIST_OUT:23 };
var HEADERS = ['Ngày','Mã NV','Họ tên','Giờ vào','Giờ ra','Số giờ','Ảnh vào','Ảnh ra','Cảnh báo','Thiết bị vào','Thiết bị ra','Vĩ độ gần nhất','Kinh độ gần nhất','Sai số GPS gần nhất (m)','Khoảng cách gần nhất (m)','Vĩ độ vào','Kinh độ vào','Sai số GPS vào (m)','Khoảng cách vào (m)','Vĩ độ ra','Kinh độ ra','Sai số GPS ra (m)','Khoảng cách ra (m)'];

// Cấu hình tài khoản đăng nhập Admin Dashboard
const ADMIN_CONFIG = {
  username: "admin",
  password: "Admin123" // Hãy chủ động thay đổi mật khẩu an toàn hơn tại đây
};

/**
 * Backend API cho GitHub Pages.
 */
function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = String(p.action || '');
  var callback = String(p.callback || 'callback').replace(/[^\w.$]/g, '');
  var result;
  try {
    if (action === 'getName') result = getName(p.code);
    else if (action === 'getPublicConfig') result = getPublicConfig();
    else if (action === 'health') result = {ok:true, service:'attendance-api'};
    else result = {success:false, message:'API action không hợp lệ.'};
  } catch (err) { result = {success:false, message:String(err)}; }
  return ContentService.createTextOutput(callback + '(' + JSON.stringify(result) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function doPost(e) {
  var payload = {};
  var nonce = "";
  try {
    // Xử lý đọc dữ liệu linh hoạt (Hỗ trợ cả Form POST thông thường và RAW JSON POST)
    var rawPayload = "";
    if (e && e.parameter && e.parameter.payload) {
      rawPayload = e.parameter.payload;
    } else if (e && e.postData && e.postData.contents) {
      // Trường hợp dữ liệu đẩy thẳng qua body text
      if (e.postData.contents.indexOf("payload=") === 0) {
        rawPayload = decodeURIComponent(e.postData.contents.substring(8));
      } else {
        rawPayload = e.postData.contents;
      }
    }
    
    payload = JSON.parse(rawPayload || '{}');
    nonce = String(payload.nonce || '');
    
    var action = String(payload.action || '');
    var d = payload.data || {};
    var result;
    
    // Điều hướng các Action
    if (action === 'checkAdminLogin') result = checkAdminLogin(d.username, d.password);
    else if (action === 'logoutAdmin') result = logoutAdmin(d.token);
    else if (action === 'getAdminDashboardData') result = getAdminDashboardData(d.token, d.date);
    else if (action === 'submitCheckin') result = submitCheckin(d);
    else if (action === 'getName') result = getName(d.code);
    else if (action === 'getPhoto') result = getPhoto(d.token, d.fileId);
    else if (action === 'getThumbs') result = getThumbs(d.token, d.ids);
    else if (action === 'cancelAttendance') result = cancelAttendance(d);
    else if (action === 'saveGeofence') result = saveGeofence(d.token, d.lat, d.lng, d.radius);
    else result = {success:false, ok:false, message:'API action không hợp lệ.'};
    
    // Trả về HTML chứa script postMessage an toàn
    var htmlContent = '<!doctype html><meta charset="utf-8"><body>' +
      '<script>' +
      '  var responseData = { type: "DD_API_RESULT", nonce: ' + JSON.stringify(nonce) + ', result: ' + JSON.stringify(result).replace(/</g, '\\u003c') + ' };' +
      '  try { window.top.postMessage(responseData, "*"); } catch (e) {}' +
      '  try { window.parent.postMessage(responseData, "*"); } catch (e) {}' +
      '<\/script></body>';
      
    return HtmlService.createHtmlOutput(htmlContent)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
      
  } catch (err) {
    var errorResult = { success: false, ok: false, message: 'Lỗi hệ thống: ' + err.toString() };
    var errorHtml = '<!doctype html><meta charset="utf-8"><body>' +
      '<script>' +
      '  var m = { type: "DD_API_RESULT", nonce: ' + JSON.stringify(nonce) + ', result: ' + JSON.stringify(errorResult).replace(/</g, '\\u003c') + ' };' +
      '  try { window.top.postMessage(m, "*"); } catch (e) {}' +
      '  try { window.parent.postMessage(m, "*"); } catch (e) {}' +
      '<\/script></body>';
      
    return HtmlService.createHtmlOutput(errorHtml)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}


function getAdminCredentials_() {
  var props = PropertiesService.getScriptProperties();
  return {
    username: props.getProperty('ADMIN_USERNAME') || ADMIN_CONFIG.username,
    password: props.getProperty('ADMIN_PASSWORD') || ADMIN_CONFIG.password
  };
}

function checkAdminLogin(username, password) {
  var credentials = getAdminCredentials_();
  if (String(username || '').trim() === credentials.username &&
      String(password || '') === credentials.password) {
    var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
    CacheService.getScriptCache().put('admin:' + token, '1', 21600);
    return { success: true, token: token };
  }
  Utilities.sleep(500);
  return { success: false, message: 'Sai tài khoản hoặc mật khẩu!' };
}

function isAdminTokenValid_(token) {
  return !!token && CacheService.getScriptCache().get('admin:' + String(token)) === '1';
}

function logoutAdmin(token) {
  if (token) CacheService.getScriptCache().remove('admin:' + String(token));
  return { success: true };
}

function getAdminDashboardData(token, targetDateStr) {
  if (!isAdminTokenValid_(token)) return { success: false, message: "Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại." };
  try {
    const sheetDD = getLogSheet_(); 
    const sheetNV = getStaffSheet_();
    
    let filterDateStr = targetDateStr;
    if (!filterDateStr) {
      filterDateStr = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
    }
    
    let allEmployees = {};
    if (sheetNV) {
      let lastRowNV = sheetNV.getLastRow();
      if (lastRowNV >= 2) {
        const cols = staffColumns_(sheetNV);
        let nvData = sheetNV.getRange(2, 1, lastRowNV - 1, Math.max(sheetNV.getLastColumn(), 5)).getValues();
        const cell = (r, i) => String(r[i] === undefined || r[i] === null ? '' : r[i]).trim();
        nvData.forEach(r => {
          let code = cell(r, cols.code).toUpperCase();
          if (code) {
            allEmployees[code] = {
              id: code,
              name: cell(r, cols.name),
              phongban: cell(r, cols.phongban),
              bophan: cell(r, cols.bophan),
              chucvu: cell(r, cols.chucvu)
            };
          }
        });
      }
    }
    
    let records = [];
    let checkedInCodes = new Set();
    let countIn = 0;
    let countOut = 0;
    let countWarn = 0;
    let countLate = 0; 
    
    if (sheetDD) {
      let lastRowDD = sheetDD.getLastRow();
      if (lastRowDD >= 2) {
        let ddRange = sheetDD.getRange(2, 1, lastRowDD - 1, HEADERS.length);
        let ddData = ddRange.getValues();
        let ddFormulas = ddRange.getFormulas();
        ddData.forEach((row, ddIndex) => {
          let rowDateObj = row[C.DATE - 1];
          if (!rowDateObj) return;
          
          let formattedRowDate = "";
          if (rowDateObj instanceof Date && !isNaN(rowDateObj.getTime())) {
            formattedRowDate = Utilities.formatDate(rowDateObj, TZ, "yyyy-MM-dd");
          } else {
            let parts = String(rowDateObj).split('/');
            if (parts.length === 3) {
              formattedRowDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
          }
          
          if (formattedRowDate === filterDateStr) {
            let code = String(row[C.CODE - 1]).toUpperCase().trim();
            if (!code) return;
            
            checkedInCodes.add(code);
            
            let timeInStr = "--:--";
            let timeOutStr = "--:--";
            
            if (row[C.IN - 1] instanceof Date && !isNaN(row[C.IN - 1].getTime())) {
              timeInStr = Utilities.formatDate(row[C.IN - 1], TZ, "HH:mm");
              countIn++;
            }
            if (row[C.OUT - 1] instanceof Date && !isNaN(row[C.OUT - 1].getTime())) {
              timeOutStr = Utilities.formatDate(row[C.OUT - 1], TZ, "HH:mm");
              countOut++;
            }
            
            let photoInUrl = driveImageUrl_(ddFormulas[ddIndex][C.PHOTO_IN - 1] || row[C.PHOTO_IN - 1]);
            let photoOutUrl = driveImageUrl_(ddFormulas[ddIndex][C.PHOTO_OUT - 1] || row[C.PHOTO_OUT - 1]);
            
            let warningText = String(row[C.WARN - 1] || "").trim();
            let status = "Đúng giờ";
            
            if (row[C.IN - 1] instanceof Date && !isNaN(row[C.IN - 1].getTime())) {
              var timeParts = Utilities.formatDate(row[C.IN - 1], TZ, "HH:mm").split(':');
              var actualMinutes = Number(timeParts[0]) * 60 + Number(timeParts[1]);
              var shiftParts = SHIFT_START_TIME.split(':');
              var shiftMinutes = Number(shiftParts[0]) * 60 + Number(shiftParts[1]);
              if (actualMinutes > shiftMinutes) { status = "Đi trễ"; countLate++; }
            } else { status = "Thiếu giờ vào"; }
            
            if (row[C.OUT - 1] instanceof Date && !isNaN(row[C.OUT - 1].getTime())) {
              status += " · Đã ra ca";
            } else if (row[C.IN - 1] instanceof Date && !isNaN(row[C.IN - 1].getTime())) {
              status += " · Đang trong ca";
            }
            if (warningText) {
              countWarn++;
              status += " (Có cảnh báo)";
            }
            
            records.push({
              row: ddIndex + 2,
              id: code,
              name: row[C.NAME - 1] || (allEmployees[code] ? allEmployees[code].name : ""),
              dept: allEmployees[code] ? allEmployees[code].phongban : "Nhân sự ngoài danh sách",
              bophan: allEmployees[code] ? allEmployees[code].bophan : "",
              chucvu: allEmployees[code] ? allEmployees[code].chucvu : "",
              date: formattedRowDate,
              timeIn: timeInStr,
              timeOut: timeOutStr,
              hours: row[C.HOURS - 1] ? Number(row[C.HOURS - 1]).toFixed(2) : "0.00",
              photoIn: photoInUrl,
              photoOut: photoOutUrl,
              photoInId: driveFileId_(ddFormulas[ddIndex][C.PHOTO_IN - 1] || row[C.PHOTO_IN - 1]),
              photoOutId: driveFileId_(ddFormulas[ddIndex][C.PHOTO_OUT - 1] || row[C.PHOTO_OUT - 1]),
              warning: warningText,
              lat: row[C.LAT-1] || null, lng: row[C.LNG-1] || null, accuracy: row[C.ACCURACY-1] || null, distance: row[C.DISTANCE-1] || null,
              latIn:row[C.LAT_IN-1]||row[C.LAT-1]||null,lngIn:row[C.LNG_IN-1]||row[C.LNG-1]||null,accuracyIn:row[C.ACC_IN-1]||row[C.ACCURACY-1]||null,distanceIn:row[C.DIST_IN-1]||row[C.DISTANCE-1]||null,
              latOut:row[C.LAT_OUT-1]||null,lngOut:row[C.LNG_OUT-1]||null,accuracyOut:row[C.ACC_OUT-1]||null,distanceOut:row[C.DIST_OUT-1]||null,
              status: status
            });
          }
        });
      }
    }
    
    let totalStaff = Object.keys(allEmployees).length;
    let absentCount = 0;
    
    Object.keys(allEmployees).forEach(code => {
      if (!checkedInCodes.has(code)) {
        absentCount++;
        records.push({
          id: code,
          name: allEmployees[code].name,
          dept: allEmployees[code].phongban,
          bophan: allEmployees[code].bophan,
          chucvu: allEmployees[code].chucvu,
          date: filterDateStr,
          timeIn: "--:--",
          timeOut: "--:--",
          hours: "0.00",
          photoIn: "",
          photoOut: "",
          warning: "",
          status: "Vắng mặt"
        });
      }
    });
    
    return {
      success: true,
      summary: {
        totalEmployees: totalStaff || checkedInCodes.size,
        totalCheckedIn: checkedInCodes.size,
        totalInCa: Math.max(0, countIn - countOut),
        totalLate: countLate,
        totalAbsent: absentCount,
        totalWarning: countWarn
      },
      detailRecords: records
    };
  } catch (error) {
return { success: false, message: error.toString() };
}
}
function parseDriveUrl_(cellValue) {
  var value = String(cellValue || '').trim();
  if (!value) return '';

  // Hỗ trợ công thức =HYPERLINK("URL", "nhãn") trong Google Sheets.
  if (value.charAt(0) === '=' || /HYPERLINK/i.test(value)) {
    var match = value.match(/HYPERLINK\s*\(\s*"([^"]+)"/i);
    if (match && match[1]) return match[1];
  }
  return /^https?:\/\//i.test(value) ? value : '';
}

function driveFileId_(cellValue) {
  var url = parseDriveUrl_(cellValue);
  if (!url) return '';
  var match = url.match(/(?:[?&]id=|\/d\/|\/file\/d\/)([A-Za-z0-9_-]+)/);
  return match ? match[1] : '';
}

function driveImageUrl_(cellValue) {
  var id = driveFileId_(cellValue);
  return id ? 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w1000' : '';
}

function getPhoto(token,fileId) {
if(!isAdminTokenValid_(token)) return {success:false,message:'Phiên đăng nhập hết hạn.'};
fileId=String(fileId||'');
if(!/^[A-Za-z0-9_-]{10,}$/.test(fileId)) return {success:false,message:'Mã ảnh không hợp lệ.'};
try {
var blob=DriveApp.getFileById(fileId).getBlob(), mime=blob.getContentType();
if (!/^image\/(jpeg|png|webp)$/.test(mime)) return {success:false,message:'Tệp không phải ảnh hợp lệ.'};
return {success:true,dataUrl:'data:'+mime+';base64,'+Utilities.base64Encode(blob.getBytes())};
} catch(err) { return {success:false,message:'Không đọc được ảnh. Kiểm tra quyền Drive.'}; }
}
function getGeofence_() {
var sh = getSS_().getSheetByName('CauHinh');
var out = {lat:null, lng:null, radius:100};
if (!sh) return out;
var lastRow = sh.getLastRow();
if (lastRow < 1) return out;
var values = sh.getRange(1, 1, lastRow, 2).getValues();
values.forEach(function(r) {
  var key = String(r[0] || '').trim();
  var raw = r[1];
  if (key === 'GEOFENCE_LAT') out.lat = raw === '' || raw === null ? null : Number(raw);
  if (key === 'GEOFENCE_LNG') out.lng = raw === '' || raw === null ? null : Number(raw);
  // Bán kính được khóa cứng 100 m theo chính sách điểm danh.
});
if (out.lat === null || !isFinite(out.lat) || out.lat < -90 || out.lat > 90) out.lat = null;
if (out.lng === null || !isFinite(out.lng) || out.lng < -180 || out.lng > 180) out.lng = null;
out.radius = 100;
return out;
}
function getPublicConfig(){
var g = getGeofence_();
return {success:true, geofence:{lat:g.lat, lng:g.lng, radius:g.radius, enabled: (g.lat !== null && g.lng !== null)}};
}
function saveGeofence(token,lat,lng,radius) {
if (!isAdminTokenValid_(token)) return {success:false,message:'Phiên đăng nhập hết hạn.'};
lat=Number(lat);lng=Number(lng);radius=Number(radius);
if(!isFinite(lat)||lat < -90||lat>90||!isFinite(lng)||lng < -180||lng>180||radius !== 100)
return {success:false,message:'Tọa độ không hợp lệ. Bán kính hệ thống được cố định 100 m.'};
var ss=getSS_(),sh=ss.getSheetByName('CauHinh')||ss.insertSheet('CauHinh');
sh.clearContents(); // Sửa từ clear() sang clearContents để giữ định dạng cột
sh.getRange(1,1,3,2).setValues([['GEOFENCE_LAT',lat],['GEOFENCE_LNG',lng],['GEOFENCE_RADIUS',radius]]);
return {success:true,message:'Đã lưu vị trí và bán kính điểm danh.',geofence:{lat:lat,lng:lng,radius:radius,enabled:true}};
}
function distanceMeters_(lat1, lon1, lat2, lon2) {
  var R = 6371000;
  var rad = Math.PI / 180;
  var phi1 = Number(lat1) * rad;
  var phi2 = Number(lat2) * rad;
  var dPhi = (Number(lat2) - Number(lat1)) * rad;
  var dLambda = (Number(lon2) - Number(lon1)) * rad;
  var sinPhi = Math.sin(dPhi / 2);
  var sinLambda = Math.sin(dLambda / 2);
  var a = sinPhi * sinPhi + Math.cos(phi1) * Math.cos(phi2) * sinLambda * sinLambda;
  // Chặn sai số dấu phẩy động để sqrt(1-a) luôn hợp lệ.
  a = Math.max(0, Math.min(1, a));
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function setup() {
getSS_().setSpreadsheetTimeZone(TZ);
getLogSheet_();
getStaffSheet_();
getFolder_();
return 'Đã sẵn sàng';
}
function getLogSheet_() {
var ss = getSS_();
var sh = ss.getSheetByName(SHEET_LOG);
if (!sh) {
sh = ss.insertSheet(SHEET_LOG);
sh.appendRow(HEADERS);
sh.setFrozenRows(1);
sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
sh.getRange('A:A').setNumberFormat('dd/MM/yyyy');
sh.getRange('D:E').setNumberFormat('dd/MM/yyyy HH:mm:ss');
sh.getRange('F:F').setNumberFormat('0.00');
sh.setColumnWidth(C.NAME, 180);
sh.setColumnWidth(C.IN, 150);
sh.setColumnWidth(C.OUT, 150);
sh.setColumnWidth(C.WARN, 280);
}
sh.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);
return sh;
}
function getStaffSheet_() {
var ss = getSS_();
var sh = ss.getSheetByName(SHEET_STAFF);
if (!sh) {
sh = ss.insertSheet(SHEET_STAFF);
sh.appendRow(['Mã NV', 'Họ tên', 'Phòng ban', 'Bộ phận', 'Chức vụ', 'Mã AC']);
sh.setFrozenRows(1);
sh.getRange(1, 1, 1, 6).setFontWeight('bold');
}
return sh;
}
function getFolder_() {
var props = PropertiesService.getScriptProperties();
var id = props.getProperty('FOLDER_ID');
if (id) {
try { return DriveApp.getFolderById(id); } catch (err) { }
}
var folder = DriveApp.createFolder(FOLDER_NAME);
props.setProperty('FOLDER_ID', folder.getId());
return folder;
}
function staffMap_() {
var sh = getStaffSheet_();
var last = sh.getLastRow();
if (last < 2) return null;
var rows = sh.getRange(2, 1, last - 1, 2).getValues();
var map = {};
rows.forEach(function (r) {
var code = String(r[0]).trim().toUpperCase();
if (code) map[code] = String(r[1]).trim();
});
return Object.keys(map).length ? map : null;
}
function normHeader_(s) {
return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');
}
// Tìm cột theo tiêu đề dòng 1 (manv, hoten, phongban, bophan, chucvu). Không thấy tiêu đề thì dùng vị trí A-E.
function staffColumns_(sh) {
var lastCol = Math.max(sh.getLastColumn(), 5);
var head = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(normHeader_);
function find(names, def) {
for (var i = 0; i < head.length; i++) if (names.indexOf(head[i]) !== -1) return i;
return def;
}
return {
code: find(['manv', 'manhanvien', 'ma'], 0),
name: find(['hoten', 'hovaten', 'ten'], 1),
phongban: find(['phongban'], 2),
bophan: find(['bophan'], 3),
chucvu: find(['chucvu'], 4),
ac: find(['maac', 'ac', 'acno', 'acid', 'macc', 'machamcong'], -1)   // Mã AC trên máy chấm công / TimeGold (cột tùy chọn)
};
}
// Mã AC (mã trên máy chấm công / TimeGold) của một nhân viên; rỗng nếu sheet NhanVien chưa có cột "Mã AC".
function staffAcCode_(code) {
var sh = getStaffSheet_(), last = sh.getLastRow();
if (last < 2) return '';
var cols = staffColumns_(sh);
if (cols.ac < 0) return '';
var rows = sh.getRange(2, 1, last - 1, Math.max(sh.getLastColumn(), cols.ac + 1)).getValues();
var key = String(code || '').trim().toUpperCase();
for (var i = 0; i < rows.length; i++) {
if (String(rows[i][cols.code]).trim().toUpperCase() === key) return String(rows[i][cols.ac]).trim();
}
return '';
}
// Ảnh thu nhỏ cho bảng admin (gửi theo lô, cache 6 giờ)
function getThumbs(token, ids) {
if (!isAdminTokenValid_(token)) return { success: false, message: 'Phiên đăng nhập hết hạn.' };
ids = (Array.isArray(ids) ? ids : []).slice(0, 8);
var cache = CacheService.getScriptCache(), thumbs = {};
ids.forEach(function (id) {
id = String(id || '');
if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) return;
var key = 'thumb:' + id, hit = cache.get(key);
if (hit) { thumbs[id] = hit; return; }
try {
var file = DriveApp.getFileById(id);
var blob = file.getThumbnail() || file.getBlob();
var mime = blob.getContentType();
if (!/^image\/(jpeg|png|webp)$/.test(mime)) return;
var dataUrl = 'data:' + mime + ';base64,' + Utilities.base64Encode(blob.getBytes());
thumbs[id] = dataUrl;
if (dataUrl.length < 90000) cache.put(key, dataUrl, 21600);
} catch (err) {}
});
return { success: true, thumbs: thumbs };
}
var SHEET_CANCEL = 'DaHuy';          // Sheet lưu lại các bản ghi điểm danh bị admin hủy
function getCancelSheet_() {
var ss = getSS_(), sh = ss.getSheetByName(SHEET_CANCEL);
if (!sh) {
sh = ss.insertSheet(SHEET_CANCEL);
sh.appendRow(['Thời điểm hủy', 'Người hủy', 'Loại hủy', 'Lý do'].concat(HEADERS));
sh.setFrozenRows(1);
sh.getRange(1, 1, 1, HEADERS.length + 4).setFontWeight('bold');
sh.getRange('A:A').setNumberFormat('dd/MM/yyyy HH:mm:ss');
}
return sh;
}
// Admin hủy điểm danh: kind = 'out' (chỉ hủy lượt ra) hoặc 'all' (xóa cả ca). Bản gốc được lưu sang sheet DaHuy.
function cancelAttendance(d) {
d = d || {};
if (!isAdminTokenValid_(d.token)) return { success: false, message: 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.' };
var row = Number(d.row), code = String(d.code || '').trim().toUpperCase();
var kind = d.kind === 'out' ? 'out' : (d.kind === 'all' ? 'all' : '');
var reason = String(d.reason || '').trim().slice(0, 200);
if (!kind || !code || !isFinite(row) || row < 2) return { success: false, message: 'Yêu cầu hủy không hợp lệ.' };
if (reason.length < 3) return { success: false, message: 'Hãy nhập lý do hủy.' };
var lock = LockService.getScriptLock();
lock.waitLock(20000);
try {
var sh = getLogSheet_();
if (row > sh.getLastRow()) return { success: false, message: 'Không tìm thấy dòng điểm danh. Hãy tải lại trang.' };
var rng = sh.getRange(row, 1, 1, HEADERS.length);
var vals = rng.getValues()[0], forms = rng.getFormulas()[0];
var rin = isDate_(vals[C.IN - 1]) ? vals[C.IN - 1] : null;
var rdate = isDate_(vals[C.DATE - 1]) ? fmt_(vals[C.DATE - 1], 'yyyy-MM-dd') : '';
var timeIn = String(d.timeIn || '');
if (String(vals[C.CODE - 1]).toUpperCase() !== code ||
(d.date && rdate !== String(d.date)) ||
(timeIn && timeIn !== '--:--' && (!rin || fmt_(rin, 'HH:mm') !== timeIn)))
return { success: false, message: 'Dữ liệu đã thay đổi. Hãy tải lại trang rồi thử lại.' };
if (kind === 'out' && !isDate_(vals[C.OUT - 1])) return { success: false, message: 'Dòng này chưa có lượt ra để hủy.' };
// Lưu bản gốc (giữ công thức liên kết ảnh, riêng số giờ lưu giá trị)
var snap = vals.map(function (v, i) { return forms[i] || v; });
snap[C.HOURS - 1] = vals[C.HOURS - 1];
getCancelSheet_().appendRow([new Date(), ADMIN_CONFIG.username, kind === 'out' ? 'Hủy lượt ra' : 'Hủy cả ca', reason].concat(snap));
if (kind === 'all') {
sh.deleteRow(row);
} else {
sh.getRange(row, C.OUT).clearContent();
sh.getRange(row, C.PHOTO_OUT).clearContent();
sh.getRange(row, C.DEV_OUT).clearContent();
sh.getRange(row, C.LAT_OUT, 1, 4).clearContent();
sh.getRange(row, C.LAT, 1, 4).setValues([[vals[C.LAT_IN - 1], vals[C.LNG_IN - 1], vals[C.ACC_IN - 1], vals[C.DIST_IN - 1]]]);
}
try {
var evs = [];
if (kind === 'all' && rin) evs.push({ eventType: 'IN', occurredAt: sqlIso_(rin) });
if (isDate_(vals[C.OUT - 1])) evs.push({ eventType: 'OUT', occurredAt: sqlIso_(vals[C.OUT - 1]) });
sqlEnqueue_(kind === 'out' ? 'CANCEL_OUT' : 'CANCEL_ALL', { employeeCode: code, workDate: rdate, cancelledEvents: evs, reason: reason, cancelledBy: ADMIN_CONFIG.username, cancelledAt: sqlIso_(new Date()) });
} catch (e) { console.error('cancel->sql: ' + e); }
return { success: true, message: kind === 'out' ? 'Đã hủy lượt ra. Nhân viên có thể ra ca lại.' : 'Đã hủy cả ca. Nhân viên có thể vào ca lại.' };
} finally {
lock.releaseLock();
}
}
function getName(code) {
var map = staffMap_();
var key = String(code || '').trim().toUpperCase();
var res = map ? { listed: true, name: map[key] || '' } : { listed: false, name: '' };
if (key && (!map || map[key])) res.shift = shiftState_(key);
return res;
}
// Trạng thái ca gần nhất của một mã: none | open (đã vào, chưa ra) | stale (vào quá lâu chưa ra) | done (đã vào và ra)
function shiftState_(code) {
var sh = getLogSheet_(), last = sh.getLastRow();
if (last < 2) return { state: 'none' };
var n = Math.min(last - 1, 1500);
var rows = sh.getRange(last - n + 1, 1, n, HEADERS.length).getValues();
var now = new Date();
for (var i = rows.length - 1; i >= 0; i--) {
if (String(rows[i][C.CODE - 1]).toUpperCase() !== code) continue;
var rin = isDate_(rows[i][C.IN - 1]) ? rows[i][C.IN - 1] : null;
var rout = isDate_(rows[i][C.OUT - 1]) ? rows[i][C.OUT - 1] : null;
var out = {
state: 'none',
timeIn: rin ? fmt_(rin, 'HH:mm') : '', dateIn: rin ? fmt_(rin, 'dd/MM') : '',
timeOut: rout ? fmt_(rout, 'HH:mm') : '', dateOut: rout ? fmt_(rout, 'dd/MM') : ''
};
if (rin && !rout) {
var h = (now - rin) / 3600000;
out.state = h >= MAX_SHIFT_HOURS ? 'stale' : 'open';
out.hours = Math.round(h * 10) / 10;
} else if (rin && rout) {
out.state = 'done';
}
return out;
}
return { state: 'none' };
}
function isDate_(v) { return v instanceof Date && !isNaN(v.getTime()); }
function fmt_(d, f) { return Utilities.formatDate(d, TZ, f); }
function hoursFormula_(row) {
return '=IF(AND(ISNUMBER(D' + row + '),ISNUMBER(E' + row + ')),MAX(0,ROUND((E' + row + '-D' + row + ')*24-' + BREAK_MINUTES + '/60,2)),"")';
}
function addWarn_(sh, row, text) {
var cell = sh.getRange(row, C.WARN);
var old = String(cell.getValue() || '').trim();
cell.setValue(old ? old + '; ' + text : text);
sh.getRange(row, 1, 1, HEADERS.length).setBackground('#fde8dc');
}
function submitCheckin(data) {
data = data || {};
var code = String(data.code || '').trim().toUpperCase().slice(0, 30);
var name = String(data.name || '').trim().slice(0, 80);
var isOut = data.type === 'out';
var device = String(data.device || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 40);
var age = Math.max(0, Math.min(Number(data.photoAgeSec) || 0, 31536000));
var photo = String(data.photo || '');
if (!code || !name) return { ok: false, message: 'Hãy nhập họ tên và mã nhân viên.' };
var m = photo.match(/^data:image\/jpeg;base64,([A-Za-z0-9+\/=]+)$/);
if (!m) return { ok: false, message: 'Chưa có ảnh selfie hợp lệ. Hãy chụp lại.' };
if (m[1].length > 600000) return { ok: false, message: 'Ảnh quá lớn. Hãy chụp lại.' };
var gps = data.location || {};
var lat = Number(gps.lat), lng = Number(gps.lng), accuracy = Number(gps.accuracy);
if (!isFinite(lat) || lat < -90 || lat > 90 || !isFinite(lng) || lng < -180 || lng > 180)
return {ok:false,message:'Không lấy được vị trí GPS. Hãy bật quyền vị trí và thử lại.'};
if (!isFinite(accuracy) || accuracy <= 0 || accuracy > 100)
return {ok:false,message:'Độ chính xác GPS chưa đạt (cần sai số không quá 100 m). Hãy thử lại ngoài trời.'};
var fence = getGeofence_();
if (fence.lat === null || fence.lng === null)
return {ok:false,message:'Admin chưa cấu hình vị trí và bán kính điểm danh.'};
var distance = Math.round(distanceMeters_(lat,lng,fence.lat,fence.lng));
if (distance > fence.radius)
return {ok:false,message:'Bạn đang cách điểm danh ' + distance + ' m, vượt bán kính cho phép ' + fence.radius + ' m.'};
var map = staffMap_();
if (map) {
if (!map[code]) return { ok: false, message: 'Mã nhân viên không có trong danh sách. Hãy kiểm tra lại mã.' };
name = map[code];
}
var lock = LockService.getScriptLock();
lock.waitLock(20000);
try {
var sh = getLogSheet_();
var now = new Date();
var nowTxt = fmt_(now, 'HH:mm:ss');
var today = fmt_(now, 'dd/MM/yyyy');
var last = sh.getLastRow();
var start = 2;
var rows = last >= 2 ? sh.getRange(start, 1, last - start + 1, HEADERS.length).getValues() : [];
var idx = -1;
for (var i = rows.length - 1; i >= 0; i--) {
if (String(rows[i][C.CODE - 1]).toUpperCase() === code) { idx = i; break; }
}
var prev = idx >= 0 ? rows[idx] : null;
var prevRow = idx >= 0 ? start + idx : 0;
var prevIn = prev && isDate_(prev[C.IN - 1]) ? prev[C.IN - 1] : null;
var prevOut = prev && isDate_(prev[C.OUT - 1]) ? prev[C.OUT - 1] : null;
var open = !!prevIn && !prevOut;
var openHours = open ? (now - prevIn) / 3600000 : 0;
var lastEvent = prevOut || prevIn;
if (lastEvent && (now - lastEvent) / 1000 < MIN_GAP_SECONDS) {
return { ok: false, message: 'Bạn vừa điểm danh xong. Vui lòng đợi ' + MIN_GAP_SECONDS + ' giây nếu cần gửi lại.' };
}
if (!isOut && open && openHours < MAX_SHIFT_HOURS) {
return { ok: false, message: 'Bạn đã vào ca lúc ' + fmt_(prevIn, 'HH:mm') + ' ngày ' + fmt_(prevIn, 'dd/MM') + ' và chưa ra ca. Muốn kết thúc ca thì chọn "Ra ca".' };
}
if (isOut && !open && prevIn && prevOut && (now - prevOut) / 3600000 < 2) {
return { ok: false, message: 'Bạn đã ra ca lúc ' + fmt_(prevOut, 'HH:mm') + '. Không cần điểm danh ra ca lần nữa.' };
}
var warns = [];
if (age > STALE_SECONDS) warns.push((isOut ? 'Ảnh ra' : 'Ảnh vào') + ' cũ ' + Math.round(age / 60) + ' phút');
if (device) {
var others = {};
rows.forEach(function (r) {
var d = isDate_(r[C.DATE - 1]) ? fmt_(r[C.DATE - 1], 'dd/MM/yyyy') : String(r[C.DATE - 1]);
var rc = String(r[C.CODE - 1]).toUpperCase();
if (d === today && rc !== code && (String(r[C.DEV_IN - 1]) === device || String(r[C.DEV_OUT - 1]) === device)) others[rc] = true;
});
var n = Object.keys(others).length;
if (n > 0) warns.push('Thiết bị này đã điểm danh cho ' + n + ' mã khác hôm nay');
}
var fileName = fmt_(now, 'yyyyMMdd_HHmmss') + '' + code + '' + (isOut ? 'ra' : 'vao') + '.jpg';
var blob = Utilities.newBlob(Utilities.base64Decode(m[1]), 'image/jpeg', fileName);
var pfile = getFolder_().createFile(blob);
var url = pfile.getUrl();
var link = '=HYPERLINK("' + url + '","Xem ảnh")';
if (!isOut) {
if (open && openHours >= MAX_SHIFT_HOURS) addWarn_(sh, prevRow, 'Quên điểm danh ra ca');
sh.appendRow([now,code,name,now,'','','','','',device,'',lat,lng,accuracy,distance,lat,lng,accuracy,distance,'','','','']);
var row = sh.getLastRow();
sh.getRange(row, C.DATE).setNumberFormat('dd/MM/yyyy');
sh.getRange(row, C.IN).setNumberFormat('dd/MM/yyyy HH:mm:ss');
sh.getRange(row, C.OUT).setNumberFormat('dd/MM/yyyy HH:mm:ss');
sh.getRange(row, C.HOURS).setFormula(hoursFormula_(row)).setNumberFormat('0.00');
sh.getRange(row, C.PHOTO_IN).setFormula(link);
if (warns.length) sh.getRange(row, 1, 1, HEADERS.length).setBackground('#fde8dc');
sqlEnqueueCheckin_('IN', now, fmt_(now, 'yyyy-MM-dd'), code, name, device, pfile.getId(), url, lat, lng, accuracy, distance, warns);
return { ok: true, name: name, message: 'Đã vào ca lúc ' + nowTxt + ' ngày ' + today + '.' };
}
if (open && openHours <= MAX_SHIFT_HOURS) {
sh.getRange(prevRow, C.OUT).setValue(now).setNumberFormat('dd/MM/yyyy HH:mm:ss');
sh.getRange(prevRow, C.PHOTO_OUT).setFormula(link);
sh.getRange(prevRow, C.DEV_OUT).setValue(device);
sh.getRange(prevRow,C.LAT,1,4).setValues([[lat,lng,accuracy,distance]]);
sh.getRange(prevRow,C.LAT_OUT,1,4).setValues([[lat,lng,accuracy,distance]]);
sh.getRange(prevRow, C.HOURS).setFormula(hoursFormula_(prevRow)).setNumberFormat('0.00');
warns.forEach(function (w) { addWarn_(sh, prevRow, w); });
sqlEnqueueCheckin_('OUT', now, fmt_(prevIn, 'yyyy-MM-dd'), code, name, device, pfile.getId(), url, lat, lng, accuracy, distance, warns);
var worked = Math.max(0, openHours - BREAK_MINUTES / 60);
var hh = Math.floor(worked), mm = Math.round((worked - hh) * 60);
if (mm === 60) { hh += 1; mm = 0; }
return { ok: true, name: name, message: 'Đã ra ca lúc ' + nowTxt + '. Hôm nay bạn làm ' + hh + ' giờ ' + mm + ' phút.' };
}
if (open && openHours > MAX_SHIFT_HOURS) addWarn_(sh, prevRow, 'Quên điểm danh ra ca');
warns.unshift('Thiếu giờ vào');
sh.appendRow([now,code,name,'',now,'','','',warns.join('; '),'',device,lat,lng,accuracy,distance,'','','','',lat,lng,accuracy,distance]);
var r2 = sh.getLastRow();
sh.getRange(r2, C.DATE).setNumberFormat('dd/MM/yyyy');
sh.getRange(r2, C.IN).setNumberFormat('dd/MM/yyyy HH:mm:ss');
sh.getRange(r2, C.OUT).setNumberFormat('dd/MM/yyyy HH:mm:ss');
sh.getRange(r2, C.HOURS).setFormula(hoursFormula_(r2)).setNumberFormat('0.00');
sh.getRange(r2, C.PHOTO_OUT).setFormula(link);
sh.getRange(r2, 1, 1, HEADERS.length).setBackground('#fde8dc');
sqlEnqueueCheckin_('OUT', now, fmt_(now, 'yyyy-MM-dd'), code, name, device, pfile.getId(), url, lat, lng, accuracy, distance, warns);
return { ok: true, name: name, message: 'Đã ghi giờ ra lúc ' + nowTxt + '. Hệ thống không thấy giờ vào của bạn nên quản lý sẽ kiểm tra.' };
} finally {
lock.releaseLock();
}
}

/**
 * Chạy thủ công một lần sau setup() để đổi thông tin đăng nhập quản trị.
 * Sửa hai giá trị bên dưới trước khi chạy; không chia sẻ mật khẩu trong mã nguồn.
 */
function setAdminCredentials() {
  var username = 'admin';
  var password = 'Admin123';
  if (!username || !password || password === 'THAY_BANG_MAT_KHAU_MOI_DAI_VA_KHO_DOAN' || password.length < 6) {
    throw new Error('Hãy sửa username/password trong setAdminCredentials(); mật khẩu cần ít nhất 6 ký tự.');
  }
  PropertiesService.getScriptProperties().setProperties({
    ADMIN_USERNAME: username,
    ADMIN_PASSWORD: password
  }, true);
  return 'Đã cập nhật thông tin đăng nhập Admin trong Script Properties.';
}

// =====================================================================
// ĐỒNG BỘ SQL SERVER QUA API NỘI BỘ (tùy chọn, mặc định TẮT)
// Google Sheet vẫn là nguồn gốc. Mỗi lượt vào/ra/hủy được xếp vào sheet HangDoiSQL,
// rồi trigger mỗi phút gửi từng lô tới API của công ty (có ký HMAC, tự thử lại khi lỗi).
// Bật bằng setupSqlSync(); tắt bằng disableSqlSync().
// =====================================================================
var SHEET_SQLQ = 'HangDoiSQL';
var SQLQ_HEADERS = ['EventId', 'Thời điểm', 'Loại', 'Dữ liệu (JSON)', 'Trạng thái', 'Số lần thử', 'Lỗi gần nhất', 'Gửi lúc'];
var SQL_BATCH = 20;          // số sự kiện mỗi lần gọi API
var SQL_MAX_BATCHES = 5;     // số lô tối đa mỗi lần chạy trigger
var SQL_MAX_ATTEMPTS = 20;   // quá số lần này thì đánh dấu FAILED (xem lỗi rồi chạy retrySqlFailed)
var SQL_KEEP_DAYS = 3;       // dọn các dòng SENT cũ hơn số ngày này

function sqlCfg_() {
var p = PropertiesService.getScriptProperties();
var url = p.getProperty('SQL_API_URL'), secret = p.getProperty('SQL_API_SECRET');
if (!url || !secret || p.getProperty('SQL_SYNC') === 'off') return null;
return { url: url, secret: secret };
}
function sqlIso_(d) { return fmt_(d, "yyyy-MM-dd'T'HH:mm:ssXXX"); }
function getSqlQueueSheet_() {
var ss = getSS_(), sh = ss.getSheetByName(SHEET_SQLQ);
if (!sh) {
sh = ss.insertSheet(SHEET_SQLQ);
sh.appendRow(SQLQ_HEADERS);
sh.setFrozenRows(1);
sh.getRange(1, 1, 1, SQLQ_HEADERS.length).setFontWeight('bold');
sh.setColumnWidth(4, 420);
}
return sh;
}
// Xếp một sự kiện vào hàng đợi. Không bao giờ làm hỏng luồng điểm danh.
function sqlEnqueue_(type, payload) {
try {
if (!sqlCfg_()) return;
var id = Utilities.getUuid();
payload.eventId = id;
payload.eventType = type;
getSqlQueueSheet_().appendRow([id, new Date(), type, JSON.stringify(payload), 'PENDING', 0, '', '']);
} catch (err) { console.error('sqlEnqueue_: ' + err); }
}
function sqlEnqueueCheckin_(type, now, workDate, code, name, device, fileId, url, lat, lng, accuracy, distance, warns) {
if (!sqlCfg_()) return;
var ac = '';
try { ac = staffAcCode_(code); } catch (e) { console.error('staffAcCode_: ' + e); }
sqlEnqueue_(type, {
occurredAt: sqlIso_(now), workDate: workDate, employeeCode: code, acCode: ac, employeeName: name,
deviceId: device, photoFileId: fileId, photoUrl: url,
latitude: lat, longitude: lng, gpsAccuracyM: accuracy, distanceM: distance,
warning: (warns || []).join('; ')
});
}
function sqlSign_(secret, ts, body) {
var bytes = Utilities.computeHmacSha256Signature(ts + '.' + body, secret);
return bytes.map(function (b) { return ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2); }).join('');
}
function sqlPost_(cfg, body) {
var ts = String(Math.floor(Date.now() / 1000));
return UrlFetchApp.fetch(cfg.url, {
method: 'post',
contentType: 'application/json; charset=utf-8',
payload: body,
headers: { 'X-Timestamp': ts, 'X-Signature': sqlSign_(cfg.secret, ts, body) },
muteHttpExceptions: true
});
}
// Trigger chạy mỗi phút: gửi các sự kiện PENDING theo lô, đánh dấu SENT / thử lại / FAILED.
function syncSqlQueue() {
var cfg = sqlCfg_();
if (!cfg) return;
var cache = CacheService.getScriptCache();
if (cache.get('sqlsync:running')) return;
cache.put('sqlsync:running', '1', 300);
try {
var sh = getSqlQueueSheet_(), last = sh.getLastRow();
if (last < 2) return;
var rows = sh.getRange(2, 1, last - 1, SQLQ_HEADERS.length).getValues();
var next = 0;
for (var b = 0; b < SQL_MAX_BATCHES; b++) {
var idx = [];
while (next < rows.length && idx.length < SQL_BATCH) { if (rows[next][4] === 'PENDING') idx.push(next); next++; }
if (!idx.length) break;
var body = '{"events":[' + idx.map(function (i) { return rows[i][3]; }).join(',') + ']}';
var okMap = null, errAll = '';
try {
var resp = sqlPost_(cfg, body), http = resp.getResponseCode();
if (http === 200) {
okMap = {};
(JSON.parse(resp.getContentText()).results || []).forEach(function (r) { okMap[r.eventId] = r; });
} else {
errAll = 'HTTP ' + http + ': ' + resp.getContentText().slice(0, 150);
}
} catch (err) { errAll = String(err).slice(0, 200); }
var nowD = new Date();
idx.forEach(function (i) {
var id = rows[i][0], attempts = Number(rows[i][5]) || 0, r = okMap && okMap[id];
var status, error = '', sent = '';
if (r && r.ok) { status = 'SENT'; sent = nowD; }
else {
attempts++;
error = r ? String(r.error || 'Lỗi không rõ').slice(0, 200) : (errAll || 'Không có phản hồi cho sự kiện này');
status = attempts >= SQL_MAX_ATTEMPTS ? 'FAILED' : 'PENDING';
}
sh.getRange(i + 2, 5, 1, 4).setValues([[status, attempts, error, sent]]);
});
if (errAll) break;   // API lỗi/mất kết nối: dừng, phút sau thử lại
}
// Dọn các dòng đã gửi cũ
var cutoff = Date.now() - SQL_KEEP_DAYS * 86400000, removed = 0;
for (var j = rows.length - 1; j >= 0 && removed < 100; j--) {
if (rows[j][4] === 'SENT' && isDate_(rows[j][7]) && rows[j][7].getTime() < cutoff) { sh.deleteRow(j + 2); removed++; }
}
} finally {
cache.remove('sqlsync:running');
}
}
// Chạy MỘT LẦN: sửa url và secret bên dưới, chạy hàm này, cấp quyền, rồi xóa secret khỏi mã nguồn.
function setupSqlSync() {
var url = 'https://api.congty.vn/api/attendance/events';   // URL API nội bộ nhận dữ liệu (bắt buộc https)
var secret = 'THAY_BANG_CHUOI_BI_MAT_DAI_TU_24_KY_TU';       // trùng với Attendance:SharedSecret phía công ty
if (!/^https:\/\//.test(url) || secret.length < 24 || secret.indexOf('THAY_BANG') === 0)
throw new Error('Hãy sửa url (https) và secret (từ 24 ký tự) trong setupSqlSync() trước khi chạy.');
PropertiesService.getScriptProperties().setProperties({ SQL_API_URL: url, SQL_API_SECRET: secret, SQL_SYNC: 'on' }, false);
getSqlQueueSheet_();
ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'syncSqlQueue') ScriptApp.deleteTrigger(t); });
ScriptApp.newTrigger('syncSqlQueue').timeBased().everyMinutes(1).create();
return 'Đã bật đồng bộ SQL. Chạy sqlPing() để kiểm tra kết nối.';
}
function disableSqlSync() {
ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'syncSqlQueue') ScriptApp.deleteTrigger(t); });
PropertiesService.getScriptProperties().setProperty('SQL_SYNC', 'off');
return 'Đã tắt đồng bộ SQL. Dữ liệu trong HangDoiSQL được giữ nguyên.';
}
// Kiểm tra URL + chữ ký bằng một lô rỗng: kỳ vọng HTTP 200.
function sqlPing() {
var cfg = sqlCfg_();
if (!cfg) throw new Error('Chưa bật đồng bộ SQL (chạy setupSqlSync trước).');
var resp = sqlPost_(cfg, '{"events":[]}');
return 'HTTP ' + resp.getResponseCode() + ' ' + resp.getContentText().slice(0, 200);
}
// Đưa các sự kiện FAILED về PENDING để gửi lại (sau khi đã sửa lỗi phía công ty).
function retrySqlFailed() {
var sh = getSqlQueueSheet_(), last = sh.getLastRow(), n = 0;
if (last < 2) return 0;
var st = sh.getRange(2, 5, last - 1, 2).getValues();
st.forEach(function (r, i) { if (r[0] === 'FAILED') { sh.getRange(i + 2, 5, 1, 2).setValues([['PENDING', 0]]); n++; } });
return 'Đã đặt lại ' + n + ' sự kiện.';
}
