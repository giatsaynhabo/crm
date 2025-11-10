import { db, collection, getDocs } from "./firebaseConfig.js";

// Đếm dữ liệu Firestore để hiển thị dashboard
async function loadDashboard() {
  const sanphamSnap = await getDocs(collection(db, "products"));
  const chuongtrinhSnap = await getDocs(collection(db, "programs"));
  const donhangSnap = await getDocs(collection(db, "orders"));

  document.getElementById("countSanPham").textContent = sanphamSnap.size;
  document.getElementById("countChuongTrinh").textContent = chuongtrinhSnap.size;
  document.getElementById("countDonHang").textContent = donhangSnap.size;
}

loadDashboard();
