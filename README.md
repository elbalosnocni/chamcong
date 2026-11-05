# Chấm công GPS v2 — GitHub Pages + Cloudflare Worker + Google Apps Script

Bản này tách frontend khỏi Apps Script. GitHub Pages chỉ phục vụ giao diện; Cloudflare Worker làm API gateway/CORS; Apps Script ghi dữ liệu vào Google Sheets và ảnh vào Drive.

## 1. Cấu hình Google Sheet

Sheet ID đã được điền trong `gas/Code.gs`:

`1R__aaKBJhbgISjq-uMRqg5G-AOQ1VKIUpNg76h2H-uE`

1. Mở Apps Script tại `https://script.google.com/` và tạo project mới.
2. Dán toàn bộ `gas/Code.gs` vào file `Code.gs`.
3. Trong **Project Settings → Script properties**, tạo:
   - `WORKER_SECRET` = một chuỗi bí mật ngẫu nhiên dài tối thiểu 32 ký tự.
4. Chạy hàm `setupSystem()` một lần và cấp quyền Google Sheets/Drive.
5. Mở Google Sheet, tab `Employees`, thêm nhân viên đầu tiên:
   - Code: mã nhân viên, ví dụ `ADMIN001`
   - Name: tên quản trị viên
   - Department: bộ phận
   - Role: `ADMIN`
   - Active: `TRUE`
6. Deploy → New deployment → Web app:
   - Execute as: **Me**
   - Who has access: **Anyone** (API được bảo vệ bằng secret ở Worker; không chia sẻ URL/secret).
   - Deploy và sao chép URL `/exec` làm `GAS_URL`.

`setupSystem()` tạo các tab `Employees`, `Locations`, `Attendance` và thư mục ảnh riêng tư trong Drive. Chạy lại hàm này không xóa dữ liệu hiện có.

## 2. Cấu hình Cloudflare Worker

1. Tạo Worker mới trong Cloudflare.
2. Dán `worker/worker.js`.
3. Thêm Worker variables/secrets:
   - `GAS_URL` = URL Web App `/exec`.
   - `WORKER_SECRET` = đúng chuỗi `WORKER_SECRET` đã đặt trong Apps Script.
   - `ALLOWED_ORIGIN` = origin GitHub Pages, ví dụ `https://TEN-USER.github.io` (không có dấu `/` cuối).
4. Deploy và sao chép URL Worker, ví dụ `https://attendance-api.<subdomain>.workers.dev`.

## 3. Cấu hình GitHub Pages

1. Tạo repository GitHub và tải các file trong thư mục này lên.
2. Mở `assets/js/app.js`, sửa:
   `const API_URL = "YOUR_CLOUDFLARE_WORKER_URL";`
   thành URL Worker thật.
3. Trong GitHub → Settings → Pages, chọn deploy từ branch `main`, folder `/root`.
4. Chờ GitHub Pages cấp HTTPS. Cập nhật `ALLOWED_ORIGIN` trong Worker đúng origin GitHub Pages, ví dụ `https://TEN-USER.github.io` (không thêm tên repository vào origin).

## 4. Khởi tạo dữ liệu

- Tab `Employees`: thêm nhân viên. Role hợp lệ: `ADMIN` hoặc `EMPLOYEE`; Active là `TRUE`/`FALSE`.
- Đăng nhập bằng mã nhân viên.
- Admin tạo địa điểm với vĩ độ/kinh độ và bán kính. Bán kính mặc định khuyến nghị 100m; có thể chỉnh từ 10 đến 5000m.
- Có thể lấy tọa độ địa điểm từ Google Maps (nhấn giữ vị trí trên bản đồ để lấy tọa độ).

## 5. Quy tắc chấm công

- CHẤM RA bị từ chối nếu sự kiện gần nhất không phải CHẤM VÀO.
- Không cho CHẤM VÀO liên tiếp khi chưa CHẤM RA.
- Server kiểm tra tọa độ, độ chính xác GPS, địa điểm và bán kính.
- Mỗi lượt lưu timestamp, mã/tên nhân viên, bộ phận, loại chấm, địa điểm, tọa độ, độ chính xác và URL ảnh selfie.
- Admin tải CSV theo tháng.

## 6. Kiểm tra bảo mật quan trọng

- Đăng nhập chỉ bằng mã nhân viên là cơ chế nhận diện yếu: người biết mã có thể giả danh nhân viên. Trước khi triển khai chính thức, nên bổ sung PIN/mật khẩu hoặc xác thực Google Workspace.
- GPS từ trình duyệt có thể bị giả lập/spoof; bán kính chỉ là kiểm tra vị trí do thiết bị gửi, không phải chống gian lận tuyệt đối.
- Selfie là ảnh minh chứng, chưa có nhận diện khuôn mặt hoặc kiểm tra người thật (liveness).
- Giữ Google Sheet và thư mục Drive ở chế độ riêng tư. Không đưa `WORKER_SECRET` vào GitHub hoặc frontend.
- Apps Script Web App được đặt quyền truy cập Anyone để Worker gọi được; endpoint này từ chối yêu cầu thiếu secret. Nếu lộ secret, hãy thay ở cả Apps Script và Worker.
- Cần kiểm tra chính sách nội bộ, thông báo cho nhân viên về việc thu thập ảnh/vị trí và thời hạn lưu trữ trước khi sử dụng.

## 7. Giới hạn phiên bản

Bản v2 là bộ mã nguồn triển khai nền tảng, chưa được deploy/kiểm thử trong tài khoản Google/Cloudflare/GitHub của bạn. Cần hoàn tất các bước cấu hình và chạy thử thực tế. Chưa có tính công, ca đêm, tăng ca, đồng bộ payroll, chống GPS giả mạo nâng cao hay nhận diện khuôn mặt.
