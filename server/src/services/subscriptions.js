// Subscribe & Save. Cards are not stored, so each round is a normal order created a few days
// before the delivery date: COD rounds ship automatically, card/PromptPay rounds email a payment link.
import { all, one, run, tx } from "../db/database.js";
import { config } from "../config.js";
import { HttpError } from "../middleware/http.js";
import { getProductById } from "./products.js";
import { addDays, getOrder, isoDate, placeOrder } from "./orders.js";
import { unitPrice } from "./cart.js";
import { queueEmail } from "./mailer.js";
import { renewalEmail, runOutReminderEmail } from "./emails.js";

const STATUS_LABEL = { active: "กำลังใช้งาน", paused: "พักไว้", cancelled: "ยกเลิกแล้ว" };

function toSub(r) {
  const product = getProductById(r.product_id);
  return {
    id: r.id,
    status: r.status,
    statusLabel: STATUS_LABEL[r.status],
    quantity: r.quantity,
    intervalDays: r.interval_days,
    discountPct: r.discount_pct,
    nextDate: r.next_date,
    paymentMethod: r.payment_method,
    product,
    unitPrice: product ? Math.round((product.price * (100 - r.discount_pct)) / 100) : null,
    shipping: { name: r.ship_name, phone: r.ship_phone, address: r.ship_address, province: r.ship_province, postcode: r.ship_postcode },
    lastOrder: r.last_order_id ? (({ orderNo, status, statusLabel, total, createdAt }) => ({ orderNo, status, statusLabel, total, createdAt }))(getOrder(r.last_order_id)) : null,
    createdAt: r.created_at,
  };
}

export const listSubscriptions = (userId) =>
  all("SELECT * FROM subscriptions WHERE user_id = ? ORDER BY status = 'cancelled', next_date", userId).map(toSub);

/** Customer actions: pause, resume, skip one round, cancel, or change quantity / interval / payment method. */
export function updateSubscription(userId, id, change) {
  const s = one("SELECT * FROM subscriptions WHERE id = ? AND user_id = ?", id, userId);
  if (!s) throw new HttpError(404, "ไม่พบรายการสมัครรับประจำ");
  if (s.status === "cancelled") throw new HttpError(409, "รายการนี้ยกเลิกไปแล้ว");
  const today = isoDate(new Date());
  switch (change.action) {
    case "pause":
      run("UPDATE subscriptions SET status = 'paused', updated_at = datetime('now') WHERE id = ?", id);
      break;
    case "resume": {
      // resuming never schedules a delivery in the past
      const next = s.next_date < today ? isoDate(addDays(new Date(), config.subscription.leadDays + 1)) : s.next_date;
      run("UPDATE subscriptions SET status = 'active', next_date = ?, updated_at = datetime('now') WHERE id = ?", next, id);
      break;
    }
    case "skip":
      run("UPDATE subscriptions SET next_date = ?, updated_at = datetime('now') WHERE id = ?",
        isoDate(addDays(new Date(`${s.next_date}T00:00:00Z`), s.interval_days)), id);
      break;
    case "cancel":
      run("UPDATE subscriptions SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?", id);
      break;
    case "update": {
      const qty = change.quantity ?? s.quantity;
      const interval = change.intervalDays ?? s.interval_days;
      const method = change.paymentMethod ?? s.payment_method;
      if (!config.subscription.intervals.includes(interval)) throw new HttpError(400, "รอบการจัดส่งไม่ถูกต้อง");
      run("UPDATE subscriptions SET quantity = ?, interval_days = ?, payment_method = ?, updated_at = datetime('now') WHERE id = ?", qty, interval, method, id);
      break;
    }
    default:
      throw new HttpError(400, "คำสั่งไม่ถูกต้อง");
  }
  return toSub(one("SELECT * FROM subscriptions WHERE id = ?", id));
}

/** Create orders for subscriptions whose delivery date is within the lead time. Safe to run repeatedly. */
export function runSubscriptionRenewals(now = new Date()) {
  const horizon = isoDate(addDays(now, config.subscription.leadDays));
  const due = all("SELECT * FROM subscriptions WHERE status = 'active' AND next_date <= ?", horizon);
  let created = 0;
  for (const s of due) {
    const product = getProductById(s.product_id);
    if (!product?.isActive) {
      run("UPDATE subscriptions SET status = 'paused', updated_at = datetime('now') WHERE id = ?", s.id);
      continue;
    }
    if (product.stock < s.quantity) continue; // try again on the next run, when stock may be back
    const user = one("SELECT id FROM users WHERE id = ?", s.user_id);
    try {
      const orderId = tx(() => {
        const id = placeOrder({
          items: [{ product, quantity: s.quantity, unitPrice: unitPrice(product, s.interval_days), intervalDays: s.interval_days }],
          user, email: s.email, paymentMethod: s.payment_method, subscriptionId: s.id,
          shipping: { name: s.ship_name, phone: s.ship_phone, address: s.ship_address, province: s.ship_province, postcode: s.ship_postcode },
        });
        run("UPDATE subscriptions SET next_date = ?, last_order_id = ?, updated_at = datetime('now') WHERE id = ?",
          isoDate(addDays(new Date(`${s.next_date}T00:00:00Z`), s.interval_days)), id, s.id);
        return id;
      });
      created++;
      queueEmail(renewalEmail(getOrder(orderId), { productName: product.name, intervalDays: s.interval_days, discountPct: s.discount_pct }));
    } catch (err) {
      console.error(`[subscriptions] renewal for subscription ${s.id} failed:`, err.message);
    }
  }
  return created;
}

/**
 * Items from a customer's past one-time orders that are running low and were not bought again since.
 */
export function runningLow(userId, withinDays = 10) {
  const horizon = isoDate(addDays(new Date(), withinDays));
  return all(`SELECT oi.product_id AS productId, MAX(oi.remind_at) AS remindAt, o.created_at AS orderedAt
              FROM order_items oi JOIN orders o ON o.id = oi.order_id
              WHERE o.user_id = ? AND o.status != 'cancelled' AND oi.interval_days = 0 AND oi.remind_at IS NOT NULL AND oi.remind_at <= ?
                AND NOT EXISTS (SELECT 1 FROM order_items oi2 JOIN orders o2 ON o2.id = oi2.order_id
                                WHERE o2.user_id = o.user_id AND oi2.product_id = oi.product_id AND o2.status != 'cancelled' AND o2.created_at > o.created_at)
                AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = o.user_id AND s.product_id = oi.product_id AND s.status = 'active')
              GROUP BY oi.product_id ORDER BY remindAt`, userId, horizon)
    .map((r) => ({ product: getProductById(r.productId), remindAt: r.remindAt, orderedAt: r.orderedAt }))
    .filter((r) => r.product?.isActive);
}

/** Email customers whose one-time purchases are about to run out. One email per order, sent once. */
export function sendRunOutReminders(now = new Date()) {
  const today = isoDate(now);
  const due = all(`SELECT oi.rowid AS rid, oi.order_id, oi.product_id, oi.name, o.email, o.user_id, o.ship_name
                   FROM order_items oi JOIN orders o ON o.id = oi.order_id
                   WHERE oi.remind_at IS NOT NULL AND oi.remind_at <= ? AND oi.reminded_at IS NULL AND oi.interval_days = 0
                     AND o.status IN ('paid','processing','shipped','delivered')
                     AND NOT EXISTS (SELECT 1 FROM order_items oi2 JOIN orders o2 ON o2.id = oi2.order_id
                                     WHERE o2.email = o.email AND oi2.product_id = oi.product_id AND o2.status != 'cancelled' AND o2.created_at > o.created_at)`, today);
  const byOrder = new Map();
  for (const r of due) {
    if (!byOrder.has(r.order_id)) byOrder.set(r.order_id, { email: r.email, name: r.ship_name, items: [], rids: [] });
    byOrder.get(r.order_id).items.push({ name: r.name });
    byOrder.get(r.order_id).rids.push(r.rid);
  }
  for (const msg of byOrder.values()) {
    for (const rid of msg.rids) run("UPDATE order_items SET reminded_at = datetime('now') WHERE rowid = ?", rid);
    queueEmail(runOutReminderEmail(msg));
  }
  return byOrder.size;
}
