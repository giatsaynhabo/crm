// js/donhang.js
import {
  db,
  collection,
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  auth
} from "./firebaseConfig.js";

/* --- Elements --- */
const sdtInput = document.getElementById("sdtKhach");
const tenInput = document.getElementById("tenKhach");
const soLanMuaInput = document.getElementById("soLanMua");
const chonSP = document.getElementById("chonSP");
const soLuongInput = document.getElementById("soLuong");
const donGiaInput = document.getElementById("donGia");
const btnAddItem = document.getElementById("btnAddItem");
const itemsTableBody = document.querySelector("#itemsTable tbody");
const totalDisplay = document.getElementById("totalDisplay");
const couponInput = document.getElementById("coupon");
const btnApplyCoupon = document.getElementById("btnApplyCoupon");
const discountDisplay = document.getElementById("discountDisplay");
const finalDisplay = document.getElementById("finalDisplay");
const btnCreateOrder = document.getElementById("btnCreateOrder");
const programList = document.getElementById("programList");

/* modal add customer */
const modalAddCustomer = document.getElementById("modalAddCustomer");
const formAddCustomer = document.getElementById("formAddCustomer");
const btnCancelAddCustomer = document.getElementById("btnCancelAddCustomer");
const c_sdt = document.getElementById("c_sdt");
const c_hoTen = document.getElementById("c_hoTen");
const c_gioiTinh = document.getElementById("c_gioiTinh");
const c_tinh = document.getElementById("c_tinh");
const c_phuong = document.getElementById("c_phuong");
const c_duong = document.getElementById("c_duong");
const c_ghiChu = document.getElementById("c_ghiChu");

/* state */
let products = [];
let items = [];
let appliedCoupon = null;
let appliedPrograms = []; // danh sách chương trình đang áp dụng
let programs = []; // chương trình khả dụng (đã lọc)
let currentCustomer = null;
let nextOrderIdCache = null;

/* --- Load user info --- */
const userInfoRaw = localStorage.getItem("userInfo");
let userInfo = null;
try {
  userInfo = userInfoRaw ? JSON.parse(userInfoRaw) : null;
} catch (err) {
  console.error("Lỗi parse userInfo:", err);
}
const isAdmin = userInfo?.quyen === "admin";
let selectedStoreId = userInfo?.khoLamViec || "0";

/* --- Elements --- */
const khoTaoSelect = document.getElementById("khoTao");

/* helpers */
function showToast(msg, time = 3000) {
  const t = document.createElement("div");
  t.className = "toast";
  t.innerText = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), time);
}
function formatVND(n) {
  return Number(n || 0).toLocaleString("vi-VN") + "₫";
}
function parseNumberFromString(s) {
  return Number(String(s || "").replace(/[^0-9.-]+/g, "")) || 0;
}

/* --- Load products --- */
async function loadProducts() {
  chonSP.innerHTML = "<option value=''>-- Chọn sản phẩm --</option>";
  products = [];
  try {
    const snap = await getDocs(collection(db, "products"));
    snap.forEach((d) => {
      const data = d.data();
      products.push(data);

      const opt = document.createElement("option");
      opt.value = data.id;
      const label = `${data.name} — ${formatVND(data.price)}`;
      opt.textContent = label;

      // ✅ Nếu sản phẩm có checkStock và hết hàng → disable chọn
      if (data.checkStock === true && Number(data.qty) <= 0) {
        opt.disabled = true;
        opt.classList.add("disabled");
        opt.title = "SP hết tồn kho, vui lòng liên hệ QL";
      }

      chonSP.appendChild(opt);
    });
  } catch (err) {
    console.error("Lỗi load products:", err);
  }
}
await loadProducts();

/* --- Load stores --- */
/* --- Load stores --- */
async function loadStores() {
  try {
    const storesSnap = await getDocs(collection(db, "cuahang"));
    const stores = [];
    storesSnap.forEach((docSnap) => {
      const d = docSnap.data();
      if (d.trangThai === "active") stores.push(d);
    });

    // clear dropdown
    khoTaoSelect.innerHTML = "";

    stores.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.storeId;
      opt.textContent = `${s.storeId} - ${s.ten}`; // 👈 chỉ hiển thị "ID - Tên"
      khoTaoSelect.appendChild(opt);
    });

    // chọn mặc định theo user
    khoTaoSelect.value = selectedStoreId;

    // nếu không phải admin thì khóa chọn kho
    if (!isAdmin) khoTaoSelect.disabled = true;

    // nếu admin, cho phép chọn kho
    khoTaoSelect.addEventListener("change", () => {
      selectedStoreId = khoTaoSelect.value;
      showToast(`🔁 Đã chọn kho: ${selectedStoreId}`);
    });
  } catch (err) {
    console.error("Lỗi loadStores:", err);
    khoTaoSelect.innerHTML = `<option value="">⚠️ Lỗi tải kho</option>`;
  }
}


/* --- Load discount programs (only active & within date & status 'đang diễn ra') --- */
async function loadPrograms() {
  programs = [];
  if (!programList) return;
  programList.innerHTML = "Đang tải chương trình...";
  try {
    const snap = await getDocs(collection(db, "programs"));
    const today = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"
    snap.forEach((d) => {
      const p = d.data();
      // Filter: active true
      if (!p) return;
      if (p.active !== true) return;
      // Filter: status is "đang diễn ra" if provided
      if (p.status && p.status !== "đang diễn ra") return;
      // Filter: must have startDate and endDate in "YYYY-MM-DD" format
      if (!p.startDate || !p.endDate) return;
      // Only keep if startDate <= today <= endDate
      const withinDate = p.startDate <= today && today <= p.endDate;
      if (!withinDate) return;
      // Passed all checks -> add
      programs.push({ ...p, withinDate });
    });
    renderPrograms();
  } catch (err) {
    console.error("Lỗi loadPrograms:", err);
    programList.innerHTML = "⚠️ Lỗi tải chương trình";
  }
}

/* --- Render discount programs --- */
function renderPrograms() {
  if (!programList) return;
  programList.innerHTML = "";
  const total = items.reduce((s, i) => s + Number(i.total || 0), 0);

  // Nếu có chương trình không cho cộng dồn đã được chọn
  const hasNoStackSelected = appliedPrograms.some((x) => x.allowStack === false);

  programs.forEach((p) => {
    // Double-check active & status & withinDate
    if (p.active !== true) return;
    if (p.status && p.status !== "đang diễn ra") return;
    if (!p.withinDate) return;

    let reason = "";
    let disabled = false;

    // --- Kiểm tra tổng đơn tối thiểu ---
    if (total < (p.minBill || 0)) {
      reason = `Đơn tối thiểu ${formatVND(p.minBill)} mới được áp dụng`;
      disabled = true;
    }

    // --- Kiểm tra chương trình đặc biệt ---
    if (p.isSpecialProgram) {
      const nextOrderNumber = (currentCustomer?.soLanMua || 0) + 1;
      if (nextOrderNumber % p.specialLimit !== 0) {
        reason = `Chỉ áp dụng khi số lần mua là bội của ${p.specialLimit} (lần mua hiện tại + 1 = ${nextOrderNumber})`;
        disabled = true;
      }
    }

    // --- Kiểm tra stacking ---
    const alreadySelected = appliedPrograms.find((x) => x.id === p.id);
    if (!alreadySelected && hasNoStackSelected) {
      const forbider = appliedPrograms.find((x) => x.allowStack === false);
      if (forbider && forbider.id !== p.id) {
        reason = "Không thể áp dụng cùng chương trình khác (một chương trình không cho phép cộng dồn)";
        disabled = true;
      }
    }

    // --- render từng item ---
    const div = document.createElement("div");
    div.className = "program-item";
    if (disabled) div.classList.add("disabled");
    if (alreadySelected) div.classList.add("selected");
    div.title = disabled ? reason : p.note || "";

    // badges
    const badges = [];
    if (p.allowStack === true) badges.push("stackable");
    else if (p.allowStack === false) badges.push("no-stack");
    if (p.allowCoupon === true) badges.push("allow-coupon");
    else if (p.allowCoupon === false) badges.push("no-coupon");

    div.innerHTML = `
      <div class="program-info">
        <strong>${p.name}</strong>
        <div class="program-badges">${badges.map(b => `<span class="badge ${b}">${b}</span>`).join(" ")}</div>
        <small>${p.note || ""}</small>
      </div>
      <div class="program-actions">
        <button class="btn small" ${disabled ? "disabled" : ""} data-id="${p.id}">
          ${alreadySelected ? "Bỏ chọn" : "Áp dụng"}
        </button>
      </div>
    `;
    programList.appendChild(div);
  });

  // --- handle apply button ---
  programList.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const prog = programs.find((x) => x.id === id);
      if (!prog) return;

      const already = appliedPrograms.find((x) => x.id === id);
      if (already) {
        appliedPrograms = appliedPrograms.filter((x) => x.id !== id);
        showToast(`❎ Bỏ áp dụng: ${prog.name}`);
      } else {
        // --- Kiểm tra special program ---
        if (prog.isSpecialProgram) {
          const nextOrderNumber = (currentCustomer?.soLanMua || 0) + 1;
          if (nextOrderNumber % prog.specialLimit !== 0) {
            return showToast(`❌ Không thể áp dụng: chỉ áp dụng khi số lần mua là bội của ${prog.specialLimit}`);
          }
        }

        // --- stacking logic ---
        if (prog.allowStack === false) {
          appliedPrograms = [prog];
        } else {
          const forbider = appliedPrograms.find((x) => x.allowStack === false);
          if (forbider) {
            showToast(`❌ Không thể áp dụng do chương trình "${forbider.name}" không cho phép cộng dồn`);
            return;
          }
          appliedPrograms.push(prog);
        }
        showToast(`✅ Áp dụng: ${prog.name}`);
      }

      // --- nếu có chương trình không cho coupon → hủy coupon ---
      const hasNoCoupon = appliedPrograms.some((x) => x.allowCoupon === false);
      if (hasNoCoupon && appliedCoupon) {
        appliedCoupon = null;
        showToast("⚠️ Coupon đã bị huỷ do chương trình hiện tại không cho phép coupon");
      }

      recalcTotals();
      renderPrograms();
      renderAppliedProgramsSummary();
    });
  });

  // --- summary ---
  renderAppliedProgramsSummary();
}


/* --- show small summary of applied programs under programList --- */
function renderAppliedProgramsSummary() {
  // optional: create or reuse a small container inside programList to show applied program ids/names
  let summary = document.getElementById("appliedProgramsSummary");
  if (!summary) {
    summary = document.createElement("div");
    summary.id = "appliedProgramsSummary";
    summary.style.marginTop = "8px";
    summary.style.fontSize = "13px";
    programList.appendChild(summary);
  }
  if (appliedPrograms.length === 0) {
    summary.innerHTML = "<em>Chưa có chương trình được áp dụng</em>";
    return;
  }
  summary.innerHTML = `<strong>Đã áp dụng:</strong> ${appliedPrograms.map(p => p.name).join(", ")}`;
}

/* --- Customer lookup --- */
sdtInput.addEventListener("change", async () => {
  const sdt = sdtInput.value.trim();
  currentCustomer = null;
  soLanMuaInput.value = "";
  tenInput.value = "";
  if (!sdt) return;

  try {
    const ref = doc(db, "customers", sdt);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      currentCustomer = snap.data();
      tenInput.value = currentCustomer.hoTen || "";
      // count orders by this customer (could be optimized with query)
      const ordersSnap = await getDocs(collection(db, "orders"));
      const count = ordersSnap.docs.filter(
        (d) => d.data().customerId === sdt
      ).length;
      currentCustomer.soLanMua = count; // <-- lưu vào state
      soLanMuaInput.value = count.toString();
      showToast(`✅ Tìm thấy khách: ${currentCustomer.hoTen}`, 2000);
    } else {
      c_sdt.value = sdt;
      c_hoTen.value = "";
      c_gioiTinh.value = "Nam";
      c_tinh.value = "";
      c_phuong.value = "";
      c_duong.value = "";
      c_ghiChu.value = "";
      openModal(modalAddCustomer);
    }
  } catch (err) {
    console.error("Lỗi tìm khách:", err);
  }
});

/* modal helpers */
function openModal(el) {
  el.style.display = "flex";
}
function closeModal(el) {
  el.style.display = "none";
}
btnCancelAddCustomer.addEventListener("click", () =>
  closeModal(modalAddCustomer)
);

/* --- add-customer form --- */
formAddCustomer.addEventListener("submit", async (e) => {
  e.preventDefault();
  const sdt = c_sdt.value.trim();
  if (!sdt) return showToast("Vui lòng nhập SĐT");

  const data = {
    id: sdt,
    sdt,
    hoTen: c_hoTen.value.trim(),
    gioiTinh: c_gioiTinh.value,
    tinh: c_tinh.value.trim(),
    phuong: c_phuong.value.trim(),
    duong: c_duong.value.trim(),
    ghiChu: c_ghiChu.value.trim(),
  };

  try {
    await setDoc(doc(db, "customers", sdt), data);
    currentCustomer = data;
    tenInput.value = data.hoTen;
    closeModal(modalAddCustomer);
    showToast("✅ Đã tạo khách hàng mới");
  } catch (err) {
    console.error(err);
    showToast("❌ Lỗi khi tạo khách hàng");
  }
});

/* --- product selection --- */
chonSP.addEventListener("change", () => {
  const id = chonSP.value;
  const p = products.find((x) => String(x.id) === String(id));
  donGiaInput.value = p ? formatVND(p.price) : "";
});

/* --- Add item --- */
btnAddItem.addEventListener("click", (e) => {
  e.preventDefault();
  const spId = chonSP.value;
  const qty = parseFloat(soLuongInput.value) || 0;
  if (!spId || qty <= 0) return showToast("Chọn sản phẩm và nhập số lượng hợp lệ");
  const p = products.find((x) => String(x.id) === String(spId));
  if (!p) return showToast("Sản phẩm không hợp lệ");

  items.push({
    productId: p.id,
    name: p.name,
    qty,
    price: Number(p.price),
    total: Number(p.price) * qty,
  });
  renderItems();
  recalcTotals();
  renderPrograms();
});

/* --- render items --- */
function renderItems() {
  itemsTableBody.innerHTML = "";
  items.forEach((it, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${it.name}</td>
      <td>${it.qty}</td>
      <td>${formatVND(it.price)}</td>
      <td>${formatVND(it.total)}</td>
      <td><button class="btn" data-idx="${idx}">Xóa</button></td>
    `;
    itemsTableBody.appendChild(tr);
  });
  itemsTableBody.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      const i = Number(b.dataset.idx);
      items.splice(i, 1);
      renderItems();
      recalcTotals();
      renderPrograms();
    });
  });
}

/* --- totals --- */
function recalcTotals() {
  const total = items.reduce((s, i) => s + Number(i.total || 0), 0);
  totalDisplay.innerText = formatVND(total);

  let discount = 0;

  // cộng dồn nhiều chương trình
  appliedPrograms.forEach((p) => {
    let d = 0;
    if (p.type === "percent") {
      d = (total * p.value) / 100;
      if (p.maxDiscount && d > p.maxDiscount) d = p.maxDiscount;
    } else if (p.type === "amount") {
      d = Number(p.value || 0);
    }
    discount += d;
  });

  // cộng thêm coupon nếu được phép
  if (appliedCoupon) {
    const allowCoupon =
      appliedPrograms.length === 0 ||
      appliedPrograms.every((x) => x.allowCoupon !== false);
    if (allowCoupon) discount += Number(appliedCoupon.soTien || 0);
  }

  if (discount > total) discount = total;
  discountDisplay.innerText = formatVND(discount);
  finalDisplay.innerText = formatVND(Math.max(0, total - discount));
}

/* --- Coupon --- */
async function findCouponByCode(code) {
  code = (code || "").trim();
  if (!code) return null;
  const colNames = ["coupons", "phieuchi", "coupon_phieuchi"];
  for (const colName of colNames) {
    try {
      const snap = await getDocs(
        query(collection(db, colName), where("ma", "==", code))
      );
      if (!snap.empty) return { id: snap.docs[0].id, col: colName, ...snap.docs[0].data() };
    } catch (err) {
      console.error("Lỗi findCouponByCode", err);
    }
  }
  return null;
}

btnApplyCoupon.addEventListener("click", async (e) => {
  e.preventDefault();
  const code = couponInput.value.trim();
  const sdt = sdtInput.value.trim();
  if (!code) return showToast("Nhập mã coupon");
  const found = await findCouponByCode(code);
  if (!found) return showToast("Coupon không tồn tại");
  if (found.trangThai && found.trangThai !== "chưa sử dụng")
    return showToast("Coupon đã sử dụng hoặc hủy");
  if (found.sdt && String(found.sdt) !== String(sdt))
    return showToast("Coupon không thuộc SĐT này");

  // kiểm tra allowCoupon
  const hasNoCoupon = appliedPrograms.some((x) => x.allowCoupon === false);
  if (hasNoCoupon)
    return showToast("❌ Chương trình hiện tại không cho phép áp dụng coupon");

  appliedCoupon = found;
  showToast(`✅ Coupon hợp lệ: giảm ${formatVND(found.soTien)}`);
  try {
    await updateDoc(doc(db, appliedCoupon.col, appliedCoupon.id), {
      trangThai: "đã sử dụng",
      updatedAt: new Date(),
    });
  } catch (err) {
    console.error("Lỗi update coupon:", err);
  }
  recalcTotals();
  renderPrograms();
});

/* --- order ID --- */
/* --- get next orderId --- */
async function getNextOrderId() {
  if (nextOrderIdCache) return nextOrderIdCache;

  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `${selectedStoreId}SO${yy}${mm}`;

  try {
    // Firestore query: lấy đơn gần nhất của kho hiện tại
    const q = query(
      collection(db, "orders"),
      where("storeId", "==", String(selectedStoreId)),
      orderBy("orderId", "desc"),
      limit(1)
    );
    const snap = await getDocs(q);

    let nextNumber = 1;
    if (!snap.empty) {
      const lastId = snap.docs[0].data().orderId || "";
      if (lastId.startsWith(prefix)) {
        const lastNum = parseInt(lastId.slice(-7), 10);
        if (!isNaN(lastNum)) nextNumber = lastNum + 1;
      }
    }

    const newOrderId = `${prefix}${String(nextNumber).padStart(7, "0")}`;
    nextOrderIdCache = newOrderId;
    return newOrderId;
  } catch (err) {
    console.error("Lỗi getNextOrderId:", err);
    return `${prefix}0000001`; // fallback
  }
}

/* --- create transactionId từ orderId --- */
function generateTransactionId(orderId) {
  const storeId = orderId.slice(0, 1); // lấy số kho
  const datePart = orderId.slice(3, 7); // YYMM
  const numPart = orderId.slice(7); // phần số 7 chữ số
  return `${storeId}CM${datePart}${numPart}`;
}

/* --- create order --- */
btnCreateOrder.addEventListener("click", async () => {
  if (items.length === 0) return showToast("Thêm ít nhất 1 sản phẩm");

  const sdt = sdtInput.value.trim();
  const ten = tenInput.value.trim() || "Khách lẻ";
  const total = items.reduce((s, i) => s + Number(i.total || 0), 0);

  // tính tổng giảm giá từ chương trình & coupon
  let programDiscount = 0;
  appliedPrograms.forEach((p) => {
    let d = 0;
    if (p.type === "percent") {
      d = (total * p.value) / 100;
      if (p.maxDiscount && d > p.maxDiscount) d = p.maxDiscount;
    } else if (p.type === "amount") d = Number(p.value || 0);
    programDiscount += d;
  });

  const allowCoupon =
    appliedPrograms.length === 0 ||
    appliedPrograms.every((x) => x.allowCoupon !== false);
  const couponValue =
    appliedCoupon && allowCoupon ? Number(appliedCoupon.soTien || 0) : 0;

  const discountTotal = programDiscount + couponValue;
  const finalBeforeRound = Math.max(0, total - discountTotal);
  const roundedFinal = Math.floor(finalBeforeRound / 1000) * 1000;
  const roundDiff = roundedFinal - finalBeforeRound;

  const orderId = await getNextOrderId();
  const transactionId = generateTransactionId(orderId);

  // Lấy user đang đăng nhập
  const user = auth.currentUser;
  const createdBy = user?.email || user?.displayName || "unknown";

  const orderPayload = {
    orderId,
    storeId: selectedStoreId,
    customerId: sdt,
    customerName: ten,
    customerInfo: currentCustomer
      ? {
          sdt: currentCustomer.sdt || currentCustomer.id,
          hoTen: currentCustomer.hoTen,
          gioiTinh: currentCustomer.gioiTinh,
          tinh: currentCustomer.tinh,
          phuong: currentCustomer.phuong,
          duong: currentCustomer.duong,
          ghiChu: currentCustomer.ghiChu || "",
        }
      : { sdt, hoTen: ten },
    items,
    appliedPrograms: appliedPrograms.map((p) => p.id),
    couponCode: appliedCoupon ? appliedCoupon.ma || appliedCoupon.id : null,
    programDiscount,
    couponValue,
    total,
    discountTotal,
    finalTotal: roundedFinal,
    roundDiff,
    note: `Làm tròn tổng tiền (${formatVND(finalBeforeRound)} → ${formatVND(roundedFinal)})`,
    status: "đã giặt xong",
    createdBy,
    createdAt: new Date().toISOString(),
  };

  try {
    // --- tạo đơn hàng ---
    await setDoc(doc(db, "orders", String(orderId)), orderPayload);
    showToast(`✅ Đã tạo đơn #${orderId}`);

    // --- tạo phiếu thu ---
    const conNo = total - programDiscount - couponValue;
    const transactionData = {
      transactionId,
      orderId,
      amount: total,
      programDiscount,
      couponValue,
      conNo,
      category: "order_payment",
      type: "thu",
      note: "Thu tiền đơn hàng",
      createdAt: new Date().toISOString(),
      date: new Date().toISOString(),
      createdBy,
    };

    await setDoc(doc(db, "transactions", transactionId), transactionData);
    showToast(`💰 Đã tạo phiếu thu #${transactionId}`);

    // mở giao diện in bill
    window.open(`in-bill.html?orderId=${orderId}`, "_blank");

    // --- reset state ---
    items = [];
    appliedCoupon = null;
    appliedPrograms = [];
    currentCustomer = null;
    renderItems();
    recalcTotals();
    renderPrograms();
    sdtInput.value = "";
    tenInput.value = "";
    soLanMuaInput.value = "";
    couponInput.value = "";
    donGiaInput.value = "";
    nextOrderIdCache = null;

    await loadProducts();
  } catch (err) {
    console.error("Lỗi khi tạo đơn:", err);
    showToast("❌ Lỗi khi tạo đơn");
  }
});

/* --- init --- */
function init() {
  items = [];
  appliedCoupon = null;
  appliedPrograms = [];
  currentCustomer = null;
  renderItems();
  recalcTotals();
}
init();
await loadPrograms();
await loadStores();
