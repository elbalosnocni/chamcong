/**
 * Chấm công GPS - backend Google Apps Script.
 * Sheet ID đã được điền theo thông tin người dùng cung cấp.
 * Bảo mật: đặt Script Property WORKER_SECRET trùng với secret của Cloudflare Worker.
 */
const CONFIG = {
  SPREADSHEET_ID: "1R__aaKBJhbgISjq-uMRqg5G-AOQ1VKIUpNg76h2H-uE",
  PHOTO_FOLDER_NAME: "ChamCongGPS_Photos",
  DEFAULT_RADIUS_METERS: 100,
  MAX_PHOTO_BYTES: 4 * 1024 * 1024,
  MAX_GPS_ACCURACY_METERS: 150
};
const SHEETS = {
  Employees: ["Code","Name","Department","Role","Active"],
  Locations: ["ID","Name","Latitude","Longitude","RadiusMeters","Active"],
  Attendance: ["Timestamp","EmployeeCode","EmployeeName","Department","Type","LocationID","LocationName","Latitude","Longitude","AccuracyMeters","PhotoURL"]
};

function setupSystem() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  Object.keys(SHEETS).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) sh.appendRow(SHEETS[name]);
    sh.setFrozenRows(1);
  });
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty("PHOTO_FOLDER_ID")) {
    const folder = DriveApp.createFolder(CONFIG.PHOTO_FOLDER_NAME);
    props.setProperty("PHOTO_FOLDER_ID", folder.getId());
  }
  Logger.log("Setup hoàn tất. Sheet: " + ss.getUrl());
}

function doGet() {
  return json_({ok:true,service:"ChamCongGPS API",version:"2.0"});
}
function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const expected = PropertiesService.getScriptProperties().getProperty("WORKER_SECRET");
    if (!expected || body._workerSecret !== expected) return json_({ok:false,error:"Unauthorized"});
    const result = route_(body);
    return json_({ok:true,...result});
  } catch (err) {
    return json_({ok:false,error:err && err.message ? err.message : String(err)});
  }
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function ss_(){ return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID); }
function sheet_(name){ const sh=ss_().getSheetByName(name); if(!sh) throw new Error("Thiếu sheet "+name+". Hãy chạy setupSystem()."); return sh; }
function rows_(name){ const v=sheet_(name).getDataRange().getValues(); return v.length>1?v.slice(1):[]; }
function route_(b) {
  switch(b.action) {
    case "login": return {employee: employee_(b.employeeCode)};
    case "init": {
      const emp=employee_(b.employeeCode);
      const locations=rows_("Locations").filter(r=>truth_(r[5])).map(r=>({id:String(r[0]),name:String(r[1]),lat:Number(r[2]),lng:Number(r[3]),radius:Number(r[4])||CONFIG.DEFAULT_RADIUS_METERS}));
      return {locations,lastEvent:lastEvent_(emp.code)};
    }
    case "attendance_submit": return submitAttendance_(b);
    case "admin_save_location": admin_(b.employeeCode); return saveLocation_(b);
    case "admin_save_employee": admin_(b.employeeCode); return saveEmployee_(b);
    case "admin_report": admin_(b.employeeCode); return report_(b.month);
    default: throw new Error("Hành động không hợp lệ.");
  }
}
function employee_(code) {
  code=String(code||"").trim().toUpperCase();
  if(!code) throw new Error("Nhập mã nhân viên.");
  const r=rows_("Employees").find(x=>String(x[0]).trim().toUpperCase()===code && truth_(x[4]));
  if(!r) throw new Error("Mã nhân viên không tồn tại hoặc đã khóa.");
  return {code:String(r[0]),name:String(r[1]),department:String(r[2]||""),role:String(r[3]||"EMPLOYEE").toUpperCase()};
}
function admin_(code){ if(employee_(code).role!=="ADMIN") throw new Error("Bạn không có quyền quản trị."); }
function truth_(v){ return v===true || String(v).toUpperCase()==="TRUE" || String(v)==="1" || String(v).toUpperCase()==="ACTIVE"; }
function lastEvent_(code) {
  const a=rows_("Attendance").filter(r=>String(r[1]).toUpperCase()===String(code).toUpperCase());
  if(!a.length) return null;
  const r=a[a.length-1], d=(r[0] instanceof Date)?r[0]:new Date(r[0]);
  return {type:String(r[4]),time:Utilities.formatDate(d,Session.getScriptTimeZone(),"dd/MM/yyyy HH:mm")};
}
function submitAttendance_(b) {
  const lock=LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const emp=employee_(b.employeeCode), type=String(b.type||"").toUpperCase();
    if(!["IN","OUT"].includes(type)) throw new Error("Loại chấm công không hợp lệ.");
    const last=lastEvent_(emp.code);
    if(type==="OUT" && (!last || last.type!=="IN")) throw new Error("Bạn chưa có lượt CHẤM VÀO hợp lệ. Vui lòng chấm vào trước.");
    if(type==="IN" && last && last.type==="IN") throw new Error("Bạn đang có lượt CHẤM VÀO chưa kết thúc bằng CHẤM RA.");
    const lat=Number(b.lat),lng=Number(b.lng),accuracy=Number(b.accuracy);
    if(!isFinite(lat)||!isFinite(lng)||lat < -90||lat>90||lng < -180||lng>180) throw new Error("Tọa độ GPS không hợp lệ.");
    if(!isFinite(accuracy)||accuracy>CONFIG.MAX_GPS_ACCURACY_METERS) throw new Error("GPS chưa đủ chính xác. Hãy thử lại ở nơi thoáng.");
    const loc=rows_("Locations").find(r=>String(r[0])===String(b.locationId)&&truth_(r[5]));
    if(!loc) throw new Error("Địa điểm không tồn tại hoặc đã ngừng hoạt động.");
    const radius=Number(loc[4])||CONFIG.DEFAULT_RADIUS_METERS;
    const distance=distanceMeters_(lat,lng,Number(loc[2]),Number(loc[3]));
    if(distance>radius) throw new Error("Bạn đang ngoài vùng chấm công ("+Math.round(distance)+"m, giới hạn "+radius+"m).");
    const photo=String(b.photoData||"");
    const match=photo.match(/^data:image\/(jpeg|jpg|png);base64,(.+)$/);
    if(!match) throw new Error("Ảnh selfie không hợp lệ.");
    const bytes=Utilities.base64Decode(match[2]);
    if(bytes.length>CONFIG.MAX_PHOTO_BYTES) throw new Error("Ảnh quá lớn. Vui lòng chụp lại.");
    const folderId=PropertiesService.getScriptProperties().getProperty("PHOTO_FOLDER_ID");
    if(!folderId) throw new Error("Chưa cấu hình thư mục ảnh. Chạy setupSystem().");
    const blob=Utilities.newBlob(bytes,"image/jpeg",emp.code+"_"+type+"_"+Date.now()+".jpg");
    const file=DriveApp.getFolderById(folderId).createFile(blob);
    file.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.VIEW);
    const now=new Date();
    sheet_("Attendance").appendRow([now,emp.code,emp.name,emp.department,type,String(loc[0]),String(loc[1]),lat,lng,accuracy,file.getUrl()]);
    return {time:Utilities.formatDate(now,Session.getScriptTimeZone(),"dd/MM/yyyy HH:mm:ss"),distance:Math.round(distance)};
  } finally { lock.releaseLock(); }
}
function saveLocation_(b) {
  const name=String(b.name||"").trim(),lat=Number(b.lat),lng=Number(b.lng),radius=Number(b.radius);
  if(!name||!isFinite(lat)||!isFinite(lng)||lat < -90||lat>90||lng < -180||lng>180) throw new Error("Thông tin địa điểm chưa hợp lệ.");
  if(!isFinite(radius)||radius<10||radius>5000) throw new Error("Bán kính phải từ 10 đến 5000 mét.");
  const id="LOC-"+Utilities.getUuid().slice(0,8).toUpperCase();
  sheet_("Locations").appendRow([id,name,lat,lng,radius,true]);
  return {locationId:id};
}
function saveEmployee_(b) {
  const code=String(b.newCode||"").trim().toUpperCase(),name=String(b.name||"").trim();
  if(!code||!name) throw new Error("Cần nhập mã và họ tên.");
  if(rows_("Employees").some(r=>String(r[0]).toUpperCase()===code)) throw new Error("Mã nhân viên đã tồn tại.");
  const role=String(b.role||"EMPLOYEE").toUpperCase()==="ADMIN"?"ADMIN":"EMPLOYEE";
  sheet_("Employees").appendRow([code,name,String(b.department||""),role,true]);
  return {employeeCode:code};
}
function report_(month) {
  if(!/^\d{4}-\d{2}$/.test(String(month||""))) throw new Error("Chọn tháng báo cáo.");
  const prefix=String(month);
  const rows=rows_("Attendance").filter(r=>{
    const d=(r[0] instanceof Date)?r[0]:new Date(r[0]);
    return Utilities.formatDate(d,Session.getScriptTimeZone(),"yyyy-MM")===prefix;
  }).map(r=>{
    const d=(r[0] instanceof Date)?r[0]:new Date(r[0]);
    return {time:Utilities.formatDate(d,Session.getScriptTimeZone(),"yyyy-MM-dd HH:mm:ss"),employeeCode:r[1],name:r[2],department:r[3],type:r[4],location:r[6],lat:r[7],lng:r[8],accuracy:r[9],photoUrl:r[10]};
  });
  return {rows};
}
function distanceMeters_(lat1,lon1,lat2,lon2) {
  const R=6371000,toRad=x=>x*Math.PI/180;
  const dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}