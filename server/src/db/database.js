import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "../config.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  category TEXT NOT NULL REFERENCES categories(slug),
  price INTEGER NOT NULL CHECK (price >= 0),
  compare_at_price INTEGER,
  size TEXT NOT NULL,
  shape TEXT NOT NULL DEFAULT 'bottle',
  color_bg TEXT NOT NULL DEFAULT '#e9eee8',
  color_accent TEXT NOT NULL DEFAULT '#1f6b57',
  image_url TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  age_min INTEGER NOT NULL DEFAULT 1,
  age_max INTEGER NOT NULL DEFAULT 100,
  gender TEXT NOT NULL DEFAULT 'all' CHECK (gender IN ('all','female','male')),
  description TEXT NOT NULL,
  ingredients TEXT NOT NULL DEFAULT '[]',
  usage TEXT NOT NULL,
  warnings TEXT,
  fda_no TEXT,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  sold INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  age INTEGER,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (product_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);

CREATE TABLE IF NOT EXISTS carts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  guest_token TEXT UNIQUE,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cart_items (
  cart_id INTEGER NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (cart_id, product_id)
);

CREATE TABLE IF NOT EXISTS coupons (
  code TEXT PRIMARY KEY COLLATE NOCASE,
  description TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('percent','amount')),
  value INTEGER NOT NULL,
  min_subtotal INTEGER NOT NULL DEFAULT 0,
  max_discount INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  order_no TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_payment','paid','processing','shipped','delivered','cancelled')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('card','promptpay','cod')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid','refunded','cod_pending')),
  payment_ref TEXT,
  subtotal INTEGER NOT NULL,
  discount INTEGER NOT NULL DEFAULT 0,
  shipping_fee INTEGER NOT NULL DEFAULT 0,
  cod_fee INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  coupon_code TEXT,
  ship_name TEXT NOT NULL,
  ship_phone TEXT NOT NULL,
  ship_address TEXT NOT NULL,
  ship_province TEXT NOT NULL,
  ship_postcode TEXT NOT NULL,
  note TEXT,
  tracking_no TEXT,
  access_token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);

CREATE TABLE IF NOT EXISTS order_items (
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  unit_price INTEGER NOT NULL,
  quantity INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

function open() {
  if (config.dbPath !== ":memory:") fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  const db = new DatabaseSync(config.dbPath);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

const MORE_TABLES = `
CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_product_images ON product_images(product_id, sort);

CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS email_log (
  id INTEGER PRIMARY KEY,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent','logged','failed')),
  error TEXT,
  html TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  interval_days INTEGER NOT NULL CHECK (interval_days IN (30, 60, 90)),
  discount_pct INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','cancelled')),
  next_date TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('card','promptpay','cod')),
  email TEXT NOT NULL,
  ship_name TEXT NOT NULL,
  ship_phone TEXT NOT NULL,
  ship_address TEXT NOT NULL,
  ship_province TEXT NOT NULL,
  ship_postcode TEXT NOT NULL,
  source_order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  last_order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
`;

/** Columns added after the first release. ALTER TABLE keeps existing shops' data. */
const ADDED_COLUMNS = [
  ["users", "token_version", "INTEGER NOT NULL DEFAULT 0"],
  ["products", "days_supply", "INTEGER"],
  ["cart_items", "interval_days", "INTEGER NOT NULL DEFAULT 0"],
  ["order_items", "interval_days", "INTEGER NOT NULL DEFAULT 0"],
  ["order_items", "remind_at", "TEXT"],
  ["order_items", "reminded_at", "TEXT"],
  ["orders", "subscription_id", "INTEGER"],
];

function migrate(db) {
  db.exec(MORE_TABLES);
  for (const [table, column, type] of ADDED_COLUMNS) {
    const has = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
    if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

export const db = open();

let depth = 0;
/** Run fn inside a transaction; rolls back on any throw. Nested calls use savepoints. */
export function tx(fn) {
  const sp = `sp${depth}`;
  db.exec(depth === 0 ? "BEGIN IMMEDIATE" : `SAVEPOINT ${sp}`);
  depth++;
  try {
    const out = fn();
    depth--;
    db.exec(depth === 0 ? "COMMIT" : `RELEASE ${sp}`);
    return out;
  } catch (err) {
    depth--;
    db.exec(depth === 0 ? "ROLLBACK" : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
    throw err;
  }
}

export const one = (sql, ...p) => db.prepare(sql).get(...p);
export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);
