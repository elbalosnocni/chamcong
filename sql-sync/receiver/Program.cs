// Dịch vụ nhận sự kiện điểm danh từ Google Apps Script và ghi vào SQL Server.
// Yêu cầu: .NET 8 SDK. Chạy: dotnet run   |   Xuất bản: dotnet publish -c Release
using System.Data;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Data.SqlClient;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

var connStr = app.Configuration.GetConnectionString("Attendance")
    ?? throw new InvalidOperationException("Thiếu ConnectionStrings:Attendance");
var secret = app.Configuration["Attendance:SharedSecret"]
    ?? throw new InvalidOperationException("Thiếu Attendance:SharedSecret");
if (secret.Length < 24) throw new InvalidOperationException("Attendance:SharedSecret phải từ 24 ký tự.");

app.MapGet("/health", () => Results.Ok(new { ok = true }));

app.MapPost("/api/attendance/events", async (HttpRequest req) =>
{
    string body;
    using (var reader = new StreamReader(req.Body, Encoding.UTF8))
        body = await reader.ReadToEndAsync();

    // 1) Xác thực: chữ ký HMAC-SHA256 của "<timestamp>.<body>", lệch giờ tối đa 5 phút
    if (!IsSigned(req, body, secret)) return Results.Unauthorized();

    // 2) Đọc lô sự kiện
    JsonDocument doc;
    try { doc = JsonDocument.Parse(body); }
    catch (JsonException) { return Results.BadRequest(new { error = "JSON không hợp lệ" }); }

    using (doc)
    {
        if (!doc.RootElement.TryGetProperty("events", out var events) || events.ValueKind != JsonValueKind.Array)
            return Results.BadRequest(new { error = "Thiếu mảng events" });
        if (events.GetArrayLength() > 100)
            return Results.BadRequest(new { error = "Tối đa 100 sự kiện mỗi lần" });

        var results = new List<object>();
        await using var conn = new SqlConnection(connStr);
        await conn.OpenAsync();

        // 3) Xử lý lần lượt theo thứ tự; mỗi sự kiện báo kết quả riêng để Apps Script chỉ thử lại cái lỗi
        foreach (var ev in events.EnumerateArray())
        {
            var eventId = Str(ev, "eventId");
            try
            {
                await ProcessAsync(conn, ev);
                results.Add(new { eventId, ok = true });
            }
            catch (Exception ex)
            {
                app.Logger.LogWarning(ex, "Lỗi xử lý sự kiện {EventId}", eventId);
                results.Add(new { eventId, ok = false, error = ex.Message });
            }
        }
        return Results.Ok(new { results });
    }
});

app.Run();

// ------------------------------------------------------------------ xác thực
static bool IsSigned(HttpRequest req, string body, string secret)
{
    if (!long.TryParse(req.Headers["X-Timestamp"].ToString(), out var ts)) return false;
    if (Math.Abs(DateTimeOffset.UtcNow.ToUnixTimeSeconds() - ts) > 300) return false;

    var sig = req.Headers["X-Signature"].ToString();
    using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
    var expected = Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes($"{ts}.{body}"))).ToLowerInvariant();
    return CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(expected), Encoding.ASCII.GetBytes(sig));
}

// ------------------------------------------------------------------ xử lý sự kiện
static async Task ProcessAsync(SqlConnection conn, JsonElement ev)
{
    var type = Str(ev, "eventType");
    switch (type)
    {
        case "IN":
        case "OUT":
            await InsertEventAsync(conn, ev, type);
            break;
        case "CANCEL_OUT":
        case "CANCEL_ALL":
            await CancelAsync(conn, ev, type);
            break;
        default:
            throw new InvalidOperationException($"eventType không hỗ trợ: {type}");
    }
}

static async Task InsertEventAsync(SqlConnection conn, JsonElement ev, string type)
{
    const string sql = @"
INSERT INTO dbo.AttendanceEvent
 (EventId, EventType, EmployeeCode, AcCode, EmployeeName, WorkDate, OccurredAt, DeviceId, PhotoFileId, PhotoUrl,
  Latitude, Longitude, GpsAccuracyM, DistanceM, Warning)
VALUES
 (@EventId, @EventType, @EmployeeCode, @AcCode, @EmployeeName, @WorkDate, @OccurredAt, @DeviceId, @PhotoFileId, @PhotoUrl,
  @Latitude, @Longitude, @GpsAccuracyM, @DistanceM, @Warning)";

    await using var cmd = new SqlCommand(sql, conn);
    Add(cmd, "@EventId", SqlDbType.UniqueIdentifier, Guid.Parse(Str(ev, "eventId")));
    Add(cmd, "@EventType", SqlDbType.VarChar, type, 3);
    Add(cmd, "@EmployeeCode", SqlDbType.NVarChar, Required(ev, "employeeCode"), 30);
    Add(cmd, "@AcCode", SqlDbType.NVarChar, Opt(Str(ev, "acCode")), 30);
    Add(cmd, "@EmployeeName", SqlDbType.NVarChar, Opt(Str(ev, "employeeName")), 100);
    Add(cmd, "@WorkDate", SqlDbType.Date, DateTime.Parse(Required(ev, "workDate"), CultureInfo.InvariantCulture).Date);
    Add(cmd, "@OccurredAt", SqlDbType.DateTimeOffset, DateTimeOffset.Parse(Required(ev, "occurredAt"), CultureInfo.InvariantCulture));
    Add(cmd, "@DeviceId", SqlDbType.VarChar, Opt(Str(ev, "deviceId")), 40);
    Add(cmd, "@PhotoFileId", SqlDbType.VarChar, Opt(Str(ev, "photoFileId")), 100);
    Add(cmd, "@PhotoUrl", SqlDbType.NVarChar, Opt(Str(ev, "photoUrl")), 400);
    Add(cmd, "@Latitude", SqlDbType.Decimal, Dec(ev, "latitude"));
    Add(cmd, "@Longitude", SqlDbType.Decimal, Dec(ev, "longitude"));
    Add(cmd, "@GpsAccuracyM", SqlDbType.Decimal, Dec(ev, "gpsAccuracyM"));
    Add(cmd, "@DistanceM", SqlDbType.Decimal, Dec(ev, "distanceM"));
    Add(cmd, "@Warning", SqlDbType.NVarChar, Opt(Str(ev, "warning")), 500);
    cmd.Parameters["@Latitude"].Precision = 9;  cmd.Parameters["@Latitude"].Scale = 6;
    cmd.Parameters["@Longitude"].Precision = 9; cmd.Parameters["@Longitude"].Scale = 6;
    cmd.Parameters["@GpsAccuracyM"].Precision = 8; cmd.Parameters["@GpsAccuracyM"].Scale = 1;
    cmd.Parameters["@DistanceM"].Precision = 8;    cmd.Parameters["@DistanceM"].Scale = 1;

    try { await cmd.ExecuteNonQueryAsync(); }
    catch (SqlException ex) when (ex.Number is 2627 or 2601)
    {
        // Trùng EventId: sự kiện này đã được ghi trước đó (Apps Script gửi lại) -> coi như thành công.
    }
}

static async Task CancelAsync(SqlConnection conn, JsonElement ev, string type)
{
    var eventId = Guid.Parse(Str(ev, "eventId"));
    var code = Required(ev, "employeeCode");
    var by = Opt(Str(ev, "cancelledBy"));
    var reason = Opt(Str(ev, "reason"));
    var at = DateTimeOffset.Parse(Required(ev, "cancelledAt"), CultureInfo.InvariantCulture);
    DateTime? workDate = DateTime.TryParse(Str(ev, "workDate"), CultureInfo.InvariantCulture, DateTimeStyles.None, out var wd) ? (DateTime?)wd.Date : null;

    await using var tx = (SqlTransaction)await conn.BeginTransactionAsync();
    try
    {
        // Ghi nhật ký (EventId duy nhất -> gửi lặp sẽ bị chặn ở đây)
        await using (var log = new SqlCommand(@"
INSERT INTO dbo.AttendanceCancelLog (EventId, EmployeeCode, WorkDate, CancelType, Reason, CancelledBy, CancelledAt)
VALUES (@EventId, @Code, @WorkDate, @Type, @Reason, @By, @At)", conn, tx))
        {
            Add(log, "@EventId", SqlDbType.UniqueIdentifier, eventId);
            Add(log, "@Code", SqlDbType.NVarChar, code, 30);
            Add(log, "@WorkDate", SqlDbType.Date, workDate.HasValue ? (object)workDate.Value : DBNull.Value);
            Add(log, "@Type", SqlDbType.VarChar, type, 10);
            Add(log, "@Reason", SqlDbType.NVarChar, reason, 200);
            Add(log, "@By", SqlDbType.NVarChar, by, 50);
            Add(log, "@At", SqlDbType.DateTimeOffset, at);
            await log.ExecuteNonQueryAsync();
        }

        // Đánh dấu hủy từng sự kiện gốc (khớp mã NV + loại + thời điểm, sai lệch tối đa 1 giây)
        foreach (var ce in ev.GetProperty("cancelledEvents").EnumerateArray())
        {
            await using var upd = new SqlCommand(@"
UPDATE dbo.AttendanceEvent
   SET IsCancelled = 1, CancelledAt = SYSUTCDATETIME(), CancelledBy = @By, CancelReason = @Reason
 WHERE EmployeeCode = @Code AND EventType = @Type AND IsCancelled = 0
   AND ABS(DATEDIFF(SECOND, OccurredAt, @At)) <= 1", conn, tx);
            Add(upd, "@By", SqlDbType.NVarChar, by, 50);
            Add(upd, "@Reason", SqlDbType.NVarChar, reason, 200);
            Add(upd, "@Code", SqlDbType.NVarChar, code, 30);
            Add(upd, "@Type", SqlDbType.VarChar, Required(ce, "eventType"), 3);
            Add(upd, "@At", SqlDbType.DateTimeOffset, DateTimeOffset.Parse(Required(ce, "occurredAt"), CultureInfo.InvariantCulture));
            if (await upd.ExecuteNonQueryAsync() == 0)
                throw new InvalidOperationException("Chưa tìm thấy sự kiện gốc để hủy (sẽ thử lại)");
        }
        await tx.CommitAsync();
    }
    catch (SqlException ex) when (ex.Number is 2627 or 2601)
    {
        await tx.RollbackAsync();   // đã xử lý trước đó -> thành công
    }
    catch
    {
        await tx.RollbackAsync();
        throw;
    }
}

// ------------------------------------------------------------------ tiện ích
static string Str(JsonElement e, string name) =>
    e.TryGetProperty(name, out var v) && v.ValueKind != JsonValueKind.Null ? v.ToString() : "";

static string Required(JsonElement e, string name)
{
    var s = Str(e, name);
    if (string.IsNullOrWhiteSpace(s)) throw new InvalidOperationException($"Thiếu trường {name}");
    return s;
}

static object Opt(string s) => string.IsNullOrWhiteSpace(s) ? DBNull.Value : s;

static object Dec(JsonElement e, string name)
{
    if (e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number) return Convert.ToDecimal(v.GetDouble());
    return DBNull.Value;
}

static void Add(SqlCommand cmd, string name, SqlDbType type, object? value, int size = 0)
{
    var p = size > 0 ? cmd.Parameters.Add(name, type, size) : cmd.Parameters.Add(name, type);
    p.Value = value ?? DBNull.Value;
}
