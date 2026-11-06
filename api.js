(function(){
  const endpoint = window.ATTENDANCE_API_URL || '';
  function ensureEndpoint(){
    if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(endpoint))
      throw new Error('Chưa cấu hình URL Google Apps Script trong config.js');
  }
  function get(action, params){
    ensureEndpoint();
    return new Promise((resolve,reject)=>{
      const cb='ddcb_'+Date.now()+'_'+Math.random().toString(36).slice(2);
      const query=new URLSearchParams(Object.assign({action,callback:cb},params||{}));
      const script=document.createElement('script');
      const timer=setTimeout(()=>{cleanup();reject(new Error('Hết thời gian chờ API.'));},20000);
      function cleanup(){clearTimeout(timer);delete window[cb];script.remove();}
      window[cb]=res=>{cleanup();resolve(res);};
      script.onerror=()=>{cleanup();reject(new Error('Không kết nối được API.'));};
      script.src=endpoint+'?'+query.toString();document.head.appendChild(script);
    });
  }
  function post(action,data){
    ensureEndpoint();
    return new Promise((resolve,reject)=>{
      const nonce='n'+Date.now()+Math.random().toString(36).slice(2);
      const iframe=document.createElement('iframe');
      iframe.name='dd_frame_'+nonce;iframe.style.display='none';
      const form=document.createElement('form');form.method='POST';form.action=endpoint;
      form.target=iframe.name;form.style.display='none';
      const input=document.createElement('input');input.name='payload';input.type='hidden';
      input.value=JSON.stringify({action,data:data||{},nonce});form.appendChild(input);
      const timer=setTimeout(()=>{cleanup();reject(new Error('Hết thời gian chờ phản hồi từ máy chủ.'));},60000);
      function cleanup(){clearTimeout(timer);window.removeEventListener('message',onMessage);form.remove();iframe.remove();}
      
      // Hàm onMessage đã loại bỏ kiểm tra ev.source để tránh lỗi rớt gói tin trên browser bảo mật
      function onMessage(ev){
        if(!ev.data || ev.data.type !== 'DD_API_RESULT' || ev.data.nonce !== nonce) return;
        cleanup();
        resolve(ev.data.result);
      }
      
      window.addEventListener('message',onMessage);
      document.body.appendChild(iframe);document.body.appendChild(form);form.submit();
    });
  }
  window.AttendanceAPI={get,post};
})();
