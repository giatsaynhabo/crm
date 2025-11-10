// nhanvien.js (full, quyền + giữ nguyên tất cả chức năng cũ)

import {
  db,
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  orderBy,
  limit,
  addDoc,
  where,
  Timestamp,
  auth,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from "./firebaseConfig.js";

import { checkPageAccess, getUserPermissions } from "./checkPermission.js";

const UPDATE_USER_EMAIL_ENDPOINT = window.UPDATE_USER_EMAIL_ENDPOINT || "";

// ==================== DOM Elements ====================
const btnOpenAddNV = document.getElementById("btnOpenAddNV");
const btnOpenAddCH = document.getElementById("btnOpenAddCH");
const btnListCH = document.getElementById("btnListCH");

const modalAddNV = document.getElementById("modalAddNV");
const modalAddCH = document.getElementById("modalAddCH");
const modalListCH = document.getElementById("modalListCH");

const btnCancelNV = document.getElementById("btnCancelNV");
const btnCancelCH = document.getElementById("btnCancelCH");
const btnCloseCH = document.getElementById("btnCloseCH");

const formNhanVien = document.getElementById("formNhanVien");
const formCuaHang = document.getElementById("formCuaHang");

const listNhanVien = document.getElementById("listNhanVien");
const listCuaHang = document.getElementById("listCuaHang");

const chQuanLy = document.getElementById("chQuanLy");
const nvKho = document.getElementById("nvKho");
const nvQuyenKho = document.getElementById("nvQuyenKho");

const searchInput = document.getElementById("searchInput");
const btnSearch = document.getElementById("btnSearch");
const btnClear = document.getElementById("btnClear");
const searchCH = document.getElementById("searchCH");
const btnSearchCH = document.getElementById("btnSearchCH");
const btnClearCH = document.getElementById("btnClearCH");

const btnOpenKhaiBaoVT = document.getElementById("btnOpenKhaiBaoVT");
const modalKhaiBaoVT = document.getElementById("modalKhaiBaoVT");
const btnCancelVT = document.getElementById("btnCancelVT");
const vtKhoSelect = document.getElementById("vtKhoSelect");
const formViTriKho = document.getElementById("formViTriKho");
const listViTriKho = document.getElementById("listViTriKho");

// ==================== Quyền ====================
let userPerms = {};
await checkPageAccess("nhanvienManage", "view");

try {
  userPerms = await getUserPermissions();
} catch (err) {
  console.warn("Không lấy được quyền người dùng:", err);
  userPerms = {};
}

function can(action) {
  return userPerms["nhanvienManage"]?.includes(action);
}

// ==================== Helper ====================
const openModal = (m) => (m.style.display = "flex");
const closeModal = (m) => (m.style.display = "none");
const showToast = (msg, timeout = 3000) => {
  const t = document.createElement("div");
  t.textContent = msg;
  Object.assign(t.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    background: "#333",
    color: "#fff",
    padding: "10px 16px",
    borderRadius: "8px",
    zIndex: 9999,
    opacity: "0.95",
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), timeout);
};
window.onclick = (e) => {
  if (e.target.classList && e.target.classList.contains("modal")) closeModal(e.target);
};

// ==================== ID Generator ====================
async function getNextAutoId(colName, idField, start = 1) {
  const q = query(collection(db, colName), orderBy(idField, "desc"), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return start;
  const last = snap.docs[0].data()[idField];
  return (parseInt(last) || 0) + 1;
}

// ==================== Dropdowns ====================
async function loadKhoDropdownNV(selectedId = "") {
  if (!nvKho) return;
  nvKho.innerHTML = ""; // xóa hoàn toàn, không hiển thị "-- Chọn kho làm việc --"
  
  const snapshot = await getDocs(collection(db, "cuahang"));
  snapshot.forEach((docSnap) => {
    const k = docSnap.data();
    const opt = document.createElement("option");
    opt.value = k.storeId;
    // Hiển thị kiểu: "1 - HCM_TDU_LTM 60 Hàng tre"
    opt.textContent = `${k.storeId} - ${k.ten}`;
    if (selectedId && String(selectedId) === String(k.storeId)) opt.selected = true;
    nvKho.appendChild(opt);
  });

  // Nếu nhân viên không có kho, có thể thêm 1 option mặc định
  if (!selectedId) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "-- Chọn kho làm việc --";
    nvKho.prepend(opt);
  }
}


async function loadNhanVienDropdown(selected = "") {
  if (!chQuanLy) return;
  chQuanLy.innerHTML = "<option value=''>-- Chọn nhân viên quản lý --</option>";
  const snapshot = await getDocs(collection(db, "nhanvien"));
  snapshot.forEach((docSnap) => {
    const nv = docSnap.data();
    const opt = document.createElement("option");
    opt.value = nv.userId;
    opt.textContent = `${nv.userId} - ${nv.hoTen}`;
    if (selected === nv.userId) opt.selected = true;
    chQuanLy.appendChild(opt);
  });
}

// ==================== Nhân viên ====================
function getEmailInputValue() {
  const el = document.getElementById("nvEmail");
  return el ? el.value.trim() : "";
}

async function addNhanVien(e) {
  e.preventDefault();
  if (!can("create")) return showToast("🚫 Bạn không có quyền thêm nhân viên!");

  try {
    const newId = await getNextAutoId("nhanvien", "userId", 1001);
    const email = getEmailInputValue();
    const hoTen = document.getElementById("nvHoTen").value.trim();
    const sdt = document.getElementById("nvSdt").value.trim();
    let createdAuthUid = null;

    if (email && auth && typeof createUserWithEmailAndPassword === "function") {
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, sdt || Math.random().toString(36).slice(2, 10));
        createdAuthUid = cred.user?.uid || null;
        if (typeof sendPasswordResetEmail === "function") await sendPasswordResetEmail(auth, email);
        showToast("📧 Đã gửi email đặt lại mật khẩu tới người dùng mới.");
      } catch (authErr) {
        console.warn("createUserWithEmailAndPassword lỗi:", authErr);
        showToast("⚠️ Lưu nhân viên nhưng không thể tạo tài khoản Auth (email có thể đã tồn tại).");
      }
    }

    const data = {
      userId: newId,
      email: email || "",
      hoTen,
      sdt,
      diaChi: document.getElementById("nvDiaChi").value.trim(),
      gioiTinh: document.getElementById("nvGioiTinh").value,
      chucVu: document.getElementById("nvChucVu").value.trim(),
      quyen: document.getElementById("nvQuyen").value,
      tinhTrang: document.getElementById("nvTinhTrang").value,
      khoLamViec: nvKho ? nvKho.value : "",
      quyenKho: nvQuyenKho ? nvQuyenKho.checked : false,
      ngayTao: new Date().toISOString(),
      authUid: createdAuthUid,
    };

    await setDoc(doc(db, "nhanvien", newId.toString()), data);
    showToast(`✅ Đã thêm nhân viên mới (ID: ${newId})`);
    formNhanVien.reset();
    closeModal(modalAddNV);
    loadDanhSachNhanVien();
  } catch (err) {
    console.error(err);
    showToast("❌ Lỗi khi thêm nhân viên!");
  }
}

async function loadDanhSachNhanVien(keyword = "") {
  const snapshot = await getDocs(collection(db, "nhanvien"));
  let html = "";

  snapshot.forEach((docSnap) => {
    const nv = docSnap.data();
    const matches =
      !keyword ||
      (nv.hoTen && nv.hoTen.toLowerCase().includes(keyword.toLowerCase())) ||
      (nv.sdt && nv.sdt.includes(keyword)) ||
      (nv.email && nv.email.toLowerCase().includes(keyword.toLowerCase()));

    if (matches) {
      const hoTenWithEmail = nv.email
        ? `${nv.hoTen || ""}<br/><small style="color:#555;">${nv.email}</small>`
        : nv.hoTen || "";

      let actionBtns = "";
      if (can("edit")) actionBtns += `<button class="btn-edit" data-id="${nv.userId}">Sửa</button>`;
      if (can("delete")) actionBtns += `<button class="btn-delete" data-id="${nv.userId}">Xóa</button>`;

      html += `
        <tr>
          <td>${nv.userId}</td>
          <td>${hoTenWithEmail}</td>
          <td>${nv.sdt || ""}</td>
          <td>${nv.diaChi || ""}</td>
          <td>${nv.gioiTinh || ""}</td>
          <td>${nv.quyen || ""}</td>
          <td>${nv.chucVu || ""}</td>
          <td>${nv.tinhTrang || ""}</td>
          <td>${nv.khoLamViec || "—"}</td>
          <td class="actions">${actionBtns}</td>
        </tr>`;
    }
  });

  listNhanVien.innerHTML = html || "<tr><td colspan='10'>Không có dữ liệu</td></tr>";

  document.querySelectorAll(".btn-edit").forEach((btn) => {
    btn.onclick = () => editNhanVien(btn.dataset.id);
  });
  document.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.onclick = async () => {
      if (!can("delete")) return showToast("🚫 Không có quyền xóa nhân viên!");
      if (!confirm(`Xác nhận xóa nhân viên ${btn.dataset.id}?`)) return;
      await deleteDoc(doc(db, "nhanvien", btn.dataset.id));
      showToast("🗑️ Đã xóa nhân viên!");
      loadDanhSachNhanVien();
    };
  });
}

// ==================== Sửa nhân viên ====================
async function editNhanVien(userId) {
  const ref = doc(db, "nhanvien", userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return showToast("⚠️ Không tìm thấy nhân viên!");
  const nv = snap.data();

  // Cập nhật tiêu đề modal
  const modalTitle = modalAddNV.querySelector("h2");
  if (modalTitle) modalTitle.textContent = "✏️ Chỉnh sửa thông tin nhân viên";

  // Load dropdown kho và chọn kho hiện tại
  if (nvKho) {
    await loadKhoDropdownNV(nv.khoLamViec); // truyền kho hiện tại để select
    nvKho.disabled = false; // cho phép đổi kho khác
  }

  document.getElementById("nvHoTen").value = nv.hoTen || "";
  document.getElementById("nvSdt").value = nv.sdt || "";
  document.getElementById("nvDiaChi").value = nv.diaChi || "";
  if (document.getElementById("nvGioiTinh")) document.getElementById("nvGioiTinh").value = nv.gioiTinh || "";
  document.getElementById("nvChucVu").value = nv.chucVu || "";
  if (document.getElementById("nvQuyen")) document.getElementById("nvQuyen").value = nv.quyen || "";
  if (document.getElementById("nvTinhTrang")) document.getElementById("nvTinhTrang").value = nv.tinhTrang || "";
  if (document.getElementById("nvEmail")) document.getElementById("nvEmail").value = nv.email || "";
  if (nvQuyenKho) nvQuyenKho.checked = nv.quyenKho || false;

  openModal(modalAddNV);

  formNhanVien.onsubmit = async (e) => {
    e.preventDefault();
    const newEmail = getEmailInputValue();
    const newData = {
      hoTen: document.getElementById("nvHoTen").value.trim(),
      sdt: document.getElementById("nvSdt").value.trim(),
      diaChi: document.getElementById("nvDiaChi").value.trim(),
      gioiTinh: document.getElementById("nvGioiTinh") ? document.getElementById("nvGioiTinh").value : nv.gioiTinh,
      chucVu: document.getElementById("nvChucVu").value.trim(),
      quyen: document.getElementById("nvQuyen") ? document.getElementById("nvQuyen").value : nv.quyen,
      tinhTrang: document.getElementById("nvTinhTrang") ? document.getElementById("nvTinhTrang").value : nv.tinhTrang,
      khoLamViec: nvKho ? nvKho.value : nv.khoLamViec, // lấy từ dropdown, có thể đổi
      quyenKho: nvQuyenKho ? nvQuyenKho.checked : nv.quyenKho,
      email: newEmail || "",
    };

    try {
      await updateDoc(ref, newData);

      if ((newEmail || "") !== (nv.email || "")) {
        if (UPDATE_USER_EMAIL_ENDPOINT && nv.authUid) {
          try {
            const resp = await fetch(UPDATE_USER_EMAIL_ENDPOINT, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ uid: nv.authUid, email: newEmail }),
            });
            if (!resp.ok) throw new Error("Server trả về lỗi khi cập nhật email Auth");
            if (auth && typeof sendPasswordResetEmail === "function") await sendPasswordResetEmail(auth, newEmail);
            showToast("🔁 Đã cập nhật email trên Auth và gửi reset link.");
          } catch (err) {
            console.error("Lỗi endpoint:", err);
            if (auth && typeof sendPasswordResetEmail === "function") await sendPasswordResetEmail(auth, newEmail);
            showToast("⚠️ Email đã cập nhật trong Firestore nhưng Auth chưa đổi.");
          }
        } else {
          if (auth && typeof sendPasswordResetEmail === "function") await sendPasswordResetEmail(auth, newEmail);
          showToast("📧 Đã gửi email reset mật khẩu tới email mới.");
        }
      }

      showToast("✏️ Đã cập nhật nhân viên!");
      closeModal(modalAddNV);
      formNhanVien.reset();
      formNhanVien.onsubmit = addNhanVien;
      loadDanhSachNhanVien();
    } catch (err) {
      console.error(err);
      showToast("❌ Lỗi khi cập nhật nhân viên!");
    }
  };
}

// ==================== Cửa hàng ====================
async function addCuaHang(e) {
  e.preventDefault();
  if (!can("store_create")) return showToast("🚫 Không có quyền thêm cửa hàng!");

  const storeId = await getNextAutoId("cuahang", "storeId", 1);
  const soViTri = parseInt(document.getElementById("chSoViTri")?.value || 0, 10);

  const viTriKho = [];
  for (let i = 1; i <= soViTri; i++) {
    viTriKho.push(`VT${i.toString().padStart(2, "0")}`);
  }

  const data = {
    storeId,
    ten: document.getElementById("chTen").value.trim(),
    diaChi: document.getElementById("chDiaChi").value.trim(),
    trangThai: document.getElementById("chTrangThai").value,
    quanLy: document.getElementById("chQuanLy").value,
    soViTri,
    viTriKho,
    ngayTao: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, "cuahang", storeId.toString()), data);
    showToast(`🏪 Đã thêm cửa hàng mới (ID: ${storeId})`);
    formCuaHang.reset();
    closeModal(modalAddCH);
    loadDanhSachCuaHang();
  } catch (err) {
    console.error(err);
    showToast("❌ Lỗi khi thêm cửa hàng!");
  }
}

async function loadDanhSachCuaHang(keyword = "") {
  if (!can("store_view")) return;
  const snapshot = await getDocs(collection(db, "cuahang"));
  const nhanVienMap = {};
  const nvs = await getDocs(collection(db, "nhanvien"));
  nvs.forEach((nv) => (nhanVienMap[nv.data().userId] = nv.data().hoTen));

  let html = "";
  snapshot.forEach((docSnap) => {
    const ch = docSnap.data();
    const quanLyTen = nhanVienMap[ch.quanLy] || "—";

    if (!keyword || ch.ten.toLowerCase().includes(keyword.toLowerCase()) || quanLyTen.toLowerCase().includes(keyword.toLowerCase())) {
      let btns = "";
      if (can("edit")) btns += `<button class="btn-edit" data-id="${ch.storeId}">Sửa</button>`;
      if (can("toggle")) btns += `<button class="btn-toggle" data-id="${ch.storeId}">${ch.trangThai === "active" ? "Tạm dừng" : "Kích hoạt"}</button>`;

      html += `
        <tr>
          <td>${ch.storeId}</td>
          <td>${ch.ten}</td>
          <td>${ch.diaChi}</td>
          <td>${ch.quanLy} - ${quanLyTen}</td>
          <td>${ch.trangThai === "active" ? "Kích hoạt" : "Tạm dừng"}</td>
          <td>Vị trí: ${ch.soViTri || 0}</td>
          <td class="actions">${btns}</td>
        </tr>`;
    }
  });

  listCuaHang.innerHTML = html || "<tr><td colspan='7'>Không có cửa hàng nào</td></tr>";

  document.querySelectorAll(".btn-toggle").forEach((btn) => {
    btn.onclick = async () => {
      if (!can("toggle")) return showToast("🚫 Không có quyền đổi trạng thái!");
      const id = btn.dataset.id;
      const ref = doc(db, "cuahang", id);
      const snap = await getDoc(ref);
      const current = snap.data().trangThai === "active" ? "inactive" : "active";
      await updateDoc(ref, { trangThai: current });
      showToast("🔁 Đã cập nhật trạng thái cửa hàng!");
      loadDanhSachCuaHang();
    };
  });

  document.querySelectorAll(".btn-edit").forEach((btn) => {
    btn.onclick = () => editCuaHang(btn.dataset.id);
  });
}

// ==================== Sửa cửa hàng ====================
async function editCuaHang(storeId) {
  if (!can("edit")) return showToast("🚫 Không có quyền sửa cửa hàng!");
  const ref = doc(db, "cuahang", storeId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return showToast("⚠️ Không tìm thấy cửa hàng!");
  const ch = snap.data();

  await loadNhanVienDropdown(ch.quanLy);
  document.getElementById("chTen").value = ch.ten;
  document.getElementById("chDiaChi").value = ch.diaChi;
  document.getElementById("chTrangThai").value = ch.trangThai;
  if (document.getElementById("chSoViTri")) document.getElementById("chSoViTri").value = ch.soViTri || 0;
  openModal(modalAddCH);

  formCuaHang.onsubmit = async (e) => {
    e.preventDefault();
    const soViTri = parseInt(document.getElementById("chSoViTri")?.value || 0, 10);
    const viTriKho = [];
    for (let i = 1; i <= soViTri; i++) viTriKho.push(`VT${i.toString().padStart(2, "0")}`);

    const newData = {
      ten: document.getElementById("chTen").value.trim(),
      diaChi: document.getElementById("chDiaChi").value.trim(),
      trangThai: document.getElementById("chTrangThai").value,
      quanLy: document.getElementById("chQuanLy").value,
      soViTri,
      viTriKho,
    };

    await updateDoc(ref, newData);
    showToast("✏️ Đã cập nhật cửa hàng!");
    closeModal(modalAddCH);
    formCuaHang.onsubmit = addCuaHang;
    loadDanhSachCuaHang();
  };
}

// ==================== Event Bindings ====================
if (can("create")) {
  btnOpenAddNV.onclick = async () => {
    await loadKhoDropdownNV();
    formNhanVien.reset();
    formNhanVien.onsubmit = addNhanVien;
    openModal(modalAddNV);
  };
} else btnOpenAddNV.style.display = "none";

if (can("store_create")) {
  btnOpenAddCH.onclick = async () => {
    await loadNhanVienDropdown();
    formCuaHang.reset();
    formCuaHang.onsubmit = addCuaHang;
    openModal(modalAddCH);
  };
} else btnOpenAddCH.style.display = "none";

btnListCH.onclick = async () => {
  await loadDanhSachCuaHang();
  openModal(modalListCH);
};
btnCancelNV.onclick = () => closeModal(modalAddNV);
btnCancelCH.onclick = () => closeModal(modalAddCH);
btnCloseCH.onclick = () => closeModal(modalListCH);

btnSearch.onclick = () => loadDanhSachNhanVien(searchInput.value);
btnClear.onclick = () => {
  searchInput.value = "";
  loadDanhSachNhanVien();
};
btnSearchCH.onclick = () => loadDanhSachCuaHang(searchCH.value);
btnClearCH.onclick = () => {
  searchCH.value = "";
  loadDanhSachCuaHang();
};

// ==================== Init ====================
loadDanhSachNhanVien();

// ==================== Vị trí kho ====================
// (giữ nguyên tất cả khai báo vị trí kho + modal như bản trước)


// ==================== Vị trí kho ====================

// Mở modal
if (btnOpenKhaiBaoVT) {
  btnOpenKhaiBaoVT.addEventListener("click", async () => {
    modalKhaiBaoVT.style.display = "flex";
    await loadKhoDropdownVT();
  });
}

// Đóng modal
if (btnCancelVT) {
  btnCancelVT.addEventListener("click", () => {
    modalKhaiBaoVT.style.display = "none";
  });
}

// Load danh sách kho cho VT
async function loadKhoDropdownVT(selectedId = "") {
  if (!vtKhoSelect) return;
  vtKhoSelect.innerHTML = "<option value=''>-- Chọn kho làm việc --</option>";
  const snapshot = await getDocs(collection(db, "cuahang"));
  snapshot.forEach((docSnap) => {
    const k = docSnap.data();
    const opt = document.createElement("option");
    opt.value = k.storeId;
    opt.textContent = `${k.storeId} - ${k.ten}`;
    if (selectedId && String(selectedId) === String(k.storeId)) opt.selected = true;
    vtKhoSelect.appendChild(opt);
  });
}


// Khi chọn kho → load danh sách vị trí hiện có
if (vtKhoSelect) {
  vtKhoSelect.addEventListener("change", async () => {
    listViTriKho.innerHTML = "";
    if (vtKhoSelect.value) await loadDanhSachViTriKho(vtKhoSelect.value);
  });
}

async function loadDanhSachViTriKho(khoId) {
  if (!listViTriKho) return;
  listViTriKho.innerHTML = `<tr><td colspan="8">⏳ Đang tải...</td></tr>`;
  const q = query(collection(db, "vitrikho"), where("khoId", "==", khoId));
  const snap = await getDocs(q);
  listViTriKho.innerHTML = "";
  snap.forEach((d) => {
    const v = d.data();
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${v.khu}</td>
      <td>${v.ke}</td>
      <td>${v.tang}</td>
      <td>${v.viTri}</td>
      <td>${v.ma}</td>
      <td>${v.soLuong}</td>
      <td>${v.ngayTao instanceof Date ? v.ngayTao.toISOString() : (v.ngayTao && v.ngayTao.toDate ? v.ngayTao.toDate().toISOString() : v.ngayTao)}</td>
      <td>${v.ma}</td>`;
    listViTriKho.appendChild(tr);
  });
  if (snap.empty) {
    listViTriKho.innerHTML = `<tr><td colspan="8">⚠️ Chưa có vị trí nào trong kho này</td></tr>`;
  }
}

// Xử lý khi submit form vị trí kho
if (formViTriKho) {
  formViTriKho.addEventListener("submit", async (e) => {
    e.preventDefault();

    const khoId = vtKhoSelect.value;
    const khu = document.getElementById("vtKhu").value.trim().toUpperCase();
    const ke = parseInt(document.getElementById("vtKe").value);
    const soTang = parseInt(document.getElementById("vtTang").value);
    const soVT = parseInt(document.getElementById("vtViTri").value);
    const soLuong = parseInt(document.getElementById("vtSoLuong").value);

    if (!khoId || !khu || !ke || !soTang || !soVT || !soLuong) {
      alert("⚠️ Vui lòng nhập đầy đủ thông tin!");
      return;
    }

    if (!confirm(`Xác nhận khai báo ${soTang} tầng * ${soVT} vị trí trong kho?`)) return;

    try {
      for (let t = 1; t <= soTang; t++) {
        for (let v = 1; v <= soVT; v++) {
          const ma = `${khu}${ke}-${t}-${v}`;
          await addDoc(collection(db, "vitrikho"), {
            khoId,
            khu,
            ke,
            tang: t,
            viTri: v,
            ma,
            soLuong,
            ngayTao: Timestamp.now(),
          });
        }
      }
      alert("✅ Khai báo vị trí thành công!");
      await loadDanhSachViTriKho(khoId);
    } catch (err) {
      console.error(err);
      alert("❌ Lỗi khi khai báo vị trí: " + err.message);
    }
  });
}
