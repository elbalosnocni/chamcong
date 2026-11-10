# Đồng bộ điểm danh sang SQL Server (tùy chọn)

```
Nhân viên → trang điểm danh → Apps Script → Google Sheet (nguồn gốc)
                                         └→ sheet HangDoiSQL → (mỗi phút, ký HMAC, HTTPS) → API của công ty → SQL Server
```
Google Sheet luôn là nguồn gốc: SQL hoặc API chết thì điểm danh vẫn chạy, sự kiện nằm chờ trong `HangDoiSQL` và tự gửi lại.

## Cài đặt phía công ty
1. Chạy `01_create_tables.sql` trên database (tạo `AttendanceEvent`, `AttendanceCancelLog`, view `vAttendanceDaily`). Tạo tài khoản SQL quyền tối thiểu theo mục 4 trong file.
2. Trong thư mục `receiver/`: copy `appsettings.example.json` thành `appsettings.json`, điền connection string và `SharedSecret` (chuỗi ngẫu nhiên từ 24 ký tự).
3. Chạy thử: `dotnet run` (cần .NET 8 SDK). Xuất bản lên IIS/Windows Service/Docker: `dotnet publish -c Release`.
4. Đưa dịch vụ ra internet qua **HTTPS** (reverse proxy IIS/Nginx), URL dạng `https://api.congty.vn/api/attendance/events`. Có thể thêm giới hạn tốc độ ở proxy.

## Cài đặt phía Apps Script
1. Dán `Code.gs` mới.
2. Mở hàm `setupSqlSync()`, sửa `url` và `secret` (trùng `SharedSecret`), chạy một lần và cấp quyền (cần thêm quyền gọi URL ngoài và tạo trigger).
3. Xóa `secret` khỏi mã nguồn (đã được lưu trong Thuộc tính tập lệnh).
4. Chạy `sqlPing()`: kết quả mong đợi `HTTP 200 {"results":[]}`.
5. **Tạo Phiên bản mới** của Web App (bắt buộc sau khi cấp quyền mới).
6. Điểm danh thử: sheet `HangDoiSQL` có dòng `PENDING`, một phút sau chuyển `SENT`, và dòng xuất hiện trong `dbo.AttendanceEvent`.

Các hàm quản trị: `disableSqlSync()` tắt đồng bộ, `retrySqlFailed()` gửi lại các sự kiện `FAILED` (sau 20 lần lỗi liên tiếp).

## Hợp đồng dữ liệu (JSON)
`POST` với header `X-Timestamp` (giây Unix) và `X-Signature` = hex thường của `HMAC-SHA256(secret, "<timestamp>.<body>")`.
Body: `{"events":[ ... ]}` (tối đa 100). Phản hồi 200: `{"results":[{"eventId":"...","ok":true|false,"error":"..."}]}`.

Sự kiện `IN` / `OUT`: `eventId, eventType, occurredAt (ISO 8601 +07:00), workDate (yyyy-MM-dd), employeeCode, acCode (Mã AC trên máy chấm công, lấy từ cột "Mã AC" của sheet NhanVien), employeeName, deviceId, photoFileId, photoUrl, latitude, longitude, gpsAccuracyM, distanceM, warning`.
Sự kiện `CANCEL_OUT` / `CANCEL_ALL`: `eventId, eventType, employeeCode, workDate, cancelledEvents:[{eventType, occurredAt}], reason, cancelledBy, cancelledAt`.

Cùng `eventId` gửi lại nhiều lần chỉ ghi một lần (chống trùng).

## Lưu ý bảo mật và dữ liệu cá nhân
- Địa chỉ IP của Google Apps Script thay đổi và rộng nên không nên chỉ dựa vào danh sách IP; chữ ký HMAC + HTTPS + giới hạn tốc độ là lớp bảo vệ chính.
- Payload không chứa ảnh, chỉ có ID/đường dẫn file Drive. Đường dẫn Drive vẫn cần quyền truy cập để mở.
- Vị trí GPS và ảnh khuôn mặt là dữ liệu cá nhân nhạy cảm: nên có thông báo cho nhân viên và quy định thời gian lưu trữ ở cả Google Sheet lẫn SQL.
