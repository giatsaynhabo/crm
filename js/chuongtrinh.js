// --------------------- IMPORT FIREBASE ---------------------
import {
  db,
  collection,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
} from "./firebaseConfig.js";
import { hasPermissionSync as hasPermission } from "./checkPermission.js";
import { getUserPermissions } from "./checkPermission.js";


// --------------------- ELEMENTS ---------------------
const listEl = document.getElementById("listPrograms");
const btnOpenAdd = document.getElementById("btnOpenAdd");
const modal = document.getElementById("modalProgram");
const form = document.getElementById("formProgram");
const modalTitle = document.getElementById("modalTitle");
const btnCancel = document.getElementById("btnCancel");

const searchInput = document.getElementById("searchInput");
const btnSearch = document.getElementById("btnSearch");
const btnClear = document.getElementById("btnClear");
// Bộ lọc trạng thái + người tạo
const filterStatus = document.getElementById("filterStatus");
const filterCreator = document.getElementById("filterCreator");

const isSpecialProgramCheckbox = document.getElementById("isSpecialProgram");
const specialProgramWrapper = document.getElementById("specialProgramWrapper");

isSpecialProgramCheckbox.addEventListener("change", () => {
  if (isSpecialProgramCheckbox.checked) {
    specialProgramWrapper.style.display = "block";
  } else {
    specialProgramWrapper.style.display = "none";
  }
});

const colPrograms = collection(db, "programs");
let programs = []; // cache

// Coupon elements
const btnOpenCouponPhieu = document.getElementById("btnOpenCouponPhieu");
const modalCouponPhieu = document.getElementById("modalCouponPhieu");
const formCouponPhieu = document.getElementById("formCouponPhieu");
const btnCancelCouponPhieu = document.getElementById("btnCancelCouponPhieu");
const btnViewCoupons = document.getElementById("btnViewCoupons");
const modalListCoupons = document.getElementById("modalListCoupons");
const btnCloseCouponList = document.getElementById("btnCloseCouponList");
const listCoupons = document.getElementById("listCoupons");
const searchCoupon = document.getElementById("searchCoupon");
const btnSearchCoupon = document.getElementById("btnSearchCoupon");
const btnClearCoupon = document.getElementById("btnClearCoupon");

let allCoupons = [];

// --------------------- TOAST (UI thông báo đẹp hơn) ---------------------
(function injectToastStyles() {
  const css = `
    .toast-container {
      position: fixed;
      top: 18px;
      right: 18px;
      z-index: 99999;
      display:flex;
      flex-direction:column;
      gap:8px;
      align-items:flex-end;
    }
    .toast {
      min-width: 220px;
      max-width: 380px;
      padding: 10px 14px;
      border-radius: 10px;
      color: #fff;
      box-shadow: 0 6px 20px rgba(0,0,0,0.12);
      font-size: 14px;
      line-height: 1.2;
      opacity: 0;
      transform: translateY(-8px);
      animation: toastIn .28s ease forwards;
      display:flex;
      gap:10px;
      align-items:center;
    }
    .toast.success { background: linear-gradient(90deg,#2ecc71,#27ae60); }
    .toast.error { background: linear-gradient(90deg,#e74c3c,#c0392b); }
    .toast.info { background: linear-gradient(90deg,#3498db,#2c82c9); }
    .toast .icon { font-weight:700; }
    @keyframes toastIn {
      to { opacity: 1; transform: translateY(0); }
    }
    .toast.fadeOut {
      animation: toastOut .28s ease forwards;
    }
    @keyframes toastOut {
      to { opacity: 0; transform: translateY(-8px); }
    }
    .small-muted { color: #666; font-size: 13px; }
    `;
  const s = document.createElement("style");
  s.textContent = css;
  document.head.appendChild(s);

  const container = document.createElement("div");
  container.className = "toast-container";
  container.id = "toastContainer";
  document.body.appendChild(container);
})();

function showToast(msg, type = "success", timeout = 3500) {
  // type: 'success' | 'error' | 'info'
  const cont = document.getElementById("toastContainer");
  if (!cont) return alert(msg);

  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.innerHTML = `<div class="icon">${type === "success" ? "✅" : type === "error" ? "❌" : "ℹ️"}</div><div style="flex:1">${escapeHtml(msg).replace(/\n/g,"<br>")}</div>`;
  cont.appendChild(t);

  const remove = () => {
    t.classList.add("fadeOut");
    setTimeout(() => t.remove(), 300);
  };

  setTimeout(remove, timeout);
  // allow manual removal on click
  t.addEventListener("click", remove);
}

function escapeHtml(text) {
  const p = document.createElement("div");
  p.textContent = text;
  return p.innerHTML;
}

// --------------------- HELPERS ---------------------
function generateCouponCode() {
  // 10 digits
  return Array.from({ length: 10 }, () => Math.floor(Math.random() * 10)).join("");
}

function formatMoney(v) {
  return Number(v || 0).toLocaleString("vi-VN") + "₫";
}

function parseDateString(s) {
  // s expected 'YYYY-MM-DD' from input[type=date]
  if (!s) return null;
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

function statusForProgram(startDateStr, endDateStr) {
  const now = new Date();
  const start = parseDateString(startDateStr);
  const end = parseDateString(endDateStr);
  if (end && now > end) return "đã kết thúc";
  if (start && now < start) return "sắp diễn ra";
  return "đang diễn ra";
}

// --------------------- LOAD PROGRAMS (with auto status update) ---------------------
async function loadPrograms() {
  try {
    const snap = await getDocs(colPrograms);
    const now = new Date();
    const updates = [];

    programs = snap.docs.map((d) => {
      const p = { id: d.id, ...d.data() };

      // If document doesn't have status or dates changed, compute current status
      const computedStatus = statusForProgram(p.startDate, p.endDate);

      // If computed status is 'đã kết thúc' but stored status isn't, schedule update
      if (computedStatus === "đã kết thúc" && p.status !== "đã kết thúc") {
        updates.push(
          updateDoc(doc(db, "programs", p.id), {
            status: "đã kết thúc",
            active: false,
            updatedAt: serverTimestamp(),
          }).catch((e) => console.error("Auto-update program status error:", e))
        );
        p.status = "đã kết thúc";
        p.active = false;
      } else if (p.status !== computedStatus) {
        // keep displayed status in sync (but don't force-update future/past unless ended)
        p.status = computedStatus;
      }

      // make sure numeric fields exist
      p.value = Number(p.value || 0);
      p.maxDiscount = Number(p.maxDiscount || 0);
      p.minBill = Number(p.minBill || 0);

      return p;
    });

    if (updates.length) {
      try {
        await Promise.all(updates);
      } catch (err) {
        console.warn("Một vài cập nhật trạng thái tự động thất bại", err);
      }
      // reload to get latest timestamps if needed
      const snap2 = await getDocs(colPrograms);
      programs = snap2.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    populateCreatorFilter(programs);
    applyFilters(); // chỉ hiển thị theo bộ lọc mặc định
  } catch (err) {
    console.error(err);
    showToast("Lỗi tải chương trình: " + (err.message || err), "error");
  }
}

function renderPrograms(data) {
  if (!Array.isArray(data)) data = [];
  listEl.innerHTML = data
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p) => {
      const when = `${p.startDate || "—"} → ${p.endDate || "—"}`;
      const discount =
        p.type === "percent" ? `${p.value}%` : formatMoney(p.value);
      const active = p.active === true || p.active === "true";
      const status = p.status || statusForProgram(p.startDate, p.endDate);

      // show badges for status and min/max info
      const noteShort =
        (p.note || "").length > 50 ? (p.note || "").slice(0, 50) + "…" : p.note || "";

      const extraInfo = `
        <div class="small-muted">
          ${p.minBill ? `Min bill: ${formatMoney(p.minBill)}` : ""}
          ${p.maxDiscount ? ` ${p.maxDiscount ? `• Max giảm: ${formatMoney(p.maxDiscount)}` : ""}` : ""}
        </div>`.trim();

      // If program is ended, disallow edit/delete/toggle
// ✅ Xét quyền từng hành động
let actions = "";

if (status === "đã kết thúc") {
  actions = `<div class="small-muted">Đã kết thúc · Không được sửa / xóa</div>`;
} else {
  const canToggle = hasPermission("chuongtrinhManage", "toggle");
  const canEdit = hasPermission("chuongtrinhManage", "edit");
  const canDelete = hasPermission("chuongtrinhManage", "delete");

  if (canToggle)
    actions += `<button class="btn-toggle" onclick="toggleActive('${p.id}', ${active})">${active ? "Tắt" : "Bật"}</button>`;
  if (canEdit)
    actions += `<button class="btn-edit" onclick="openEdit('${p.id}')">✏️ Sửa</button>`;
  if (canDelete)
    actions += `<button class="btn-delete" onclick="deleteProgram('${p.id}')">🗑️ Xóa</button>`;

  if (!canToggle && !canEdit && !canDelete)
    actions = `<div class="small-muted">Không có quyền thao tác</div>`;
}


      return `
        <tr>
          <td>${escapeHtml(String(p.id))}</td>
          <td>
            <div style="font-weight:600">${escapeHtml(p.name || "")}</div>
            <div class="small-muted">${escapeHtml(noteShort)}</div>
            ${extraInfo}
          </td>
          <td>${escapeHtml(when)}</td>
          <td>${escapeHtml(discount)}</td>
<td>${p.allowStack ? "Có" : "Không"}</td>
<td>${p.allowCoupon ? "Có" : "Không"}</td>

          <td>${escapeHtml(String(status))}${active ? " · <strong>Kích hoạt</strong>" : ""}</td>
          <td>${escapeHtml(p.note || "")}</td>
          <td class="actions">${actions}</td>
        </tr>
      `;
    })
    .join("");
}

// --------------------- FILTER SUPPORT ---------------------
function populateCreatorFilter(data) {
  const creators = [...new Set(data.map(p => p.createBy || "Không rõ"))];
  filterCreator.innerHTML = `<option value="all">Tất cả người tạo</option>` +
    creators.map(c => `<option value="${c}">${c}</option>`).join("");
}

function applyFilters() {
  const statusFilter = filterStatus.value;
  const creatorFilter = filterCreator.value;
  const keyword = (searchInput.value || "").trim().toLowerCase();

  const filtered = programs.filter(p => {
    const status = p.status || statusForProgram(p.startDate, p.endDate);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && status === "đang diễn ra") ||
      (statusFilter === "ended" && status === "đã kết thúc");

    const matchesCreator =
      creatorFilter === "all" || (p.createBy || "Không rõ") === creatorFilter;

    const matchesKeyword =
      !keyword ||
      (String(p.id) + " " + (p.name || "")).toLowerCase().includes(keyword);

    return matchesStatus && matchesCreator && matchesKeyword;
  });

  renderPrograms(filtered);
}

filterStatus.addEventListener("change", applyFilters);
filterCreator.addEventListener("change", applyFilters);

// --------------------- MODAL ADD/EDIT ---------------------
btnOpenAdd.addEventListener("click", () => {
  form.reset();
  // ensure optional fields exist in DOM (if not, ignore)
  const codeEl = document.getElementById("code");
  if (codeEl) codeEl.disabled = false;
  modalTitle.textContent = "➕ Thêm chương trình";
  modal.style.display = "flex";
});

btnCancel.addEventListener("click", () => (modal.style.display = "none"));
window.addEventListener("click", (e) => {
  if (e.target === modal) modal.style.display = "none";
});

// --------------------- SUBMIT FORM (CREATE / UPDATE PROGRAM) ---------------------
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = (document.getElementById("code")?.value || "").trim();
  const name = (document.getElementById("name")?.value || "").trim();
  const startDate = document.getElementById("startDate")?.value || "";
  const endDate = document.getElementById("endDate")?.value || "";
  const type = document.getElementById("type")?.value || "percent";
  const value = Number(document.getElementById("value")?.value) || 0;
  const note = (document.getElementById("note")?.value || "").trim();
  const active = (document.getElementById("active")?.value || "true") === "true";
  const maxDiscount = Number(document.getElementById("maxDiscount")?.value) || 0;
  const minBill = Number(document.getElementById("minBill")?.value) || 0;
  const allowStack = document.getElementById("allowStack").checked;
  const allowCoupon = document.getElementById("allowCoupon").checked;
  const isSpecialProgram = isSpecialProgramCheckbox.checked;
  const specialLimit = isSpecialProgram ? Number(document.getElementById("specialLimit")?.value || 1) : null;
  

  if (!id || !name) return showToast("Mã và tên là bắt buộc.", "error");
  if (startDate && endDate && startDate > endDate)
    return showToast("Ngày bắt đầu phải <= ngày kết thúc.", "error");

  const computedStatus = statusForProgram(startDate, endDate);
  const payload = {
    name,
    startDate,
    endDate,
    type,
    value,
    note,
    active: computedStatus === "đã kết thúc" ? false : active,
    maxDiscount,
    minBill,
    allowStack,
    allowCoupon,
    status: computedStatus,
    isSpecialProgram,   // ✅ lưu trạng thái đặc biệt
    specialLimit,       // ✅ số đơn áp dụng (nếu tick)
    updatedAt: serverTimestamp(),
  };

  try {
    const docRef = doc(db, "programs", id);
    const existing = await getDoc(docRef);
    if (existing.exists()) {
      // If existing program already marked as 'đã kết thúc', disallow edits
      const existingData = existing.data();
      if (existingData?.status === "đã kết thúc") {
        return showToast("Chương trình đã kết thúc, không được sửa.", "error");
      }
      await updateDoc(docRef, payload);
      showToast("Đã cập nhật chương trình.", "success");
    } else {
      // create
      await setDoc(docRef, {
        id,
        ...payload,
        createdAt: serverTimestamp(),
      });
      showToast("Đã tạo chương trình mới.", "success");
    }
    modal.style.display = "none";
    await loadPrograms();
  } catch (err) {
    console.error(err);
    showToast("Lỗi khi lưu: " + (err.message || err), "error");
  }
});

// --------------------- EDIT / DELETE / TOGGLE ---------------------
window.openEdit = async (id) => {
  try {
    const docRef = doc(db, "programs", id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return showToast("Không tìm thấy chương trình", "error");
    const p = snap.data();

    if (p.status === "đã kết thúc") return showToast("Chương trình đã kết thúc, không được sửa.", "error");

    // populate fields (some may not exist in DOM if you didn't add corresponding inputs)
    const codeEl = document.getElementById("code");
    if (codeEl) {
      codeEl.value = p.id || id;
      codeEl.disabled = true;
    }
    if (document.getElementById("name")) document.getElementById("name").value = p.name || "";
    if (document.getElementById("startDate")) document.getElementById("startDate").value = p.startDate || "";
    if (document.getElementById("endDate")) document.getElementById("endDate").value = p.endDate || "";
    if (document.getElementById("type")) document.getElementById("type").value = p.type || "percent";
    if (document.getElementById("value")) document.getElementById("value").value = p.value || 0;
    if (document.getElementById("note")) document.getElementById("note").value = p.note || "";
    if (document.getElementById("active")) document.getElementById("active").value = (p.active === true || p.active === "true") ? "true" : "false";
    document.getElementById("allowStack").checked = !!p.allowStack;
document.getElementById("allowCoupon").checked = !!p.allowCoupon;

    if (document.getElementById("maxDiscount")) document.getElementById("maxDiscount").value = p.maxDiscount || 0;
    if (document.getElementById("minBill")) document.getElementById("minBill").value = p.minBill || 0;
    if (document.getElementById("isSpecialProgram")) {
      isSpecialProgramCheckbox.checked = !!p.isSpecialProgram;
      specialProgramWrapper.style.display = !!p.isSpecialProgram ? "block" : "none";
    }
    if (document.getElementById("specialLimit")) {
      document.getElementById("specialLimit").value = p.specialLimit || 1;
    }
    
    modalTitle.textContent = "✏️ Chỉnh sửa chương trình";
    modal.style.display = "flex";
  } catch (err) {
    console.error(err);
    showToast("Lỗi khi mở chương trình", "error");
  }
};

window.deleteProgram = async (id) => {
  try {
    const docRef = doc(db, "programs", id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return showToast("Không tìm thấy chương trình", "error");
    const p = snap.data();
    if (p.status === "đã kết thúc") return showToast("Chương trình đã kết thúc, không được xóa.", "error");
    if (!confirm(`Xóa chương trình ${id} ?`)) return;
    await deleteDoc(docRef);
    showToast("Đã xóa chương trình.", "success");
    loadPrograms();
  } catch (err) {
    console.error(err);
    showToast("Lỗi khi xóa: " + (err.message || err), "error");
  }
};

window.toggleActive = async (id, current) => {
  try {
    const docRef = doc(db, "programs", id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return showToast("Không tìm thấy chương trình", "error");
    const p = snap.data();
    if (p.status === "đã kết thúc") return showToast("Chương trình đã kết thúc, không thể bật/tắt.", "error");

    await updateDoc(docRef, {
      active: !current,
      updatedAt: serverTimestamp(),
    });
    loadPrograms();
  } catch (err) {
    console.error(err);
    showToast("Lỗi khi cập nhật trạng thái", "error");
  }
};

// --------------------- SEARCH PROGRAMS ---------------------
btnSearch.addEventListener("click", applyFilters);
btnClear.addEventListener("click", () => {
  searchInput.value = "";
  filterStatus.value = "active";
  filterCreator.value = "all";
  applyFilters();
});


// --------------------- COUPON / PHIẾU CHI ---------------------
btnOpenCouponPhieu.addEventListener("click", () => {
  formCouponPhieu.reset();
  modalCouponPhieu.style.display = "flex";
});
btnCancelCouponPhieu.addEventListener("click", () => (modalCouponPhieu.style.display = "none"));
window.addEventListener("click", (e) => {
  if (e.target === modalCouponPhieu) modalCouponPhieu.style.display = "none";
});

// helper: create ms timestamp for expiration after N days
function msAfterDays(days) {
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

// Submit coupon / phieuchi
formCouponPhieu.addEventListener("submit", async (e) => {
  e.preventDefault();
  const loai = document.getElementById("loai")?.value || "coupon";
  const sdt = (document.getElementById("sdt")?.value || "").trim();
  const soTien = parseInt(document.getElementById("soTien")?.value) || 0;
  const noiDung = (document.getElementById("noiDung")?.value || "").trim();
  const ghiChu = (document.getElementById("ghiChuCoupon")?.value || "").trim();

  if (!sdt || !soTien || !noiDung) return showToast("⚠️ Vui lòng nhập đầy đủ thông tin", "error");

  try {
    const ma = generateCouponCode();
    const collectionName = loai === "coupon" ? "coupons" : "phieuchi";
    const expiredAtMs = msAfterDays(7); // default 7 days

    await setDoc(doc(db, collectionName, ma), {
      ma,
      loai,
      sdt,
      soTien,
      noiDung,
      ghiChu,
      trangThai: "chưa sử dụng",
      createdAt: serverTimestamp(),
      expiredAtMs, // store ms to ease client-side checks
      updatedAt: serverTimestamp(),
    });

    showToast(`${loai.toUpperCase()} đã tạo thành công!\nMã: ${ma}`, "success");
    formCouponPhieu.reset();
    modalCouponPhieu.style.display = "none";
  } catch (err) {
    console.error(err);
    showToast("Lỗi khi tạo phiếu: " + (err.message || err), "error");
  }
});

// --------------------- LIST COUPONS (with auto-lock after expiration) ---------------------
btnViewCoupons.addEventListener("click", async () => {
  modalListCoupons.style.display = "flex";
  await loadCoupons();
});
btnCloseCouponList.addEventListener("click", () => (modalListCoupons.style.display = "none"));
window.addEventListener("click", (e) => {
  if (e.target === modalListCoupons) modalListCoupons.style.display = "none";
});

async function loadCoupons() {
  try {
    const col1 = collection(db, "coupons");
    const col2 = collection(db, "phieuchi");
    const [snap1, snap2] = await Promise.all([getDocs(col1), getDocs(col2)]);

    const now = Date.now();
    const updates = [];
    allCoupons = [
      ...snap1.docs.map((d) => ({ id: d.id, ...d.data() })),
      ...snap2.docs.map((d) => ({ id: d.id, ...d.data() })),
    ];

    // check expiration and auto-lock
    allCoupons = allCoupons.map((c) => {
      const createdMs = c.createdAt?.seconds ? c.createdAt.seconds * 1000 : (c.createdAt || 0);
      const expiredAtMs = c.expiredAtMs || (createdMs ? createdMs + 7 * 24 * 60 * 60 * 1000 : 0);
      c.expiredAtMs = expiredAtMs;

      if (expiredAtMs && now > expiredAtMs && c.trangThai !== "đã khóa") {
        // schedule update
        const collName = c.loai === "coupon" ? "coupons" : "phieuchi";
        updates.push(
          updateDoc(doc(db, collName, c.id || c.ma), {
            trangThai: "đã khóa",
            updatedAt: serverTimestamp(),
          }).catch((e) => console.error("Auto-lock coupon error:", e))
        );
        c.trangThai = "đã khóa";
      }
      return c;
    });

    if (updates.length) {
      try {
        await Promise.all(updates);
      } catch (err) {
        console.warn("Một vài cập nhật khóa coupon thất bại", err);
      }
      // reload to get latest states
      const [snap1b, snap2b] = await Promise.all([getDocs(col1), getDocs(col2)]);
      allCoupons = [
        ...snap1b.docs.map((d) => ({ id: d.id, ...d.data() })),
        ...snap2b.docs.map((d) => ({ id: d.id, ...d.data() })),
      ];
    }

    renderCoupons(allCoupons);
  } catch (err) {
    console.error(err);
    showToast("Lỗi khi tải danh sách coupon: " + (err.message || err), "error");
  }
}

function renderCoupons(data) {
  if (!Array.isArray(data)) data = [];
  listCoupons.innerHTML = data
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    .map((c) => {
      const date = c.createdAt
        ? new Date(c.createdAt.seconds * 1000).toLocaleString("vi-VN")
        : "—";

      // 👉 CHUYỂN expiredAtMs (nếu có) thành ngày hết hạn đẹp
      const expiredAt = c.expiredAtMs
        ? new Date(c.expiredAtMs).toLocaleDateString("vi-VN")
        : "—";

      return `
        <tr>
          <td>${c.ma || c.id}</td>
          <td>${c.loai?.toUpperCase()}</td>
          <td>${c.sdt}</td>
          <td>${Number(c.soTien || 0).toLocaleString()}₫</td>
          <td>${c.noiDung || ""}</td>
          <td>${c.trangThai || "chưa sử dụng"}</td>
          <td>${c.lyDoHuy || "—"}</td>
          <td>${date}</td>
          <td>${expiredAt}</td> <!-- ✅ CỘT NGÀY HẾT HẠN -->
          <td class="actions">
            <button class="btn-delete" onclick="deleteCoupon('${c.loai}','${c.ma || c.id}')">🗑️ Xóa</button>
            <button class="btn-toggle" onclick="cancelCoupon('${c.loai}','${c.ma || c.id}','${c.trangThai || "chưa sử dụng"}')"
              ${c.trangThai === "đã hủy" ? "disabled" : ""}>🚫 Hủy</button>
          </td>
        </tr>
      `;
    })
    .join("");
}


// XÓA COUPON | PHIẾU CHI
window.deleteCoupon = async (loai, ma) => {
  if (!confirm(`Bạn có chắc muốn xóa ${loai.toUpperCase()} [${ma}] không?`)) return;
  try {
    const collectionName = loai === "coupon" ? "coupons" : "phieuchi";
    await deleteDoc(doc(db, collectionName, ma));
    showToast(`🗑️ Đã xóa ${loai.toUpperCase()} [${ma}]`, "success");
    loadCoupons();
  } catch (err) {
    console.error(err);
    showToast("Lỗi khi xóa: " + (err.message || err), "error");
  }
};

// HỦY KÍCH HOẠT COUPON | PHIẾU CHI
window.cancelCoupon = async (loai, ma, trangThai) => {
  if (trangThai === "đã khóa") {
    showToast("⚠️ Coupon / Phiếu chi đã khóa, không thể hủy.", "error");
    return;
  }

  if (trangThai !== "chưa sử dụng") {
    showToast("⚠️ Chỉ có thể hủy coupon ở trạng thái 'chưa sử dụng'.", "error");
    return;
  }

  const lyDoHuy = prompt("Nhập lý do hủy (bắt buộc):");
  if (!lyDoHuy || lyDoHuy.trim() === "") {
    showToast("🚫 Vui lòng nhập lý do hủy trước khi xác nhận.", "error");
    return;
  }

  if (!confirm(`Bạn có chắc chắn muốn hủy ${loai.toUpperCase()} [${ma}] không?`)) return;

  try {
    const collectionName = loai === "coupon" ? "coupons" : "phieuchi";
    await updateDoc(doc(db, collectionName, ma), {
      trangThai: "đã hủy",
      lyDoHuy,
      updatedAt: serverTimestamp(),
    });
    showToast(`🚫 ${loai.toUpperCase()} [${ma}] đã được hủy thành công!`, "success");
    loadCoupons();
  } catch (err) {
    console.error(err);
    showToast("Lỗi khi hủy: " + (err.message || err), "error");
  }
};

// tìm kiếm coupon
btnSearchCoupon.addEventListener("click", () => {
  const k = (searchCoupon.value || "").trim().toLowerCase();
  if (!k) return renderCoupons(allCoupons);
  const filtered = allCoupons.filter(
    (c) =>
      ((c.ma || "") + (c.id || "")).toLowerCase().includes(k) ||
      (c.sdt || "").toLowerCase().includes(k)
  );
  renderCoupons(filtered);
});
btnClearCoupon.addEventListener("click", () => {
  searchCoupon.value = "";
  renderCoupons(allCoupons);
});

// --------------------- INITIAL LOAD (đợi quyền rồi mới chạy) ---------------------
window.addEventListener("DOMContentLoaded", async () => {
  document.body.style.visibility = "hidden"; // Ẩn tạm trang để tránh nhấp nháy quyền

  try {
    await getUserPermissions(); // ⏳ Đợi tải quyền từ Firestore
    console.log("✅ Quyền đã tải xong");

    await loadPrograms();
    await loadCoupons();

    // Optional: tự động refresh mỗi 60s (giữ trạng thái cập nhật)
    setInterval(() => {
      loadPrograms();
      loadCoupons();
    }, 60 * 1000);
  } catch (err) {
    console.error("🚫 Lỗi khi tải quyền:", err);
  } finally {
    document.body.style.visibility = "visible"; // Hiển lại trang
  }
});
