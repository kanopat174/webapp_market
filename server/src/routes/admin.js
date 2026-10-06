import { Router } from "express";
import { z } from "zod";
import { all, one, run } from "../db/database.js";
import { requireAdmin } from "../middleware/auth.js";
import { HttpError, notFound, validate } from "../middleware/http.js";
import { getProductById, searchProducts } from "../services/products.js";
import { getOrder, NEXT_STATUS, publicOrder, STATUS_LABELS, updateStatus, expireUnpaidOrders } from "../services/orders.js";
import { deleteImage, imageUpload, saveImage } from "../services/uploads.js";
import { runSubscriptionRenewals, sendRunOutReminders } from "../services/subscriptions.js";

const r = Router();
r.use(requireAdmin);

/* ---------- product photos ---------- */
const productOr404 = (id) => {
  if (!one("SELECT id FROM products WHERE id = ?", id)) throw notFound("ไม่พบสินค้านี้");
  return id;
};

r.post("/products/:id/images", imageUpload.array("images", 10), (req, res) => {
  const id = productOr404(Number(req.params.id));
  if (!req.files?.length) throw new HttpError(400, "กรุณาเลือกรูปภาพ");
  if (one("SELECT COUNT(*) AS n FROM product_images WHERE product_id = ?", id).n + req.files.length > 12) {
    throw new HttpError(400, "สินค้าหนึ่งชิ้นมีรูปได้สูงสุด 12 รูป");
  }
  const urls = req.files.map(saveImage); // checks every file before inserting any row
  let sort = one("SELECT COALESCE(MAX(sort), -1) AS s FROM product_images WHERE product_id = ?", id).s;
  for (const url of urls) run("INSERT INTO product_images (product_id, url, sort) VALUES (?, ?, ?)", id, url, ++sort);
  res.status(201).json({ product: getProductById(id) });
});

r.put("/products/:id/images/order", validate(z.object({ ids: z.array(z.number().int()).max(12) })), (req, res) => {
  const id = productOr404(Number(req.params.id));
  req.body.ids.forEach((imageId, i) => run("UPDATE product_images SET sort = ? WHERE id = ? AND product_id = ?", i, imageId, id));
  res.json({ product: getProductById(id) });
});

r.delete("/products/:id/images/:imageId", (req, res) => {
  const id = productOr404(Number(req.params.id));
  const img = one("SELECT url FROM product_images WHERE id = ? AND product_id = ?", Number(req.params.imageId), id);
  if (!img) throw notFound("ไม่พบรูปนี้");
  run("DELETE FROM product_images WHERE id = ?", Number(req.params.imageId));
  deleteImage(img.url);
  res.json({ product: getProductById(id) });
});

/* ---------- email log, subscriptions, background jobs ---------- */
r.get("/emails", (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const total = one("SELECT COUNT(*) AS n FROM email_log").n;
  const emails = all("SELECT id, to_email AS toEmail, subject, kind, status, error, created_at AS createdAt FROM email_log ORDER BY id DESC LIMIT 30 OFFSET ?", (page - 1) * 30);
  res.json({ emails, total, page, pages: Math.max(1, Math.ceil(total / 30)) });
});

r.get("/emails/:id", (req, res) => {
  const e = one("SELECT html FROM email_log WHERE id = ?", Number(req.params.id));
  if (!e) throw notFound();
  res.json({ html: e.html });
});

r.get("/subscriptions", (_req, res) => {
  res.json({ subscriptions: all(`SELECT s.id, s.status, s.quantity, s.interval_days AS intervalDays, s.next_date AS nextDate, s.payment_method AS paymentMethod,
      s.discount_pct AS discountPct, s.email, s.ship_name AS name, p.name AS product, p.price FROM subscriptions s JOIN products p ON p.id = s.product_id
      ORDER BY s.status = 'cancelled', s.next_date LIMIT 200`) });
});

/** Run the scheduled jobs now (they also run automatically every 30 minutes). */
r.post("/jobs/run", (_req, res) => {
  res.json({ renewals: runSubscriptionRenewals(), reminders: sendRunOutReminders(), expired: expireUnpaidOrders(24) });
});

r.get("/stats", (_req, res) => {
  const revenue = one(`SELECT COALESCE(SUM(total),0) AS total, COUNT(*) AS n FROM orders
                       WHERE status != 'cancelled' AND (payment_status = 'paid' OR payment_method = 'cod')`);
  const today = one(`SELECT COALESCE(SUM(total),0) AS total, COUNT(*) AS n FROM orders
                     WHERE status != 'cancelled' AND date(created_at) = date('now')`);
  const byStatus = Object.fromEntries(all("SELECT status, COUNT(*) AS n FROM orders GROUP BY status").map((x) => [x.status, x.n]));
  const daily = all(`SELECT date(created_at) AS day, COALESCE(SUM(total),0) AS total, COUNT(*) AS orders FROM orders
                     WHERE status != 'cancelled' AND created_at >= date('now','-13 days') GROUP BY day ORDER BY day`);
  res.json({
    revenue: revenue.total, paidOrders: revenue.n, todayRevenue: today.total, todayOrders: today.n,
    customers: one("SELECT COUNT(*) AS n FROM users WHERE role = 'customer'").n,
    byStatus, daily,
    lowStock: all("SELECT id, slug, name, stock FROM products WHERE is_active = 1 AND stock <= 10 ORDER BY stock LIMIT 10"),
    topProducts: all(`SELECT oi.product_id AS id, oi.name, SUM(oi.quantity) AS qty, SUM(oi.quantity * oi.unit_price) AS revenue
                      FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status != 'cancelled'
                      GROUP BY oi.product_id ORDER BY qty DESC LIMIT 5`),
  });
});

/* ---------- products ---------- */
r.get("/products", (req, res) => {
  res.json(searchProducts({ q: String(req.query.q || ""), sort: "newest", page: Number(req.query.page) || 1, pageSize: 50, includeInactive: true }));
});

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "สีต้องเป็นรูปแบบ #RRGGBB");
const productSchema = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug ใช้ได้เฉพาะ a-z, 0-9 และ -").max(80),
  name: z.string().trim().min(2).max(120),
  brand: z.string().trim().min(1).max(60),
  category: z.string().trim().min(1),
  price: z.number().int().min(0).max(1e6),
  compareAtPrice: z.number().int().min(0).max(1e6).nullish(),
  size: z.string().trim().min(1).max(60),
  shape: z.enum(["bottle", "jar", "tub", "box"]).default("bottle"),
  colorBg: hex.default("#e9eee8"),
  colorAccent: hex.default("#1f6b57"),
  imageUrl: z.string().trim().url().max(500).nullish().or(z.literal("")),
  tags: z.array(z.string().trim().min(1).max(30)).max(12).default([]),
  ageMin: z.number().int().min(0).max(120).default(1),
  ageMax: z.number().int().min(0).max(120).default(100),
  gender: z.enum(["all", "female", "male"]).default("all"),
  description: z.string().trim().min(10).max(2000),
  ingredients: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  usage: z.string().trim().min(3).max(500),
  warnings: z.string().trim().max(500).nullish(),
  fdaNo: z.string().trim().max(40).nullish(),
  stock: z.number().int().min(0).max(1e6),
  daysSupply: z.number().int().min(1).max(365).nullish(),
  isActive: z.boolean().default(true),
}).refine((p) => p.ageMin <= p.ageMax, { message: "อายุต่ำสุดต้องไม่มากกว่าอายุสูงสุด", path: ["ageMax"] });

const productParams = (p) => [p.slug, p.name, p.brand, p.category, p.price, p.compareAtPrice ?? null, p.size, p.shape, p.colorBg, p.colorAccent,
  p.imageUrl || null, JSON.stringify(p.tags), p.ageMin, p.ageMax, p.gender, p.description, JSON.stringify(p.ingredients), p.usage,
  p.warnings ?? null, p.fdaNo ?? null, p.stock, p.isActive ? 1 : 0, p.daysSupply ?? null];

function assertCategory(slug) {
  if (!one("SELECT slug FROM categories WHERE slug = ?", slug)) throw new HttpError(400, "ไม่พบหมวดหมู่นี้");
}

r.post("/products", validate(productSchema), (req, res) => {
  assertCategory(req.body.category);
  if (one("SELECT id FROM products WHERE slug = ?", req.body.slug)) throw new HttpError(409, "slug นี้ถูกใช้แล้ว");
  const id = Number(run(`INSERT INTO products (slug, name, brand, category, price, compare_at_price, size, shape, color_bg, color_accent, image_url,
      tags, age_min, age_max, gender, description, ingredients, usage, warnings, fda_no, stock, is_active, days_supply)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, ...productParams(req.body)).lastInsertRowid);
  res.status(201).json({ product: getProductById(id) });
});

r.put("/products/:id", validate(productSchema), (req, res) => {
  const id = Number(req.params.id);
  if (!one("SELECT id FROM products WHERE id = ?", id)) throw notFound("ไม่พบสินค้านี้");
  assertCategory(req.body.category);
  if (one("SELECT id FROM products WHERE slug = ? AND id != ?", req.body.slug, id)) throw new HttpError(409, "slug นี้ถูกใช้แล้ว");
  run(`UPDATE products SET slug = ?, name = ?, brand = ?, category = ?, price = ?, compare_at_price = ?, size = ?, shape = ?, color_bg = ?,
       color_accent = ?, image_url = ?, tags = ?, age_min = ?, age_max = ?, gender = ?, description = ?, ingredients = ?, usage = ?, warnings = ?,
       fda_no = ?, stock = ?, is_active = ?, days_supply = ?, updated_at = datetime('now') WHERE id = ?`, ...productParams(req.body), id);
  res.json({ product: getProductById(id) });
});

/** Products that appear in orders are hidden instead of deleted, so order history stays intact. */
r.delete("/products/:id", (req, res) => {
  const id = Number(req.params.id);
  if (one("SELECT 1 FROM order_items WHERE product_id = ? LIMIT 1", id)) {
    run("UPDATE products SET is_active = 0, updated_at = datetime('now') WHERE id = ?", id);
    return res.json({ ok: true, archived: true });
  }
  const photos = all("SELECT url FROM product_images WHERE product_id = ?", id);
  run("DELETE FROM products WHERE id = ?", id);
  photos.forEach((p) => deleteImage(p.url));
  res.json({ ok: true, archived: false });
});

/* ---------- orders ---------- */
r.get("/orders", validate(z.object({
  status: z.enum(Object.keys(STATUS_LABELS)).optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
}), "query"), (req, res) => {
  const { status, q, page = 1 } = req.validQuery;
  const where = [];
  const params = [];
  if (status) { where.push("status = ?"); params.push(status); }
  if (q) { where.push("(order_no LIKE ? OR email LIKE ? OR ship_name LIKE ? OR ship_phone LIKE ?)"); params.push(...Array(4).fill(`%${q}%`)); }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const pageSize = 25;
  const total = one(`SELECT COUNT(*) AS n FROM orders ${clause}`, ...params).n;
  const rows = all(`SELECT id FROM orders ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize);
  res.json({ orders: rows.map(({ id }) => publicOrder(getOrder(id))), total, page, pages: Math.max(1, Math.ceil(total / pageSize)), statusLabels: STATUS_LABELS, nextStatus: NEXT_STATUS });
});

r.patch("/orders/:id", validate(z.object({
  status: z.enum(Object.keys(STATUS_LABELS)),
  trackingNo: z.string().trim().max(40).optional(),
  note: z.string().trim().max(200).optional(),
})), (req, res) => {
  res.json({ order: publicOrder(updateStatus(Number(req.params.id), req.body.status, req.body)) });
});

/* ---------- coupons ---------- */
r.get("/coupons", (_req, res) => res.json({ coupons: all("SELECT * FROM coupons ORDER BY code") }));

r.put("/coupons/:code", validate(z.object({
  description: z.string().trim().min(2).max(120),
  kind: z.enum(["percent", "amount"]),
  value: z.number().int().min(1).max(100000),
  minSubtotal: z.number().int().min(0).default(0),
  maxDiscount: z.number().int().min(1).nullish(),
  isActive: z.boolean().default(true),
  expiresAt: z.string().nullish(),
}).refine((c) => c.kind !== "percent" || c.value <= 100, { message: "เปอร์เซ็นต์ต้องไม่เกิน 100", path: ["value"] })), (req, res) => {
  const code = req.params.code.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,30}$/.test(code)) throw new HttpError(400, "โค้ดใช้ได้เฉพาะ A-Z และ 0-9 ยาว 3-30 ตัว");
  const c = req.body;
  run(`INSERT INTO coupons (code, description, kind, value, min_subtotal, max_discount, is_active, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (code) DO UPDATE SET description = excluded.description, kind = excluded.kind, value = excluded.value,
       min_subtotal = excluded.min_subtotal, max_discount = excluded.max_discount, is_active = excluded.is_active, expires_at = excluded.expires_at`,
    code, c.description, c.kind, c.value, c.minSubtotal, c.maxDiscount ?? null, c.isActive ? 1 : 0, c.expiresAt || null);
  res.json({ coupon: one("SELECT * FROM coupons WHERE code = ?", code) });
});

export default r;
