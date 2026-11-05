/** CHAM CONG GPS V1 - Google Apps Script
 * Run setupSystem() once as the spreadsheet/Drive owner, then deploy as Web App.
 * Authentication is employee-code-only by explicit project requirement. This is
 * identification, not strong authentication; see README before production use.
 */
const CFG = {
  APP_NAME: 'CHẤM CÔNG GPS',
  SHEETS: {
    EMP: 'NHAN_VIEN', LOC: 'DIA_DIEM', ATT: 'CHAM_CONG', LOG: 'NHAT_KY'
  },
  DEFAULT_RADIUS: 100,
  SESSION_SECONDS: 21600,
  MAX_PHOTO_BYTES: 4 * 1024 * 1024
};

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle(CFG.APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1');
}
function include(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

function setupSystem() {
  const props = PropertiesService.getScriptProperties();
  const ssId = props.getProperty('SPREADSHEET_ID');
  const ss = ssId ? SpreadsheetApp.openById(ssId) : SpreadsheetApp.create('Du lieu cham cong GPS');
  props.setProperty('SPREADSHEET_ID', ss.getId());
  const folderId = props.getProperty('PHOTO_FOLDER_ID');
  const folder = folderId ? DriveApp.getFolderById(folderId) : DriveApp.createFolder('Anh cham cong GPS');
  props.setProperty('PHOTO_FOLDER_ID', folder.getId());

  ensureSheet_(ss, CFG.SHEETS.EMP, ['MaNV','HoTen','PhongBan','VaiTro','TrangThai']);
  ensureSheet_(ss, CFG.SHEETS.LOC, ['MaDiaDiem','TenDiaDiem','ViDo','KinhDo','BanKinhMet','TrangThai']);
  ensureSheet_(ss, CFG.SHEETS.ATT, ['MaBanGhi','ThoiGianMayChu','Ngay','MaNV','HoTen','PhongBan','Loai','MaDiaDiem','TenDiaDiem','ViDo','KinhDo','KhoangCachMet','AnhDriveId','AnhURL','UserAgent']);
  ensureSheet_(ss, CFG.SHEETS.LOG, ['ThoiGian','NguoiThucHien','HanhDong','ChiTiet']);
  if (ss.getSheetByName(CFG.SHEETS.EMP).getLastRow() === 1) {
    ss.getSheetByName(CFG.SHEETS.EMP).appendRow(['ADMIN','Quản trị hệ thống','Ban quản trị','ADMIN','ACTIVE']);
  }
  return {ok:true, spreadsheetUrl:ss.getUrl(), photoFolderUrl:folder.getUrl(),
    message:'Đã khởi tạo dữ liệu. Hãy sửa mã ADMIN mẫu và thêm nhân viên/địa điểm trong Google Sheets.'};
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.appendRow(headers);
  return sh;
}
function db_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Chưa khởi tạo. Hãy chạy setupSystem() trước.');
  return SpreadsheetApp.openById(id);
}
function rows_(sheetName) {
  const sh = db_().getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return [];
  const vals = sh.getDataRange().getValues();
  const heads = vals.shift();
  return vals.filter(r => r.some(v => v !== '')).map(r => {
    const o = {}; heads.forEach((h,i) => o[h] = r[i]); return o;
  });
}
function active_(v) { return String(v).toUpperCase() === 'ACTIVE'; }
function clean_(v) { return String(v == null ? '' : v).trim(); }
function log_(who, action, detail) {
  db_().getSheetByName(CFG.SHEETS.LOG).appendRow([new Date(), who, action, String(detail || '')]);
}
function apiLogin(code) {
  code = clean_(code).toUpperCase();
  if (!code) throw new Error('Vui lòng nhập mã nhân viên.');
  const emp = rows_(CFG.SHEETS.EMP).find(x => clean_(x.MaNV).toUpperCase() === code && active_(x.TrangThai));
  if (!emp) throw new Error('Mã nhân viên không tồn tại hoặc đã bị khóa.');
  const token = Utilities.getUuid() + Utilities.getUuid();
  const user = {code:code, name:clean_(emp.HoTen), dept:clean_(emp.PhongBan), role:clean_(emp.VaiTro || 'EMPLOYEE').toUpperCase()};
  CacheService.getScriptCache().put('sess_'+token, JSON.stringify(user), CFG.SESSION_SECONDS);
  log_(code, 'LOGIN', 'Đăng nhập thành công');
  return {token:token, user:user};
}
function auth_(token) {
  const raw = CacheService.getScriptCache().get('sess_'+clean_(token));
  if (!raw) throw new Error('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
  return JSON.parse(raw);
}
function requireAdmin_(token) {
  const u = auth_(token);
  if (!['ADMIN','MANAGER'].includes(u.role)) throw new Error('Bạn không có quyền thực hiện chức năng này.');
  return u;
}
function apiLogout(token) { const u=auth_(token); CacheService.getScriptCache().remove('sess_'+clean_(token)); log_(u.code,'LOGOUT','Đăng xuất'); return {ok:true}; }

function apiGetInit(token) {
  const u = auth_(token);
  const locations = rows_(CFG.SHEETS.LOC).filter(x => active_(x.TrangThai)).map(x => ({
    id:clean_(x.MaDiaDiem), name:clean_(x.TenDiaDiem), lat:Number(x.ViDo), lng:Number(x.KinhDo),
    radius:Number(x.BanKinhMet) || CFG.DEFAULT_RADIUS
  })).filter(x => x.id && Number.isFinite(x.lat) && Number.isFinite(x.lng));
  const open = rows_(CFG.SHEETS.ATT).filter(x => clean_(x.MaNV).toUpperCase()===u.code && clean_(x.Loai)==='VÀO')
    .filter(x => !rows_(CFG.SHEETS.ATT).some(y => clean_(y.MaNV).toUpperCase()===u.code && clean_(y.Loai)==='RA' && clean_(y.MaBanGhi).startsWith(clean_(x.MaBanGhi).split('_')[0])));
  // The definitive open-shift check is performed against the latest unmatched event below.
  const events = rows_(CFG.SHEETS.ATT).filter(x => clean_(x.MaNV).toUpperCase()===u.code);
  const last = events.sort((a,b)=>new Date(b.ThoiGianMayChu)-new Date(a.ThoiGianMayChu))[0];
  const isOpen = !!last && clean_(last.Loai)==='VÀO';
  const payload = {user:u, locations:locations, openShift:isOpen, lastEvent:last ? {type:last.Loai, time:last.ThoiGianMayChu, location:last.TenDiaDiem} : null};
  if (['ADMIN','MANAGER'].includes(u.role)) {
    payload.employees = rows_(CFG.SHEETS.EMP);
    payload.allLocations = rows_(CFG.SHEETS.LOC);
    payload.recent = rows_(CFG.SHEETS.ATT).slice(-300).reverse().map(serializableRow_);
  }
  return payload;
}

function apiSubmitAttendance(token, data) {
  const u = auth_(token);
  if (!data || !['VÀO','RA'].includes(clean_(data.type))) throw new Error('Loại chấm công không hợp lệ.');
  const type = clean_(data.type);
  const locId = clean_(data.locationId);
  const lat = Number(data.lat), lng = Number(data.lng), accuracy = Number(data.accuracy);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Không đọc được vị trí GPS.');
  if (Number.isFinite(accuracy) && accuracy > 100) throw new Error('GPS chưa đủ chính xác (độ chính xác phải ≤ 100m). Hãy thử lại ngoài trời.');
  const loc = rows_(CFG.SHEETS.LOC).find(x => clean_(x.MaDiaDiem)===locId && active_(x.TrangThai));
  if (!loc) throw new Error('Địa điểm không hợp lệ hoặc đã ngừng hoạt động.');
  const dist = haversine_(lat,lng,Number(loc.ViDo),Number(loc.KinhDo));
  const radius = Number(loc.BanKinhMet) || CFG.DEFAULT_RADIUS;
  if (dist > radius) throw new Error('Bạn đang ngoài vùng cho phép. Khoảng cách: '+Math.round(dist)+'m; giới hạn: '+radius+'m.');
  const photo = clean_(data.photoData);
  const match = photo.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('Ảnh selfie không hợp lệ. Vui lòng chụp lại.');
  const bytes = Utilities.base64Decode(match[2]);
  if (bytes.length > CFG.MAX_PHOTO_BYTES) throw new Error('Ảnh quá lớn. Vui lòng chụp lại.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const events = rows_(CFG.SHEETS.ATT).filter(x => clean_(x.MaNV).toUpperCase()===u.code)
      .sort((a,b)=>new Date(a.ThoiGianMayChu)-new Date(b.ThoiGianMayChu));
    const last = events[events.length-1];
    const open = !!last && clean_(last.Loai)==='VÀO';
    if (type==='RA' && !open) throw new Error('Bạn chưa có lượt CHẤM VÀO hợp lệ. Vui lòng chọn CHẤM VÀO trước.');
    if (type==='VÀO' && open) throw new Error('Bạn đang có lượt vào chưa kết thúc. Vui lòng chấm RA trước.');
    const now = new Date();
    const tz = Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh';
    const day = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
    const id = Utilities.getUuid();
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const blob = Utilities.newBlob(bytes, 'image/'+match[1], u.code+'_'+type+'_'+Utilities.formatDate(now,tz,'yyyyMMdd_HHmmss')+'.'+ext);
    const folder = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('PHOTO_FOLDER_ID'));
    const file = folder.createFile(blob);
    const sh = db_().getSheetByName(CFG.SHEETS.ATT);
    sh.appendRow([id, now, day, u.code, u.name, u.dept, type, loc.id, loc.name,
      lat, lng, Math.round(dist), file.getId(), file.getUrl(), clean_(data.userAgent).slice(0,300)]);
    log_(u.code, 'ATTENDANCE_'+type, 'Địa điểm '+loc.name+'; cách '+Math.round(dist)+'m; ảnh '+file.getId());
    return {ok:true, type:type, time:Utilities.formatDate(now,tz,'dd/MM/yyyy HH:mm:ss'), distance:Math.round(dist), location:loc.name, photoUrl:file.getUrl()};
  } finally { lock.releaseLock(); }
}
function haversine_(lat1,lon1,lat2,lon2) {
  const R=6371000, rad=Math.PI/180, dLat=(lat2-lat1)*rad, dLon=(lon2-lon1)*rad;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin(dLon/2)**2;
  return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function apiAdminSaveEmployee(token, item) {
  const admin=requireAdmin_(token), code=clean_(item.code).toUpperCase();
  if (!code || !clean_(item.name)) throw new Error('Cần mã nhân viên và họ tên.');
  const requestedRole=clean_(item.role||'EMPLOYEE').toUpperCase();
  if (admin.role!=='ADMIN' && requestedRole!=='EMPLOYEE') throw new Error('Chỉ ADMIN được cấp quyền ADMIN/MANAGER.');
  const sh=db_().getSheetByName(CFG.SHEETS.EMP), vals=sh.getDataRange().getValues();
  let row=vals.findIndex((r,i)=>i>0 && clean_(r[0]).toUpperCase()===code);
  const record=[code,clean_(item.name),clean_(item.dept),requestedRole,clean_(item.status||'ACTIVE').toUpperCase()];
  if(row>0) sh.getRange(row+1,1,1,record.length).setValues([record]); else sh.appendRow(record);
  log_(admin.code,'SAVE_EMPLOYEE',code); return {ok:true};
}
function apiAdminSaveLocation(token, item) {
  const admin=requireAdmin_(token), id=clean_(item.id)||Utilities.getUuid().slice(0,8).toUpperCase();
  const lat=Number(item.lat), lng=Number(item.lng), radius=Number(item.radius)||CFG.DEFAULT_RADIUS;
  if(!clean_(item.name)||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||radius<10||radius>5000) throw new Error('Thông tin địa điểm/toạ độ/bán kính không hợp lệ (10–5000m).');
  const sh=db_().getSheetByName(CFG.SHEETS.LOC), vals=sh.getDataRange().getValues();
  const row=vals.findIndex((r,i)=>i>0&&clean_(r[0])===id);
  const rec=[id,clean_(item.name),lat,lng,radius,clean_(item.status||'ACTIVE').toUpperCase()];
  if(row>0) sh.getRange(row+1,1,1,rec.length).setValues([rec]); else sh.appendRow(rec);
  log_(admin.code,'SAVE_LOCATION',id); return {ok:true,id:id};
}
function apiAdminReport(token, from, to, employee) {
  requireAdmin_(token);
  return rows_(CFG.SHEETS.ATT).filter(x=>{
    const d=clean_(x.Ngay), e=clean_(employee).toUpperCase();
    return (!from||d>=from)&&(!to||d<=to)&&(!e||clean_(x.MaNV).toUpperCase()===e);
  }).sort((a,b)=>new Date(a.ThoiGianMayChu)-new Date(b.ThoiGianMayChu)).map(serializableRow_);
}
function serializableRow_(row) {
  const out={}; Object.keys(row).forEach(k=>{ const v=row[k]; out[k]=v instanceof Date ? Utilities.formatDate(v, Session.getScriptTimeZone()||'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm:ss') : v; }); return out;
}
