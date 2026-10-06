import crypto from "node:crypto";
import { all, one, run, tx } from "../db/database.js";
import { config } from "../config.js";
import { getProductsByIds } from "./products.js";
import { HttpError } from "../middleware/http.js";

const GUEST_COOKIE = "vt_cart";
export const MAX_QTY = 20;

/** Find (or create) the cart for this request: the user's cart when signed in, otherwise a guest cart keyed by cookie. */
export function resolveCart(req, res, { create = true } = {}) {
  if (req.cartId) return req.cartId;
  const id = findOrCreateCart(req, res, create);
  if (id) req.cartId = id;
  return id;
}

function findOrCreateCart(req, res, create) {
  if (req.user) {
    let cart = one("SELECT id FROM carts WHERE user_id = ?", req.user.id);
    if (!cart && create) cart = { id: Number(run("INSERT INTO carts (user_id) VALUES (?)", req.user.id).lastInsertRowid) };
    return cart?.id ?? null;
  }
  const token = req.cookies?.[GUEST_COOKIE];
  if (token) {
    const cart = one("SELECT id FROM carts WHERE guest_token = ?", token);
    if (cart) return cart.id;
  }
  if (!create) return null;
  const fresh = crypto.randomBytes(24).toString("base64url");
  const id = Number(run("INSERT INTO carts (guest_token) VALUES (?)", fresh).lastInsertRowid);
  res.cookie(GUEST_COOKIE, fresh, { httpOnly: true, sameSite: "lax", secure: config.isProd, maxAge: 30 * 864e5, path: "/" });
  return id;
}

/** After sign-in, fold the guest cart into the user's cart. */
export function mergeGuestCart(req, res, userId) {
  const token = req.cookies?.[GUEST_COOKIE];
  if (!token) return;
  const guest = one("SELECT id FROM carts WHERE guest_token = ?", token);
  res.clearCookie(GUEST_COOKIE, { path: "/" });
  if (!guest) return;
  tx(() => {
    let userCart = one("SELECT id FROM carts WHERE user_id = ?", userId);
    if (!userCart) userCart = { id: Number(run("INSERT INTO carts (user_id) VALUES (?)", userId).lastInsertRowid) };
    for (const it of all("SELECT product_id, quantity, interval_days FROM cart_items WHERE cart_id = ?", guest.id)) {
      run(`INSERT INTO cart_items (cart_id, product_id, quantity, interval_days) VALUES (?, ?, ?, ?)
           ON CONFLICT (cart_id, product_id) DO UPDATE SET quantity = MIN(?, quantity + excluded.quantity), interval_days = excluded.interval_days`,
        userCart.id, it.product_id, it.quantity, it.interval_days, MAX_QTY);
    }
    run("DELETE FROM carts WHERE id = ?", guest.id);
  });
}

/** Price per unit: subscriptions get the Subscribe & Save discount. */
export const unitPrice = (product, intervalDays) =>
  intervalDays ? Math.round((product.price * (100 - config.subscription.discountPct)) / 100) : product.price;

export function cartView(cartId) {
  if (!cartId) return { items: [], count: 0, subtotal: 0, hasSubscription: false };
  const rows = all("SELECT product_id, quantity, interval_days FROM cart_items WHERE cart_id = ?", cartId);
  const products = new Map(getProductsByIds(rows.map((r) => r.product_id)).map((p) => [p.id, p]));
  const items = rows
    .map((r) => ({ product: products.get(r.product_id), quantity: r.quantity, intervalDays: r.interval_days || 0 }))
    .filter((i) => i.product && i.product.isActive)
    .map((i) => {
      const price = unitPrice(i.product, i.intervalDays);
      return { ...i, unitPrice: price, lineTotal: price * i.quantity, available: i.product.stock >= i.quantity };
    });
  return {
    items,
    count: items.reduce((s, i) => s + i.quantity, 0),
    subtotal: items.reduce((s, i) => s + i.lineTotal, 0),
    hasSubscription: items.some((i) => i.intervalDays > 0),
    subscribeDiscountPct: config.subscription.discountPct,
  };
}

/**
 * Change a cart line. intervalDays: undefined keeps the line's current mode, 0 = buy once, 30/60/90 = subscribe.
 */
export function setItem(cartId, productId, quantity, { add = false, intervalDays } = {}) {
  const p = one("SELECT id, stock, is_active FROM products WHERE id = ?", productId);
  if (!p || !p.is_active) throw new HttpError(404, "ไม่พบสินค้านี้");
  if (intervalDays && !config.subscription.intervals.includes(intervalDays)) throw new HttpError(400, "รอบการจัดส่งไม่ถูกต้อง");
  const current = one("SELECT quantity, interval_days FROM cart_items WHERE cart_id = ? AND product_id = ?", cartId, productId);
  const next = Math.min(MAX_QTY, add ? (current?.quantity || 0) + quantity : quantity);
  if (next <= 0) {
    run("DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?", cartId, productId);
    return;
  }
  if (next > p.stock) throw new HttpError(409, p.stock ? `สินค้านี้เหลือเพียง ${p.stock} ชิ้น` : "สินค้าหมดชั่วคราว");
  const interval = intervalDays ?? current?.interval_days ?? 0;
  run(`INSERT INTO cart_items (cart_id, product_id, quantity, interval_days) VALUES (?, ?, ?, ?)
       ON CONFLICT (cart_id, product_id) DO UPDATE SET quantity = excluded.quantity, interval_days = excluded.interval_days`, cartId, productId, next, interval);
  run("UPDATE carts SET updated_at = datetime('now') WHERE id = ?", cartId);
}

export const clearCart = (cartId) => run("DELETE FROM cart_items WHERE cart_id = ?", cartId);
