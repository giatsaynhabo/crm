import {
  db,
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where
} from "./firebaseConfig.js";

import { checkPageAccess, getUserPermissions } from "./checkPermission.js";

// ==================== QUYỀN ====================
let userPerms = {};
await checkPageAccess("customerManage", "view");

try {
  userPerms = await getUserPermissions();
} catch (err) {
  console.warn("Không lấy được quyền người dùng:", err);
  userPerms = {};
}

function can(action) {
  return userPerms["customerManage"]?.includes(action);
}

// ==================== DOM ELEMENTS ====================
const khDetail = document.getElementById("khDetail");
const addressList = document.getElementById("addressList");
const orderList = document.getElementById("orderList");

const rowsPerPageSelect = document.getElementById("rowsPerPage");
const filterMonth = document.getElementById("filterMonth");
const filterYear = document.getElementById("filterYear");

const urlParams = new URLSearchParams(window.location.search);
const khId = urlParams.get("id");

if (!khId) {
  khDetail.innerHTML = "<p>❌ Không tìm thấy ID khách hàng.</p>";
  throw new Error("Missing customer ID");
}

// ==================== SET MẶC ĐỊNH THÁNG & NĂM HIỆN TẠI ====================
const now = new Date();
const currentMonth = now.getMonth() + 1; // 1-12
const currentYear = now.getFullYear();

if (filterMonth) filterMonth.value = currentMonth.toString().padStart(2, "0");
if (filterYear) filterYear.value = currentYear.toString();

// ==================== LOAD THÔNG TIN KHÁCH ====================
async function loadCustomerDetail() {
  const ref = doc(db, "customers", khId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    khDetail.innerHTML = "<p>❌ Không tìm thấy khách hàng.</p>";
    return;
  }

  const kh = snap.data();

  let defaultAddress = "";
  if (typeof kh.diaChi === "string") {
    defaultAddress = kh.diaChi;
  } else if (typeof kh.diaChi === "object") {
    const defaultObj = Object.values(kh.diaChi).find(a => a.isDefault) || Object.values(kh.diaChi)[0];
    defaultAddress = defaultObj ? defaultObj.full : "";
  }

  khDetail.innerHTML = `
    <div class="info-line"><strong>UID (SĐT):</strong> ${kh.sdt || khId}</div>
    <div class="info-line"><strong>Họ tên:</strong> ${kh.hoTen || "—"}</div>
    <div class="info-line"><strong>Giới tính:</strong> ${kh.gioiTinh || "—"}</div>
    <div class="info-line"><strong>Địa chỉ mặc định:</strong> ${defaultAddress || "Chưa có địa chỉ"}</div>
    <div class="info-line"><strong>Ghi chú:</strong> ${kh.ghiChu || "-"}</div>
    <div style="margin-top:10px;">
      ${can("edit") ? `<button id="btnEditCustomer" class="btn-action">✏️ Chỉnh sửa thông tin</button>` : ""}
      ${can("addAddress") ? `<button id="btnAddNewAddress" class="btn-action">➕ Thêm địa chỉ</button>` : ""}
    </div>
  `;

  if (can("edit")) {
    document.getElementById("btnEditCustomer").addEventListener("click", () => editCustomer(kh));
  }
  if (can("addAddress")) {
    document.getElementById("btnAddNewAddress").addEventListener("click", () => addAddress(kh));
  }

  displayAddresses(kh);
}

// ==================== HIỂN THỊ ĐỊA CHỈ ====================
function displayAddresses(kh) {
  addressList.innerHTML = "";

  if (!kh.diaChi || (typeof kh.diaChi === "string" && kh.diaChi.trim() === "")) {
    addressList.innerHTML = "<p>Khách chưa có địa chỉ</p>";
    return;
  }

  if (typeof kh.diaChi === "string") {
    const div = document.createElement("div");
    div.className = "address-item default";
    const span = document.createElement("span");
    span.textContent = kh.diaChi;
    div.appendChild(span);

    const defaultLabel = document.createElement("span");
    defaultLabel.style.fontWeight = "bold";
    defaultLabel.style.marginLeft = "10px";
    defaultLabel.textContent = "⭐ Mặc định";
    div.appendChild(defaultLabel);

    addressList.appendChild(div);
  } else {
    Object.entries(kh.diaChi).forEach(([key, a]) => {
      const div = document.createElement("div");
      div.className = "address-item" + (a.isDefault ? " default" : "");

      const span = document.createElement("span");
      span.textContent = a.full || `${a.duong || ""}, ${a.phuong || ""}, ${a.tinh || ""}`;
      div.appendChild(span);

      if (a.isDefault) {
        const defaultLabel = document.createElement("span");
        defaultLabel.style.fontWeight = "bold";
        defaultLabel.style.marginLeft = "10px";
        defaultLabel.textContent = "⭐ Mặc định";
        div.appendChild(defaultLabel);
      } else if (can("setDefault")) {
        const btn = document.createElement("button");
        btn.textContent = "⭐ Đặt mặc định";
        btn.addEventListener("click", () => setDefault(key));
        div.appendChild(btn);
      }

      addressList.appendChild(div);
    });
  }
}

// ==================== CHỈNH SỬA THÔNG TIN KHÁCH ====================
function editCustomer(kh) {
  if (!can("edit")) return alert("🚫 Bạn không có quyền chỉnh sửa khách hàng!");

  const formHtml = `
    <div id="editCustomerModal" class="modal" style="display:flex;">
      <div class="modal-content">
        <h3>✏️ Chỉnh sửa thông tin khách</h3>
        <label>SĐT (không được chỉnh sửa): <input id="editSDT" value="${kh.sdt || ""}" disabled></label>
        <label>Họ tên: <input id="editHoTen" value="${kh.hoTen || ""}"></label>
        <label>Giới tính:
          <select id="editGioiTinh">
            <option value="Nam" ${kh.gioiTinh === "Nam" ? "selected" : ""}>Nam</option>
            <option value="Nữ" ${kh.gioiTinh === "Nữ" ? "selected" : ""}>Nữ</option>
            <option value="Khác" ${kh.gioiTinh === "Khác" ? "selected" : ""}>Khác</option>
          </select>
        </label>
        <label>Ghi chú: <input id="editghiChu" value="${kh.ghiChu || ""}"></label>
        <div class="modal-actions">
          <button id="saveCustomer" class="btn-save">💾 Lưu</button>
          <button id="cancelEdit" class="btn-cancel">❌ Hủy</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", formHtml);

  const modal = document.getElementById("editCustomerModal");

  modal.querySelector("#cancelEdit").addEventListener("click", () => modal.remove());

  modal.querySelector("#saveCustomer").addEventListener("click", async () => {
    const newHoTen = modal.querySelector("#editHoTen").value.trim();
    const newGioiTinh = modal.querySelector("#editGioiTinh").value;
    const newghiChu = modal.querySelector("#editghiChu").value;

    await updateDoc(doc(db, "customers", khId), {
      hoTen: newHoTen,
      gioiTinh: newGioiTinh,
      ghiChu: newghiChu
    });

    modal.remove();
    loadCustomerDetail();
  });
}

// ==================== THÊM ĐỊA CHỈ ====================
function addAddress(kh) {
  if (!can("addAddress")) return alert("🚫 Bạn không có quyền thêm địa chỉ!");

  const oldModal = document.getElementById("addAddressModal");
  if (oldModal) oldModal.remove();

  const formHtml = `
    <div id="addAddressModal" class="modal" style="display:flex;">
      <div class="modal-content">
        <h3>➕ Thêm địa chỉ</h3>
        <label>Tỉnh/TP: <input id="newTinh" placeholder="VD: TP HCM"></label>
        <label>Phường/Xã: <input id="newPhuong" placeholder="VD: Thủ Đức"></label>
        <label>Đường/Số nhà: <input id="newDuong" placeholder="VD: 182 Lã Xuân Oai"></label>
        <label><input type="checkbox" id="newIsDefault"> Đặt làm địa chỉ mặc định</label>
        <div class="modal-actions">
          <button id="saveAddress" class="btn-save">💾 Lưu</button>
          <button id="cancelAddAddress" class="btn-cancel">❌ Hủy</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", formHtml);

  const modal = document.getElementById("addAddressModal");
  const btnCancel = modal.querySelector("#cancelAddAddress");
  const btnSave = modal.querySelector("#saveAddress");

  btnCancel.addEventListener("click", () => modal.remove());

  btnSave.addEventListener("click", async () => {
    const tinh = modal.querySelector("#newTinh").value.trim();
    const phuong = modal.querySelector("#newPhuong").value.trim();
    const duong = modal.querySelector("#newDuong").value.trim();
    const isDefault = modal.querySelector("#newIsDefault").checked;

    if (!tinh || !phuong || !duong) return alert("Nhập đầy đủ thông tin!");

    let diaChiObj = {};
    if (typeof kh.diaChi === "string") {
      diaChiObj = { "1": { full: kh.diaChi, isDefault: true } };
    } else if (typeof kh.diaChi === "object") {
      diaChiObj = { ...kh.diaChi };
    }

    const newKey = (Object.keys(diaChiObj).length + 1).toString();
    diaChiObj[newKey] = {
      tinh,
      phuong,
      duong,
      full: `${duong}, ${phuong}, ${tinh}`,
      isDefault
    };

    const hasDefault = Object.values(diaChiObj).some(a => a.isDefault);
    if (!hasDefault) diaChiObj[newKey].isDefault = true;

    await updateDoc(doc(db, "customers", khId), { diaChi: diaChiObj });
    modal.remove();
    loadCustomerDetail();
  });
}

// ==================== ĐẶT ĐỊA CHỈ MẶC ĐỊNH ====================
window.setDefault = async (key) => {
  if (!can("setDefault")) return alert("🚫 Bạn không có quyền đặt địa chỉ mặc định!");

  const ref = doc(db, "customers", khId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const kh = snap.data();
  if (typeof kh.diaChi !== "object") return;

  const diaChi = { ...kh.diaChi };
  Object.keys(diaChi).forEach(k => diaChi[k].isDefault = (k === key));
  await updateDoc(ref, { diaChi });
  loadCustomerDetail();
};

// ==================== LOAD ĐƠN HÀNG ====================
let currentPage = 1;

async function loadOrders() {
  const ordersRef = collection(db, "orders");
  const q = query(ordersRef, where("customerId", "==", khId));
  const snap = await getDocs(q);
  let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // 🔹 Lấy map nhân viên (email -> hoTen)
  const nhanvienRef = collection(db, "nhanvien");
  const nhanvienSnap = await getDocs(nhanvienRef);
  const nhanvienMap = {};
  nhanvienSnap.forEach(doc => {
    const data = doc.data();
    if (data.email) nhanvienMap[data.email.toLowerCase()] = data.hoTen || "(Chưa có tên)";
  });


  // 🔹 Sắp xếp mới nhất lên đầu
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // 🔹 Lọc theo tháng / năm
  const month = parseInt(filterMonth.value);
  const year = parseInt(filterYear.value);
  if (month || year) {
    list = list.filter(o => {
      const dt = new Date(o.createdAt);
      return (!month || dt.getMonth() + 1 === month) && (!year || dt.getFullYear() === year);
    });
  }

  // 🔹 Phân trang
  const rowsPerPage = parseInt(rowsPerPageSelect.value || 10);
  const totalPages = Math.ceil(list.length / rowsPerPage);
  if (currentPage > totalPages) currentPage = totalPages || 1;
  const start = (currentPage - 1) * rowsPerPage;
  const paginatedList = list.slice(start, start + rowsPerPage);

  // 🔹 Render bảng
  orderList.innerHTML = paginatedList.length === 0
    ? "<tr><td colspan='10'>Chưa có đơn hàng nào.</td></tr>"
    : paginatedList.map((o, i) => `
      <tr>
        <td>${start + i + 1}</td>
        <td>${o.orderId || "—"}</td>
        <td>${o.items?.map(it => `${it.name}(${it.qty})`).join(", ") || "—"}</td>
        <td>${o.total?.toLocaleString() || "0"}</td>
        <td>${o.discountTotal?.toLocaleString() || "0"}</td>
        <td>${o.finalTotal?.toLocaleString() || "0"}</td>
        <td>${o.conNo || "-"}</td>
        <td>${o.paymentMethod || "—"}</td>
        <td>${nhanvienMap[o.createdBy?.toLowerCase()] || o.createdBy || "-"}</td>
        <td>${o.createdAt ? new Date(o.createdAt).toLocaleString() : "—"}</td>
      </tr>
    `).join("");

  renderPagination(totalPages);
}


function renderPagination(totalPages) {
  const container = document.getElementById("pagination");
  if (totalPages <= 1) { container.innerHTML = ""; return; }
  let html = `<button ${currentPage === 1 ? "disabled" : ""} onclick="goToPage(1)"><<</button>`;
  html += `<button ${currentPage === 1 ? "disabled" : ""} onclick="goToPage(${currentPage - 1})"><</button>`;

  const maxPages = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxPages / 2));
  let endPage = Math.min(totalPages, startPage + maxPages - 1);
  startPage = Math.max(1, endPage - maxPages + 1);

  if (startPage > 1) html += `<span>...</span>`;
  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="${i === currentPage ? "active" : ""}" onclick="goToPage(${i})">${i}</button>`;
  }
  if (endPage < totalPages) html += `<span>...</span>`;
  html += `<button ${currentPage === totalPages ? "disabled" : ""} onclick="goToPage(${currentPage + 1})">></button>`;
  html += `<button ${currentPage === totalPages ? "disabled" : ""} onclick="goToPage(${totalPages})">>></button>`;

  container.innerHTML = html;
}

window.goToPage = function (page) { currentPage = page; loadOrders(); };
rowsPerPageSelect.addEventListener("change", () => { currentPage = 1; loadOrders(); });
filterMonth.addEventListener("change", () => { currentPage = 1; loadOrders(); });
filterYear.addEventListener("change", () => { currentPage = 1; loadOrders(); });

// ==================== INIT ====================
loadCustomerDetail();
loadOrders();
