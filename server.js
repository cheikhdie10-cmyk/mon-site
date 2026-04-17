const crypto = require("crypto");
const path = require("path");
const express = require("express");
const { initDatabase, all, run } = require("./db");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const VALID_CATEGORIES = new Set(["mode", "tech", "maison"]);
const VALID_ORDER_STATUS = new Set(["nouvelle", "en_preparation", "expediee", "livree", "annulee"]);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "chdn-admin-2026";
const ADMIN_COOKIE_NAME = "chdn_admin_session";
const ADMIN_SESSION_DURATION_MS = 1000 * 60 * 60 * 12;
const adminSessions = new Map();

app.use(express.json());
app.use(express.static(path.join(__dirname)));

function normalizeCategory(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  const parts = String(cookieHeader).split(";");
  for (const part of parts) {
    const [rawName, ...rest] = part.trim().split("=");
    if (!rawName || rest.length === 0) continue;
    const rawValue = rest.join("=");
    cookies[rawName] = decodeURIComponent(rawValue);
  }
  return cookies;
}

function getAdminTokenFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[ADMIN_COOKIE_NAME];
}

function cleanupExpiredAdminSessions() {
  const now = Date.now();
  for (const [token, session] of adminSessions.entries()) {
    if (session.expiresAt <= now) {
      adminSessions.delete(token);
    }
  }
}

function createAdminSession() {
  cleanupExpiredAdminSessions();
  const token = crypto.randomBytes(32).toString("hex");
  adminSessions.set(token, {
    createdAt: Date.now(),
    expiresAt: Date.now() + ADMIN_SESSION_DURATION_MS
  });
  return token;
}

function setAdminCookie(res, token) {
  const maxAgeSec = Math.floor(ADMIN_SESSION_DURATION_MS / 1000);
  res.setHeader(
    "Set-Cookie",
    `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}`
  );
}

function clearAdminCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${ADMIN_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

function isAuthenticatedAdmin(req) {
  cleanupExpiredAdminSessions();
  const token = getAdminTokenFromRequest(req);
  if (!token) return false;
  const session = adminSessions.get(token);
  if (!session) return false;
  if (session.expiresAt <= Date.now()) {
    adminSessions.delete(token);
    return false;
  }
  return true;
}

function requireAdmin(req, res, next) {
  if (!isAuthenticatedAdmin(req)) {
    return res.status(401).json({ message: "Authentification admin requise." });
  }
  next();
}

async function logAdminEvent(type, message, meta = {}) {
  try {
    await run(
      "INSERT INTO admin_events (type, message, meta) VALUES (?, ?, ?)",
      [type, message, JSON.stringify(meta)]
    );
  } catch (error) {
    console.error("Erreur journal admin:", error.message);
  }
}

app.post("/api/admin/login", async (req, res) => {
  try {
    const password = String(req.body.password || "");
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ message: "Mot de passe admin invalide." });
    }

    const token = createAdminSession();
    setAdminCookie(res, token);
    await logAdminEvent("admin_login", "Connexion admin reussie");
    res.json({ message: "Connexion admin reussie." });
  } catch (error) {
    res.status(500).json({ message: "Erreur serveur connexion admin." });
  }
});

app.get("/api/admin/auth-status", (req, res) => {
  res.json({ authenticated: isAuthenticatedAdmin(req) });
});

app.post("/api/admin/logout", async (req, res) => {
  try {
    const token = getAdminTokenFromRequest(req);
    if (token) adminSessions.delete(token);
    clearAdminCookie(res);
    await logAdminEvent("admin_logout", "Deconnexion admin");
    res.json({ message: "Deconnexion admin reussie." });
  } catch (error) {
    res.status(500).json({ message: "Erreur serveur deconnexion admin." });
  }
});

app.get("/api/products", async (req, res) => {
  try {
    const category = normalizeCategory(req.query.category);
    const sql = category && category !== "all"
      ? "SELECT * FROM products WHERE category = ? ORDER BY id DESC"
      : "SELECT * FROM products ORDER BY id DESC";
    const params = category && category !== "all" ? [category] : [];
    const products = await all(sql, params);
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: "Erreur serveur lors du chargement des produits." });
  }
});

app.post("/api/orders", async (req, res) => {
  try {
    const { customerName, customerEmail, items } = req.body;
    const safeName = String(customerName || "").trim();
    const safeEmail = String(customerEmail || "").trim();

    if (!safeName || !safeEmail || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Donnees de commande invalides." });
    }

    const hasInvalidItem = items.some((item) =>
      !Number.isInteger(item.productId) || !Number.isInteger(item.quantity) || item.quantity <= 0
    );
    if (hasInvalidItem) {
      return res.status(400).json({ message: "Contenu du panier invalide." });
    }

    const productIds = [...new Set(items.map((item) => item.productId))];
    const placeholders = productIds.map(() => "?").join(",");
    const dbProducts = await all(
      `SELECT id, name, price FROM products WHERE id IN (${placeholders})`,
      productIds
    );

    if (dbProducts.length !== productIds.length) {
      return res.status(400).json({ message: "Certains produits n'existent plus." });
    }

    const priceMap = new Map(dbProducts.map((product) => [product.id, product.price]));
    const total = items.reduce((sum, item) => {
      const price = priceMap.get(item.productId) || 0;
      return sum + price * item.quantity;
    }, 0);

    const orderResult = await run(
      "INSERT INTO orders (customer_name, customer_email, total, status) VALUES (?, ?, ?, ?)",
      [safeName, safeEmail, total, "nouvelle"]
    );

    for (const item of items) {
      const productPrice = priceMap.get(item.productId) || 0;
      await run(
        "INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)",
        [orderResult.lastID, item.productId, item.quantity, productPrice]
      );
    }

    await logAdminEvent(
      "order_created",
      `Nouvelle commande #${orderResult.lastID} de ${safeName}`,
      { orderId: orderResult.lastID, total }
    );

    res.status(201).json({
      message: "Commande enregistree.",
      orderId: orderResult.lastID
    });
  } catch (error) {
    res.status(500).json({ message: "Erreur serveur lors de la commande." });
  }
});

app.get("/api/admin/dashboard", requireAdmin, async (req, res) => {
  try {
    const [productsRow] = await all("SELECT COUNT(*) AS count FROM products");
    const [ordersRow] = await all("SELECT COUNT(*) AS count FROM orders");
    const [revenueRow] = await all("SELECT COALESCE(SUM(total), 0) AS value FROM orders");
    const [pendingRow] = await all(
      "SELECT COUNT(*) AS count FROM orders WHERE status IN ('nouvelle', 'en_preparation')"
    );

    const recentOrders = await all(
      `SELECT
        id,
        customer_name AS customerName,
        customer_email AS customerEmail,
        total,
        status,
        created_at AS createdAt
      FROM orders
      ORDER BY id DESC
      LIMIT 8`
    );

    const recentEventsRaw = await all(
      `SELECT
        id,
        type,
        message,
        meta,
        created_at AS createdAt
      FROM admin_events
      ORDER BY id DESC
      LIMIT 12`
    );

    const recentEvents = recentEventsRaw.map((event) => {
      let meta = {};
      try {
        meta = JSON.parse(event.meta);
      } catch {
        meta = {};
      }
      return {
        id: event.id,
        type: event.type,
        message: event.message,
        meta,
        createdAt: event.createdAt
      };
    });

    res.json({
      productsCount: productsRow?.count || 0,
      ordersCount: ordersRow?.count || 0,
      revenueTotal: revenueRow?.value || 0,
      pendingOrders: pendingRow?.count || 0,
      recentOrders,
      recentEvents
    });
  } catch (error) {
    res.status(500).json({ message: "Erreur serveur dashboard admin." });
  }
});

app.get("/api/admin/products", requireAdmin, async (req, res) => {
  try {
    const products = await all(
      `SELECT
        id,
        name,
        category,
        price,
        image,
        description
      FROM products
      ORDER BY id DESC`
    );
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: "Erreur serveur produits admin." });
  }
});

app.post("/api/admin/products", requireAdmin, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const category = normalizeCategory(req.body.category);
    const price = Number(req.body.price);
    const image = String(req.body.image || "").trim();
    const description = String(req.body.description || "").trim();

    if (!name || !VALID_CATEGORIES.has(category) || !Number.isFinite(price) || price <= 0 || !image || !description) {
      return res.status(400).json({ message: "Donnees produit invalides." });
    }

    const result = await run(
      "INSERT INTO products (name, category, price, image, description) VALUES (?, ?, ?, ?, ?)",
      [name, category, price, image, description]
    );

    await logAdminEvent(
      "product_created",
      `Produit ajoute: ${name}`,
      { productId: result.lastID, category, price }
    );

    const [created] = await all("SELECT * FROM products WHERE id = ?", [result.lastID]);
    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ message: "Erreur serveur ajout produit." });
  }
});

app.delete("/api/admin/products/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "Identifiant produit invalide." });
    }

    const [existing] = await all("SELECT id, name FROM products WHERE id = ?", [id]);
    if (!existing) {
      return res.status(404).json({ message: "Produit introuvable." });
    }

    await run("DELETE FROM products WHERE id = ?", [id]);

    await logAdminEvent(
      "product_deleted",
      `Produit supprime: ${existing.name}`,
      { productId: id }
    );

    res.json({ message: "Produit supprime." });
  } catch (error) {
    res.status(500).json({ message: "Erreur serveur suppression produit." });
  }
});

app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  try {
    const orders = await all(
      `SELECT
        id,
        customer_name AS customerName,
        customer_email AS customerEmail,
        total,
        status,
        created_at AS createdAt
      FROM orders
      ORDER BY id DESC`
    );

    const items = await all(
      `SELECT
        oi.order_id AS orderId,
        oi.product_id AS productId,
        oi.quantity,
        oi.price,
        p.name AS productName
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id
      ORDER BY oi.id DESC`
    );

    const itemsByOrder = new Map();
    for (const item of items) {
      const list = itemsByOrder.get(item.orderId) || [];
      list.push(item);
      itemsByOrder.set(item.orderId, list);
    }

    const payload = orders.map((order) => ({
      ...order,
      items: itemsByOrder.get(order.id) || []
    }));

    res.json(payload);
  } catch (error) {
    res.status(500).json({ message: "Erreur serveur commandes admin." });
  }
});

app.patch("/api/admin/orders/:id/status", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = normalizeStatus(req.body.status);

    if (!Number.isInteger(id) || id <= 0 || !VALID_ORDER_STATUS.has(status)) {
      return res.status(400).json({ message: "Mise a jour statut invalide." });
    }

    const result = await run(
      "UPDATE orders SET status = ? WHERE id = ?",
      [status, id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ message: "Commande introuvable." });
    }

    await logAdminEvent(
      "order_status_updated",
      `Commande #${id} -> ${status}`,
      { orderId: id, status }
    );

    res.json({ message: "Statut commande mis a jour.", status });
  } catch (error) {
    res.status(500).json({ message: "Erreur serveur statut commande." });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`CHDN lance sur http://localhost:${PORT}`);
      console.log("Admin password active. Definissez ADMIN_PASSWORD en variable d'environnement.");
    });
  })
  .catch((error) => {
    console.error("Erreur initialisation base de donnees:", error);
    process.exit(1);
  });
