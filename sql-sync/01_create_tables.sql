/* =====================================================================
   Đồng bộ điểm danh -> SQL Server
   Chạy script này trên database của công ty (cần SQL Server 2008 trở lên vì dùng kiểu DATE và DATETIMEOFFSET; hãy kiểm tra bằng SELECT @@VERSION).
   Mọi sự kiện đều có EventId (GUID) do Apps Script sinh ra, dùng để chống ghi trùng.
   ===================================================================== */

-- 1) Bảng sự kiện điểm danh: mỗi lượt VÀO hoặc RA là một dòng
IF OBJECT_ID('dbo.AttendanceEvent') IS NULL
CREATE TABLE dbo.AttendanceEvent (
    Id            BIGINT IDENTITY(1,1) CONSTRAINT PK_AttendanceEvent PRIMARY KEY,
    EventId       UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_AttendanceEvent_EventId UNIQUE,
    EventType     VARCHAR(3)       NOT NULL CONSTRAINT CK_AttendanceEvent_Type CHECK (EventType IN ('IN','OUT')),
    EmployeeCode  NVARCHAR(30)     NOT NULL,          -- mã nhân viên bên hệ thống điểm danh QR
    AcCode        NVARCHAR(30)     NULL,              -- Mã AC trên máy chấm công / TimeGold (lấy từ cột Mã AC của sheet NhanVien)
    EmployeeName  NVARCHAR(100)    NULL,
    WorkDate      DATE             NOT NULL,          -- ngày của ca (lượt RA tính theo ngày VÀO của ca đó)
    OccurredAt    DATETIMEOFFSET(0) NOT NULL,         -- thời điểm điểm danh (+07:00)
    DeviceId      VARCHAR(40)      NULL,
    PhotoFileId   VARCHAR(100)     NULL,              -- ID file ảnh trên Google Drive
    PhotoUrl      NVARCHAR(400)    NULL,
    Latitude      DECIMAL(9,6)     NULL,
    Longitude     DECIMAL(9,6)     NULL,
    GpsAccuracyM  DECIMAL(8,1)     NULL,
    DistanceM     DECIMAL(8,1)     NULL,              -- khoảng cách tới tâm khu vực điểm danh
    Warning       NVARCHAR(500)    NULL,
    IsCancelled   BIT              NOT NULL CONSTRAINT DF_AttendanceEvent_IsCancelled DEFAULT 0,
    CancelledAt   DATETIME2(0)     NULL,              -- giờ UTC
    CancelledBy   NVARCHAR(50)     NULL,
    CancelReason  NVARCHAR(200)    NULL,
    ReceivedAt    DATETIME2(0)     NOT NULL CONSTRAINT DF_AttendanceEvent_ReceivedAt DEFAULT SYSUTCDATETIME()
);
GO
IF COL_LENGTH('dbo.AttendanceEvent', 'AcCode') IS NULL ALTER TABLE dbo.AttendanceEvent ADD AcCode NVARCHAR(30) NULL;   -- nếu bảng đã tạo từ bản cũ
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AttendanceEvent_Emp_Date')
    CREATE INDEX IX_AttendanceEvent_Emp_Date ON dbo.AttendanceEvent (EmployeeCode, WorkDate) INCLUDE (EventType, OccurredAt, IsCancelled);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AttendanceEvent_Date')
    CREATE INDEX IX_AttendanceEvent_Date ON dbo.AttendanceEvent (WorkDate);
GO

-- 2) Nhật ký hủy điểm danh (admin hủy do chụp sai hình...). EventId duy nhất để xử lý lặp lại an toàn.
IF OBJECT_ID('dbo.AttendanceCancelLog') IS NULL
CREATE TABLE dbo.AttendanceCancelLog (
    Id            BIGINT IDENTITY(1,1) CONSTRAINT PK_AttendanceCancelLog PRIMARY KEY,
    EventId       UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_AttendanceCancelLog_EventId UNIQUE,
    EmployeeCode  NVARCHAR(30)     NOT NULL,
    WorkDate      DATE             NULL,
    CancelType    VARCHAR(10)      NOT NULL,          -- CANCEL_OUT | CANCEL_ALL
    Reason        NVARCHAR(200)    NULL,
    CancelledBy   NVARCHAR(50)     NULL,
    CancelledAt   DATETIMEOFFSET(0) NULL,
    ReceivedAt    DATETIME2(0)     NOT NULL CONSTRAINT DF_AttendanceCancelLog_ReceivedAt DEFAULT SYSUTCDATETIME()
);
GO

-- 3) View tổng hợp theo ngày: giờ vào đầu tiên, giờ ra cuối cùng (bỏ qua lượt đã hủy)
IF OBJECT_ID('dbo.vAttendanceDaily') IS NOT NULL DROP VIEW dbo.vAttendanceDaily;
GO
CREATE VIEW dbo.vAttendanceDaily AS
SELECT  EmployeeCode,
        MAX(AcCode) AS AcCode,
        MAX(EmployeeName) AS EmployeeName,
        WorkDate,
        MIN(CASE WHEN EventType = 'IN'  THEN OccurredAt END) AS FirstIn,
        MAX(CASE WHEN EventType = 'OUT' THEN OccurredAt END) AS LastOut,
        CAST(DATEDIFF(MINUTE,
                      MIN(CASE WHEN EventType = 'IN'  THEN OccurredAt END),
                      MAX(CASE WHEN EventType = 'OUT' THEN OccurredAt END)) / 60.0 AS DECIMAL(6,2)) AS GrossHours   -- chưa trừ giờ nghỉ
FROM dbo.AttendanceEvent
WHERE IsCancelled = 0
GROUP BY EmployeeCode, WorkDate;
GO

/* 4) Tài khoản SQL quyền tối thiểu cho dịch vụ nhận dữ liệu (sửa tên, mật khẩu, database)
CREATE LOGIN attendance_api WITH PASSWORD = N'<MAT_KHAU_MANH>';
CREATE USER  attendance_api FOR LOGIN attendance_api;
GRANT INSERT, UPDATE, SELECT ON dbo.AttendanceEvent     TO attendance_api;
GRANT INSERT, SELECT          ON dbo.AttendanceCancelLog TO attendance_api;
*/

/* Truy vấn mẫu: ai vào hôm nay mà chưa ra
SELECT * FROM dbo.vAttendanceDaily WHERE WorkDate = CAST(SYSDATETIMEOFFSET() AS DATE) AND LastOut IS NULL;
*/
