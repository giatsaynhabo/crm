import {
    db,
    collection,
    getDocs,
    getDoc,
    updateDoc,
    doc,
    query,
    where,
  } from "./firebaseConfig.js";
  
  console.log("✅ JS loaded & Firestore ready:", db);
  
  const sel = (id) => document.getElementById(id);
  const collectionSelect = sel("collectionSelect");
  const idInputWrap = sel("idInputWrap");
  const docIdInput = sel("docIdInput");
  const btnLoadDoc = sel("btnLoadDoc");
  const updateForm = sel("updateForm");
  const fieldsContainer = sel("fieldsContainer");
  const toast = sel("toast");
  const btnViewJson = sel("btnViewJson");
  const jsonModal = sel("jsonModal");
  const jsonDisplay = sel("jsonDisplay");
  const btnCloseJson = sel("btnCloseJson");
  
  let currentCollection = "";
  let currentDocRef = null;
  let currentDocData = null;
  
  // === Helper ===
  function showToast(msg, color = "#333") {
    toast.textContent = msg;
    toast.style.background = color;
    toast.style.display = "block";
    setTimeout(() => (toast.style.display = "none"), 2500);
  }
  
  function formatNumber(num) {
    if (isNaN(num)) return num;
    return num.toLocaleString("vi-VN");
  }
  
  function formatDateTime(val) {
    if (!val) return "";
    let date;
    if (val.seconds) date = new Date(val.seconds * 1000);
    else if (typeof val === "string") date = new Date(val);
    else date = new Date(val);
    if (isNaN(date.getTime())) return val;
    return date.toLocaleTimeString("vi-VN") + " " + date.toLocaleDateString("vi-VN");
  }
  
  function isMoneyField(key) {
    return ["total", "programDiscount", "finalTotal", "couponValue", "amount", "conNo", "soTien"].includes(key);
  }
  
  function isDateField(key) {
    return ["createdAt", "updatedAt", "deliveredAt"].includes(key);
  }
  
  // === 1️⃣ Chọn collection ===
  collectionSelect.addEventListener("change", () => {
    currentCollection = collectionSelect.value;
    idInputWrap.style.display = currentCollection ? "block" : "none";
    updateForm.style.display = "none";
  });
  
  // === 2️⃣ Tải document ===
  btnLoadDoc.addEventListener("click", async () => {
    const idVal = docIdInput.value.trim();
    if (!idVal) return showToast("⚠️ Nhập ID / mã trước!");
  
    try {
      currentDocRef = null;
      currentDocData = null;
      console.log("🔍 Loading", currentCollection, idVal);
  
      if (currentCollection === "orders") {
        const q = query(collection(db, "orders"), where("orderId", "==", Number(idVal)));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const d = snap.docs[0];
          currentDocRef = doc(db, "orders", d.id);
          currentDocData = d.data();
        }
      } else if (currentCollection === "programs") {
        const ref = doc(db, "programs", idVal);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          currentDocRef = ref;
          currentDocData = snap.data();
        }
      } else if (currentCollection === "coupons") {
        const q = query(collection(db, "coupons"), where("ma", "==", idVal));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const d = snap.docs[0];
          currentDocRef = doc(db, "coupons", d.id);
          currentDocData = d.data();
        }
      }
  
      if (!currentDocData) {
        showToast("❌ Không tìm thấy dữ liệu!", "#b02a37");
        return;
      }
  
      console.log("✅ Found document:", currentDocRef.path);
      renderFields(currentDocData);
      updateForm.style.display = "block";
      showToast("✅ Dữ liệu đã tải!");
    } catch (err) {
      console.error("🔥 Load error:", err);
      showToast("Lỗi khi tải dữ liệu!", "#b02a37");
    }
  });
  
  // === 3️⃣ Render form động ===
  function renderFields(data) {
    fieldsContainer.innerHTML = "";
  
    // 🔒 Các trường không được chỉnh sửa
    const readOnlyFields = {
      orders: ["orderId", "createdAt", "updatedAt", "deliveredAt", "customerId","couponValue","programDiscount"],
      programs: ["id", "createdAt"],
      coupons: ["ma", "createdAt", "updatedAt"],
    };
    const locked = readOnlyFields[currentCollection] || [];
  
    Object.entries(data).forEach(([key, val]) => {
      let fieldHtml = "";
      const isReadOnly = locked.includes(key);
  
      // --- Định dạng hiển thị ---
      let displayVal = val;
      if (isDateField(key)) displayVal = formatDateTime(val);
      if (isMoneyField(key)) displayVal = formatNumber(Number(val));
  
      // --- Nếu là status thì dropdown ---
      if (key === "status" || key === "trangThai") {
        fieldHtml = `
          <select data-key="${key}" ${isReadOnly ? "disabled" : ""}>
            <option value="chờ giao" ${val === "chờ giao" ? "selected" : ""}>chờ giao</option>
            <option value="đã giặt xong" ${val === "đã giặt xong" ? "selected" : ""}>đã giặt xong</option>
            <option value="đã giao" ${val === "đã giao" ? "selected" : ""}>đã giao</option>
            <option value="đã hủy" ${val === "đã hủy" ? "selected" : ""}>đã hủy</option>
          </select>`;
      } else if (typeof val === "object" && val !== null) {
        fieldHtml = `<textarea data-key="${key}" rows="3" ${isReadOnly ? "readonly class='readonly'" : ""}>${JSON.stringify(val, null, 2)}</textarea>`;
      } else if (typeof val === "boolean") {
        fieldHtml = `<select data-key="${key}" ${isReadOnly ? "disabled" : ""}>
          <option value="true" ${val ? "selected" : ""}>true</option>
          <option value="false" ${!val ? "selected" : ""}>false</option>
        </select>`;
      } else {
        fieldHtml = `<input data-key="${key}" value="${displayVal ?? ""}" ${isReadOnly ? "readonly class='readonly'" : ""}/>`;
      }
  
      fieldsContainer.innerHTML += `
        <div class="field-group">
          <label>${key}</label>
          ${fieldHtml}
        </div>`;
    });
  
    // 🎨 Highlight khi thay đổi
    fieldsContainer.querySelectorAll("input, select, textarea").forEach((el) => {
      if (el.hasAttribute("readonly") || el.disabled) return;
      const oldVal = el.value;
      el.addEventListener("input", () => {
        el.style.backgroundColor = el.value !== oldVal ? "#fff3cd" : "";
      });
    });
  }
  
  // === 4️⃣ Cập nhật dữ liệu ===
  updateForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    console.log("🔥 Submit triggered!");
  
    if (!currentDocRef) {
      console.warn("⚠️ currentDocRef null");
      return showToast("Không có doc nào để update!", "#b02a37");
    }
  
    try {
      const newData = {};
      fieldsContainer.querySelectorAll("[data-key]").forEach((el) => {
        if (el.hasAttribute("readonly") || el.disabled) return;
        const k = el.dataset.key;
        if (el.tagName === "SELECT" && el.options.length === 2) {
          newData[k] = el.value === "true";
        } else if (el.tagName === "TEXTAREA") {
          try {
            newData[k] = JSON.parse(el.value);
          } catch {
            newData[k] = el.value;
          }
        } else {
          const val = el.value.replace(/\./g, ""); // bỏ dấu chấm nếu là số tiền
          newData[k] = isNaN(val) ? val : Number(val);
        }
      });
  
      newData.updatedAt = new Date().toISOString();
      newData.ghiChu = "Cập nhật từ updatedata";
  
      console.log("📦 Update data:", newData);
      await updateDoc(currentDocRef, newData);
      showToast("✅ Cập nhật thành công!", "#198754");
    } catch (err) {
      console.error("🔥 Update error:", err);
      showToast("❌ Lỗi khi cập nhật!", "#b02a37");
    }
  });
  
  // === 5️⃣ JSON Viewer ===
  btnViewJson.addEventListener("click", () => {
    if (!currentDocData) return showToast("Chưa có dữ liệu!");
    jsonDisplay.textContent = JSON.stringify(currentDocData, null, 2);
    jsonModal.style.display = "flex";
  });
  btnCloseJson.addEventListener("click", () => (jsonModal.style.display = "none"));
  
  window.addEventListener("DOMContentLoaded", () => {
    console.log("✅ updateForm script sẵn sàng");
  });
  