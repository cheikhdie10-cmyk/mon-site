const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const dbPath = path.join(__dirname, "chdn.db");
const schemaPath = path.join(__dirname, "schema.sql");

const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initDatabase() {
  const schema = fs.readFileSync(schemaPath, "utf8");

  await new Promise((resolve, reject) => {
    db.exec(schema, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  const orderColumns = await all("PRAGMA table_info(orders)");
  const hasStatusColumn = orderColumns.some((column) => column.name === "status");
  if (!hasStatusColumn) {
    await run("ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT 'nouvelle'");
  }

  await run(`
    CREATE TABLE IF NOT EXISTS admin_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      meta TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const countRows = await all("SELECT COUNT(*) AS count FROM products");
  const count = countRows[0]?.count ?? 0;

  if (count === 0) {
    const seedProducts = [
      ["Sneakers Alpha", "mode", 89.99, "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1000&q=80", "Confort premium et style urbain."],
      ["Montre CHDN X", "tech", 149.0, "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1000&q=80", "Design moderne avec suivi intelligent."],
      ["Casque Audio Pro", "tech", 79.0, "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1000&q=80", "Son immersif et reduction de bruit."],
      ["Lampe Aura", "maison", 54.9, "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1000&q=80", "Ambiance elegante pour votre interieur."],
      ["Veste Momentum", "mode", 119.0, "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1000&q=80", "Coupe premium et materiaux durables."],
      ["Chaise Minimal One", "maison", 129.0, "https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&w=1000&q=80", "Ergonomie et finition haut de gamme."]
    ];

    for (const product of seedProducts) {
      await run(
        "INSERT INTO products (name, category, price, image, description) VALUES (?, ?, ?, ?, ?)",
        product
      );
    }
  }
}

module.exports = {
  db,
  run,
  all,
  initDatabase
};
