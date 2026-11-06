/**
 * Điểm danh nhân viên bằng QR + selfie
 * Công Ty Cổ Phần Liwayway VN
 *
 * Dán file này vào Apps Script của Google Sheets (xem HUONG-DAN.md).
 */

var TZ = 'Asia/Ho_Chi_Minh';
var SHEET_LOG = 'DiemDanh';        // sheet ghi lượt điểm danh (tự tạo)
var SHEET_STAFF = 'NhanVien';      // sheet danh sách nhân viên (tự tạo, không bắt buộc điền)
var FOLDER_NAME = 'DiemDanh_Anh';  // thư mục Drive chứa ảnh selfie (tự tạo)
var STALE_SECONDS = 180;           // ảnh cũ hơn mức này bị gắn cờ
var MIN_GAP_SECONDS = 60;          // chặn gửi trùng cùng mã, cùng loại trong khoảng này

var HEADERS = ['Thời gian', 'Ngày', 'Giờ', 'Mã NV', 'Họ tên', 'Loại', 'Ảnh', 'Tuổi ảnh (giây)', 'Mã thiết bị', 'Cảnh báo'];

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

/** Nhận một lượt điểm danh từ trang. */
function submitCheckin(data) {
  data = data || {};
  var code = String(data.code || '').trim().toUpperCase().slice(0, 30);
  var name = String(data.name || '').trim().slice(0, 80);
  var type = data.type === 'out' ? 'Ra ca' : 'Vào ca';
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
    var warns = [];

    // Đọc tối đa 600 dòng gần nhất để kiểm tra trùng và gian lận.
    var last = sh.getLastRow();
    var start = Math.max(2, last - 599);
    var recent = last >= 2 ? sh.getRange(start, 1, last - start + 1, HEADERS.length).getValues() : [];
    var today = Utilities.formatDate(now, TZ, 'dd/MM/yyyy');

    for (var i = recent.length - 1; i >= 0; i--) {
      var r = recent[i];
      var t = r[0] instanceof Date ? r[0] : new Date(r[0]);
      var gap = (now - t) / 1000;
      if (String(r[3]).toUpperCase() === code && r[5] === type && gap < MIN_GAP_SECONDS) {
        return { ok: false, message: 'Bạn vừa điểm danh xong. Vui lòng đợi ' + MIN_GAP_SECONDS + ' giây nếu cần gửi lại.' };
      }
      if (gap > 86400 * 2) break;
    }

    if (age > STALE_SECONDS) warns.push('Ảnh cũ ' + Math.round(age / 60) + ' phút');
    if (device) {
      var others = {};
      recent.forEach(function (r) {
        var d = r[1] instanceof Date ? Utilities.formatDate(r[1], TZ, 'dd/MM/yyyy') : String(r[1]);
        if (d === today && r[8] === device && String(r[3]).toUpperCase() !== code) others[String(r[3])] = true;
      });
      var n = Object.keys(others).length;
      if (n > 0) warns.push('Thiết bị này đã điểm danh cho ' + n + ' mã khác hôm nay');
    }

    var fileName = Utilities.formatDate(now, TZ, 'yyyyMMdd_HHmmss') + '_' + code + '_' + (type === 'Ra ca' ? 'ra' : 'vao') + '.jpg';
    var blob = Utilities.newBlob(Utilities.base64Decode(m[1]), 'image/jpeg', fileName);
    var file = getFolder_().createFile(blob);
    var url = file.getUrl();

    sh.appendRow([
      now,
      Utilities.formatDate(now, TZ, 'dd/MM/yyyy'),
      Utilities.formatDate(now, TZ, 'HH:mm:ss'),
      code,
      name,
      type,
      '',
      age,
      device,
      warns.join('; ')
    ]);
    var row = sh.getLastRow();
    sh.getRange(row, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
    // setFormula luôn dùng dấu phẩy, không phụ thuộc ngôn ngữ của bảng tính.
    sh.getRange(row, 7).setFormula('=HYPERLINK("' + url + '","Xem ảnh")');
    if (warns.length) sh.getRange(row, 1, 1, HEADERS.length).setBackground('#fde8dc');

    return {
      ok: true,
      message: type + ' lúc ' + Utilities.formatDate(now, TZ, 'HH:mm:ss') + ' ngày ' + today + '.',
      name: name
    };
  } finally {
    lock.releaseLock();
  }
}
