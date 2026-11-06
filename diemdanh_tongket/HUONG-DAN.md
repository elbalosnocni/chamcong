# Hướng dẫn cài đặt hệ thống điểm danh QR + selfie

Công Ty Cổ Phần Liwayway VN. Nhân viên không cần tài khoản nào. Dữ liệu lưu trong Google Sheets và Google Drive của bạn.

## Bạn cần
- Một tài khoản Google (dùng để tạo Sheets, chạy Apps Script).
- Năm file: `Code.gs`, `Index.html`, `Qr.html`, `Admin.html`, `HUONG-DAN.md`.

## Cài đặt (khoảng 10 phút)

1. Vào Google Sheets, tạo bảng tính mới, đặt tên "Điểm danh Liwayway".
2. Trong bảng tính, chọn **Tiện ích mở rộng > Apps Script**.
3. Xoá nội dung có sẵn trong `Code.gs`, dán toàn bộ nội dung file `Code.gs` của mình vào.
4. Bấm dấu **+** cạnh "Tệp" > **HTML**, đặt tên đúng là `Index` (không gõ đuôi .html), dán nội dung file `Index.html`.
5. Tạo thêm tệp HTML tên `Qr`, dán nội dung `Qr.html`.
6. Tạo tệp HTML tên `Admin`, dán nội dung `Admin.html`.
7. Bấm **Lưu**. Chọn hàm `setup` ở thanh trên rồi bấm **Chạy**. Google sẽ hỏi cấp quyền: chọn tài khoản của bạn, bấm "Nâng cao" > "Đi tới ... (không an toàn)" > "Cho phép". Đây là script của chính bạn nên bước này bình thường.
8. Bấm **Triển khai > Tạo bản triển khai mới**. Bấm biểu tượng bánh răng, chọn loại **Ứng dụng web**. Điền:
   - Thực thi dưới tên: **Tôi**
   - Ai có quyền truy cập: **Bất kỳ ai** (chọn đúng mục này, không chọn "Bất kỳ ai có Tài khoản Google", nếu không nhân viên sẽ bị bắt đăng nhập)
9. Bấm **Triển khai**, sao chép **URL ứng dụng web** (dạng `https://script.google.com/macros/s/.../exec`).

## Lấy mã QR để in
Mở URL vừa sao chép và thêm `?view=qr` vào cuối, ví dụ `https://script.google.com/macros/s/.../exec?view=qr`. Trang này hiện ảnh QR có logo Oishi và tên công ty. Bấm **Tải ảnh QR (PNG)** rồi in ra, dán ở cổng hoặc quầy.

## Danh sách nhân viên (nên làm)
Mở sheet **NhanVien** (tự tạo khi chạy `setup`), điền cột A là mã nhân viên, cột B là họ tên. Khi có danh sách:
- Nhân viên nhập mã thì họ tên tự điền và không sửa được.
- Mã không có trong danh sách sẽ bị từ chối.

Nếu để trống, ai cũng có thể nhập mã và tên tuỳ ý.

## Xem kết quả
- Sheet **ChamCong**: mỗi ca là một dòng gồm thời gian (giờ máy chủ, không sửa được từ điện thoại), mã, họ tên, vào/ra ca, liên kết xem ảnh, cảnh báo.
- Dòng tô màu cam là dòng bị cảnh báo:
  - "Ảnh cũ ..." khi ảnh được chụp trước đó hơn 3 phút (có thể lấy từ thư viện).
  - "Thiết bị này đã điểm danh cho N mã khác hôm nay" khi một điện thoại điểm danh cho nhiều người.
- Ảnh nằm trong thư mục Drive **DiemDanh_Anh**, ở chế độ riêng tư, chỉ bạn và người bạn chia sẻ mới xem được.

## Giới hạn cần biết
- Trang web không mở trực tiếp camera được, nên ảnh đến từ ô chụp ảnh của điện thoại. Trên một số máy vẫn chọn được ảnh trong thư viện. Hệ thống không chặn hẳn mà đánh dấu để bạn kiểm tra. Hệ thống cũng không lấy được vị trí GPS.
- Một người vẫn có thể nhờ đồng nghiệp chụp ảnh của chính đồng nghiệp đó. Cảnh báo "một thiết bị nhiều mã" giúp phát hiện trường hợp một điện thoại điểm danh hộ nhiều người.
- Ảnh khuôn mặt là dữ liệu cá nhân. Nên thông báo cho nhân viên và có sự đồng ý của họ (theo Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân).

## Khi sửa mã sau này
Sau khi sửa, vào **Triển khai > Quản lý bản triển khai**, bấm biểu tượng bút chì, chọn **Phiên bản mới**, rồi **Triển khai**. Làm vậy URL và mã QR cũ vẫn dùng được. Nếu chọn "Tạo bản triển khai mới" thì URL sẽ đổi và phải in lại QR.


## Quản trị Admin
- Mở URL ứng dụng web và thêm `?page=admin` để vào trang quản trị.
- Tài khoản mặc định trong `Code.gs`: `admin` / `AdminPassword123`. **Bắt buộc đổi mật khẩu** trong `ADMIN_CONFIG` trước khi triển khai cho sử dụng thật.
- Sau khi sửa mã nguồn, vào **Triển khai > Quản lý bản triển khai > Chỉnh sửa > Phiên bản mới > Triển khai** để cập nhật Web App.
- Token đăng nhập Admin được lưu tạm phía máy chủ trong tối đa 6 giờ; dữ liệu Dashboard yêu cầu token hợp lệ.
- Giờ bắt đầu để tính đi trễ mặc định là `08:00`, cấu hình tại `SHIFT_START_TIME` trong `Code.gs`. Hãy đổi thành giờ bắt đầu ca thực tế của công ty. Hiện tại hệ thống dùng một giờ chuẩn chung, chưa có lịch ca riêng theo phòng ban/nhân viên.
- Dashboard xuất CSV UTF-8 có thể mở bằng Excel. Ảnh vào và ảnh ra được lấy từ hai cột riêng trong sheet `ChamCong`.

## Cấu trúc dữ liệu
- `ChamCong`: Ngày, Mã NV, Họ tên, Giờ vào, Giờ ra, Số giờ, Ảnh vào, Ảnh ra, Cảnh báo, Thiết bị vào, Thiết bị ra.
- `NhanVien`: cột A là Mã NV, cột B là Họ tên.
- Ảnh selfie lưu trong thư mục Drive `DiemDanh_Anh` do hàm `setup()` tạo.

## Lưu ý bảo mật và vận hành
- Không chia sẻ quyền chỉnh sửa Apps Script hoặc Google Sheet cho nhân viên không có trách nhiệm.
- Đường dẫn Web App có thể được nhân viên truy cập nếu triển khai công khai; chỉ trang Admin yêu cầu đăng nhập.
- Cơ chế cảnh báo ảnh cũ/thiết bị dùng chung chỉ là tín hiệu kiểm tra, không thể chứng minh danh tính hoặc ngăn tuyệt đối gian lận.
- Sao lưu Google Sheet và thư mục ảnh định kỳ.
