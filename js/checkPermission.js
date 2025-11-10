import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { firebaseConfig } from "./firebaseConfig.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Cache quyền
let cachedPerms = null;

// Session helpers
function saveLoginTime() {
  localStorage.setItem("loginTime", Date.now().toString());
}

function isSessionValid() {
  const loginTime = localStorage.getItem("loginTime");
  if (!loginTime) return false;
  const now = Date.now();
  const MAX_SESSION_DURATION = 2 * 60 * 60 * 1000; // 2h
  return now - parseInt(loginTime, 10) < MAX_SESSION_DURATION;
}

function clearSession() {
  localStorage.removeItem("loginTime");
  cachedPerms = null;
}

// Gia hạn session khi hoạt động
["mousemove", "keydown", "click"].forEach(evt =>
  window.addEventListener(evt, saveLoginTime)
);

// ---------------------- Wait for Firebase Auth user ----------------------
function waitForUser() {
  return new Promise((resolve, reject) => {
    const user = auth.currentUser;
    if (user) return resolve(user);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      if (user) resolve(user);
      else reject(new Error("NO_USER"));
    });
  });
}

// ---------------------- Get user permissions ----------------------
export async function getUserPermissions() {
  try {
    const user = await waitForUser();

    if (!isSessionValid()) {
      clearSession();
      await signOut(auth);
      throw new Error("SESSION_EXPIRED");
    }

    // Lấy dữ liệu nhân viên từ Firestore
    const snap = await getDocs(collection(db, "nhanvien"));
    const current = snap.docs.map(d => d.data()).find(nv => nv.email === user.email);

    if (!current) throw new Error("USER_NOT_FOUND");

    cachedPerms = current.permissionKeys || {};
    saveLoginTime();
    return cachedPerms;

  } catch (err) {
    console.error("getUserPermissions lỗi:", err);
    throw err;
  }
}

// ---------------------- Check permission async ----------------------
export async function hasPermission(module, action) {
  if (!cachedPerms) {
    try { cachedPerms = await getUserPermissions(); }
    catch { return false; }
  }
  return cachedPerms[module]?.includes(action);
}

// ---------------------- Check permission sync ----------------------
export function hasPermissionSync(module, action) {
  if (!cachedPerms) return false;
  return cachedPerms[module]?.includes(action) === true;
}

// ---------------------- Refresh permissions ----------------------
export function refreshPermissions() { cachedPerms = null; }

// ---------------------- Apply UI ----------------------
export async function applyPermissionUI() {
  document.body.style.visibility = "hidden";

  try {
    const userPerms = await getUserPermissions();

    document.querySelectorAll("[data-permission-key]").forEach(el => {
      const key = el.getAttribute("data-permission-key");
      const action = el.getAttribute("data-permission-action") || "view";
      const behavior = el.getAttribute("data-permission-behavior") || "hide";

      const hasPerm = userPerms[key]?.includes(action);

      if (hasPerm) {
        el.style.display = "";
        el.disabled = false;
        el.title = "";
      } else {
        if (behavior === "disable") {
          el.disabled = true;
          el.style.display = "";
          el.title = "⛔ Bạn không có quyền thực hiện hành động này";
        } else {
          el.style.display = "none";
        }
      }
    });

  } catch (err) {
    console.error("applyPermissionUI lỗi:", err);
    document.querySelectorAll("[data-permission-key]").forEach(el => el.style.display = "none");
  } finally {
    document.body.style.visibility = "visible";
  }
}

// ---------------------- Check page access ----------------------
export async function checkPageAccess(requiredKey, requiredAction = "view") {
  document.body.style.visibility = "hidden";

  try {
    const userPerms = await getUserPermissions();
    if (!userPerms[requiredKey]?.includes(requiredAction)) {
      document.body.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;color:#fff;background:#222;font-family:Poppins,sans-serif;">
          <h2>🚫 Bạn không có quyền truy cập trang này</h2>
          <a href="index.html" style="color:#00d4ff;margin-top:20px;">⬅️ Quay lại Trang chủ</a>
        </div>`;
      document.body.style.visibility = "visible";
      return false;
    }

    document.body.style.visibility = "visible";
    return true;

  } catch (err) {
    document.body.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;color:#fff;background:#222;">
        <h2>⚠️ Lỗi xác thực quyền</h2>
        <p>${err}</p>
        <a href="login.html" style="color:#00d4ff;margin-top:20px;">Đăng nhập lại</a>
      </div>`;
    document.body.style.visibility = "visible";
    return false;
  }
}

// ---------------------- Auto check page ----------------------
export function autoCheckPage(requiredKey, requiredAction = "view") {
  window.addEventListener("DOMContentLoaded", () => checkPageAccess(requiredKey, requiredAction));
}
