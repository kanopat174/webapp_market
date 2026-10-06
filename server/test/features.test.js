import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

process.env.DB_PATH = ":memory:";
process.env.ANTHROPIC_API_KEY = "";
process.env.STRIPE_SECRET_KEY = "";
process.env.RESEND_API_KEY = "";
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "vitara-uploads-"));

const { createApp } = await import("../src/app.js");
const { seedIfEmpty } = await import("../src/db/seed.js");
const { one, run } = await import("../src/db/database.js");
const { runSubscriptionRenewals, sendRunOutReminders } = await import("../src/services/subscriptions.js");

let server;
let base;
before(async () => {
  seedIfEmpty();
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true }); });

function client() {
  const jar = new Map();
  const call = async (method, p, body, { raw } = {}) => {
    const headers = { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") };
    if (body && !raw) headers["content-type"] = "application/json";
    const res = await fetch(base + "/api" + p, { method, headers, body: raw ? body : body ? JSON.stringify(body) : undefined });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const [k, ...v] = pair.split("=");
      jar.set(k, v.join("="));
    }
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  return call;
}

const shipping = { name: "สมหญิง รักดี", phone: "0812345678", address: "88 ถนนนิมมานเหมินท์ ตำบลสุเทพ", province: "เชียงใหม่", postcode: "50200" };
const productBySlug = (slug) => one("SELECT * FROM products WHERE slug = ?", slug);
const lastEmail = (to, kind) => one("SELECT * FROM email_log WHERE to_email = ? AND kind = ? ORDER BY id DESC", to, kind);

test("forgot password: email with a one-time link resets the password and signs out other devices", async () => {
  const a = client();
  await a("POST", "/auth/register", { email: "reset@example.com", password: "Oldpass123", name: "ลืม รหัส" });
  assert.ok(lastEmail("reset@example.com", "welcome"), "welcome email logged");
  const other = client();
  await other("POST", "/auth/login", { email: "reset@example.com", password: "Oldpass123" });
  assert.ok((await other("GET", "/auth/me")).body.user);

  const unknown = await client()("POST", "/auth/forgot", { email: "nobody@example.com" });
  const known = await client()("POST", "/auth/forgot", { email: "reset@example.com" });
  assert.equal(unknown.body.message, known.body.message, "same answer for unknown emails");

  const token = /token=([\w-]+)/.exec(lastEmail("reset@example.com", "password_reset").html)[1];
  const bad = await client()("POST", "/auth/reset", { token: "x".repeat(40), password: "Newpass123" });
  assert.equal(bad.status, 400);
  const ok = await client()("POST", "/auth/reset", { token, password: "Newpass123" });
  assert.equal(ok.status, 200);
  const again = await client()("POST", "/auth/reset", { token, password: "Another123" });
  assert.equal(again.status, 400, "link works only once");

  assert.equal((await other("GET", "/auth/me")).body.user, null, "old session signed out");
  assert.equal((await client()("POST", "/auth/login", { email: "reset@example.com", password: "Newpass123" })).status, 200);
});

test("subscribe & save: discounted price, subscription created, renewal order and skip/pause", async () => {
  const api = client();
  const guest = client();
  const p = productBySlug("magnesium-glycinate-sleep");
  await guest("POST", "/cart/items", { productId: p.id, quantity: 1, intervalDays: 30 });
  const guestOrder = await guest("POST", "/orders", { email: "g@example.com", shipping, paymentMethod: "cod" });
  assert.equal(guestOrder.status, 401, "guests cannot subscribe");

  await api("POST", "/auth/register", { email: "sub@example.com", password: "Subpass123", name: "สมาชิก ประจำ" });
  const cart = await api("POST", "/cart/items", { productId: p.id, quantity: 2, intervalDays: 30 });
  assert.equal(cart.body.items[0].unitPrice, Math.round(p.price * 0.9));
  assert.equal(cart.body.hasSubscription, true);

  const order = await api("POST", "/orders", { email: "sub@example.com", shipping, paymentMethod: "cod" });
  assert.equal(order.status, 201, JSON.stringify(order.body));
  assert.equal(order.body.order.subtotal, Math.round(p.price * 0.9) * 2);
  assert.equal(order.body.order.items[0].intervalDays, 30);

  let subs = (await api("GET", "/account/subscriptions")).body.subscriptions;
  assert.equal(subs.length, 1);
  assert.equal(subs[0].quantity, 2);

  // nothing is due yet; move the delivery date into the lead window and run the job
  assert.equal(runSubscriptionRenewals(), 0);
  run("UPDATE subscriptions SET next_date = date('now', '+2 days') WHERE id = ?", subs[0].id);
  assert.equal(runSubscriptionRenewals(), 1);
  assert.equal(runSubscriptionRenewals(), 0, "running again does not create a duplicate");
  subs = (await api("GET", "/account/subscriptions")).body.subscriptions;
  assert.notEqual(subs[0].lastOrder.orderNo, order.body.order.orderNo);
  assert.ok(lastEmail("sub@example.com", "subscription_renewal"));

  const before = subs[0].nextDate;
  const skipped = await api("PATCH", `/account/subscriptions/${subs[0].id}`, { action: "skip" });
  assert.ok(skipped.body.subscription.nextDate > before);
  const paused = await api("PATCH", `/account/subscriptions/${subs[0].id}`, { action: "pause" });
  assert.equal(paused.body.subscription.status, "paused");
  const stranger = client();
  await stranger("POST", "/auth/register", { email: "x@example.com", password: "Xpass1234", name: "คนอื่น" });
  assert.equal((await stranger("PATCH", `/account/subscriptions/${subs[0].id}`, { action: "cancel" })).status, 404);
});

test("run-out reminder is emailed once and the item shows as running low", async () => {
  const api = client();
  await api("POST", "/auth/register", { email: "low@example.com", password: "Lowpass123", name: "ใกล้ หมด" });
  const p = productBySlug("psyllium-fiber-detox"); // 15-day supply
  await api("POST", "/cart/items", { productId: p.id, quantity: 1 });
  const order = await api("POST", "/orders", { email: "low@example.com", shipping, paymentMethod: "cod" });
  const remindAt = one("SELECT remind_at FROM order_items WHERE order_id = ?", order.body.order.id).remind_at;
  assert.ok(remindAt, "reminder date scheduled");

  run("UPDATE order_items SET remind_at = date('now', '-1 day') WHERE order_id = ?", order.body.order.id);
  assert.equal(sendRunOutReminders(), 1);
  assert.equal(sendRunOutReminders(), 0, "sent only once");
  assert.ok(lastEmail("low@example.com", "runout_reminder"));
  const low = await api("GET", "/account/running-low");
  assert.equal(low.body.items[0].product.slug, "psyllium-fiber-detox");

  const again = await api("POST", `/orders/${order.body.order.orderNo}/reorder`);
  assert.equal(again.body.items[0].product.slug, "psyllium-fiber-detox");
});

test("health quiz returns a set within budget, filtered by age, with a caution when needed", async () => {
  const api = client();
  const res = await api("POST", "/quiz", {
    gender: "female", age: 30, goals: ["skin_bright", "sleep"], sleep: "poor", exercise: "none", screen: "high", diet: "busy",
    conditions: ["pregnant"], budget: 1500,
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.source, "rules");
  assert.ok(res.body.items.length >= 2);
  assert.ok(res.body.monthlyTotal <= 1500);
  assert.ok(res.body.items.every((i) => i.product.ageMin <= 30 && i.product.ageMax >= 30));
  assert.ok(res.body.items.some((i) => i.product.slug === "magnesium-glycinate-sleep"));
  assert.match(res.body.caution, /ปรึกษาแพทย์/);
  const tooMany = await api("POST", "/quiz", { age: 30, goals: ["sleep", "eye", "gut", "hair"], sleep: "ok", exercise: "some", screen: "mid", diet: "balanced" });
  assert.equal(tooMany.status, 400);
});

test("admin uploads product photos; non-images are rejected", async () => {
  const admin = client();
  await admin("POST", "/auth/login", { email: "admin@vitara.local", password: "Admin@12345" });
  const p = productBySlug("biotin-hair-nail");
  // smallest valid PNG
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  const form = new FormData();
  form.append("images", new Blob([png], { type: "image/png" }), "a.png");
  form.append("images", new Blob([png], { type: "image/png" }), "b.png");
  const up = await admin("POST", `/admin/products/${p.id}/images`, form, { raw: true });
  assert.equal(up.status, 201, JSON.stringify(up.body));
  assert.equal(up.body.product.images.length, 2);
  assert.match(up.body.product.imageUrl, /^\/uploads\/[a-f0-9]+\.png$/);
  const served = await fetch(base + up.body.product.imageUrl);
  assert.equal(served.status, 200);

  const fake = new FormData();
  fake.append("images", new Blob(["<script>alert(1)</script>"], { type: "image/png" }), "evil.png");
  assert.equal((await admin("POST", `/admin/products/${p.id}/images`, fake, { raw: true })).status, 400);

  const [first, second] = up.body.product.images;
  const reordered = await admin("PUT", `/admin/products/${p.id}/images/order`, { ids: [second.id, first.id] });
  assert.equal(reordered.body.product.images[0].id, second.id);
  const removed = await admin("DELETE", `/admin/products/${p.id}/images/${first.id}`);
  assert.equal(removed.body.product.images.length, 1);

  const customer = client();
  assert.equal((await customer("POST", `/admin/products/${p.id}/images`, form, { raw: true })).status, 401);
});

test("order emails are logged for placement, shipping and cancellation", async () => {
  const api = client();
  const p = productBySlug("vita-c-1000-acerola");
  await api("POST", "/cart/items", { productId: p.id, quantity: 1 });
  const order = (await api("POST", "/orders", { email: "mail@example.com", shipping, paymentMethod: "cod" })).body.order;
  assert.ok(lastEmail("mail@example.com", "order_placed"));
  const admin = client();
  await admin("POST", "/auth/login", { email: "admin@vitara.local", password: "Admin@12345" });
  await admin("PATCH", `/admin/orders/${order.id}`, { status: "shipped", trackingNo: "TH999" });
  assert.match(lastEmail("mail@example.com", "order_shipped").html, /TH999/);
  const log = await admin("GET", "/admin/emails");
  assert.ok(log.body.emails.length > 0);
});
