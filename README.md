# CHẤM CÔNG GPS V1

Ứng dụng chấm công web trên điện thoại bằng mã nhân viên, selfie, GPS và geofence. Backend Google Apps Script; dữ liệu Google Sheets; ảnh Google Drive. Không cần máy chủ riêng và dùng `google.script.run`, không gọi API cross-origin nên tránh cấu hình CORS.

## Tính năng
- Đăng nhập mã nhân viên; vai trò `ADMIN`, `MANAGER`, `EMPLOYEE`.
- Chấm VÀO / RA; chặn RA khi chưa có VÀO và chặn VÀO khi ca trước chưa RA.
- Chụp selfie bằng camera trước.
- Lấy GPS độ chính xác cao; máy chủ tính khoảng cách Haversine với địa điểm.
- Nhiều địa điểm; bán kính mặc định 100m, Admin chỉnh từng địa điểm (10–5000m).
- Lưu giờ máy chủ, vị trí, khoảng cách, mã nhân viên và link ảnh Drive.
- Admin quản lý nhân viên, địa điểm, xem báo cáo lọc ngày/mã nhân viên.

## Cài đặt
1. Tạo một project tại https://script.google.com/ và tạo các file `Code.gs`, `Index.html`, `Styles.html`, `App.html`.
2. Bật **Show "appsscript.json" manifest file** trong Project Settings; thay nội dung manifest bằng file kèm theo.
3. Chọn timezone `Asia/Ho_Chi_Minh`.
4. Chọn hàm `setupSystem` và Run, cấp quyền Google Sheets và Google Drive. Hàm tạo spreadsheet và thư mục ảnh; xem URL trả về trong Execution log.
5. Mở spreadsheet vừa tạo:
   - Sheet `NHAN_VIEN`: sửa dòng `ADMIN` mẫu, thêm nhân viên. Vai trò: `ADMIN`, `MANAGER`, `EMPLOYEE`; trạng thái `ACTIVE` hoặc `INACTIVE`.
   - Sheet `DIA_DIEM`: thêm các chi nhánh. Cột vĩ độ/kinh độ là tọa độ decimal, ví dụ `10.980000`, `106.651000`; bán kính mặc định 100m.
6. Deploy > New deployment > Web app:
   - Execute as: **Me**
   - Who has access: chọn phạm vi phù hợp tổ chức (ví dụ anyone with Google account hoặc trong Workspace domain). Tránh public anonymous nếu có dữ liệu nhân sự.
7. Mở URL Web App trên điện thoại bằng Chrome/Safari. Cấp quyền camera và location; trang cần HTTPS (URL Apps Script Web App đáp ứng).
8. Thử bằng nhân viên test và địa điểm test trước khi triển khai chính thức.

## Quy tắc và giới hạn quan trọng
- **Đăng nhập chỉ bằng mã nhân viên theo yêu cầu.** Mã nhân viên không phải bí mật; bất kỳ ai biết mã đều có thể giả danh. Với chấm công có giá trị pháp lý/tiền lương, nên bổ sung PIN/mật khẩu hoặc xác thực Google Workspace, và cân nhắc quy trình xác minh ảnh.
- Selfie được lưu làm bằng chứng ảnh; phiên bản này **không nhận diện khuôn mặt, không chống ảnh chụp lại/liveness**, không thể đảm bảo người trong ảnh chính là chủ mã.
- GPS trình duyệt có thể bị giả mạo trên thiết bị đã can thiệp. Bán kính GPS chỉ là kiểm tra vị trí theo tọa độ do trình duyệt cung cấp, không phải chống gian lận tuyệt đối.
- Máy chủ kiểm tra khoảng cách và trạng thái ca, nhưng Apps Script/Sheets không phải hệ thống chấm công chịu tải lớn. Dùng `LockService` để tránh hai lần gửi đồng thời.
- Ảnh được lưu trong Drive của tài khoản triển khai. Quyền chia sẻ file giữ mặc định riêng tư; quản trị viên truy cập qua Drive. Không bật chia sẻ công khai nếu không cần.
- Phiên đăng nhập lưu trong CacheService 6 giờ; cache có thể bị xóa sớm, khi đó nhân viên đăng nhập lại.
- Báo cáo V1 hiển thị các sự kiện; chưa tự tính công chuẩn, tăng ca, nghỉ phép, ca qua đêm hay xuất bảng lương.
- Admin/Manager có quyền xem báo cáo và sửa nhân viên/địa điểm. Hạn chế cấp role này.

## Cấu trúc dữ liệu
- `NHAN_VIEN`: MaNV, HoTen, PhongBan, VaiTro, TrangThai
- `DIA_DIEM`: MaDiaDiem, TenDiaDiem, ViDo, KinhDo, BanKinhMet, TrangThai
- `CHAM_CONG`: MaBanGhi, ThoiGianMayChu, Ngay, MaNV, HoTen, PhongBan, Loai, MaDiaDiem, TenDiaDiem, ViDo, KinhDo, KhoangCachMet, AnhDriveId, AnhURL, UserAgent
- `NHAT_KY`: ThoiGian, NguoiThucHien, HanhDong, ChiTiet

## Gợi ý vận hành
- Dùng tài khoản Google Workspace thuộc công ty làm chủ project và Drive.
- Sao lưu spreadsheet định kỳ; đặt chính sách lưu trữ ảnh và phân quyền Drive.
- Kiểm tra GPS accuracy, vị trí chi nhánh và bán kính tại hiện trường.
- Trước khi áp dụng chấm công chính thức, kiểm thử các tình huống: chấm ra trước vào, vào hai lần, ra hai lần, ngoài bán kính, từ chối camera/GPS, mất mạng và hai lần nhấn đồng thời.
