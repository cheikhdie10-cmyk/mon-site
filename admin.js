const adminAuthCard = document.getElementById("adminAuthCard");
const adminApp = document.getElementById("adminApp");
const adminLoginForm = document.getElementById("adminLoginForm");
const adminPassword = document.getElementById("adminPassword");
const adminAuthMessage = document.getElementById("adminAuthMessage");
const logoutAdminBtn = document.getElementById("logoutAdminBtn");
const adminNotice = document.getElementById("adminNotice");
const refreshAdminBtn = document.getElementById("refreshAdminBtn");
const productForm = document.getElementById("productForm");
const productsTableBody = document.getElementById("productsTableBody");
const ordersTableBody = document.getElementById("ordersTableBody");
const eventList = document.getElementById("eventList");

const statusOptions = [
  { value: "nouvelle", label: "Nouvelle" },
  { value: "en_preparation", label: "En preparation" },
  { value: "expediee", label: "Expediee" },
  { value: "livree", label: "Livree" },
  { value: "annulee", label: "Annulee" }
];

let isAuthenticated = false;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function formatPrice(value) {
  const amount = Number(value) || 0;
  return `${amount.toFixed(2)} EUR`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date inconnue";
  return date.toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function setNotice(message, type = "info") {
  if (!adminNotice) return;
  adminNotice.textContent = message;
  adminNotice.classList.remove("is-info", "is-success", "is-error");
  adminNotice.classList.add(`is-${type}`);
}

function setAuthMessage(message, type = "info") {
  if (!adminAuthMessage) return;
  adminAuthMessage.textContent = message;
  adminAuthMessage.classList.remove("is-info", "is-success", "is-error");
  adminAuthMessage.classList.add(`is-${type}`);
}

function setAuthView(authenticated) {
  isAuthenticated = authenticated;
  if (adminAuthCard) adminAuthCard.hidden = authenticated;
  if (adminApp) adminApp.hidden = !authenticated;
  if (logoutAdminBtn) logoutAdminBtn.hidden = !authenticated;
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    const message = data?.message || "Erreur serveur.";
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

async function checkAuthStatus() {
  const data = await apiFetch("/api/admin/auth-status");
  return Boolean(data?.authenticated);
}

async function loginAdmin(password) {
  return apiFetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
}

async function logoutAdmin() {
  return apiFetch("/api/admin/logout", { method: "POST" });
}

function statusLabel(status) {
  const found = statusOptions.find((option) => option.value === status);
  return found ? found.label : status;
}

function renderKpis(dashboard) {
  document.getElementById("kpiProducts").textContent = String(dashboard.productsCount || 0);
  document.getElementById("kpiOrders").textContent = String(dashboard.ordersCount || 0);
  document.getElementById("kpiRevenue").textContent = formatPrice(dashboard.revenueTotal || 0);
  document.getElementById("kpiPending").textContent = String(dashboard.pendingOrders || 0);
}

function renderProducts(products) {
  if (!productsTableBody) return;
  if (!products.length) {
    productsTableBody.innerHTML = `
      <tr>
        <td colspan="5">Aucun produit disponible.</td>
      </tr>
    `;
    return;
  }

  productsTableBody.innerHTML = products.map((product) => `
    <tr>
      <td>#${product.id}</td>
      <td>${escapeHtml(product.name)}</td>
      <td>${escapeHtml(product.category)}</td>
      <td>${formatPrice(product.price)}</td>
      <td>
        <button class="ghost-mini btn-danger" data-delete-product-id="${product.id}">
          Supprimer
        </button>
      </td>
    </tr>
  `).join("");
}

function renderOrders(orders) {
  if (!ordersTableBody) return;
  if (!orders.length) {
    ordersTableBody.innerHTML = `
      <tr>
        <td colspan="6">Aucune commande enregistree.</td>
      </tr>
    `;
    return;
  }

  ordersTableBody.innerHTML = orders.map((order) => {
    const items = (order.items || []).map((item) => {
      const productName = item.productName || `Produit #${item.productId}`;
      return `${escapeHtml(productName)} x${item.quantity}`;
    }).join(", ");

    const optionsHtml = statusOptions.map((option) => `
      <option value="${option.value}" ${option.value === order.status ? "selected" : ""}>
        ${option.label}
      </option>
    `).join("");

    return `
      <tr>
        <td>#${order.id}</td>
        <td>
          <strong>${escapeHtml(order.customerName)}</strong><br />
          <span class="cell-muted">${escapeHtml(order.customerEmail)}</span>
        </td>
        <td>${formatPrice(order.total)}</td>
        <td>
          <span class="status-badge status-${escapeHtml(order.status)}">
            ${escapeHtml(statusLabel(order.status))}
          </span>
          <select class="status-select" data-order-status-id="${order.id}">
            ${optionsHtml}
          </select>
        </td>
        <td class="cell-muted">${escapeHtml(items || "Sans details")}</td>
        <td class="cell-muted">${formatDate(order.createdAt)}</td>
      </tr>
    `;
  }).join("");
}

function renderEvents(events) {
  if (!eventList) return;
  if (!events.length) {
    eventList.innerHTML = "<li class=\"activity-item\">Aucune activite recente.</li>";
    return;
  }

  eventList.innerHTML = events.map((event) => `
    <li class="activity-item">
      <strong>${escapeHtml(event.message)}</strong>
      <span>${formatDate(event.createdAt)}</span>
    </li>
  `).join("");
}

async function loadDashboard() {
  const [dashboard, products, orders] = await Promise.all([
    apiFetch("/api/admin/dashboard"),
    apiFetch("/api/admin/products"),
    apiFetch("/api/admin/orders")
  ]);

  renderKpis(dashboard);
  renderProducts(products);
  renderOrders(orders);
  renderEvents(dashboard.recentEvents || []);
}

async function refreshDashboardWithFeedback(message = "Actualisation des donnees...") {
  if (!isAuthenticated) return;
  try {
    setNotice(message, "info");
    await loadDashboard();
    setNotice("Donnees actualisees.", "success");
  } catch (error) {
    if (error.status === 401) {
      setAuthView(false);
      setAuthMessage("Session admin expiree. Reconnectez-vous.", "error");
      return;
    }
    setNotice(error.message, "error");
  }
}

async function handleAddProduct(event) {
  event.preventDefault();
  const payload = {
    name: document.getElementById("productName").value.trim(),
    category: document.getElementById("productCategory").value,
    price: Number(document.getElementById("productPrice").value),
    image: document.getElementById("productImage").value.trim(),
    description: document.getElementById("productDescription").value.trim()
  };

  try {
    setNotice("Ajout du produit en cours...", "info");
    await apiFetch("/api/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    productForm.reset();
    await loadDashboard();
    setNotice("Produit ajoute avec succes.", "success");
  } catch (error) {
    if (error.status === 401) {
      setAuthView(false);
      setAuthMessage("Session admin expiree. Reconnectez-vous.", "error");
      return;
    }
    setNotice(error.message, "error");
  }
}

async function handleDeleteProduct(productId) {
  try {
    setNotice("Suppression du produit en cours...", "info");
    await apiFetch(`api/admin/products/${productId}`, { method: "DELETE" });
    await loadDashboard();
    setNotice("Produit supprime.", "success");
  } catch (error) {
    if (error.status === 401) {
      setAuthView(false);
      setAuthMessage("Session admin expiree. Reconnectez-vous.", "error");
      return;
    }
    setNotice(error.message, "error");
  }
}

async function handleOrderStatusChange(orderId, status) {
  try {
    setNotice("Mise a jour du statut commande...", "info");
    await apiFetch(`api/admin/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    await loadDashboard();
    setNotice("Statut commande mis a jour.", "success");
  } catch (error) {
    if (error.status === 401) {
      setAuthView(false);
      setAuthMessage("Session admin expiree. Reconnectez-vous.", "error");
      return;
    }
    setNotice(error.message, "error");
  }
}

function bindEvents() {
  if (refreshAdminBtn) {
    refreshAdminBtn.addEventListener("click", () => {
      refreshDashboardWithFeedback("Actualisation des donnees...");
    });
  }

  if (logoutAdminBtn) {
    logoutAdminBtn.addEventListener("click", async () => {
      try {
        await logoutAdmin();
      } finally {
        setAuthView(false);
        setAuthMessage("Vous etes deconnecte.", "info");
      }
    });
  }

  if (adminLoginForm) {
    adminLoginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const password = adminPassword?.value || "";
      try {
        setAuthMessage("Connexion en cours...", "info");
        await loginAdmin(password);
        if (adminPassword) adminPassword.value = "";
        setAuthView(true);
        setAuthMessage("");
        await refreshDashboardWithFeedback("Chargement du panneau admin...");
      } catch (error) {
        setAuthMessage(error.message, "error");
      }
    });
  }

  if (productForm) {
    productForm.addEventListener("submit", handleAddProduct);
  }

  if (productsTableBody) {
    productsTableBody.addEventListener("click", async (event) => {
      const target = event.target.closest("[data-delete-product-id]");
      if (!target) return;
      const productId = Number(target.dataset.deleteProductId);
      if (!Number.isInteger(productId)) return;
      const confirmDelete = window.confirm("Supprimer ce produit ?");
      if (!confirmDelete) return;
      await handleDeleteProduct(productId);
    });
  }

  if (ordersTableBody) {
    ordersTableBody.addEventListener("change", async (event) => {
      const target = event.target.closest("[data-order-status-id]");
      if (!target) return;
      const orderId = Number(target.dataset.orderStatusId);
      if (!Number.isInteger(orderId)) return;
      await handleOrderStatusChange(orderId, target.value);
    });
  }
}

async function bootAdmin() {
  bindEvents();
  try {
    const authenticated = await checkAuthStatus();
    setAuthView(authenticated);
    if (authenticated) {
      await refreshDashboardWithFeedback("Chargement du panneau admin...");
    } else {
      setAuthMessage("Connexion admin requise.", "info");
    }
  } catch (error) {
    setAuthView(false);
    setAuthMessage(error.message, "error");
  }
}

bootAdmin();

