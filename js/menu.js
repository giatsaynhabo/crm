import { getFirestore, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

// Load menu
async function loadMenu() {
  const menuContainer = document.getElementById("menu");
  if (!menuContainer) return;

  try {
    const response = await fetch("menu.html");
    const html = await response.text();
    menuContainer.innerHTML = html;

    // Khởi tạo dropdown menu
    initDropdownMenu();

    // Hiển thị kho cấu hình
    await showKhoInfo();

    // Apply permission UI nếu có
    import("./checkPermission.js").then(module => {
      if (module.applyPermissionUI) module.applyPermissionUI();
    });

  } catch (error) {
    console.error("Không thể tải menu.html:", error);
  }
}

// Dropdown menu
function initDropdownMenu() {
  const dropdowns = document.querySelectorAll(".dropdown");

  dropdowns.forEach(dropdown => {
    const toggle = dropdown.querySelector(".dropdown-toggle");
    if (toggle) {
      toggle.addEventListener("click", (e) => {
        e.preventDefault();
        dropdowns.forEach(d => { if (d !== dropdown) d.classList.remove("active"); });
        dropdown.classList.toggle("active");
      });
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".dropdown")) {
      dropdowns.forEach(d => d.classList.remove("active"));
    }
  });
}

// Hiển thị kho cấu hình
async function showKhoInfo() {
  const db = getFirestore();
  const userStr = localStorage.getItem("userInfo");
  if (!userStr) return;

  const user = JSON.parse(userStr);
  console.log("User khoLamViec:", user.khoLamViec);

  const khoId = user.khoLamViec;
  if (!khoId) return;

  const cuahangRef = collection(db, "cuahang");
  const q = query(cuahangRef, where("storeId", "==", Number(khoId)));
  const snap = await getDocs(q);

  console.log("Snap empty?", snap.empty, snap.docs.map(d=>d.data()));

  const khoDiv = document.getElementById("khoInfo");
  if (!khoDiv) {
    console.warn("#khoInfo not found");
    return;
  }

  if (!snap.empty) {
    const khoData = snap.docs[0].data();
    const khoText = `${khoData.storeId} - ${khoData.ten}`;
    khoDiv.textContent = `Kho cấu hình: ${khoText}`;
  } else {
    khoDiv.textContent = "Kho cấu hình: Chưa xác định";
  }
}

// Gọi loadMenu khi trang được tải
loadMenu();
