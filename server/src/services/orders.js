import crypto from "node:crypto";
import { all, one, run, tx } from "../db/database.js";
import { config } from "../config.js";
import { HttpError } from "../middleware/http.js";
import { cartView, clearCart } from "./cart.js";
import { queueEmail } from "./mailer.js";
import { cancelledEmail, orderPlacedEmail, paymentReceivedEmail, shippedEmail } from "./emails.js";

export const STATUS_LABELS = {
  pending_payment: "รอชำระเงิน",
  paid: "ชำระเงินแล้ว",
  processing: "กำลังเตรียมสินค้า",
  shipped: "จัดส่งแล้ว",
  delivered: "ได้รับสินค้าแล้ว",
  cancelled: "ยกเลิกแล้ว",
};

/** Allowed admin transitions. */
export const NEXT_STATUS = {
  pending_payment: ["paid", "processing", "cancelled"],
  paid: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

export function findCoupon(code) {
  if (!code) return null;
  const c = one("SELECT * FROM coupons WHERE code = ? AND is_active = 1", code.trim());
  if (!c) return null;
  // a date-only expiry lasts until the end of that day, Thailand time
  const expiry = c.expires_at && (c.expires_at.length === 10 ? new Date(`${c.expires_at}T23:59:59+07:00`) : new Date(c.expires_at));
  if (expiry && expiry < new Date()) return null;
  return c;
}

/** Compute every money figure server-side. Client totals are never trusted. */
export function quote(subtotal, { couponCode, paymentMethod } = {}) {
  let discount = 0;
  let coupon = null;
  let couponError = null;
  if (couponCode) {
    coupon = findCoupon(couponCode);
    if (!coupon) couponError = "ไม่พบโค้ดส่วนลดนี้ หรือโค้ดหมดอายุแล้ว";
    else if (subtotal < coupon.min_subtotal) {
      couponError = `โค้ดนี้ใช้ได้เมื่อซื้อครบ ฿${coupon.min_subtotal.toLocaleString("th-TH")}`;
      coupon = null;
    } else {
      discount = coupon.kind === "percent" ? Math.floor((subtotal * coupon.value) / 100) : coupon.value;
      if (coupon.max_discount) discount = Math.min(discount, coupon.max_discount);
      discount = Math.min(discount, subtotal);
    }
  }
  const afterDiscount = subtotal - discount;
  const shippingFee = subtotal === 0 || afterDiscount >= config.shop.freeShippingMin ? 0 : config.shop.shippingFee;
  const codFee = paymentMethod === "cod" ? config.shop.codFee : 0;
  return {
    subtotal, discount, shippingFee, codFee,
    total: afterDiscount + shippingFee + codFee,
    coupon: coupon ? { code: coupon.code, description: coupon.description } : null,
    couponError,
    freeShippingMin: config.shop.freeShippingMin,
  };
}

const orderNo = () => {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `VT${ymd}${crypto.randomInt(100000, 999999)}`;
};

export const isoDate = (d) => d.toISOString().slice(0, 10);
export const addDays = (date, days) => { const d = new Date(date); d.setUTCDate(d.getUTCDate() + days); return d; };

/**
 * Write one order: checks and reserves stock, prices are passed in already computed.
 * items: [{ product, quantity, unitPrice, intervalDays }]. Runs inside the caller's transaction if there is one.
 */
export function placeOrder({ items, user, email, shipping, paymentMethod, couponCode, note, subscriptionId = null }) {
  return tx(() => {
    if (!items.length) throw new HttpError(400, "ตะกร้าว่าง กรุณาเลือกสินค้าก่อน");
    for (const it of items) {
      const stock = one("SELECT stock FROM products WHERE id = ?", it.product.id).stock;
      if (stock < it.quantity) throw new HttpError(409, `${it.product.name} เหลือเพียง ${stock} ชิ้น กรุณาแก้ไขจำนวนในตะกร้า`);
    }
    const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const q = quote(subtotal, { couponCode, paymentMethod });
    if (couponCode && q.couponError) throw new HttpError(400, q.couponError);

    const status = paymentMethod === "cod" ? "processing" : "pending_payment";
    const paymentStatus = paymentMethod === "cod" ? "cod_pending" : "unpaid";
    const no = orderNo();
    const accessToken = crypto.randomBytes(24).toString("base64url");
    const id = Number(run(`INSERT INTO orders (order_no, user_id, email, status, payment_method, payment_status, subtotal, discount, shipping_fee,
        cod_fee, total, coupon_code, ship_name, ship_phone, ship_address, ship_province, ship_postcode, note, access_token, subscription_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      no, user?.id ?? null, email, status, paymentMethod, paymentStatus, q.subtotal, q.discount, q.shippingFee, q.codFee, q.total,
      q.coupon?.code ?? null, shipping.name, shipping.phone, shipping.address, shipping.province, shipping.postcode, note || null, accessToken,
      subscriptionId,
    ).lastInsertRowid);

    for (const it of items) {
      // one-time purchases get a "running low" reminder a few days before the supply should run out
      const remindAt = !it.intervalDays && it.product.daysSupply
        ? isoDate(addDays(new Date(), it.product.daysSupply * it.quantity - config.reminderLeadDays))
        : null;
      run("INSERT INTO order_items (order_id, product_id, name, unit_price, quantity, interval_days, remind_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        id, it.product.id, it.product.name, it.unitPrice, it.quantity, it.intervalDays || 0, remindAt);
      // reserve stock now; released again if the order is cancelled
      run("UPDATE products SET stock = stock - ?, sold = sold + ? WHERE id = ?", it.quantity, it.quantity, it.product.id);
    }
    run("INSERT INTO order_events (order_id, status, note) VALUES (?, ?, ?)", id, status,
      subscriptionId ? "คำสั่งซื้อรอบใหม่จากการสมัครรับประจำ"
        : paymentMethod === "cod" ? "สั่งซื้อแบบเก็บเงินปลายทาง" : "สร้างคำสั่งซื้อ รอชำระเงิน");
    return id;
  });
}

/** Checkout from the cart. Subscription lines also start a subscription (signed-in customers only). */
export function createOrder({ cartId, user, email, shipping, paymentMethod, couponCode, note }) {
  const id = tx(() => {
    const cart = cartView(cartId);
    if (cart.hasSubscription && !user) throw new HttpError(401, "กรุณาเข้าสู่ระบบเพื่อสมัครรับสินค้าประจำ");
    const orderId = placeOrder({ items: cart.items, user, email, shipping, paymentMethod, couponCode, note });
    for (const it of cart.items.filter((i) => i.intervalDays)) {
      run(`INSERT INTO subscriptions (user_id, product_id, quantity, interval_days, discount_pct, next_date, payment_method, email,
           ship_name, ship_phone, ship_address, ship_province, ship_postcode, source_order_id, last_order_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        user.id, it.product.id, it.quantity, it.intervalDays, config.subscription.discountPct,
        isoDate(addDays(new Date(), it.intervalDays)), paymentMethod, email,
        shipping.name, shipping.phone, shipping.address, shipping.province, shipping.postcode, orderId, orderId);
    }
    clearCart(cartId);
    return orderId;
  });
  const order = getOrder(id);
  queueEmail(orderPlacedEmail(order));
  return order;
}

export function getOrder(id) {
  const o = one("SELECT * FROM orders WHERE id = ?", id);
  if (!o) return null;
  return {
    id: o.id,
    orderNo: o.order_no,
    userId: o.user_id,
    email: o.email,
    status: o.status,
    statusLabel: STATUS_LABELS[o.status],
    paymentMethod: o.payment_method,
    paymentStatus: o.payment_status,
    subtotal: o.subtotal, discount: o.discount, shippingFee: o.shipping_fee, codFee: o.cod_fee, total: o.total,
    couponCode: o.coupon_code,
    subscriptionId: o.subscription_id,
    shipping: { name: o.ship_name, phone: o.ship_phone, address: o.ship_address, province: o.ship_province, postcode: o.ship_postcode },
    note: o.note,
    trackingNo: o.tracking_no,
    accessToken: o.access_token,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    items: all(`SELECT oi.product_id AS productId, oi.name, oi.unit_price AS unitPrice, oi.quantity, oi.interval_days AS intervalDays,
                p.slug, p.shape, p.color_bg, p.color_accent, p.image_url, p.brand,
                (SELECT url FROM product_images pi WHERE pi.product_id = oi.product_id ORDER BY sort, id LIMIT 1) AS photo
                FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`, id)
      .map((i) => ({ productId: i.productId, name: i.name, unitPrice: i.unitPrice, quantity: i.quantity, intervalDays: i.intervalDays,
        slug: i.slug, brand: i.brand, imageUrl: i.photo || i.image_url,
        art: i.shape ? { shape: i.shape, bg: i.color_bg, accent: i.color_accent } : null })),
    events: all("SELECT status, note, created_at AS at FROM order_events WHERE order_id = ? ORDER BY id", id)
      .map((e) => ({ ...e, label: STATUS_LABELS[e.status] || e.status })),
  };
}

export const getOrderByNo = (no) => {
  const row = one("SELECT id FROM orders WHERE order_no = ?", no);
  return row ? getOrder(row.id) : null;
};

/** Public view of an order: hide the access token. */
export const publicOrder = (o) => {
  if (!o) return o;
  const { accessToken, ...rest } = o;
  return rest;
};

export function markPaid(orderId, paymentRef, note = "ชำระเงินสำเร็จ") {
  const changed = tx(() => {
    const o = one("SELECT status, payment_status FROM orders WHERE id = ?", orderId);
    if (!o || o.payment_status === "paid") return false;
    if (o.status === "cancelled") {
      console.warn(`[payments] order ${orderId} was paid after it was cancelled; refund needed (ref ${paymentRef})`);
      run("INSERT INTO order_events (order_id, status, note) VALUES (?, 'cancelled', ?)", orderId, `ได้รับชำระเงินหลังยกเลิก ต้องคืนเงิน (อ้างอิง ${paymentRef})`);
      return false;
    }
    run(`UPDATE orders SET payment_status = 'paid', payment_ref = ?, status = CASE WHEN status = 'pending_payment' THEN 'paid' ELSE status END,
         updated_at = datetime('now') WHERE id = ?`, paymentRef, orderId);
    run("INSERT INTO order_events (order_id, status, note) VALUES (?, 'paid', ?)", orderId, note);
    return true;
  });
  if (changed) queueEmail(paymentReceivedEmail(getOrder(orderId)));
  return changed;
}

export function updateStatus(orderId, status, { note, trackingNo } = {}) {
  const order = tx(() => {
    const o = one("SELECT status, payment_method FROM orders WHERE id = ?", orderId);
    if (!o) throw new HttpError(404, "ไม่พบคำสั่งซื้อ");
    if (!NEXT_STATUS[o.status].includes(status)) {
      throw new HttpError(409, `เปลี่ยนสถานะจาก "${STATUS_LABELS[o.status]}" เป็น "${STATUS_LABELS[status]}" ไม่ได้`);
    }
    if (status === "cancelled") {
      for (const it of all("SELECT product_id, quantity FROM order_items WHERE order_id = ? AND product_id IS NOT NULL", orderId)) {
        run("UPDATE products SET stock = stock + ?, sold = MAX(0, sold - ?) WHERE id = ?", it.quantity, it.quantity, it.product_id);
      }
    }
    if (status === "delivered" && o.payment_method === "cod") {
      run("UPDATE orders SET payment_status = 'paid' WHERE id = ?", orderId);
    }
    run("UPDATE orders SET status = ?, tracking_no = COALESCE(?, tracking_no), updated_at = datetime('now') WHERE id = ?", status, trackingNo || null, orderId);
    run("INSERT INTO order_events (order_id, status, note) VALUES (?, ?, ?)", orderId, status, note || (trackingNo ? `เลขพัสดุ ${trackingNo}` : null));
    return getOrder(orderId);
  });
  if (status === "shipped") queueEmail(shippedEmail(order));
  if (status === "cancelled") queueEmail(cancelledEmail(order, note));
  return order;
}

/** Cancel card/PromptPay orders that were never paid, returning their stock. */
export function expireUnpaidOrders(hours = 24) {
  const stale = all(`SELECT id FROM orders WHERE status = 'pending_payment' AND payment_status = 'unpaid'
                     AND created_at < datetime('now', ?)`, `-${hours} hours`);
  for (const { id } of stale) updateStatus(id, "cancelled", { note: `ยกเลิกอัตโนมัติ: ไม่ได้ชำระเงินภายใน ${hours} ชั่วโมง` });
  return stale.length;
}

/** True when this user has a paid or COD order containing the product (for "verified buyer" reviews). */
export const hasPurchased = (userId, productId) => Boolean(one(
  `SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id = o.id
   WHERE o.user_id = ? AND oi.product_id = ? AND (o.payment_status = 'paid' OR o.status IN ('processing','shipped','delivered')) LIMIT 1`,
  userId, productId));
