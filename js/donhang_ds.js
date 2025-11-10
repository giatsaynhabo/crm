// js/donhang_ds.js (FULL with VietQR and enhanced popup)
// Giữ nguyên chức năng cũ, chỉ thay phần QR để quét được bằng app ngân hàng

import {
  db,
  collection,
  getDocs,
  doc,
  updateDoc,
  setDoc,
} from "./firebaseConfig.js";

/* UI */
const ordersTableBody = document.querySelector("#ordersTable tbody");
const filterStatus = document.getElementById("filterStatus");
const searchInput = document.getElementById("searchInput");
const btnSearch = document.getElementById("btnSearch");
const btnClear = document.getElementById("btnClear");
const btnReload = document.getElementById("btnReload");
const filterCreator = document.getElementById("filterCreator");
const filterDateFrom = document.getElementById("filterDateFrom");
const filterDateTo = document.getElementById("filterDateTo");
const btnSync = document.getElementById("btnSync");
const btnExportExcel = document.getElementById("btnExportExcel");

const modalDetail = document.getElementById("modalDetail");
const btnCloseDetail = document.getElementById("btnCloseDetail");
const detailOrderIdEl = document.getElementById("detailOrderId");
const detailBody = document.getElementById("detailBody");
const btnMarkDelivered = document.getElementById("btnMarkDelivered");
const btnPrintInvoice = document.getElementById("btnPrintInvoice");
// Khởi tạo filter nâng cao
const todayStr = new Date().toISOString().slice(0, 10);
filterDateFrom.value = todayStr;
filterDateTo.value = todayStr;

// Cache danh sách nhân viên
let allStaff = [];

/* state */
let allOrders = [];
let currentDetailOrder = null;
let selectedOrderForPayment = null; // declared once
let qrTimer = null;
let qrTimeLeft = 0;

/* Payment popup (enhanced) */
const paymentPopup = document.createElement("div");
paymentPopup.className = "modal";
paymentPopup.innerHTML = `
  <div class="modal-content" id="paymentPopupContent">
    <h3>Chọn hình thức thanh toán</h3>
    <select id="paymentMethod" style="width:100%;padding:8px;border-radius:8px;margin-top:8px;">
      <option value="">-- Chọn hình thức --</option>
      <option value="tiền mặt">💵 Tiền mặt</option>
      <option value="chuyển khoản">🏦 Chuyển khoản (VietQR)</option>
    </select>
    <div id="paymentExtra"></div>
    <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">
      <button id="btnConfirmPayment" class="btn primary">Xác nhận</button>
      <button id="btnCancelPayment" class="btn">Hủy</button>
    </div>
  </div>
`;
document.body.appendChild(paymentPopup);

const paymentSelect = paymentPopup.querySelector("#paymentMethod");
const paymentExtra = paymentPopup.querySelector("#paymentExtra");
const btnConfirmPayment = paymentPopup.querySelector("#btnConfirmPayment");
const btnCancelPayment = paymentPopup.querySelector("#btnCancelPayment");

/* helpers */
function showToast(msg, t = 2500) {
  const div = document.createElement("div");
  div.className = "toast";
  div.innerText = msg;
  Object.assign(div.style, {
    position: "fixed",
    right: "18px",
    bottom: "18px",
    zIndex: 9999,
  });
  document.body.appendChild(div);
  setTimeout(() => div.remove(), t);
}
function formatVND(n) {
  return Number(n || 0).toLocaleString("vi-VN") + "₫";
}
function openModal(el) { el.style.display = "flex"; }
function closeModal(el) { el.style.display = "none"; }

/* ===== VietQR payload builder (simplified) - (kept for fallback) =====
   Note: we will use createVietQRUrl() (img.vietqr.io) for bank-app-friendly QR,
   but keep this function if you want a text fallback.
*/
function buildVietQRPayload({ accountNumber, accountName, bankCode, amount = 0, transferDesc = "" }) {
  const human = `VietQR|Bank:${bankCode}|STK:${accountNumber}|Name:${accountName}${amount ? `|Amt:${amount}` : ""}${transferDesc ? `|Note:${transferDesc}` : ""}`;
  const emv = `00020101021226${bankCode}${accountNumber}52045800${amount ? `54${String(amount)}` : ""}5802VN5909${encodeURIComponent(accountName).slice(0, 20)}6304`;
  return `${emv}|${human}`;
}

/* Helper to create QR image URL (uses qrserver) - kept as fallback but not used for bank-ready QR */
function qrImageUrlFromText(text) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(text)}`;
}

/* ===== createVietQRUrl: use VietQR image API for bank-scannable QR =====
   Format:
   https://img.vietqr.io/image/<BANK>-<ACCOUNT>-compact2.png?amount=<AMOUNT>&addInfo=<DESC>&accountName=<NAME>
   BANK: code like VCB (Vietcombank), MBB (MB), TCB (Techcom), etc.
*/
function createVietQRUrl({ bank, account, name, amount = 0, desc = "" }) {
  // Ensure no undefined
  const amt = amount || 0;
  const encodedDesc = encodeURIComponent(desc || "");
  const encodedName = encodeURIComponent(name || "");
  return `https://img.vietqr.io/image/${bank}-${account}-compact2.png?amount=${amt}&addInfo=${encodedDesc}&accountName=${encodedName}`;
}

async function loadStaffList() {
  try {
    const snap = await getDocs(collection(db, "nhanvien"));
    allStaff = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderStaffDropdown();
  } catch (err) {
    console.error("Lỗi tải danh sách nhân viên", err);
    showToast("❌ Lỗi tải danh sách nhân viên!");
  }
}

let creatorSelectInstance;

function renderStaffDropdown() {
  if (!filterCreator) return;

  // Dọn dropdown cũ
  filterCreator.innerHTML = "";

  // Thêm option nhân viên
  allStaff.forEach((nv) => {
    const opt = document.createElement("option");
    opt.value = nv.email; // lọc theo email
    opt.textContent = nv.hoTen; // hiển thị tên
    filterCreator.appendChild(opt);
  });

  // Hủy TomSelect cũ nếu có
  if (creatorSelectInstance) creatorSelectInstance.destroy();

  // ✅ Tạo TomSelect đa chọn có tìm kiếm
  creatorSelectInstance = new TomSelect("#filterCreator", {
    plugins: ["remove_button"],
    maxOptions: 1000,
    placeholder: "Chọn người tạo...",
    persist: false,
    closeAfterSelect: false,
    hideSelected: true,
    create: false,
    render: {
      option: (data, escape) => `<div>${escape(data.text)}</div>`,
      item: (data, escape) => `<div>${escape(data.text)}</div>`,
    },
  });

  // ✅ Thêm nút chọn tất cả / bỏ chọn tất cả
  const container = filterCreator.closest(".creator-filter");
  let btnSelectAll = container.querySelector(".btn-select-all");
  if (!btnSelectAll) {
    btnSelectAll = document.createElement("button");
    btnSelectAll.type = "button";
    btnSelectAll.className = "btn small btn-select-all";
    btnSelectAll.textContent = "✅ Chọn tất cả";
    btnSelectAll.style.marginTop = "6px";
    btnSelectAll.style.display = "block";
    btnSelectAll.style.width = "100%";
    container.appendChild(btnSelectAll);
  }

  btnSelectAll.onclick = () => {
    const allEmails = allStaff.map((s) => s.email);
    const current = creatorSelectInstance.getValue();
    const allSelected = current.length === allEmails.length;
    if (allSelected) {
      creatorSelectInstance.clear();
      btnSelectAll.textContent = "✅ Chọn tất cả";
    } else {
      creatorSelectInstance.setValue(allEmails);
      btnSelectAll.textContent = "❎ Bỏ chọn tất cả";
    }
  };
}


/* ===== load orders ===== */
async function loadOrders() {
  try {
    const snap = await getDocs(collection(db, "orders"));
    allOrders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // fix conNo logic
    const fixPromises = [];
    allOrders.forEach((o) => {
      if (o.status !== "đã giao" && (o.conNo === 0 || o.conNo === undefined)) {
        fixPromises.push(
          updateDoc(doc(db, "orders", o.id), {
            conNo: o.finalTotal ?? o.total ?? 0,
          })
        );
      }
    });
    if (fixPromises.length) await Promise.all(fixPromises);

    const snap2 = await getDocs(collection(db, "orders"));
    allOrders = snap2.docs.map((d) => ({ id: d.id, ...d.data() }));

    allOrders.sort((a, b) => (b.orderId || 0) - (a.orderId || 0));

    // 🔹 Lọc mặc định: chỉ đơn hàng hôm nay
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    const todayOrders = allOrders.filter((o) => {
      const created = o.createdAt ? new Date(o.createdAt) : null;
      return created && created >= today && created < tomorrow;
    });
    
    renderOrders(todayOrders);
    showToast(`📅 Hiển thị ${todayOrders.length} đơn hàng hôm nay`);
    
  } catch (err) {
    console.error(err);
    showToast("Lỗi khi tải đơn!");
  }
}

/* ===== render table ===== */
function renderOrders(list) {
  ordersTableBody.innerHTML = "";
  if (!list.length) {
    ordersTableBody.innerHTML = "<tr><td colspan='12'>Không có đơn hàng</td></tr>";
    return;
  }

  list.forEach((o) => {
    const itemsCount = Array.isArray(o.items) ? o.items.length : 0;
    const total = o.total || 0;
    const coupon = o.couponValue || 0;
    const promo = o.programDiscount || 0;
    const totalDiscount = coupon + promo;
    const final = o.finalTotal ?? (total - totalDiscount);
    const created = o.createdAt ? new Date(o.createdAt).toLocaleString() : "—";
    const delivered = o.deliveredAt ? new Date(o.deliveredAt).toLocaleString() : "—";
    const canDeliver = o.status !== "đã giao";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${o.orderId}</td>
      <td>${o.customerName || o.customerInfo?.hoTen || "—"}</td>
      <td>${o.customerId || o.customerInfo?.sdt || "—"}</td>
      <td>${itemsCount} loại</td>
      <td>${formatVND(total)}</td>
      <td>${formatVND(totalDiscount)}</td>
      <td>${formatVND(final)}</td>
      <td>${formatVND(o.conNo ?? 0)}</td>
      <td>${o.status || "—"}</td>
      <td>${created}</td>
      <td>${delivered}</td>
      <td>
        <button class="btn" data-id="${o.orderId}" data-action="view">Xem</button>
        ${canDeliver ? `<button class="btn" data-id="${o.orderId}" data-action="deliver">Đã giao</button>` : ""}
      </td>
    `;
    ordersTableBody.appendChild(tr);
  });

  // attach handlers
  ordersTableBody.querySelectorAll("button").forEach((btn) => {
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    btn.addEventListener("click", () => {
      if (action === "view") openDetail(id);
      if (action === "deliver") openPaymentPopup(id);
    });
  });
}

/* ===== filter & search ===== */
btnSearch.addEventListener("click", () => {
  const k = searchInput.value.trim().toLowerCase();
  const status = filterStatus.value;

  // lấy danh sách email được chọn (đa chọn)
  const selectedCreators = creatorSelectInstance
  ? creatorSelectInstance.getValue()
  : [];



  const from = filterDateFrom.value ? new Date(filterDateFrom.value) : null;
  const to = filterDateTo.value ? new Date(filterDateTo.value + "T23:59:59") : null;

  const filtered = allOrders.filter((o) => {
    const matchStatus = status ? o.status === status : true;
    const matchSearch =
      !k ||
      String(o.orderId).toLowerCase().includes(k) ||
      (o.customerId || "").toLowerCase().includes(k) ||
      (o.customerInfo?.sdt || "").toLowerCase().includes(k);

    const matchCreator =
      !selectedCreators.length ||
      (o.createdBy && selectedCreators.includes(o.createdBy));

    const createdAt = o.createdAt ? new Date(o.createdAt) : null;
    const matchDate =
      (!from || (createdAt && createdAt >= from)) &&
      (!to || (createdAt && createdAt <= to));

    return matchStatus && matchSearch && matchCreator && matchDate;
  });

  renderOrders(filtered);
});


btnClear.addEventListener("click", () => {
  searchInput.value = "";
  filterStatus.value = "";
  Array.from(filterCreator.options).forEach((o) => (o.selected = false));
  filterDateFrom.value = todayStr;
  filterDateTo.value = todayStr;
  if (creatorSelectInstance) creatorSelectInstance.clear();

  renderOrders(allOrders);
});


btnSync.addEventListener("click", async () => {
  showToast("🔄 Đang đồng bộ dữ liệu...");
  await loadOrders();
  showToast("✅ Đồng bộ hoàn tất!");
});

btnExportExcel.addEventListener("click", () => {
  if (!allOrders.length) return showToast("Không có dữ liệu để xuất!");

  // Lấy danh sách đang hiển thị
  const rows = Array.from(document.querySelectorAll("#ordersTable tbody tr"))
    .map((tr) => Array.from(tr.children).map((td) => td.innerText));

  // Thêm tiêu đề cột
  const headers = Array.from(document.querySelectorAll("#ordersTable thead th"))
    .map((th) => th.innerText);

  const wsData = [headers, ...rows];

  import("https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs").then((XLSX) => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "DonHang");
    XLSX.writeFile(wb, `DonHang_${new Date().toISOString().slice(0, 10)}.xlsx`);
  });
});

btnReload.addEventListener("click", loadOrders);

/* ===== open detail modal ===== */
function openDetail(orderId) {
  const order = allOrders.find((o) => String(o.orderId) === String(orderId));
  if (!order) return showToast("Không tìm thấy đơn");
  currentDetailOrder = order;

  const cust = order.customerInfo || {};
  const coupon = order.couponValue || 0;
  const programDiscount = order.programDiscount || 0;
  const totalDiscount = coupon + programDiscount;
  const appliedPrograms =
    Array.isArray(order.appliedPrograms) && order.appliedPrograms.length
      ? order.appliedPrograms.join(", ")
      : "—";

  // restore all original detail fields (giữ nguyên nội dung gốc)
  detailOrderIdEl.innerText = `#${order.orderId}`;
  detailBody.innerHTML = `
    <div class="order-detail">
      <div class="detail-section">
        <h3>🧍 Thông tin đơn hàng</h3>
        <div class="info-row"><b>Họ tên:</b> ${cust.hoTen || order.customerName || "—"}</div>
        <div class="info-row"><b>SĐT:</b> ${cust.sdt || order.customerId || "—"}</div>
        <div class="info-row"><b>Địa chỉ:</b> ${
          cust.duong ? `${cust.duong}, ${cust.phuong}, ${cust.tinh}` : "—"
        }</div>
        <div class="info-row"><b>Ghi chú:</b> ${cust.ghiChu || "—"}</div>
      </div>

      <div class="detail-section">
        <h3>🧺 Sản phẩm</h3>
        <table class="detail-table">
          <thead><tr><th>Sản phẩm</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead>
          <tbody>${(order.items || [])
            .map(
              (it) =>
                `<tr><td>${it.name}</td><td>${it.qty}</td><td>${formatVND(
                  it.price
                )}</td><td>${formatVND(it.total)}</td></tr>`
            )
            .join("")}</tbody>
        </table>
      </div>

      <div class="detail-section summary-box">
        <h3>💰 Tổng quan đơn hàng</h3>
        <div class="info-row"><b>Tổng cộng:</b> ${formatVND(order.total)}</div>
        <div class="info-row"><b>Tiền coupon:</b> ${formatVND(coupon)}</div>
        <div class="info-row"><b>Tiền CTKM:</b> ${formatVND(programDiscount)}</div>
        <div class="info-row highlight"><b>Tổng tiền giảm giá:</b> ${formatVND(totalDiscount)}</div>
        <div class="info-row"><b>Coupon đã dùng:</b> ${order.couponCode || "—"}</div>
        <div class="info-row"><b>Chương trình KM:</b> ${appliedPrograms}</div>
        <div class="info-row"><b>Thanh toán cuối:</b> ${formatVND(order.finalTotal)}</div>
        <div class="info-row"><b>Phương thức TT:</b> ${order.paymentMethod || "—"}</div>
        <div class="info-row"><b>Còn nợ:</b> ${formatVND(order.conNo || 0)}</div>
        <div class="info-row"><b>Trạng thái:</b> ${order.status}</div>
        <div class="info-row"><b>Ngày tạo:</b> ${order.createdAt ? new Date(order.createdAt).toLocaleString() : "—"}</div>
        <div class="info-row"><b>Ngày giao:</b> ${
          order.deliveredAt ? new Date(order.deliveredAt).toLocaleString() : "—"
        }</div>
      </div>
    </div>
  `;
  btnMarkDelivered.style.display = order.status === "đã giao" ? "none" : "inline-block";
  openModal(modalDetail);
}

/* ===== Payment popup logic (VietQR + Cash) ===== */
function openPaymentPopup(orderId) {
  selectedOrderForPayment = orderId;
  const order = allOrders.find((o) => o.orderId == orderId);
  const amount = order?.finalTotal ?? order?.total ?? 0;

  // hiển thị số tiền ngay đầu popup
  const header = paymentPopup.querySelector("h3");
  header.innerHTML = `💰 Thanh toán đơn #${orderId} - Số tiền: <span style="color:#007bff">${formatVND(amount)}</span>`;

  paymentSelect.value = "";
  paymentExtra.innerHTML = "";
  clearInterval(qrTimer);
  openModal(paymentPopup);
}

btnCancelPayment.addEventListener("click", () => {
  closeModal(paymentPopup);
  clearInterval(qrTimer);
});

paymentSelect.addEventListener("change", () => {
  const method = paymentSelect.value;
  paymentExtra.innerHTML = "";
  clearInterval(qrTimer);

  if (method === "tiền mặt") {
    const order = allOrders.find((o) => o.orderId == selectedOrderForPayment);
    const conNo = order?.conNo ?? order?.finalTotal ?? 0;
    paymentExtra.innerHTML = `
      <div>
        <label>Số tiền khách đưa:</label>
        <input type="number" id="cashGiven" style="width:100%;padding:8px;margin-top:6px;border:1px solid #ccc;border-radius:6px;">
        <div id="changeAmount" style="margin-top:8px;font-weight:bold;"></div>
      </div>
    `;
    const cashInput = paymentExtra.querySelector("#cashGiven");
    const changeEl = paymentExtra.querySelector("#changeAmount");

    // realtime change calculation
    cashInput.addEventListener("input", () => {
      const given = Number(cashInput.value || 0);
      const change = given - conNo;
      changeEl.style.color = change < 0 ? "red" : "green";
      changeEl.innerText =
        change < 0
          ? `❌ Thiếu ${formatVND(Math.abs(change))}`
          : `💰 Thối lại: ${formatVND(change)}`;
    });
  }

  if (method === "chuyển khoản") {
    // Use VietQR image API (img.vietqr.io) so bank apps can parse STK/name/amount/desc
    const order = allOrders.find((o) => o.orderId == selectedOrderForPayment);
    const amount = order?.finalTotal ?? order?.total ?? 0;

    const bankCodeForUrl = "VCB"; // use bank code, e.g., VCB for Vietcombank
    const accountNumber = "1013093373";
    const accountName = "Nguyen Thanh Vinh";
    const transferDesc = `Thanh toan don ${order.orderId}`;

    // Build bank-scannable QR image url
    const qrUrl = createVietQRUrl({
      bank: bankCodeForUrl,
      account: accountNumber,
      name: accountName,
      amount,
      desc: transferDesc,
    });

    // render QR + meta + countdown
    paymentExtra.innerHTML = `
      <div class="payment-qr-wrap">
        <img id="qrImage" src="${qrUrl}" alt="QR chuyển khoản">
        <div class="qr-meta">Ngân hàng: <b>Vietcombank</b> &nbsp; STK: <b>${accountNumber}</b> &nbsp; Chủ TK: <b>${accountName}</b></div>
        <div class="qr-meta">Số tiền: <b>${formatVND(amount)}</b></div>
        <div class="qr-meta">Mã giao dịch: <span id="qrCodeDisplay">auto</span></div>
        <div id="qrCountdown">⏳ Mã hết hạn sau: 120s</div>
      </div>
    `;

    // set initial code display (random)
    const qrCodeDisplay = document.getElementById("qrCodeDisplay");
    const initialCode = Math.floor(100000 + Math.random() * 900000);
    qrCodeDisplay.innerText = initialCode;

    // countdown + refresh QR every 120s
    qrTimeLeft = 120;
    const qrImage = document.getElementById("qrImage");
    const qrCountdown = document.getElementById("qrCountdown");
    qrTimer = setInterval(() => {
      qrTimeLeft--;
      qrCountdown.innerText = `⏳ Mã hết hạn sau: ${qrTimeLeft}s`;
      if (qrTimeLeft <= 0) {
        // generate new bank-ready QR (with updated desc to avoid caching)
        const newQrUrl = createVietQRUrl({
          bank: bankCodeForUrl,
          account: accountNumber,
          name: accountName,
          amount,
          desc: `${transferDesc} ${Date.now()}`,
        });
        qrImage.src = newQrUrl + `&_=${Date.now()}`; // cache-bust
        qrCodeDisplay.innerText = Math.floor(100000 + Math.random() * 900000);
        qrTimeLeft = 120;
      }
    }, 1000);
  }
});
btnConfirmPayment.addEventListener("click", async () => {
  const method = paymentSelect.value;
  if (!method) return showToast("Vui lòng chọn hình thức thanh toán");

  const order = allOrders.find((o) => o.orderId == selectedOrderForPayment);
  if (!order) return showToast("Không tìm thấy đơn hàng");

  const now = new Date().toISOString();

  // ✅ Lấy thông tin userThu chính xác
  const authDataRaw = localStorage.getItem("userInfo");
  if (!authDataRaw) return showToast("❌ Không xác định được người thu tiền. Vui lòng đăng nhập lại!");
  const authData = JSON.parse(authDataRaw);
  if (!authData.email) return showToast("❌ Email người dùng không hợp lệ. Vui lòng đăng nhập lại!");
  const currentEmail = authData.email;

  // Nếu là tiền mặt thì lấy số tiền khách đưa, nếu không có thì dùng finalTotal
  let amountCollected = order?.finalTotal ?? order?.total ?? 0;
  if (method === "tiền mặt") {
    const cashInput = document.getElementById("cashGiven");
    const val = Number(cashInput?.value || 0);
    if (!val || val < amountCollected) {
      return showToast("❌ Số tiền khách đưa không hợp lệ hoặc chưa đủ!");
    }
    amountCollected = val;
  }

  try {
    // 1️⃣ Cập nhật order
    const orderRef = doc(db, "orders", String(selectedOrderForPayment));
    await updateDoc(orderRef, {
      status: "đã giao",
      paymentMethod: method,
      amountCollected: amountCollected,
      userThu: currentEmail, // ✅ Đảm bảo ghi đúng người thu
      conNo: 0,
      timeUpdate: now,
      deliveredAt: now,
      updatedAt: now,
    });

    // 2️⃣ Tạo / cập nhật transaction
    const transactionsSnap = await getDocs(collection(db, "transactions"));
    const existingTrans = transactionsSnap.docs.find(
      (d) => d.data().orderId === String(order.orderId)
    );

    const transactionData = {
      orderId: String(order.orderId),
      type: "thu",
      category: "order_payment",
      note: "Thu tiền đơn hàng",
      amountCollected: amountCollected,
      conNo: 0,
      createdAt: existingTrans ? existingTrans.data().createdAt : now,
      date: now,
      createdBy: existingTrans ? existingTrans.data().createdBy : currentEmail, // giữ đúng người tạo transaction
      paymentMethod: method,
      userThu: currentEmail, // ✅ ghi chính xác
      timeUpdate: now,
      transactionId: existingTrans
        ? existingTrans.data().transactionId
        : `THU_${order.orderId}_${Date.now()}`,
    };

    if (existingTrans) {
      const transRef = doc(db, "transactions", existingTrans.id);
      await updateDoc(transRef, transactionData);
    } else {
      await setDoc(doc(db, "transactions", transactionData.transactionId), transactionData);
    }

    // ✅ Hoàn tất
    closeModal(paymentPopup);
    closeModal(modalDetail);
    clearInterval(qrTimer);
    showToast(`✅ Đã thu ${formatVND(amountCollected)} (${method}) bởi ${currentEmail}`);
    await loadOrders();
  } catch (err) {
    console.error(err);
    showToast("❌ Lỗi khi cập nhật thu tiền!");
  }
});



/* ===== Print invoice (keeps previous behavior) ===== */
btnPrintInvoice.addEventListener("click", () => {
  if (!currentDetailOrder) return;
  const o = currentDetailOrder;
  const cust = o.customerInfo || {};
  const itemsHtml = (o.items || [])
    .map(
      (it) =>
        `<tr><td>${it.name}</td><td>${it.qty}</td><td>${formatVND(
          it.price
        )}</td><td>${formatVND(it.total)}</td></tr>`
    )
    .join("");

  const totalDiscount = (o.couponValue || 0) + (o.programDiscount || 0);

  const win = window.open("", "_blank", "width=800,height=900");
  const html = `
    <html><head><title>Hóa đơn #${o.orderId}</title>
    <style>
      body{font-family:Arial;padding:20px}
      h2{text-align:center;margin-bottom:6px}
      table{width:100%;border-collapse:collapse;margin-top:10px}
      th,td{border:1px solid #ddd;padding:8px;text-align:left}
      .summary{margin-top:15px;border-top:1px solid #ccc;padding-top:10px;}
    </style>
    </head><body>
      <h2>🧺 HÓA ĐƠN GIẶT ỦI</h2>
      <div><b>Mã đơn:</b> ${o.orderId}</div>
      <div><b>Khách hàng:</b> ${cust.hoTen || o.customerName || "—"}</div>
      <div><b>SĐT:</b> ${cust.sdt || o.customerId || "—"}</div>
      <div><b>Địa chỉ:</b> ${
        cust.duong ? `${cust.duong}, ${cust.phuong}, ${cust.tinh}` : "—"
      }</div>
      <table>
        <thead><tr><th>Sản phẩm</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <div class="summary">
        <p>Tổng cộng: ${formatVND(o.total)}</p>
        <p>Giảm giá (coupon + KM): ${formatVND(totalDiscount)}</p>
        <p><b>Thành tiền: ${formatVND(o.finalTotal)}</b></p>
        <p>Phương thức: ${o.paymentMethod || "—"}</p>
      </div>
      <p style="text-align:center;margin-top:20px;">Cảm ơn quý khách!</p>
    </body></html>
  `;
  win.document.write(html);
  win.document.close();
  win.print();
});

/* close detail modal */
btnCloseDetail.addEventListener("click", () => closeModal(modalDetail));

/* initial load */
await loadStaffList();
await loadOrders();

