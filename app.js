// Điền URL Worker sau khi deploy: https://<worker>.<subdomain>.workers.dev
const API_URL = "YOUR_CLOUDFLARE_WORKER_URL";
const $ = (id) => document.getElementById(id);
let employee = null, stream = null, photoData = "";

function showMessage(message, kind="") { const el=$("message"); el.textContent=message; el.className="message "+kind; }
async function api(action, data={}) {
  if (!API_URL.startsWith("https://")) throw new Error("Chưa cấu hình API_URL trong assets/js/app.js");
  const res = await fetch(API_URL, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({action,...data})});
  const json = await res.json().catch(()=>({ok:false,error:"Phản hồi API không hợp lệ"}));
  if (!res.ok || !json.ok) throw new Error(json.error || `Lỗi máy chủ (${res.status})`);
  return json;
}
function switchPanel(loggedIn) {
  $("loginPanel").classList.toggle("hidden",loggedIn);
  $("attendancePanel").classList.toggle("hidden",!loggedIn);
  $("adminPanel").classList.toggle("hidden",!loggedIn || employee?.role!=="ADMIN");
}
async function login() {
  try {
    $("loginBtn").disabled=true;
    const code=$("employeeCode").value.trim();
    if(!code) throw new Error("Vui lòng nhập mã nhân viên.");
    const r=await api("login",{employeeCode:code});
    employee=r.employee; $("employeeName").textContent=employee.name;
    $("employeeMeta").textContent=[employee.code,employee.department].filter(Boolean).join(" • ");
    switchPanel(true);
    const init=await api("init",{employeeCode:employee.code});
    $("locationSelect").innerHTML="";
    (init.locations||[]).forEach(l=>{const o=document.createElement("option");o.value=l.id;o.textContent=`${l.name} • ${l.radius}m`; $("locationSelect").appendChild(o);});
    $("lastStatus").textContent=init.lastEvent ? `Lượt gần nhất: ${init.lastEvent.type==="IN"?"CHẤM VÀO":"CHẤM RA"} lúc ${init.lastEvent.time}` : "Chưa có lượt chấm công hôm nay.";
    if(employee.role==="ADMIN") $("reportMonth").value=new Date().toISOString().slice(0,7);
  } catch(e){showMessage(e.message,"error"); alert(e.message);}
  finally{$("loginBtn").disabled=false;}
}
async function startCamera(){
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"},audio:false});
    $("camera").srcObject=stream;$("cameraPlaceholder").classList.add("hidden");
    $("retakeBtn").disabled=false;
  }catch(e){showMessage("Không mở được camera. Hãy cấp quyền camera và dùng HTTPS.", "error");}
}
function takePhoto(){
  const v=$("camera"); if(!stream || !v.videoWidth){showMessage("Hãy bật camera trước.", "error");return;}
  const c=$("snapshot");c.width=v.videoWidth;c.height=v.videoHeight;
  const ctx=c.getContext("2d");ctx.translate(c.width,0);ctx.scale(-1,1);ctx.drawImage(v,0,0);
  photoData=c.toDataURL("image/jpeg",0.78);$("preview").src=photoData;$("preview").classList.remove("hidden");
}
function getPosition(){
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation) return reject(new Error("Thiết bị không hỗ trợ GPS."));
    navigator.geolocation.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy}),e=>reject(new Error("Không lấy được vị trí GPS: "+e.message)),{enableHighAccuracy:true,timeout:20000,maximumAge:0});
  });
}
async function submit(type){
  try{
    if(!photoData) takePhoto();
    if(!photoData) throw new Error("Cần chụp selfie trước khi chấm công.");
    const locationId=$("locationSelect").value;if(!locationId) throw new Error("Chưa có địa điểm chấm công. Admin cần tạo địa điểm.");
    showMessage("Đang lấy vị trí GPS...");
    const pos=await getPosition();
    showMessage("Đang gửi dữ liệu chấm công...");
    const r=await api("attendance_submit",{employeeCode:employee.code,type,locationId,...pos,photoData});
    $("lastStatus").textContent=`${type==="IN"?"CHẤM VÀO":"CHẤM RA"} thành công lúc ${r.time}`;
    showMessage(`Đã ghi nhận ${type==="IN"?"chấm vào":"chấm ra"} lúc ${r.time}.`,"ok");
    photoData="";$("preview").classList.add("hidden");
  }catch(e){showMessage(e.message,"error");}
}
async function saveLocation(){
  try{await api("admin_save_location",{employeeCode:employee.code,name:$("locName").value.trim(),lat:Number($("locLat").value),lng:Number($("locLng").value),radius:Number($("locRadius").value)});
    alert("Đã lưu địa điểm.");location.reload();
  }catch(e){alert(e.message);}
}
async function saveEmployee(){
  try{await api("admin_save_employee",{employeeCode:employee.code,newCode:$("newEmpCode").value.trim(),name:$("newEmpName").value.trim(),department:$("newEmpDept").value.trim(),role:$("newEmpRole").value});
    alert("Đã lưu nhân viên.");
  }catch(e){alert(e.message);}
}
async function exportReport(){
  try{
    const r=await api("admin_report",{employeeCode:employee.code,month:$("reportMonth").value});
    const rows=[["Thời gian","Mã NV","Họ tên","Bộ phận","Loại","Địa điểm","Vĩ độ","Kinh độ","Độ chính xác (m)","Ảnh"]];
    (r.rows||[]).forEach(x=>rows.push([x.time,x.employeeCode,x.name,x.department,x.type,x.location,x.lat,x.lng,x.accuracy,x.photoUrl]));
    const csv=rows.map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\r\n");
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));a.download=`cham-cong-${$("reportMonth").value}.csv`;a.click();URL.revokeObjectURL(a.href);
  }catch(e){alert(e.message);}
}
$("loginBtn").addEventListener("click",login);
$("employeeCode").addEventListener("keydown",e=>{if(e.key==="Enter")login();});
$("logoutBtn").addEventListener("click",()=>{if(stream)stream.getTracks().forEach(t=>t.stop());employee=null;photoData="";switchPanel(false);});
$("cameraBtn").addEventListener("click",startCamera);
$("retakeBtn").addEventListener("click",takePhoto);
$("inBtn").addEventListener("click",()=>submit("IN"));
$("outBtn").addEventListener("click",()=>submit("OUT"));
$("saveLocBtn").addEventListener("click",saveLocation);
$("saveEmpBtn").addEventListener("click",saveEmployee);
$("reportBtn").addEventListener("click",exportReport);
