import { db, collection, getDocs, query, orderBy, addDoc, doc, updateDoc, setDoc } from "./firebaseConfig.js";
import { checkPageAccess, getUserPermissions } from "./checkPermission.js";

// ==================== QUYỀN ====================
let userPerms = {};
await checkPageAccess("thuchi", "view");

try {
  userPerms = await getUserPermissions();
} catch (err) {
  console.warn("Không lấy được quyền người dùng:", err);
  userPerms = {};
}

function can(action) {
  return userPerms["thuchi"]?.includes(action);
}

// Lấy user info từ localStorage và lưu vào window để tiện dùng
window.userInfo = JSON.parse(localStorage.getItem("userInfo") || "{}");

// kho thu chi

// ==================== DOM ELEMENTS ====================
const tbody = document.querySelector("#transactionsTable tbody");
const fromDateInput = document.getElementById("fromDate");
const toDateInput = document.getElementById("toDate");
const createdByFilter = document.getElementById("createdByFilter");
const userThuFilter = document.getElementById("userThuFilter");
const typeFilter = document.getElementById("typeFilter");
const paymentFilter = document.getElementById("paymentFilter");
const btnFilter = document.getElementById("btnFilter");
const btnReset = document.getElementById("btnReset");
const btnExportExcel = document.getElementById("btnExportExcel");
const summaryDiv = document.getElementById("summary");
const btnReload = document.getElementById("btnReload");
const btnCreateChi = document.getElementById("btnCreateChi");
const dateRangeSelect = document.getElementById("dateRangeSelect");


// Popup Tạo Phiếu Chi
const popupChi = document.getElementById("popupChi");
const chiAmount = document.getElementById("chiAmount");
const chiCash = document.getElementById("chiCash");
const chiBank = document.getElementById("chiBank");
const chiConNo = document.getElementById("chiConNo");
const chiKho = document.getElementById("chiKho");
const chiNoiDung = document.getElementById("chiNoiDung");
const chiMucKhoan = document.getElementById("chiMucKhoan");
const btnSaveChi = document.getElementById("btnSaveChi");
const btnCancelChi = document.getElementById("btnCancelChi");
const khoTaoSelect = document.getElementById("chiKho");

const isAdmin = window.userInfo?.quyen === "admin"; 
let selectedStoreId = window.userInfo?.khoLamViec || "0"; // kho mặc định theo user

// Popup Chi tiết Phiếu
const popupDetail = document.getElementById("popupDetail");
const detailInfo = document.getElementById("detailInfo");
const detailHistoryTbody = document.querySelector("#detailHistory tbody");
const addPaymentSection = document.getElementById("addPaymentSection");
const detailCash = document.getElementById("detailCash");
const detailBank = document.getElementById("detailBank");
const detailNote = document.getElementById("detailNote");
const btnAddPayment = document.getElementById("btnAddPayment");
const btnCloseDetail = document.getElementById("btnCloseDetail");

// ==================== DATA ====================
let allTransactions = [];
let nhanVienMap = {};
let currentTransaction = null;
const today = new Date().toISOString().slice(0, 10);
fromDateInput.value = toDateInput.value = today;

// ==================== UTILITIES ====================
function parseVND(str) {
  if (!str) return 0;
  return Number(str.toString().replace(/,/g, ""));
}

function formatVND(n) {
  return Number(n || 0).toLocaleString("vi-VN");
}

// Setup input tiền với tự động thêm dấu âm khi nhập
function setupMoneyInput(input) {
  input.addEventListener("input", () => {
    let val = input.value.replace(/,/g, "").replace(/[^\d]/g, "");
    val = val ? -Math.abs(Number(val)) : 0; // luôn âm
    input.dataset.raw = val;
    input.value = formatVND(val);
    updateChiConNo();
  });
}

// ==================== LOAD KHO CẤU HÌNH ====================
function showToast(message, duration = 3000) {
  Toastify({
    text: message,
    duration: duration,
    gravity: "top", // top / bottom
    position: "right", // left / center / right
    backgroundColor: "#4caf50", // màu xanh cho thông báo thành công
    stopOnFocus: true,
  }).showToast();
}

async function loadStores() {
  const khoTaoSelect = document.getElementById("chiKho");
  if (!khoTaoSelect) return console.error("Không tìm thấy select #chiKho");

  try {
    const storesSnap = await getDocs(collection(db, "cuahang"));
    const stores = [];
    storesSnap.forEach(docSnap => {
      const d = docSnap.data();
      if (d.trangThai === "active") stores.push(d);
    });

    khoTaoSelect.innerHTML = "";

    stores.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.storeId;
      opt.textContent = `${s.storeId} - ${s.ten}`;
      khoTaoSelect.appendChild(opt);
    });

    // LƯU KHO MẶC ĐỊNH TỪ USER
    selectedStoreId = window.userInfo?.khoLamViec || "0";
    khoTaoSelect.value = selectedStoreId;

    if (window.userInfo?.quyen === "admin") {
      // Admin có thể đổi kho → show toast
      khoTaoSelect.disabled = false;
      khoTaoSelect.addEventListener("change", () => {
        selectedStoreId = khoTaoSelect.value;
        showToast(`🔁 Đã chọn kho: ${selectedStoreId}`);
      });
    } else {
      // Non-admin → khóa dropdown
      khoTaoSelect.disabled = true;
    }

  } catch (err) {
    console.error("Lỗi loadStores:", err);
    khoTaoSelect.innerHTML = `<option value="">⚠️ Lỗi tải kho</option>`;
  }
}

// ==================== LOAD NHÂN VIÊN ====================
async function loadNhanVien() {
  const snap = await getDocs(collection(db, "nhanvien"));
  snap.forEach(doc => {
    const d = doc.data();
    if (d.email && d.hoTen) nhanVienMap[d.email] = d.hoTen;
  });
}
// ==================== LOAD Thời gian filter ====================
function updateDateInputs() {
  const val = dateRangeSelect.value;

  if (val === "custom") {
    fromDateInput.parentElement.style.display = "block";
    toDateInput.parentElement.style.display = "block";
  } else {
    fromDateInput.parentElement.style.display = "none";
    toDateInput.parentElement.style.display = "none";

    const today = new Date();
    let from = new Date();
    let to = new Date();

    switch (val) {
      case "today": from = to = today; break;
      case "yesterday": from = to = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 0); break;
      case "7days": from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6); to = today; break;
      case "14days": from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 13); to = today; break;
      case "30days": from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29); to = today; break;
      case "thisMonth": from = new Date(today.getFullYear(), today.getMonth(), 1); to = today; break;
      case "lastMonth": from = new Date(today.getFullYear(), today.getMonth() - 1, 1); to = new Date(today.getFullYear(), today.getMonth(), 0); break;
      case "all": from = to = null; break;
    }

    fromDateInput.value = from ? from.toISOString().slice(0, 10) : "";
    toDateInput.value = to ? to.toISOString().slice(0, 10) : "";
  }

  renderTable();
}

dateRangeSelect.addEventListener("change", updateDateInputs);
updateDateInputs(); // set mặc định lúc load

// ==================== LOAD NGƯỜI TẠO & NGƯỜI THU ====================
async function loadCreators() {
  const snap = await getDocs(collection(db, "transactions"));
  const creators = new Set();
  const thuUsers = new Set();
  snap.forEach(doc => {
    const d = doc.data();
    if (d.createdBy) creators.add(d.createdBy);
    if (d.userThu) thuUsers.add(d.userThu);
  });
  [...creators].sort().forEach(email => {
    const opt = document.createElement("option");
    opt.value = email;
    opt.textContent = nhanVienMap[email] || email;
    createdByFilter.appendChild(opt);
  });
  [...thuUsers].sort().forEach(email => {
    const opt = document.createElement("option");
    opt.value = email;
    opt.textContent = nhanVienMap[email] || email;
    userThuFilter.appendChild(opt);
  });
}

// ==================== LOAD TRANSACTIONS ====================
async function loadTransactions() {
  tbody.innerHTML = "<tr><td colspan='13'>⏳ Đang tải...</td></tr>";
  const snap = await getDocs(query(collection(db, "transactions"), orderBy("createdAt", "desc")));
  allTransactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderTable();
}

// ==================== GET NEXT TRANSACTION ID ====================
async function getNextTransactionId() {
  const snap = await getDocs(collection(db, "transactions"));
  
  // Lọc phiếu chỉ của kho đang tạo
  const ids = snap.docs
      .map(d => d.data())
      .filter(d => d.khoChi === selectedStoreId) // <-- chỉ lấy phiếu cùng kho
      .map(d => d.transactionId)
      .filter(id => id)
      .map(id => parseInt(id.slice(-7))) // lấy 7 số cuối
      .filter(n => !isNaN(n));

  const nextNum = ids.length ? Math.max(...ids) + 1 : 1;
  const now = new Date();
  const prefix = selectedStoreId + "CM" + now.getFullYear().toString().slice(-2) + String(now.getMonth() + 1).padStart(2, '0');
  return prefix + String(nextNum).padStart(7, '0'); // 7 số
}

// 

// ==================== UPDATE CÒN NỢ ====================
function updateChiConNo() {
  const amount = Number(chiAmount.dataset.raw || 0);
  const cash = Number(chiCash.dataset.raw || 0);
  const bank = Number(chiBank.dataset.raw || 0);
  const con = amount + (cash + bank);
  chiConNo.value = formatVND(con);

  if (Math.abs(cash + bank) > Math.abs(amount)) {
    alert("❌ Số tiền chi vượt quá số tiền được phép!");
  }
}

// ==================== TẠO PHIẾU CHI ====================
if (!can("createPhieuChi")) btnCreateChi.style.display = "none";

btnCreateChi.addEventListener("click", () => {
  popupChi.classList.add("active"); // bật popup

  // reset các input khác
  chiAmount.value = chiCash.value = chiBank.value = chiConNo.value = chiNoiDung.value = "";
  chiAmount.dataset.raw = chiCash.dataset.raw = chiBank.dataset.raw = 0;

  // ✅ giữ kho mặc định khi mở popup
  chiKho.value = selectedStoreId;
});



setupMoneyInput(chiAmount);
setupMoneyInput(chiCash);
setupMoneyInput(chiBank);

btnCancelChi.addEventListener("click", () => popupChi.classList.remove("active"));


btnSaveChi.addEventListener("click", async () => {
  if (!can("createPhieuChi")) return alert("❌ Bạn không có quyền tạo phiếu chi!");
  const amount = Number(chiAmount.dataset.raw || 0);
  const cash = Number(chiCash.dataset.raw || 0);
  const bank = Number(chiBank.dataset.raw || 0);
  const kho = selectedStoreId; // luôn lấy kho theo user đang đăng nhập hoặc admin đã chọn
  const note = chiNoiDung.value;
  const muc = chiMucKhoan.value;
  const storedUser = window.userInfo || {};
  const userCreate = storedUser.email || "unknown";

  const transactionId = await getNextTransactionId();
  const newTx = {
    transactionId,
    type: "chi",
    amount,
    cash,
    bankTransfer: bank,
    conNo: amount + (cash + bank),
    createdAt: new Date().toISOString(),
    createdBy: userCreate,
    userThu: "",
    khoChi: kho, // <-- lưu kho tạo
    history: [],
    mucKhoanChi: muc,
    note
  };
  // Thay vì addDoc, dùng setDoc với transactionId làm document ID
  await setDoc(doc(db, "transactions", transactionId), newTx);

  // ✅ Hiển thị popup thành công
  showCreateChiSuccess(amount, async () => {
    popupChi.classList.remove("active");
    await loadTransactions();       // reload bảng
  });
});


// ==================== RENDER BẢNG ====================
function renderTable() {
  const from = fromDateInput.value ? new Date(fromDateInput.value) : null;
  let to = toDateInput.value ? new Date(toDateInput.value) : null;
  if (to) to.setHours(23, 59, 59, 999);

  const filterCreated = createdByFilter.value;
  const filterThu = userThuFilter.value;
  const filterType = typeFilter.value;
  const filterPayment = paymentFilter.value;

  const rows = allTransactions.filter(t => {
    const date = new Date(t.createdAt);
    if (from && date < from) return false;
    if (to && date > to) return false;
    if (filterCreated && t.createdBy !== filterCreated) return false;
    if (filterThu && t.userThu !== filterThu) return false;
    if (filterType && t.type !== filterType) return false;
    if (filterPayment && t.paymentMethod !== filterPayment) return false;
    return true;
  });

  if (rows.length === 0) {
    tbody.innerHTML = "<tr><td colspan='13'>Không có dữ liệu</td></tr>";
    summaryDiv.innerHTML = "";
    return;
  }

  let totalThu = 0, totalChi = 0, totalConNo = 0, totalDaThu = 0, totalCT = 0, totalCoupon = 0;

  tbody.innerHTML = rows.map(d => {
    const type = d.type === "thu" ? "🟢 Thu" : "🔴 Chi";
    const dateStr = new Date(d.date || d.createdAt).toLocaleString("vi-VN");
    const createdName = nhanVienMap[d.createdBy] || d.createdBy || "";
    const thuName = nhanVienMap[d.userThu] || d.userThu || "";

    if (d.type === "thu") totalThu += d.amount || 0;
    if (d.type === "chi") totalChi += d.amount || 0;
    totalConNo += d.conNo || 0;
    totalDaThu += d.amountCollected || 0;
    totalCT += d.programDiscount || 0;
    totalCoupon += d.couponValue || 0;

    let actionBtn = can("viewDetail") ? `<a href="#" class="transaction-link" data-id="${d.id}">${d.transactionId || d.id}</a>` : d.transactionId || d.id;

    return `<tr>
      <td>${actionBtn}</td>
      <td>${type}</td>
      <td>${d.orderId || ""}</td>
      <td>${createdName}</td>
      <td>${thuName}</td>
      <td>${dateStr}</td>
      <td>${formatVND(d.amount)}</td>
      <td>${formatVND(d.amountCollected)}</td>
      <td>${formatVND(d.conNo)}</td>
      <td>${formatVND(d.programDiscount)}</td>
      <td>${formatVND(d.couponValue)}</td>
      <td>${d.paymentMethod || ""}</td>
      <td>${d.note || ""}</td>
    </tr>`;
  }).join("");

  document.querySelectorAll(".transaction-link").forEach(a => {
    a.addEventListener("click", e => {
      e.preventDefault();
      const tx = allTransactions.find(t => t.id === a.dataset.id);
      if (tx) openDetail(tx);
    });
  });

  summaryDiv.innerHTML = `<div>
    Tổng <b>Thu:</b> ${formatVND(totalThu)} |
    <b>Chi:</b> ${formatVND(totalChi)} |
    <b>Đã thu:</b> ${formatVND(totalDaThu)} |
    <b>Còn nợ:</b> ${formatVND(totalConNo)} |
    <b>Phiếu CT:</b> ${formatVND(totalCT)} |
    <b>Coupon:</b> ${formatVND(totalCoupon)}
  </div>`;

  btnExportExcel.onclick = () => {
    if (!can("exportExcel")) return alert("❌ Bạn không có quyền xuất Excel!");
    import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm").then(XLSX => {
      const exportRows = rows.map(r => ({
        Mã_phiếu: r.transactionId,
        Loại: r.type,
        Đơn_hàng: r.orderId,
        Người_tạo: nhanVienMap[r.createdBy] || r.createdBy,
        Người_thu: nhanVienMap[r.userThu] || r.userThu,
        Ngày: new Date(r.date || r.createdAt).toLocaleString("vi-VN"),
        Phải_thu: r.amount,
        Đã_thu: r.amountCollected,
        Còn_nợ: r.conNo,
        Phiếu_CT: r.programDiscount,
        Coupon: r.couponValue,
        Phương_thức: r.paymentMethod,
        Ghi_chú: r.note || ""
      }));
      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Transactions");
      XLSX.writeFile(wb, "thu-chi.xlsx");
    });
  };
}

// Chi tiết phiếu thu chi 
// Chi tiết phiếu thu chi
function openDetail(tx) {
  currentTransaction = tx;
  detailInfo.innerHTML = "";
  detailHistoryTbody.innerHTML = "";

  const createdByEmail = tx.createdBy || "unknown";
  const userThuEmail = tx.userThu || "";

  // ===================== RENDER CHI TIẾT =====================
  const row1 = document.createElement("div");
  row1.className = "detail-row";
  row1.innerHTML = `
    <div class="label-value"><span class="label">Mã phiếu:</span> <span class="value">${tx.transactionId}</span></div>
    <div class="label-value"><span class="label">Loại:</span> <span class="value">${tx.type === "thu" ? "🟢 Thu" : "🔴 Chi"}</span></div>
    <div class="label-value"><span class="label">Đơn hàng:</span> <span class="value">${tx.orderId ||""}</span></div>
  `;
  detailInfo.appendChild(row1);

  const row2 = document.createElement("div");
  row2.className = "detail-row";
  row2.innerHTML = `
    <div class="label-value"><span class="label">Số tiền:</span> <span class="value">${formatVND(tx.amount)}</span></div>
    <div class="label-value"><span class="label">Đã thu/chi:</span> <span class="value">${formatVND((tx.cash || 0) + (tx.bankTransfer || 0) + (tx.amountCollected || 0))}</span></div>
  `;
  detailInfo.appendChild(row2);

  const row3 = document.createElement("div");
  row3.className = "detail-row";
  row3.innerHTML = `
<div class="label-value">
  <span class="label">Tiền mặt:</span>
  <span class="value">${formatVND(tx.paymentMethod === 'tiền mặt' ? tx.amountCollected : tx.cash || 0)}</span>
</div>
<div class="label-value">
  <span class="label">Chuyển khoản:</span>
  <span class="value">${formatVND(tx.paymentMethod === 'Chuyển khoản' ? tx.amountCollected : tx.bankTransfer || 0)}</span>
</div>
<div class="label-value">
  <span class="label">Còn nợ:</span>
  <span class="value">${formatVND(tx.conNo || 0)}</span>
</div>
  `;
  detailInfo.appendChild(row3);

  const row4 = document.createElement("div");
  row4.className = "detail-row";
  row4.innerHTML = `
    <div class="label-value"><span class="label">Kho thu - chi:</span> <span class="value">${tx.khoChi || ""}</span></div>
    <div class="label-value"><span class="label">Mục khoản chi:</span> <span class="value">${tx.mucKhoanChi || ""}</span></div>
  `;
  detailInfo.appendChild(row4);

  const row5 = document.createElement("div");
  row5.className = "detail-row";
  row5.innerHTML = `<div class="label-value"><span class="label">Nội dung:</span> <span class="value">${tx.note || ""}</span></div>`;
  detailInfo.appendChild(row5);

  const row6 = document.createElement("div");
  row6.className = "detail-row";
  row6.innerHTML = `
    <div class="label-value"><span class="label">User tạo:</span> <span class="value">${nhanVienMap[createdByEmail] || createdByEmail}</span></div>
    <div class="label-value"><span class="label">User thu - chi:</span> <span class="value">${nhanVienMap[userThuEmail] || userThuEmail}</span></div>
  `;
  detailInfo.appendChild(row6);

  const row7 = document.createElement("div");
  row7.className = "detail-row";
  row7.innerHTML = `<div class="label-value"><span class="label">Ngày tạo:</span> <span class="value">${new Date(tx.createdAt).toLocaleString("vi-VN")}</span></div>`;
  detailInfo.appendChild(row7);

  // ===================== LỊCH SỬ THANH TOÁN =====================
  let history = tx.history || [];
  if (!history.length && tx.type === 'thu') {
    history.push({
      cash: tx.paymentMethod === 'tiền mặt' ? tx.amountCollected : 0,
      bank: tx.paymentMethod === 'chuyển khoản' ? tx.amountCollected : 0,
      note: tx.note || '',
      user: tx.userThu || tx.createdBy,
      date: tx.date || tx.createdAt,
      method: tx.paymentMethod
    });
  }
  history.forEach(h => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatVND(h.cash || 0)}</td>
      <td>${formatVND(h.bank || 0)}</td>
      <td>${h.note || ""}</td>
      <td>${nhanVienMap[h.user] || h.user}</td>
      <td>${new Date(h.date).toLocaleString("vi-VN")}</td>
    `;
    detailHistoryTbody.appendChild(tr);
  });

  addPaymentSection.style.display = (tx.type === "chi" && tx.conNo < 0 && can("chiTien")) ? "block" : "none";
  detailCash.value = detailBank.value = detailNote.value = "";

  popupDetail.classList.add("active");

  // ===================== NÚT CHỈNH SỬA =====================
  const btnEditTransaction = document.getElementById("btnEditTransaction");
  if (can("editTransaction")) {
    btnEditTransaction.style.display = "inline-block";
    btnEditTransaction.disabled = false;

    btnEditTransaction.onclick = () => {
      btnEditTransaction.disabled = true;

      // Chuyển các span.value thành input
      document.querySelectorAll("#detailInfo .value").forEach(span => {
        const val = span.textContent;
        const input = document.createElement("input");
        input.type = "text";
        input.value = val;
        input.className = "editable-input";
        span.replaceWith(input);
      });

      // Thêm nút Lưu
      const saveBtn = document.createElement("button");
      saveBtn.textContent = "💾 Lưu thay đổi";
      saveBtn.className = "btn success";
      saveBtn.id = "btnSaveEdit";
      document.querySelector("#detailInfo").appendChild(saveBtn);

      // ===================== LƯU THAY ĐỔI =====================
      saveBtn.addEventListener("click", async () => {
        const inputs = document.querySelectorAll("#detailInfo .editable-input");
        const [transactionIdInput, typeInput, orderIdInput, amountInput, noteInput] = inputs;

        currentTransaction.transactionId = transactionIdInput.value;
        currentTransaction.type = typeInput.value;
        currentTransaction.orderId = orderIdInput.value;
        currentTransaction.amount = parseVND(amountInput.value);
        currentTransaction.note = noteInput.value;

        try {
          await updateDoc(doc(db, "transactions", currentTransaction.id), currentTransaction);
          Swal.fire("✅ Thành công!", "Đã cập nhật phiếu thành công.", "success");
          popupDetail.classList.remove("active");
          await loadTransactions();
        } catch (err) {
          console.error(err);
          Swal.fire("❌ Lỗi!", "Không thể cập nhật phiếu.", "error");
        }
      });
    };
  } else {
    btnEditTransaction.style.display = "none";
  }

  // ===================== NÚT HỦY/ĐÓNG =====================
  btnCloseDetail.onclick = () => {
    const editInputs = document.querySelectorAll("#detailInfo .editable-input");
    const saveBtn = document.getElementById("btnSaveEdit");

    if (editInputs.length || saveBtn) {
      // Hủy chỉnh sửa → trở lại detail
      editInputs.forEach((input, idx) => {
        const span = document.createElement("span");
        // Lấy giá trị cũ từ currentTransaction
        let oldVal = "";
        switch(idx) {
          case 0: oldVal = currentTransaction.transactionId; break;
          case 1: oldVal = currentTransaction.type === 'thu' ? '🟢 Thu' : '🔴 Chi'; break;
          case 2: oldVal = currentTransaction.orderId || ""; break;
          case 3: oldVal = formatVND(currentTransaction.amount); break;
          case 4: oldVal = currentTransaction.note || ""; break;
        }
        span.className = "value";
        span.textContent = oldVal;
        input.replaceWith(span);
      });
      if(saveBtn) saveBtn.remove();
      btnEditTransaction.disabled = false;
    } else {
      // Nếu không phải edit mode → đóng popup
      popupDetail.classList.remove("active");
    }
  };
}

// ==================== POPUP THÀNH CÔNG HIỆN ĐẠI =================
// === Hàm popup SweetAlert2 ===
function showChiSuccessSweet(amount, method, callback) {
  Swal.fire({
    title: '✅ Thành công!',
    html: `Số tiền đã chi: <b>${formatVND(amount)}</b><br>Hình thức: <b>${method}</b>`,
    icon: 'success',
    confirmButtonText: 'OK',
    allowOutsideClick: false,
    allowEscapeKey: false,
  }).then(() => {
    if (callback) callback();
  });
}
function showCreateChiSuccess(amount, callback) {
  Swal.fire({
    title: '✅ Tạo phiếu chi thành công!',
    html: `Số tiền: <b>${formatVND(amount)}</b><br>Hình thức: <b>Tạo phiếu chi</b>`,
    icon: 'success',
    confirmButtonText: 'OK',
    allowOutsideClick: true,
    allowEscapeKey: true,
    position: 'center' // bắt buộc căn giữa

  }).then(() => {
    if (callback) callback();
  });
}


// === Hàm popup lỗi ===
function showChiFailSweet(message) {
  Swal.fire({
    title: '❌ Thất bại!',
    html: message,
    icon: 'error',
    confirmButtonText: 'OK',
    allowOutsideClick: false,
    allowEscapeKey: false,
  });
}

// === Xử lý khi ấn nút "Chi tiền" ===
btnAddPayment.addEventListener("click", async () => {
  if (!can("chiTien")) {
    return showChiFailSweet("Bạn không có quyền chi tiền!");
  }

  const cash = parseVND(detailCash.value);
  const bank = parseVND(detailBank.value);

  if (cash + bank <= 0) {
    return showChiFailSweet("Phải nhập số tiền chi!");
  }

  const storedUser = window.userInfo || {};
  const currentUserEmail = storedUser.email || "unknown";

  // Tính còn nợ
  const remaining = currentTransaction.amount + (currentTransaction.cash + currentTransaction.bankTransfer);

  if (cash + bank > Math.abs(remaining)) {
    return showChiFailSweet(
      `Số tiền chi vượt số tiền còn nợ (${formatVND(remaining)})!<br>` +
      `Không thể chi tiền.<br><br>` +
      `<b>> Liên hệ quản lý nếu có thắc mắc.</b>`
    );
  }

  // Cập nhật dữ liệu
  currentTransaction.cash += cash;
  currentTransaction.bankTransfer += bank;
  currentTransaction.conNo = currentTransaction.amount + (currentTransaction.cash + currentTransaction.bankTransfer);
  currentTransaction.history = currentTransaction.history || [];
  currentTransaction.history.push({
    cash,
    bank,
    note: detailNote.value || "",
    user: currentUserEmail,
    date: new Date().toISOString()
  });
  currentTransaction.userThu = currentUserEmail;

  await updateDoc(doc(db, "transactions", currentTransaction.id), {
    cash: currentTransaction.cash,
    bankTransfer: currentTransaction.bankTransfer,
    conNo: currentTransaction.conNo,
    userThu: currentTransaction.userThu,
    history: currentTransaction.history
  });

  // Xác định hình thức chi
  const method = cash > 0 && bank > 0
    ? "Tiền mặt + Chuyển khoản"
    : (cash > 0 ? "Tiền mặt" : "Chuyển khoản");

  // Hiển thị popup thành công, sau OK thì đóng popup chi tiết + reload bảng
  showChiSuccessSweet(cash + bank, method, async () => {
    popupDetail.classList.remove("active"); // ✅ đóng popup chi tiết
    await loadTransactions();                // reload bảng
  });

});

// ==================== FILTER, RESET, RELOAD ====================
btnFilter.addEventListener("click", renderTable);
btnReset.addEventListener("click", () => {
  fromDateInput.value = toDateInput.value = today;
  createdByFilter.value = userThuFilter.value = typeFilter.value = paymentFilter.value = "";
  renderTable();
});

btnReload.addEventListener("click", async () => {
  tbody.innerHTML = "<tr><td colspan='13'>🔄 Đang đồng bộ dữ liệu...</td></tr>";
  summaryDiv.innerHTML = "";
  btnReload.disabled = true;
  btnReload.textContent = "⏳ Đang tải...";
  try {
    await loadNhanVien();
    createdByFilter.innerHTML = '<option value="">-- Tất cả --</option>';
    userThuFilter.innerHTML = '<option value="">-- Tất cả --</option>';
    await loadCreators();
    await loadTransactions();
  } catch (err) { console.error(err); alert("Lỗi đồng bộ!"); }
  btnReload.disabled = false;
  btnReload.textContent = "🔄 Đồng bộ";
});

// ==================== INIT ====================
await loadNhanVien();
await loadStores(); // load danh sách kho vào dropdown
await loadCreators();
await loadTransactions();
