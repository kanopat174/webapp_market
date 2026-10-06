import { Router, raw } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { all, one } from "../db/database.js";
import { config } from "../config.js";
import { requireUser } from "../middleware/auth.js";
import { HttpError, notFound, validate } from "../middleware/http.js";
import { cartView, resolveCart, setItem, MAX_QTY } from "../services/cart.js";
import { createOrder, getOrder, getOrderByNo, markPaid, publicOrder, quote, STATUS_LABELS } from "../services/orders.js";
import { onlinePaymentAvailable, paymentInfo, parseStripeEvent, startPayment } from "../services/payments.js";
import { recommend, aiStatus } from "../services/ai.js";
import { getProductsByIds } from "../services/products.js";
import { listSubscriptions, runningLow, updateSubscription } from "../services/subscriptions.js";
import { buildPlan, QUIZ_GOALS } from "../services/quiz.js";

const r = Router();

/* ---------- cart ---------- */
const sendCart = (req, res) => res.json(cartView(resolveCart(req, res, { create: false })));

r.get("/cart", sendCart);

// 0 = buy once; 30/60/90 = Subscribe & Save
const intervalDays = z.union([z.literal(0), ...config.subscription.intervals.map((d) => z.literal(d))]);

r.post("/cart/items", validate(z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(MAX_QTY).default(1),
  intervalDays: intervalDays.optional(),
})), (req, res) => {
  setItem(resolveCart(req, res), req.body.productId, req.body.quantity, { add: true, intervalDays: req.body.intervalDays });
  sendCart(req, res);
});

/** Add several products at once (quiz result, "buy again"). Skips items that are out of stock. */
r.post("/cart/bulk", validate(z.object({
  items: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().min(1).max(MAX_QTY).default(1), intervalDays: intervalDays.optional() })).min(1).max(20),
})), (req, res) => {
  const cartId = resolveCart(req, res);
  const skipped = [];
  for (const it of req.body.items) {
    try { setItem(cartId, it.productId, it.quantity, { add: true, intervalDays: it.intervalDays }); } catch (e) { skipped.push({ productId: it.productId, reason: e.message }); }
  }
  res.json({ ...cartView(cartId), skipped });
});

r.put("/cart/items/:productId", validate(z.object({
  quantity: z.number().int().min(0).max(MAX_QTY),
  intervalDays: intervalDays.optional(),
})), (req, res) => {
  setItem(resolveCart(req, res), Number(req.params.productId), req.body.quantity, { intervalDays: req.body.intervalDays });
  sendCart(req, res);
});

r.delete("/cart/items/:productId", (req, res) => {
  const id = resolveCart(req, res, { create: false });
  if (id) setItem(id, Number(req.params.productId), 0);
  sendCart(req, res);
});

/* ---------- checkout ---------- */
r.get("/checkout/config", (_req, res) => res.json({
  payment: paymentInfo(),
  shop: config.shop,
  subscription: { discountPct: config.subscription.discountPct, intervals: config.subscription.intervals },
}));

r.post("/checkout/quote", validate(z.object({
  couponCode: z.string().trim().max(30).optional(),
  paymentMethod: z.enum(["card", "promptpay", "cod"]).optional(),
})), (req, res) => {
  const cart = cartView(resolveCart(req, res, { create: false }));
  res.json({ ...quote(cart.subtotal, req.body), cart });
});

const shippingSchema = z.object({
  name: z.string().trim().min(2, "กรุณากรอกชื่อผู้รับ").max(80),
  phone: z.string().trim().transform((s) => s.replace(/[\s-]/g, "")).pipe(z.string().regex(/^0\d{8,9}$/, "เบอร์โทรต้องเป็นตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0")),
  address: z.string().trim().min(8, "กรุณากรอกที่อยู่ให้ครบ").max(300),
  province: z.string().trim().min(2, "กรุณาเลือกจังหวัด").max(60),
  postcode: z.string().trim().regex(/^\d{5}$/, "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก"),
});

const orderLimiter = rateLimit({ windowMs: 10 * 60_000, limit: 15, standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "สั่งซื้อบ่อยเกินไป กรุณารอสักครู่" } });

r.post("/orders", orderLimiter, validate(z.object({
  email: z.string().trim().toLowerCase().email("อีเมลไม่ถูกต้อง").max(120),
  shipping: shippingSchema,
  paymentMethod: z.enum(["card", "promptpay", "cod"]),
  couponCode: z.string().trim().max(30).optional(),
  note: z.string().trim().max(300).optional(),
})), async (req, res) => {
  const cartId = resolveCart(req, res, { create: false });
  if (!cartId) throw new HttpError(400, "ตะกร้าว่าง กรุณาเลือกสินค้าก่อน");
  if (req.body.paymentMethod !== "cod" && !onlinePaymentAvailable()) {
    throw new HttpError(400, "ตอนนี้ร้านรับเฉพาะเก็บเงินปลายทาง กรุณาเลือกวิธีชำระเงินใหม่");
  }
  const order = createOrder({ cartId, user: req.user, ...req.body });
  let payment = null;
  if (order.paymentMethod !== "cod") payment = await startPayment(order);
  res.status(201).json({
    order: publicOrder(order),
    accessToken: order.accessToken,
    next: payment ? payment.url : `/orders/${order.orderNo}?t=${order.accessToken}`,
  });
});

/** Read an order: the signed-in owner, an admin, or anyone holding the order's access token (guest checkout). */
function readableOrder(req) {
  const order = getOrderByNo(req.params.orderNo);
  if (!order) throw notFound("ไม่พบคำสั่งซื้อ");
  const owner = req.user && (order.userId === req.user.id || req.user.role === "admin");
  const token = req.query.t || req.body?.t;
  if (!owner && token !== order.accessToken) throw notFound("ไม่พบคำสั่งซื้อ");
  return order;
}

r.get("/orders", requireUser, (req, res) => {
  const rows = all("SELECT id FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 100", req.user.id);
  res.json({ orders: rows.map(({ id }) => publicOrder(getOrder(id))) });
});

r.get("/orders/:orderNo", (req, res) => res.json({ order: publicOrder(readableOrder(req)), statusLabels: STATUS_LABELS }));

/** Resume payment for an unpaid order (e.g. after closing the payment page). */
r.post("/orders/:orderNo/pay", async (req, res) => {
  const order = readableOrder(req);
  if (order.paymentMethod === "cod" || order.paymentStatus !== "unpaid" || order.status !== "pending_payment") {
    throw new HttpError(409, "คำสั่งซื้อนี้ไม่ต้องชำระเงินเพิ่มแล้ว");
  }
  res.json({ next: (await startPayment(order)).url });
});

/** "Buy again": put every still-available item of a past order back in the cart. */
r.post("/orders/:orderNo/reorder", (req, res) => {
  const order = readableOrder(req);
  const cartId = resolveCart(req, res);
  const skipped = [];
  for (const it of order.items) {
    if (!it.productId) { skipped.push(it.name); continue; }
    try { setItem(cartId, it.productId, it.quantity, { add: true, intervalDays: 0 }); } catch { skipped.push(it.name); }
  }
  res.json({ ...cartView(cartId), skipped });
});

/* ---------- account: subscriptions & running low ---------- */
r.get("/account/subscriptions", requireUser, (req, res) => res.json({ subscriptions: listSubscriptions(req.user.id) }));

r.patch("/account/subscriptions/:id", requireUser, validate(z.object({
  action: z.enum(["pause", "resume", "skip", "cancel", "update"]),
  quantity: z.number().int().min(1).max(MAX_QTY).optional(),
  intervalDays: intervalDays.optional(),
  paymentMethod: z.enum(["card", "promptpay", "cod"]).optional(),
})), (req, res) => {
  res.json({ subscription: updateSubscription(req.user.id, Number(req.params.id), req.body) });
});

r.get("/account/running-low", requireUser, (req, res) => res.json({ items: runningLow(req.user.id) }));

/* ---------- health quiz ---------- */
r.get("/quiz/options", (_req, res) => res.json({ goals: Object.entries(QUIZ_GOALS).map(([value, g]) => ({ value, label: g.label })) }));

const quizLimiter = rateLimit({ windowMs: 10 * 60_000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "ทำแบบทดสอบบ่อยเกินไป กรุณารอสักครู่" } });

r.post("/quiz", quizLimiter, validate(z.object({
  gender: z.enum(["female", "male", ""]).default(""),
  age: z.number().int().min(4).max(110),
  goals: z.array(z.enum(Object.keys(QUIZ_GOALS))).min(1, "เลือกเป้าหมายอย่างน้อย 1 ข้อ").max(3, "เลือกได้สูงสุด 3 ข้อ"),
  sleep: z.enum(["good", "ok", "poor"]),
  exercise: z.enum(["none", "some", "often"]),
  screen: z.enum(["low", "mid", "high"]),
  diet: z.enum(["balanced", "busy", "plant"]),
  conditions: z.array(z.enum(["pregnant", "breastfeeding", "medication", "chronic"])).max(4).default([]),
  budget: z.number().int().min(0).max(100000).default(0),
})), async (req, res) => {
  res.json(await buildPlan(req.body));
});

/* ---------- payments ---------- */
// Sandbox gateway used in development when Stripe keys are not configured.
r.post("/payments/sandbox/:orderNo", (req, res) => {
  if (config.paymentMode !== "sandbox" || (config.isProd && process.env.ALLOW_SANDBOX_PAYMENTS !== "true")) throw notFound();
  const order = readableOrder(req);
  const outcome = req.body?.outcome === "fail" ? "fail" : "success";
  if (outcome === "success") markPaid(order.id, `SANDBOX-${Date.now()}`, "ชำระเงินสำเร็จ (ระบบทดสอบ)");
  res.json({ ok: outcome === "success", order: publicOrder(getOrder(order.id)) });
});

// Stripe calls this; mounted with a raw body parser in index.js so the signature can be verified.
export const stripeWebhook = [raw({ type: "application/json" }), (req, res) => {
  const event = parseStripeEvent(req.body, req.get("stripe-signature"));
  const session = event.data?.object;
  const orderId = Number(session?.metadata?.orderId);
  if (orderId && (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded")) {
    if (session.payment_status === "paid") markPaid(orderId, session.payment_intent || session.id, "ชำระเงินผ่าน Stripe สำเร็จ");
  }
  res.json({ received: true });
}];

/* ---------- AI assistant ---------- */
const chatLimiter = rateLimit({ windowMs: 60_000, limit: 12, standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "ส่งข้อความถี่เกินไป กรุณารอสักครู่" } });

r.get("/chat/status", (_req, res) => res.json(aiStatus()));

r.post("/chat", chatLimiter, validate(z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(1000),
  })).min(1).max(20)
    .refine((m) => m[0].role === "user" && m[m.length - 1].role === "user", "บทสนทนาต้องเริ่มและจบด้วยข้อความของผู้ใช้"),
  filters: z.object({
    age: z.number().int().min(1).max(120).nullish(),
    gender: z.enum(["female", "male"]).nullish(),
    budget: z.number().int().min(1).max(1e6).nullish(),
  }).default({}),
})), async (req, res) => {
  const history = req.body.messages.slice(-12);
  while (history[0].role !== "user") history.shift();
  const out = await recommend(history, req.body.filters);
  const byId = new Map(getProductsByIds(out.productIds).map((p) => [p.id, p]));
  res.json({ reply: out.reply, products: out.productIds.map((id) => byId.get(id)).filter(Boolean), source: out.source });
});

export default r;
