import { db, doc, getDoc } from "./firebaseConfig.js";

const orderIdSpan = document.getElementById("orderId");
const orderDateSpan = document.getElementById("orderDate");
const customerNameSpan = document.getElementById("customerName");
const customerPhoneSpan = document.getElementById("customerPhone");
const itemsTableBody = document.querySelector("#itemsTable tbody");
const totalEl = document.getElementById("total");
const discountEl = document.getElementById("discount");
const finalEl = document.getElementById("final");
const discountsDiv = document.getElementById("discounts");
const paperSizeSelect = document.getElementById("paperSize");
const printArea = document.getElementById("printArea");
const btnPrint = document.getElementById("btnPrint");

function formatVND(n) {
  return Number(n || 0).toLocaleString("vi-VN") + "₫";
}

async function loadOrder() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("orderId");
  if (!id) {
    alert("Không có mã đơn");
    return;
  }

  const snap = await getDoc(doc(db, "orders", String(id)));
  if (!snap.exists()) {
    alert("Không tìm thấy đơn hàng");
    return;
  }

  const order = snap.data();
  orderIdSpan.textContent = order.orderId;
  orderDateSpan.textContent = new Date(order.createdAt).toLocaleString("vi-VN");
  customerNameSpan.textContent = order.customerName || "Khách lẻ";
  customerPhoneSpan.textContent = order.customerId || "";

  // render items
  itemsTableBody.innerHTML = "";
  order.items.forEach((it) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${it.name}</td>
      <td>${it.qty}</td>
      <td>${formatVND(it.price)}</td>
      <td>${formatVND(it.total)}</td>
    `;
    itemsTableBody.appendChild(tr);
  });

  // giảm giá chi tiết


  totalEl.textContent = formatVND(order.total);
  const discountTotal = (order.programDiscount || 0) + (order.couponValue || 0);
  discountEl.textContent = formatVND(discountTotal);
  finalEl.textContent = formatVND(order.finalTotal);
}

paperSizeSelect.addEventListener("change", () => {
  printArea.className = paperSizeSelect.value;
});

btnPrint.addEventListener("click", () => window.print());

loadOrder();
