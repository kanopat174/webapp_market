import bcrypt from "bcryptjs";
import { pathToFileURL } from "node:url";
import { db, one, run, tx } from "./database.js";
import { config } from "../config.js";
import { CATEGORIES, PRODUCTS, COUPONS, DAYS_SUPPLY } from "../data/catalog.js";

/** Fill an empty database with the starter catalogue and an admin account. Safe to call on every boot. */
export function seedIfEmpty({ reset = false } = {}) {
  if (reset) {
    db.exec(`DELETE FROM order_events; DELETE FROM order_items; DELETE FROM orders; DELETE FROM cart_items; DELETE FROM carts;
             DELETE FROM reviews; DELETE FROM products; DELETE FROM categories; DELETE FROM coupons;`);
  }
  const hasProducts = one("SELECT COUNT(*) AS n FROM products").n > 0;

  tx(() => {
    if (!hasProducts) {
      CATEGORIES.forEach(([slug, name], i) => run("INSERT OR REPLACE INTO categories (slug, name, sort) VALUES (?, ?, ?)", slug, name, i));
      const insP = db.prepare(`INSERT INTO products (slug, name, brand, category, price, compare_at_price, size, shape, color_bg, color_accent,
        tags, age_min, age_max, gender, description, ingredients, usage, warnings, stock, sold)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      const insR = db.prepare(`INSERT INTO reviews (product_id, display_name, age, rating, body, verified, is_sample) VALUES (?, ?, ?, ?, ?, 1, 1)`);
      for (const p of PRODUCTS) {
        const { lastInsertRowid: id } = insP.run(p.slug, p.name, p.brand, p.category, p.price, p.compare, p.size, p.shape, p.c[0], p.c[1],
          JSON.stringify(p.tags), p.age[0], p.age[1], p.gender, p.description, JSON.stringify(p.ingredients), p.usage,
          "ผู้ตั้งครรภ์ ให้นมบุตร หรือมีโรคประจำตัว ควรปรึกษาแพทย์ก่อนรับประทาน", p.stock, p.sold);
        for (const r of p.reviews) insR.run(id, r.name, r.age, r.rating, r.body);
      }
      for (const c of COUPONS) {
        run("INSERT OR REPLACE INTO coupons (code, description, kind, value, min_subtotal, max_discount) VALUES (?, ?, ?, ?, ?, ?)",
          c.code, c.description, c.kind, c.value, c.min, c.max);
      }
    }
    // fill package duration for starter products (also upgrades databases created before this column existed)
    for (const [slug, days] of Object.entries(DAYS_SUPPLY)) run("UPDATE products SET days_supply = ? WHERE slug = ? AND days_supply IS NULL", days, slug);
    if (!one("SELECT id FROM users WHERE role = 'admin' LIMIT 1")) {
      run("INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, 'admin')",
        config.admin.email, bcrypt.hashSync(config.admin.password, 12), "ผู้ดูแลร้าน");
    }
  });
  return { seeded: !hasProducts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = seedIfEmpty({ reset: process.argv.includes("--reset") });
  console.log(out.seeded ? "Seeded catalogue." : "Catalogue already present.", `Admin: ${config.admin.email}`);
}
