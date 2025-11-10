import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { getFirestore, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { firebaseConfig } from "./firebaseConfig.js";
import { refreshLoginTime } from "./permissionInit.js"; // để gia hạn session ngay

// 🔥 Khởi tạo Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const form = document.getElementById("loginForm");
const message = document.getElementById("message");
const btnLogin = document.querySelector(".btn-login");

// Spinner
const spinner = document.createElement("div");
spinner.classList.add("spinner");
spinner.style.display = "none";
btnLogin.insertAdjacentElement("afterend", spinner);

// Xóa session cũ
localStorage.removeItem("userInfo");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  spinner.style.display = "block";
  btnLogin.disabled = true;
  btnLogin.style.opacity = "0.7";
  message.style.color = "#fff";
  message.textContent = "⏳ Đang đăng nhập...";

  try {
    // 🔹 Firebase login
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // 🔹 Query Firestore chỉ doc của user
    const q = query(collection(db, "nhanvien"), where("authUid", "==", user.uid));
    const snap = await getDocs(q);
    const matchedDoc = snap.docs[0];

    let userInfo;

    if (matchedDoc) {
      const nv = matchedDoc.data();
      userInfo = {
        email: nv.email,
        userId: nv.userId,
        hoTen: nv.hoTen,
        quyen: nv.quyen,
        authUid: nv.authUid,
        diaChi: nv.diaChi,
        khoLamViec: nv.khoLamViec, // <-- thêm dòng này
        loginTime: Date.now(),
      };
      message.style.color = "#00ff88";
      message.textContent = `✅ Xin chào ${nv.hoTen}! Đăng nhập thành công.`;
    } else {
      userInfo = {
        email: user.email,
        userId: null,
        hoTen: "Không xác định",
        quyen: "unknown",
        authUid: user.uid,
        loginTime: Date.now(),
      };
      message.style.color = "#ffcc00";
      message.textContent = "⚠️ Không tìm thấy thông tin nhân viên, đăng nhập cơ bản.";
    }

    // Lưu vào localStorage
    localStorage.setItem("userInfo", JSON.stringify(userInfo));

    // Gia hạn session ngay
    refreshLoginTime();

    spinner.style.display = "none";

    // Redirect sang index.html
    setTimeout(() => window.location.href = "index.html", 800);

  } catch (error) {
    spinner.style.display = "none";
    btnLogin.disabled = false;
    btnLogin.style.opacity = "1";
    message.style.color = "#ff8080";

    switch (error.code) {
      case "auth/user-not-found": message.textContent = "❌ Không tìm thấy tài khoản!"; break;
      case "auth/wrong-password": message.textContent = "❌ Mật khẩu không đúng!"; break;
      default: message.textContent = "⚠️ Lỗi: " + error.message;
    }
  }
});
