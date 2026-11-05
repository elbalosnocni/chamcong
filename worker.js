/**
 * Cloudflare Worker: CORS gateway cho GitHub Pages -> Google Apps Script.
 * Secrets/vars cần khai báo trong Cloudflare:
 *   GAS_URL       = URL Web App kết thúc bằng /exec
 *   WORKER_SECRET = chuỗi bí mật ngẫu nhiên dài tối thiểu 32 ký tự
 *   ALLOWED_ORIGIN= https://<username>.github.io (hoặc domain riêng)
 */
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN || "";
    const corsOrigin = (origin === allowed) ? origin : "null";
    const headers = {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    };
    if (request.method === "OPTIONS") return new Response(null, {status:204,headers});
    if (request.method !== "POST") return new Response(JSON.stringify({ok:false,error:"Method not allowed"}),{status:405,headers:{...headers,"Content-Type":"application/json"}});
    if (!env.GAS_URL || !env.WORKER_SECRET || !allowed) return new Response(JSON.stringify({ok:false,error:"Worker chưa được cấu hình đầy đủ"}),{status:500,headers:{...headers,"Content-Type":"application/json"}});
    if (origin !== allowed) return new Response(JSON.stringify({ok:false,error:"Origin không được phép"}),{status:403,headers:{...headers,"Content-Type":"application/json"}});
    try {
      const body = await request.json();
      body._workerSecret = env.WORKER_SECRET;
      const upstream = await fetch(env.GAS_URL, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(body),
        redirect:"follow"
      });
      const payload = await upstream.text();
      return new Response(payload,{status:upstream.ok?200:502,headers:{...headers,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
    } catch (e) {
      return new Response(JSON.stringify({ok:false,error:"Không kết nối được máy chủ chấm công"}),{status:502,headers:{...headers,"Content-Type":"application/json"}});
    }
  }
};