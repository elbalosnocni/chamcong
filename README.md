# Hệ thống điểm danh QR + Camera Selfie + GPS — Liwayway VN

Frontend chạy trên GitHub Pages (HTTPS); backend Google Apps Script lưu dữ liệu trong Google Sheets và ảnh trong Google Drive.

## Chức năng bản Final

- Nhân viên mở QR, nhập mã nhân viên, chọn **Vào ca/Ra ca**.
- Bấm **Bật camera & định vị**: trình duyệt yêu cầu cấp quyền camera và vị trí. Không cấp đủ hai quyền thì không thể chụp và gửi điểm danh.
- Camera trước mở trực tiếp bằng `getUserMedia`; ảnh được chụp từ luồng camera, đóng dấu họ tên/thời gian tại thiết bị và gửi lên máy chủ.
- Mỗi lượt gửi lấy GPS mới; backend kiểm tra tọa độ và sai số GPS không quá 100 m.
- Backend tính khoảng cách Haversine và **từ chối nếu thiết bị ở ngoài bán kính cố định 100 m**. Bán kính không thể tăng từ giao diện Admin.
- Admin đăng nhập dashboard, lọc ngày/tìm nhân viên, xem ảnh vào/ra (qua API có xác thực), xem bản đồ và tọa độ GPS riêng cho cả lượt vào lẫn lượt ra.
- Lưu riêng GPS vào/ra trong các cột mới; giữ các cột GPS cũ để tương thích báo cáo cũ.

> Trình duyệt web không thể tự bật quyền khi người dùng đã chọn “Từ chối” hoặc tự mở trang Cài đặt hệ điều hành. Hệ thống sẽ yêu cầu quyền khi người dùng bấm nút; nếu đã chặn, nhân viên cần tự bật Camera và Vị trí cho Safari/Chrome trong Cài đặt điện thoại rồi tải lại trang. Chỉ hoạt động trên HTTPS (GitHub Pages đáp ứng).

## 1. Cài backend Google Apps Script

1. Mở Google Spreadsheet dùng lưu dữ liệu → **Tiện ích mở rộng → Apps Script**.
2. Thay toàn bộ `Code.gs` bằng file `Code.gs` trong gói này.
3. Đổi tài khoản/mật khẩu trong `ADMIN_CONFIG` hoặc chạy `setAdminCredentials()` sau khi sửa username/password trong hàm. Không sử dụng mật khẩu mẫu `admin / Admin123` khi vận hành thật.
4. Chạy `setup()` một lần và cấp quyền truy cập Google Sheets/Drive.
   - Tự tạo/cập nhật sheet `ChamCong`, `NhanVien`, thư mục Drive ảnh `DiemDanh_Anh`.
   - Sheet `ChamCong` cũ được bổ sung các cột GPS riêng cho vào/ra ở cuối, dữ liệu cũ không bị xóa.
5. Trong `NhanVien`, nhập mã nhân viên (`manv`), họ tên (`hoten`), rồi `phongban`, `bophan`, `chucvu`.
   Hệ thống tìm cột theo tiêu đề dòng 1 (không phân biệt hoa/thường, có dấu hay không); nếu không thấy tiêu đề thì dùng thứ tự cột A-E.
   Trang admin hiển thị riêng 3 cột Phòng ban, Bộ phận, Chức vụ và đưa cả 3 vào bộ lọc tìm kiếm và file xuất.
6. **Triển khai → Quản lý bản triển khai → Chỉnh sửa/Tạo bản triển khai → Ứng dụng web**:
   - Thực thi với tư cách: **Tôi**
   - Ai có quyền truy cập: **Bất kỳ ai**
7. Sao chép URL Web App kết thúc bằng `/exec`.

Khi cập nhật `Code.gs`, chọn **Triển khai → Quản lý bản triển khai → Chỉnh sửa → Phiên bản mới**. Giữ nguyên URL nếu cập nhật deployment hiện tại.

## 2. Cài frontend GitHub Pages

1. Upload `index.html`, `admin.html`, `qr.html`, `api.js`, `config.js` lên repository.
2. Trong `config.js`, dán URL Apps Script `/exec` vào `ATTENDANCE_API_URL`.
3. Bật GitHub Pages tại **Settings → Pages** (branch `main`, thư mục `/root` hoặc thư mục chứa file).
4. Sử dụng:
   - Nhân viên: URL GitHub Pages `/`
   - Admin: `/admin.html`
   - QR: `/qr.html`

## 3. Cấu hình vị trí nhà máy (bắt buộc)

1. Admin mở `/admin.html`, đăng nhập.
2. Ở **Vị trí điểm danh trực quan**, đứng tại vị trí trung tâm (ví dụ cổng nhà máy), bấm **Lấy GPS hiện tại**.
3. Bấm **Lưu khu vực**. Bán kính được cố định 100 m.
4. Bản đồ Admin hiển thị vòng tròn 100 m và hai điểm GPS (nếu có) của mỗi nhân viên:
   - Điểm xanh: trong bán kính.
   - Điểm đỏ: ngoài bán kính (có thể xuất hiện ở dữ liệu cũ hoặc khi cấu hình thay đổi).
5. Bảng chi tiết có liên kết xem riêng vị trí **Vào** và **Ra**, sai số GPS và khoảng cách tới tâm.

## 4. Luồng nhân viên

1. Mở trang điểm danh bằng QR trên Safari/Chrome; đảm bảo trang có HTTPS.
2. Nhập mã nhân viên, kiểm tra họ tên; chọn Vào ca hoặc Ra ca.
3. Bấm **Bật camera & định vị**, chọn Cho phép cho cả Camera và Vị trí.
4. Nhìn vào camera, bấm **Chụp selfie**, kiểm tra ảnh rồi bấm **Gửi điểm danh**.
5. Nếu GPS báo sai số trên 100 m, di chuyển ra nơi thoáng hơn và thử lại.
6. Nếu đã chặn quyền: iPhone vào **Cài đặt → Safari → Camera/Vị trí** (hoặc Cài đặt → Ứng dụng → Chrome → Quyền); Android vào **Cài đặt → Ứng dụng → Chrome → Quyền → Camera/Vị trí**. Tên mục có thể khác theo phiên bản hệ điều hành.

## 5. Dữ liệu và bảo mật

- `ChamCong`: ngày, mã NV, giờ vào/ra, ảnh vào/ra, cảnh báo, GPS gần nhất và GPS riêng cho vào/ra.
- Ảnh selfie lưu trong Drive; dashboard lấy ảnh qua `getPhoto` có kiểm tra token Admin, không cần chia sẻ công khai thư mục ảnh.
- Web App cần cho phép truy cập công khai để nhân viên không phải đăng nhập Google. Vì vậy cần mật khẩu Admin mạnh, không chia sẻ URL quản trị/mật khẩu, chỉ cấp quyền Spreadsheet và Drive cho người có trách nhiệm.
- GPS là tín hiệu định vị thiết bị, không chứng minh tuyệt đối người lao động đang cầm thiết bị và không chống giả lập GPS chuyên dụng.
- Ảnh khuôn mặt và dữ liệu vị trí là dữ liệu cá nhân: cần thông báo mục đích, phạm vi sử dụng, thời hạn lưu, người được truy cập và tuân thủ quy định bảo vệ dữ liệu cá nhân.

## 6. Kiểm tra trước khi chạy thật

- Thử bằng iPhone và Android thực tế tại nhà máy; kiểm tra cấp quyền camera/GPS.
- Thử ở trong vòng 100 m và ngoài vòng 100 m; ngoài vùng phải bị backend từ chối.
- Thử Vào → Ra, kiểm tra ảnh và tọa độ hai lượt hiển thị đúng trong dashboard.
- Thử đăng xuất/đăng nhập Admin và tải ảnh khi thư mục Drive vẫn để riêng tư.


## Đổi logo
Cả `index.html`, `admin.html` và `qr.html` dùng chung file `logo.png` cùng thư mục. Muốn đổi logo, chỉ cần upload file ảnh mới (PNG nền trong suốt, tỷ lệ ngang) đặt tên `logo.png` đè lên file cũ, rồi tải lại trang bằng Ctrl+F5.


## Đồng bộ SQL Server (tùy chọn)
Xem `sql-sync/HUONG_DAN.md` (script tạo bảng, dịch vụ nhận dữ liệu .NET và cách bật `setupSqlSync()`). Mặc định tắt; khi tắt, hệ thống không gọi ra ngoài và không tạo thêm sheet.
