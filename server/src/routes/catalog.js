import { Router } from "express";
import { z } from "zod";
import { all, one, run } from "../db/database.js";
import { requireUser } from "../middleware/auth.js";
import { HttpError, notFound, validate } from "../middleware/http.js";
import { getProductBySlug, listCategories, searchProducts, similarProducts } from "../services/products.js";
import { hasPurchased } from "../services/orders.js";

const r = Router();

const num = (min, max) => z.coerce.number().int().min(min).max(max).optional();

r.get("/categories", (_req, res) => res.json({ categories: listCategories() }));

r.get("/products", validate(z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().max(40).optional(),
  age: num(1, 120),
  gender: z.enum(["female", "male"]).optional(),
  minPrice: num(0, 1e6),
  maxPrice: num(0, 1e6),
  inStock: z.enum(["1", "true"]).optional(),
  sort: z.enum(["popular", "rating", "price_asc", "price_desc", "newest"]).optional(),
  page: num(1, 1000),
  pageSize: num(1, 60),
}), "query"), (req, res) => {
  const q = req.validQuery;
  res.json(searchProducts({ ...q, inStock: Boolean(q.inStock) }));
});

r.get("/products/:slug", (req, res) => {
  const product = getProductBySlug(req.params.slug);
  if (!product || !product.isActive) throw notFound("ไม่พบสินค้านี้");
  res.json({ product, similar: similarProducts(product) });
});

r.get("/products/:slug/reviews", validate(z.object({
  sort: z.enum(["newest", "highest", "lowest"]).optional(),
  page: num(1, 1000),
}), "query"), (req, res) => {
  const product = one("SELECT id FROM products WHERE slug = ?", req.params.slug);
  if (!product) throw notFound("ไม่พบสินค้านี้");
  const { sort = "newest", page = 1 } = req.validQuery;
  const order = { newest: "created_at DESC, id DESC", highest: "rating DESC, id DESC", lowest: "rating ASC, id DESC" }[sort];
  const pageSize = 10;
  const rows = all(`SELECT id, user_id, display_name, age, rating, body, verified, is_sample, created_at FROM reviews
                    WHERE product_id = ? ORDER BY ${order} LIMIT ? OFFSET ?`, product.id, pageSize, (page - 1) * pageSize);
  const stats = one("SELECT COUNT(*) AS count, AVG(rating) AS avg FROM reviews WHERE product_id = ?", product.id);
  const dist = Object.fromEntries([5, 4, 3, 2, 1].map((n) => [n, 0]));
  for (const d of all("SELECT rating, COUNT(*) AS n FROM reviews WHERE product_id = ? GROUP BY rating", product.id)) dist[d.rating] = d.n;
  res.json({
    reviews: rows.map((x) => ({
      id: x.id, name: x.display_name, age: x.age, rating: x.rating, body: x.body, verified: Boolean(x.verified),
      isSample: Boolean(x.is_sample), createdAt: x.created_at, mine: Boolean(req.user && x.user_id === req.user.id),
    })),
    summary: { count: stats.count, average: stats.avg ? Math.round(stats.avg * 10) / 10 : 0, distribution: dist },
    page, pages: Math.max(1, Math.ceil(stats.count / pageSize)),
    canReview: Boolean(req.user),
  });
});

r.post("/products/:slug/reviews", requireUser, validate(z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().min(10, "รีวิวต้องยาวอย่างน้อย 10 ตัวอักษร").max(1000),
  age: z.number().int().min(5).max(120).optional(),
  displayName: z.string().trim().min(1).max(40).optional(),
})), (req, res) => {
  const product = one("SELECT id FROM products WHERE slug = ? AND is_active = 1", req.params.slug);
  if (!product) throw notFound("ไม่พบสินค้านี้");
  const verified = hasPurchased(req.user.id, product.id) ? 1 : 0;
  const name = req.body.displayName || req.user.name;
  run(`INSERT INTO reviews (product_id, user_id, display_name, age, rating, body, verified) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (product_id, user_id) DO UPDATE SET display_name = excluded.display_name, age = excluded.age,
       rating = excluded.rating, body = excluded.body, verified = excluded.verified, created_at = datetime('now')`,
    product.id, req.user.id, name, req.body.age ?? null, req.body.rating, req.body.body, verified);
  res.status(201).json({ ok: true, verified: Boolean(verified) });
});

r.delete("/reviews/:id", requireUser, (req, res) => {
  const review = one("SELECT user_id FROM reviews WHERE id = ?", Number(req.params.id));
  if (!review) throw notFound();
  if (review.user_id !== req.user.id && req.user.role !== "admin") throw new HttpError(403, "ลบได้เฉพาะรีวิวของคุณเอง");
  run("DELETE FROM reviews WHERE id = ?", Number(req.params.id));
  res.json({ ok: true });
});

export default r;
