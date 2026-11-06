/**
 * Điểm danh nhân viên bằng QR + selfie
 * Công Ty Cổ Phần Liwayway VN
 *
 * Mỗi ca là MỘT dòng: giờ vào, giờ ra và số giờ làm thực tế.
 * Dán file này vào Apps Script của Google Sheets (xem HUONG-DAN.md).
 */

var TZ = 'Asia/Ho_Chi_Minh';
var SHEET_LOG = 'ChamCong';        // sheet chấm công, mỗi ca một dòng (tự tạo)
var SHEET_STAFF = 'NhanVien';      // sheet danh sách nhân viên (tự tạo, không bắt buộc điền)
var FOLDER_NAME = 'DiemDanh_Anh';  // thư mục Drive chứa ảnh selfie (tự tạo)
var STALE_SECONDS = 180;           // ảnh chụp cũ hơn mức này bị gắn cờ
var MIN_GAP_SECONDS = 60;          // chặn bấm gửi trùng trong khoảng này
var MAX_SHIFT_HOURS = 16;          // ca dài tối đa; quá mức này coi là quên ra ca
var BREAK_MINUTES = 0;             // phút nghỉ trừ khỏi mỗi ca (ví dụ 60 nếu nghỉ trưa không tính lương)

// Số cột (bắt đầu từ 1)
var C = { DATE: 1, CODE: 2, NAME: 3, IN: 4, OUT: 5, HOURS: 6, PHOTO_IN: 7, PHOTO_OUT: 8, WARN: 9, DEV_IN: 10, DEV_OUT: 11 };
var HEADERS = ['Ngày', 'Mã NV', 'Họ tên', 'Giờ vào', 'Giờ ra', 'Số giờ', 'Ảnh vào', 'Ảnh ra', 'Cảnh báo', 'Thiết bị vào', 'Thiết bị ra'];

/** Mở trang web. Thêm ?view=qr vào đường dẫn để mở trang in mã QR. */
function doGet(e) {
  var view = e && e.parameter && e.parameter.view;
  var page = view === 'qr' ? 'Qr' : 'Index';
  var t = HtmlService.createTemplateFromFile(page);
  t.appUrl = ScriptApp.getService().getUrl();
  return t.evaluate()
    .setTitle('Điểm danh - Liwayway VN')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Chạy một lần từ trình soạn thảo để cấp quyền và tạo sẵn sheet, thư mục. */
function setup() {
  SpreadsheetApp.getActiveSpreadsheet().setSpreadsheetTimeZone(TZ);
  getLogSheet_();
  getStaffSheet_();
  getFolder_();
  return 'Đã sẵn sàng';
}

function getLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
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
  return sh;
}

function getStaffSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_STAFF);
  if (!sh) {
    sh = ss.insertSheet(SHEET_STAFF);
    sh.appendRow(['Mã NV', 'Họ tên']);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 2).setFontWeight('bold');
  }
  return sh;
}

function getFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (err) { /* thư mục đã bị xoá, tạo lại */ }
  }
  var folder = DriveApp.createFolder(FOLDER_NAME);
  props.setProperty('FOLDER_ID', folder.getId());
  return folder;
}

/** Trả về bảng mã -> tên nếu sheet NhanVien có dữ liệu, ngược lại trả về null. */
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

/** Gọi từ trang để tự điền họ tên khi nhập mã. */
function getName(code) {
  var map = staffMap_();
  if (!map) return { listed: false, name: '' };
  var key = String(code || '').trim().toUpperCase();
  return { listed: true, name: map[key] || '' };
}

function isDate_(v) { return v instanceof Date && !isNaN(v.getTime()); }
function fmt_(d, f) { return Utilities.formatDate(d, TZ, f); }

function hoursFormula_(row) {
  return '=IF(AND(ISNUMBER(D' + row + '),ISNUMBER(E' + row + ')),MAX(0,ROUND((E' + row + '-D' + row + ')*24-' + BREAK_MINUTES + '/60,2)),"")';
}

function addWarn_(sh, row, text) {
  var cell = sh.getRange(row, C.WARN);
  var old = String(cell.getValue() || '');
  cell.setValue(old ? old + '; ' + text : text);
  sh.getRange(row, 1, 1, HEADERS.length).setBackground('#fde8dc');
}

/** Nhận một lượt điểm danh từ trang. */
function submitCheckin(data) {
  data = data || {};
  var code = String(data.code || '').trim().toUpperCase().slice(0, 30);
  var name = String(data.name || '').trim().slice(0, 80);
  var isOut = data.type === 'out';
  var device = String(data.device || '').replace(/[^A-Za-z0-9\-]/g, '').slice(0, 40);
  var age = Math.max(0, Math.min(Number(data.photoAgeSec) || 0, 31536000));
  var photo = String(data.photo || '');

  if (!code || !name) return { ok: false, message: 'Hãy nhập họ tên và mã nhân viên.' };
  var m = photo.match(/^data:image\/jpeg;base64,([A-Za-z0-9+\/=]+)$/);
  if (!m) return { ok: false, message: 'Chưa có ảnh selfie hợp lệ. Hãy chụp lại.' };
  if (m[1].length > 600000) return { ok: false, message: 'Ảnh quá lớn. Hãy chụp lại.' };

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

    // Đọc tối đa 600 dòng gần nhất.
    var last = sh.getLastRow();
    var start = Math.max(2, last - 599);
    var rows = last >= 2 ? sh.getRange(start, 1, last - start + 1, HEADERS.length).getValues() : [];

    // Dòng gần nhất của cùng mã nhân viên.
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

    // Chặn bấm trùng trong thời gian ngắn.
    var lastEvent = prevOut || prevIn;
    if (lastEvent && (now - lastEvent) / 1000 < MIN_GAP_SECONDS) {
      return { ok: false, message: 'Bạn vừa điểm danh xong. Vui lòng đợi ' + MIN_GAP_SECONDS + ' giây nếu cần gửi lại.' };
    }

    // Vào ca khi ca trước vẫn đang mở.
    if (!isOut && open && openHours < MAX_SHIFT_HOURS) {
      return { ok: false, message: 'Bạn đã vào ca lúc ' + fmt_(prevIn, 'HH:mm') + ' ngày ' + fmt_(prevIn, 'dd/MM') + ' và chưa ra ca. Muốn kết thúc ca thì chọn "Ra ca".' };
    }

    // Ra ca lần nữa ngay sau khi vừa ra ca.
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
        if (d === today && rc !== code && (r[C.DEV_IN - 1] === device || r[C.DEV_OUT - 1] === device)) others[rc] = true;
      });
      var n = Object.keys(others).length;
      if (n > 0) warns.push('Thiết bị này đã điểm danh cho ' + n + ' mã khác hôm nay');
    }

    // Lưu ảnh vào Drive.
    var fileName = fmt_(now, 'yyyyMMdd_HHmmss') + '_' + code + '_' + (isOut ? 'ra' : 'vao') + '.jpg';
    var blob = Utilities.newBlob(Utilities.base64Decode(m[1]), 'image/jpeg', fileName);
    var url = getFolder_().createFile(blob).getUrl();
    var link = '=HYPERLINK("' + url + '","Xem ảnh")';

    if (!isOut) {
      // VÀO CA: tạo dòng mới.
      if (open && openHours >= MAX_SHIFT_HOURS) addWarn_(sh, prevRow, 'Quên điểm danh ra ca');
      sh.appendRow([now, code, name, now, '', '', '', '', warns.join('; '), device, '']);
      var row = sh.getLastRow();
      sh.getRange(row, C.DATE).setNumberFormat('dd/MM/yyyy');
      sh.getRange(row, C.IN).setNumberFormat('dd/MM/yyyy HH:mm:ss');
      sh.getRange(row, C.OUT).setNumberFormat('dd/MM/yyyy HH:mm:ss');
      sh.getRange(row, C.HOURS).setFormula(hoursFormula_(row)).setNumberFormat('0.00');
      sh.getRange(row, C.PHOTO_IN).setFormula(link);
      if (warns.length) sh.getRange(row, 1, 1, HEADERS.length).setBackground('#fde8dc');
      return { ok: true, name: name, message: 'Đã vào ca lúc ' + nowTxt + ' ngày ' + today + '.' };
    }

    // RA CA
    if (open && openHours <= MAX_SHIFT_HOURS) {
      // Ghi giờ ra vào dòng đang mở.
      sh.getRange(prevRow, C.OUT).setValue(now).setNumberFormat('dd/MM/yyyy HH:mm:ss');
      sh.getRange(prevRow, C.PHOTO_OUT).setFormula(link);
      sh.getRange(prevRow, C.DEV_OUT).setValue(device);
      sh.getRange(prevRow, C.HOURS).setFormula(hoursFormula_(prevRow)).setNumberFormat('0.00');
      warns.forEach(function (w) { addWarn_(sh, prevRow, w); });
      var worked = Math.max(0, openHours - BREAK_MINUTES / 60);
      var hh = Math.floor(worked), mm = Math.round((worked - hh) * 60);
      if (mm === 60) { hh += 1; mm = 0; }
      return { ok: true, name: name, message: 'Đã ra ca lúc ' + nowTxt + '. Hôm nay bạn làm ' + hh + ' giờ ' + mm + ' phút.' };
    }

    // Không có giờ vào tương ứng: tạo dòng chỉ có giờ ra để quản lý xử lý.
    if (open && openHours > MAX_SHIFT_HOURS) addWarn_(sh, prevRow, 'Quên điểm danh ra ca');
    warns.unshift('Thiếu giờ vào');
    sh.appendRow([now, code, name, '', now, '', '', '', warns.join('; '), '', device]);
    var r2 = sh.getLastRow();
    sh.getRange(r2, C.DATE).setNumberFormat('dd/MM/yyyy');
    sh.getRange(r2, C.IN).setNumberFormat('dd/MM/yyyy HH:mm:ss');
    sh.getRange(r2, C.OUT).setNumberFormat('dd/MM/yyyy HH:mm:ss');
    sh.getRange(r2, C.HOURS).setFormula(hoursFormula_(r2)).setNumberFormat('0.00');
    sh.getRange(r2, C.PHOTO_OUT).setFormula(link);
    sh.getRange(r2, 1, 1, HEADERS.length).setBackground('#fde8dc');
    return { ok: true, name: name, message: 'Đã ghi giờ ra lúc ' + nowTxt + '. Hệ thống không thấy giờ vào của bạn nên quản lý sẽ kiểm tra.' };
  } finally {
    lock.releaseLock();
  }
}
