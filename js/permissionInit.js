// js/permissionInit.js
import { checkPageAccess, applyPermissionUI } from "./checkPermission.js";

/* ------------------ Toast ------------------ */
function showToast(message) {
  const toast = document.createElement("div");
  toast.textContent = message;
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "30px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "#333",
    color: "#fff",
    padding: "12px 20px",
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
    fontFamily: "Poppins, sans-serif",
    fontSize: "15px",
    zIndex: "9999",
    opacity: "0",
    transition: "opacity 0.3s ease",
  });
  document.body.appendChild(toast);
  setTimeout(() => (toast.style.opacity = "1"), 100);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 500);
  }, 2500);
}

/* ------------------ Loading nhẹ ------------------ */
function showLoadingLite() {
  if (document.getElementById("page-loader-lite")) return;
  const loader = document.createElement("div");
  loader.id = "page-loader-lite";
  Object.assign(loader.style, {
    position: "fixed",
    top: "10px",
    right: "10px",
    padding: "8px 12px",
    background: "#333",
    color: "#fff",
    borderRadius: "6px",
    zIndex: "9999",
    fontFamily: "Poppins, sans-serif",
    fontSize: "14px",
  });
  loader.textContent = "⏳ Kiểm tra quyền...";
  document.body.appendChild(loader);
}

function hideLoadingLite() {
  const loader = document.getElementById("page-loader-lite");
  if (loader) loader.remove();
}

/* ------------------ Logout ------------------ */
export function logout(showMessage = false) {
  try {
    localStorage.removeItem("userInfo");
    localStorage.removeItem("userPermissions");
    console.log("👋 Đã đăng xuất khỏi hệ thống");
  } catch (error) {
    console.error("Lỗi khi đăng xuất:", error);
  } finally {
    if (showMessage) {
      showToast("⏰ Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại");
      setTimeout(() => (window.location.href = "login.html"), 2500);
    } else {
      window.location.href = "login.html";
    }
  }
}

/* ------------------ Session & Login ------------------ */
function checkLoginStatus() {
  try {
    const data = localStorage.getItem("userInfo");
    if (!data) return null;

    const user = JSON.parse(data);

    // ✅ Nếu loginTime chưa có, set ngay
    if (!user.loginTime) {
      user.loginTime = Date.now();
      localStorage.setItem("userInfo", JSON.stringify(user));
      return user;
    }

    // ✅ Kiểm tra thời hạn đăng nhập (5 phút)
    const now = Date.now();
    const maxSession = 5 * 60 * 1000; // 5 phút
    if (now - user.loginTime > maxSession) {
      console.warn("⏰ Phiên đăng nhập đã hết hạn!");
      safeLogout(true);
      return null;
    }

    return user;
  } catch (error) {
    console.error("Lỗi kiểm tra đăng nhập:", error);
    return null;
  }
}

/* ------------------ Gia hạn session ------------------ */
// permissionInit.js
export function refreshLoginTime() {
  const data = localStorage.getItem("userInfo");
  if (!data) return;
  const user = JSON.parse(data);
  user.loginTime = Date.now();
  localStorage.setItem("userInfo", JSON.stringify(user));
}


// Gia hạn khi user hoạt động
["click", "scroll", "keypress"].forEach(evt =>
  window.addEventListener(evt, refreshLoginTime)
);

// Gia hạn ngay khi load page
window.addEventListener("load", refreshLoginTime);

// Gia hạn định kỳ mỗi 2 phút
setInterval(refreshLoginTime, 2 * 60 * 1000);

/* ------------------ Đồng bộ logout ------------------ */
let isLoggingOut = false;
function safeLogout(showMessage = false) {
  if (isLoggingOut) return;
  isLoggingOut = true;
  logout(showMessage);
}

window.addEventListener("storage", (event) => {
  if (event.key === "userInfo" && !event.newValue) {
    console.log("🚪 Phát hiện đăng xuất từ tab khác");
    safeLogout(true);
  }
});

// Check session định kỳ
setInterval(() => {
  const user = checkLoginStatus();
  if (!user) safeLogout(true);
}, 60 * 1000);

/* ------------------ Init trang bảo vệ ------------------ */
export async function initProtectedPage(key, action = "view") {
  try {
    showLoadingLite();

    const user = checkLoginStatus();
    if (!user) return;

    // ✅ Apply UI quyền ngay từ cache
    applyPermissionUI().catch(err => console.error("applyPermissionUI lỗi:", err));

    // ✅ Lấy quyền đã cache
    const cachedPermissions = JSON.parse(localStorage.getItem("userPermissions") || "{}");
    if (cachedPermissions[key]?.[action] !== undefined) {
      if (!cachedPermissions[key][action]) {
        hideLoadingLite();
        safeLogout(true);
        return;
      }
    } else {
      // ✅ Check server nếu chưa cache
      const hasAccess = await checkPageAccess(key, action).catch(err => {
        console.error("checkPageAccess lỗi:", err);
        return false;
      });

      cachedPermissions[key] = cachedPermissions[key] || {};
      cachedPermissions[key][action] = hasAccess;
      localStorage.setItem("userPermissions", JSON.stringify(cachedPermissions));

      if (!hasAccess) {
        hideLoadingLite();
        safeLogout(true);
        return;
      }
    }

    hideLoadingLite();
  } catch (error) {
    console.error("Lỗi initProtectedPage:", error);
    hideLoadingLite();
    document.body.innerHTML = `
      <div style="
        display:flex;
        align-items:center;
        justify-content:center;
        height:100vh;
        flex-direction:column;
        font-family:Poppins, sans-serif;
        text-align:center;
      ">
        <h2>🚫 Bạn không có quyền truy cập trang này</h2>
        <button onclick="window.location.href='index.html'"
          style="
            margin-top:16px;
            padding:10px 20px;
            border:none;
            background:#007bff;
            color:white;
            border-radius:8px;
            cursor:pointer;
          ">
          ⬅️ Quay về Trang chủ
        </button>
      </div>`;
  }
}
