# Hệ thống điểm danh QR + Selfie — GitHub Pages

Frontend chạy trên **GitHub Pages**; Google Apps Script chỉ còn làm API và lưu dữ liệu vào Google Sheets/Drive. Không còn mở giao diện bằng `script.google.com/macros/.../exec` và không dùng `google.script.run`.

## 1. Cấu hình Google Apps Script (backend)

1. Tạo/mở Google Spreadsheet dùng lưu dữ liệu.
2. Mở **Tiện ích mở rộng → Apps Script**.
3. Thay toàn bộ `Code.gs` bằng file `Code.gs` trong thư mục này.
4. Trong `ADMIN_CONFIG`, đổi `username` và `password` mặc định `admin / Admin123` thành thông tin mạnh, riêng biệt.
5. Chạy hàm `setup()` một lần trong Apps Script để cấp quyền và tạo sheet `ChamCong`, `NhanVien`, thư mục Drive ảnh.
6. Trong `NhanVien`, nhập mã nhân viên ở cột A, họ tên ở cột B.
7. **Triển khai → Quản lý bản triển khai → Tạo bản triển khai mới → Ứng dụng web**:
   - Thực thi với tư cách: **Tôi**
   - Ai có quyền truy cập: **Bất kỳ ai**
8. Sao chép URL có dạng `https://script.google.com/macros/s/.../exec`.

> Khi cập nhật `Code.gs`, hãy tạo **Phiên bản mới** cho deployment hiện có, không cần đổi URL.

## 2. Cấu hình GitHub Pages (frontend)

1. Tạo repository GitHub mới (hoặc dùng repository hiện tại).
2. Upload các file frontend: `index.html`, `admin.html`, `qr.html`, `api.js`, `config.js`.
3. Mở `config.js`, thay `PASTE_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE` bằng URL `/exec` ở bước 1.
4. Vào **Settings → Pages**, chọn branch và thư mục chứa file (thường `main` / `/root`), lưu để bật GitHub Pages.
5. Mở URL GitHub Pages:
   - Nhân viên: `/`
   - Admin: `/admin.html`
   - Mã QR: `/qr.html`

Không dùng URL Apps Script để mở giao diện nữa.

## 3. Thiết lập vùng chấm công

1. Truy cập `/admin.html`, đăng nhập.
2. Ở mục **Vị trí điểm danh trực quan**, đứng tại tâm khu vực cần cho phép (ví dụ cổng nhà máy), bấm **Lấy GPS hiện tại**. Có thể nhập tay vĩ độ/kinh độ.
3. Chọn bán kính từ **20 đến 5000 mét**, bấm **Lưu khu vực**.
4. Bản đồ hiển thị vòng tròn khu vực cho phép và các điểm GPS ghi nhận trong ngày:
   - Xanh: điểm ghi nhận trong bán kính.
   - Đỏ: điểm ngoài bán kính (nếu dữ liệu cũ hoặc bị thay đổi).
5. Bảng chi tiết có liên kết **Xem bản đồ**, sai số GPS và khoảng cách đến tâm.

## 4. Cách kiểm tra vị trí

- Nhân viên phải cấp quyền vị trí cho trình duyệt và bật GPS/Location.
- Hệ thống yêu cầu độ chính xác GPS không quá 100 m; không lấy được GPS hoặc GPS có sai số lớn sẽ không cho gửi.
- Backend Apps Script tính khoảng cách Haversine từ tọa độ nhận được đến tâm và từ chối nếu vượt bán kính. Không chỉ kiểm tra ở trình duyệt.
- Chức năng vị trí cần HTTPS; GitHub Pages đáp ứng HTTPS.
- GPS trên điện thoại có thể sai lệch do nhà xưởng, mái tôn, nhà cao tầng hoặc môi trường trong nhà. Nên thử nghiệm tại địa điểm thực tế và đặt bán kính phù hợp.

## 5. Cấu trúc dữ liệu

`ChamCong` giữ 11 cột cũ và bổ sung:
- Vĩ độ, Kinh độ
- Sai số GPS (m)
- Khoảng cách đến tâm (m)

`CauHinh` lưu tọa độ tâm và bán kính. `NhanVien` giữ nguyên hai cột mã nhân viên/họ tên. Ảnh selfie vẫn lưu trong Drive.

Nếu đang có sheet `ChamCong` cũ, chạy lại `setup()` sau khi cập nhật để bổ sung các cột GPS ở cuối.

## 6. Lưu ý bảo mật

- Đổi ngay mật khẩu admin mẫu trong `Code.gs` trước khi sử dụng thật.
- Chỉ chia sẻ Google Sheet, Apps Script và thư mục ảnh cho người có trách nhiệm.
- Web App backend cần cho phép truy cập công khai để nhân viên không phải đăng nhập Google; quyền ghi dữ liệu vẫn thực thi dưới tài khoản chủ sở hữu script. Vì endpoint công khai, cần bảo vệ admin bằng mật khẩu mạnh và cân nhắc bổ sung CAPTCHA/rate limit nếu công khai quy mô lớn.
- Vị trí GPS và ảnh khuôn mặt là dữ liệu cá nhân. Cần thông báo mục đích, phạm vi lưu trữ, người được truy cập và thời hạn lưu; tuân thủ quy định bảo vệ dữ liệu cá nhân.
- GPS chỉ là tín hiệu kiểm tra vị trí thiết bị, không chứng minh tuyệt đối người lao động đang cầm thiết bị hay ngăn giả lập vị trí.
