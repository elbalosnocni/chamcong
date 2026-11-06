/**
 * CẤU HÌNH ĐƯỜNG DẪN KẾT NỐI TRỰC TIẾP ĐẾN GOOGLE APPS SCRIPT
 * Hãy thay thế URL dưới đây bằng URL Web App sau khi bạn Deploy (Xuất bản) Code.gs
 */
const API_URL = "https://script.google.com/macros/s/AKfycby1fB68hxP0MYsBhcfZMksfz8zgIo5_uapZmrL1picKCrx7DGpsV80vKEBTpAWPG9b3/exec";

// Trạng thái phiên làm việc hiện tại của nhân viên trên Browser
let currentSession = JSON.parse(localStorage.getItem("emp_session")) || null;

/**
 * HÀM DÙNG CHUNG ĐỂ GỌI API (ĐÃ LOẠI BỎ CLOUDFLARE)
 */
async function callBackend(actionData) {
    try {
        const response = await fetch(API_URL, {
            method: "POST",
            mode: "cors", // Kích hoạt chế độ CORS trực tiếp với Google
            headers: {
                "Content-Type": "text/plain;charset=utf-8" // Sử dụng text/plain để tránh kích hoạt Preflight CORS phức tạp của GAS
            },
            body: JSON.stringify(actionData)
        });
        
        if (!response.ok) throw new Error("Mất kết nối tới máy chủ Google!");
        return await response.json();
    } catch (error) {
        console.error("API Error:", error);
        alert("Có lỗi xảy ra: " + error.message);
        return { status: "error", message: error.message };
    }
}

/**
 * XỬ LÝ ĐĂNG NHẬP BẰNG MÃ NHÂN VIÊN
 */
async function handleLogin(employeeCode) {
    if (!employeeCode) {
        alert("Vui lòng điền mã nhân viên!");
        return;
    }

    // Định dạng gói tin mới đẩy lên bộ định tuyến GAS
    const result = await callBackend({
        action: "login",
        employeeCode: employeeCode
    });

    if (result.status === "success") {
        currentSession = result.data;
        localStorage.setItem("emp_session", JSON.stringify(currentSession));
        alert(`Chào mừng ${currentSession.fullName} đăng nhập thành công!`);
        renderDashboard(); // Chuyển giao diện
    } else {
        alert(result.message);
    }
}

/**
 * XỬ LÝ CHẤM CÔNG (CHECK-IN / CHECK-OUT)
 */
async function doAttendance(type) {
    if (!currentSession) {
        alert("Vui lòng đăng nhập trước khi chấm công!");
        return;
    }

    const result = await callBackend({
        action: type, // 'checkin' hoặc 'checkout'
        employeeCode: currentSession.employeeCode,
        deviceInfo: navigator.userAgent.substring(0, 50) // Gửi kèm thông tin trình duyệt làm log thiết bị
    });

    if (result.status === "success") {
        alert(result.message + "\nThời gian: " + result.time);
        loadAttendanceLogs(); // Tải lại bảng lịch sử hiển thị
    } else {
        alert(result.message);
    }
}

/**
 * TẢI LỊCH SỬ CHẤM CÔNG (CHỈ TẢI THEO THÁNG HIỆN TẠI ĐỂ TĂNG TỐC)
 */
async function loadAttendanceLogs() {
    if (!currentSession) return;

    const now = new Date();
    const currentMonthStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, '0');

    const result = await callBackend({
        action: "getLogs",
        employeeCode: currentSession.employeeCode,
        month: currentMonthStr // Lọc ngay tại tầng backend giúp tối ưu băng thông và tốc độ tải
    });

    if (result.status === "success") {
        updateLogTableUI(result.logs); // Hàm hiển thị bảng dữ liệu lên HTML của bạn
    }
}
