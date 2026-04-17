const page = document.body.dataset.page;
const CART_KEY = "chdn_cart";
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const CAN_HOVER = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
let isUsingFallbackProducts = false;
const FALLBACK_PRODUCTS = [
  { id: 1, name: "Sneakers Alpha", category: "mode", price: 89.99, image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1000&q=80", description: "Confort premium et style urbain." },
  { id: 2, name: "Montre CHDN X", category: "tech", price: 149.0, image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1000&q=80", description: "Design moderne avec suivi intelligent." },
  { id: 3, name: "Casque Audio Pro", category: "tech", price: 79.0, image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1000&q=80", description: "Son immersif et reduction de bruit." },
  { id: 4, name: "Lampe Aura", category: "maison", price: 54.9, image: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1000&q=80", description: "Ambiance elegante pour votre interieur." },
  { id: 5, name: "Veste Momentum", category: "mode", price: 119.0, image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1000&q=80", description: "Coupe premium et materiaux durables." },
  { id: 6, name: "Chaise Minimal One", category: "maison", price: 129.0, image: "https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&w=1000&q=80", description: "Ergonomie et finition haut de gamme." }
];

function readCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch {
    return [];
  }
}

function writeCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function formatPrice(value) {
  return `${value.toFixed(2)} EUR`;
}

function setupRevealAnimations() {
  const elements = document.querySelectorAll("[data-reveal]");
  if (!elements.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  elements.forEach((el) => observer.observe(el));
}

function setupSurrealBackground() {
  if (document.querySelector(".surreal-bg")) return;

  const bg = document.createElement("div");
  bg.className = "surreal-bg";
  bg.innerHTML = `
    <span class="surreal-blob blob-a"></span>
    <span class="surreal-blob blob-b"></span>
    <span class="surreal-halo"></span>
  `;

  document.body.prepend(bg);
}

function setupPageEntrance() {
  requestAnimationFrame(() => {
    document.body.classList.add("is-loaded");
  });
}

function setupCurrentYear() {
  const target = document.getElementById("year");
  if (target) target.textContent = String(new Date().getFullYear());
}

function setupActiveMenu() {
  const links = document.querySelectorAll(".menu a");
  if (!links.length) return;
  const path = window.location.pathname.split("/").pop() || "index.html";
  links.forEach((link) => {
    const href = link.getAttribute("href");
    const isActive = href === path || (path === "" && href === "index.html");
    link.classList.toggle("active", isActive);
  });
}

function setupPageTransitions() {
  if (REDUCED_MOTION) return;
  if (document.querySelector(".page-wipe")) return;

  const wipe = document.createElement("div");
  wipe.className = "page-wipe";
  document.body.appendChild(wipe);

  document.querySelectorAll("a[href]").forEach((link) => {
    if (link.dataset.transitionBound === "true") return;

    const href = link.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("http")) return;

    link.dataset.transitionBound = "true";
    link.addEventListener("click", (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || link.target === "_blank") return;
      event.preventDefault();
      document.body.classList.add("is-leaving");
      wipe.classList.add("is-active");
      setTimeout(() => {
        window.location.href = href;
      }, 240);
    });
  });
}

function bindMagneticElement(element) {
  if (REDUCED_MOTION || !CAN_HOVER) return;
  if (element.dataset.magneticBound === "true") return;
  element.dataset.magneticBound = "true";
  element.classList.add("magnetic");

  let rafId = 0;
  let nextX = 0;
  let nextY = 0;

  const flush = () => {
    element.style.setProperty("--mx", `${nextX.toFixed(2)}px`);
    element.style.setProperty("--my", `${nextY.toFixed(2)}px`);
    rafId = 0;
  };

  element.addEventListener("pointermove", (event) => {
    const rect = element.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    nextX = px * 5;
    nextY = py * 3;

    if (!rafId) {
      rafId = requestAnimationFrame(flush);
    }
  });

  element.addEventListener("pointerleave", () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    element.style.setProperty("--mx", "0px");
    element.style.setProperty("--my", "0px");
  });
}

function setupMagneticHover(scope = document) {
  const selector = ".btn-primary, .btn-secondary, .checkout-btn, .cart-btn, .stat, .value-card, .info-card";
  scope.querySelectorAll(selector).forEach(bindMagneticElement);
}

function bindCartPanel() {
  const cartPanel = document.getElementById("cartPanel");
  const overlay = document.getElementById("overlay");
  const openCartBtn = document.getElementById("openCartBtn");
  const closeCartBtn = document.getElementById("closeCartBtn");
  const cartItemsContainer = document.getElementById("cartItems");
  const cartCount = document.getElementById("cartCount");
  const cartTotal = document.getElementById("cartTotal");

  if (!cartPanel || !overlay || !openCartBtn || !closeCartBtn) return;

  function renderCart() {
    let cart = readCart();
    const quantity = cart.reduce((sum, item) => sum + item.quantity, 0);
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    cartCount.textContent = String(quantity);
    cartTotal.textContent = formatPrice(total);

    if (!cart.length) {
      cartItemsContainer.innerHTML = "<p>Votre panier est vide.</p>";
      return;
    }

    cartItemsContainer.innerHTML = cart.map((item) => `
      <div class="cart-item">
        <div>
          <strong>${item.name}</strong>
          <p>${item.quantity} x ${formatPrice(item.price)}</p>
        </div>
        <button class="ghost-mini" data-remove-id="${item.id}">Retirer</button>
      </div>
    `).join("");

    document.querySelectorAll("[data-remove-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = Number(button.dataset.removeId);
        cart = readCart().filter((item) => item.id !== id);
        writeCart(cart);
        renderCart();
      });
    });
  }

  function openCart() {
    cartPanel.classList.add("open");
    overlay.classList.add("show");
  }

  function closeCart() {
    cartPanel.classList.remove("open");
    overlay.classList.remove("show");
  }

  openCartBtn.addEventListener("click", openCart);
  closeCartBtn.addEventListener("click", closeCart);
  overlay.addEventListener("click", closeCart);

  renderCart();
}

async function loadProducts(category = "all") {
  try {
    const response = await fetch(`/api/products?category=${encodeURIComponent(category)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Erreur API produits");
    isUsingFallbackProducts = false;
    return response.json();
  } catch {
    isUsingFallbackProducts = true;
    return category === "all"
      ? FALLBACK_PRODUCTS
      : FALLBACK_PRODUCTS.filter((product) => product.category === category);
  }
}

function addToCart(product) {
  const cart = readCart();
  const existing = cart.find((item) => item.id === product.id);
  if (existing) existing.quantity += 1;
  else cart.push({ id: product.id, name: product.name, price: product.price, quantity: 1 });
  writeCart(cart);
}

async function setupProductsPage() {
  const productGrid = document.getElementById("productGrid");
  if (!productGrid) return;
  const toolbarShell = document.querySelector(".toolbar-shell");

  const filterButtons = document.querySelectorAll(".filter-btn");
  let currentCategory = "all";

  async function render() {
    const products = await loadProducts(currentCategory);
    if (!products.length) {
      productGrid.innerHTML = "<p>Aucun produit trouve.</p>";
      return;
    }

    if (toolbarShell) {
      let warning = document.getElementById("apiWarning");
      if (!warning) {
        warning = document.createElement("p");
        warning.id = "apiWarning";
        warning.className = "api-warning";
        toolbarShell.appendChild(warning);
      }
      warning.textContent = isUsingFallbackProducts
        ? "Attention: connexion API indisponible. Affichage des produits de demonstration."
        : "";
    }

    productGrid.innerHTML = products.map((product, index) => `
      <article class="card" data-reveal style="transition-delay:${index * 40}ms">
        <img src="${product.image}" alt="${product.name}" loading="lazy" />
        <div class="card-content">
          <span class="chip">${product.category.toUpperCase()}</span>
          <h3>${product.name}</h3>
          <p class="meta">${product.description}</p>
          <div class="price-row">
            <strong>${formatPrice(product.price)}</strong>
            <button class="btn-primary" data-id="${product.id}">Ajouter</button>
          </div>
        </div>
      </article>
    `).join("");

    setupRevealAnimations();
    setupMagneticHover(productGrid);

    document.querySelectorAll(".btn-primary[data-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const product = products.find((p) => p.id === Number(button.dataset.id));
        if (!product) return;
        addToCart(product);
        window.location.href = "checkout.html";
      });
    });
  }

  filterButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      currentCategory = button.dataset.filter;
      filterButtons.forEach((btn) => btn.classList.toggle("active", btn === button));
      await render();
    });
  });

  await render();
}

function setupContactPage() {
  const form = document.getElementById("contactForm");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    window.location.href = "message-sent.html";
  });
}

function setupCheckoutPage() {
  const container = document.getElementById("checkoutItems");
  const total = document.getElementById("checkoutTotal");
  const form = document.getElementById("checkoutForm");
  if (!container || !total || !form) return;

  function renderCheckout() {
    const cart = readCart();
    if (!cart.length) {
      container.innerHTML = "<p>Votre panier est vide. Retournez a la page produits.</p>";
      total.textContent = formatPrice(0);
      return;
    }

    container.innerHTML = cart.map((item) => `
      <div class="line-item">
        <span>${item.name}</span>
        <span>${item.quantity} x ${formatPrice(item.price)}</span>
      </div>
    `).join("");

    const sum = cart.reduce((acc, item) => acc + item.quantity * item.price, 0);
    total.textContent = formatPrice(sum);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const cart = readCart();
    if (!cart.length) return;

    const customerName = document.getElementById("customerName").value.trim();
    const customerEmail = document.getElementById("customerEmail").value.trim();
    const items = cart.map((item) => ({ productId: item.id, quantity: item.quantity }));

    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerName, customerEmail, items })
    });

    const data = await response.json();
    if (response.ok) {
      writeCart([]);
      window.location.href = `success.html?orderId=${encodeURIComponent(data.orderId)}`;
    } else {
      alert(data.message || "Erreur commande.");
    }
  });

  renderCheckout();
}

function setupSuccessPage() {
  const orderTarget = document.getElementById("orderIdValue");
  if (!orderTarget) return;
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("orderId");
  orderTarget.textContent = orderId ? `#${orderId}` : "non disponible";
}

function setupFaqPage() {
  const items = Array.from(document.querySelectorAll(".faq-item"));
  if (!items.length) return;

  items.forEach((item) => {
    item.addEventListener("toggle", () => {
      if (!item.open) return;
      items.forEach((other) => {
        if (other !== item) other.open = false;
      });
    });
  });
}

function boot() {
  setupSurrealBackground();
  setupPageEntrance();
  setupPageTransitions();
  setupCurrentYear();
  setupActiveMenu();
  setupRevealAnimations();
  setupMagneticHover();
  bindCartPanel();
  if (page === "products") setupProductsPage();
  if (page === "contact") setupContactPage();
  if (page === "checkout") setupCheckoutPage();
  if (page === "success") setupSuccessPage();
  if (page === "faq") setupFaqPage();
}

boot();
