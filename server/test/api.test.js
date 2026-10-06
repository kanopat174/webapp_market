import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.DB_PATH = ":memory:";
process.env.ANTHROPIC_API_KEY = "";
process.env.STRIPE_SECRET_KEY = "";

const { createApp } = await import("../src/app.js");
const { seedIfEmpty } = await import("../src/db/seed.js");

let server;
let base;

before(async () => {
  seedIfEmpty();
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

/** Tiny client that keeps cookies, like a browser. */
function client() {
  const jar = new Map();
  return async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json", cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const [k, ...v] = pair.split("=");
      jar.set(k, v.join("="));
    }
    return { status: res.status, body: await res.json() };
  };
}

const shipping = { name: "สมชาย ใจดี", phone: "0812345678", address: "99/1 ถนนสุขุมวิท แขวงคลองเตย", province: "กรุงเทพมหานคร", postcode: "10110" };

test("search finds Thai keywords and filters by age", async () => {
  const api = client();
  const { body } = await api("GET", "/products?q=" + encodeURIComponent("ผิวขาว"));
  assert.ok(body.total >= 2);
  assert.ok(body.items.every((p) => p.tags.includes("ผิวขาว") || p.description.includes("ผิวขาว")));
  const kids = await api("GET", "/products?age=8");
  assert.ok(kids.body.items.every((p) => p.ageMin <= 8 && p.ageMax >= 8));
});

test("product detail includes similar products and reviews", async () => {
  const api = client();
  const { body } = await api("GET", "/products/gluta-bright-vitamin-c");
  assert.equal(body.product.slug, "gluta-bright-vitamin-c");
  assert.equal(body.similar.length, 4);
  assert.ok(!body.similar.some((p) => p.id === body.product.id));
  const rv = await api("GET", "/products/gluta-bright-vitamin-c/reviews");
  assert.ok(rv.body.summary.count >= 3);
});

test("guest checkout: cart totals are computed on the server and stock is reserved", async () => {
  const api = client();
  const { body: detail } = await api("GET", "/products/omega-3-fish-oil-1000");
  const stockBefore = detail.product.stock;
  let cart = await api("POST", "/cart/items", { productId: detail.product.id, quantity: 2 });
  assert.equal(cart.body.count, 2);
  assert.equal(cart.body.subtotal, 1300);

  const q = await api("POST", "/checkout/quote", { couponCode: "WELCOME10", paymentMethod: "promptpay" });
  assert.equal(q.body.discount, 130);
  assert.equal(q.body.shippingFee, 0);
  assert.equal(q.body.total, 1170);

  const order = await api("POST", "/orders", { email: "guest@example.com", shipping, paymentMethod: "promptpay", couponCode: "WELCOME10" });
  assert.equal(order.status, 201, JSON.stringify(order.body));
  assert.equal(order.body.order.total, 1170);
  assert.equal(order.body.order.status, "pending_payment");
  assert.match(order.body.next, /\/pay\//);

  const after = await api("GET", "/products/omega-3-fish-oil-1000");
  assert.equal(after.body.product.stock, stockBefore - 2);
  cart = await api("GET", "/cart");
  assert.equal(cart.body.count, 0);

  // a stranger without the token cannot read the order
  const stranger = client();
  const hidden = await stranger("GET", `/orders/${order.body.order.orderNo}`);
  assert.equal(hidden.status, 404);

  const paid = await stranger("POST", `/payments/sandbox/${order.body.order.orderNo}?t=${order.body.accessToken}`, { outcome: "success" });
  assert.equal(paid.body.order.paymentStatus, "paid");
  assert.equal(paid.body.order.status, "paid");
});

test("orders reject quantities above stock", async () => {
  const api = client();
  const { body } = await api("GET", "/products/vitamin-d3-zinc-daily"); // seeded with 4 in stock
  const res = await api("POST", "/cart/items", { productId: body.product.id, quantity: 5 });
  assert.equal(res.status, 409);
});

test("register, merge guest cart, review as verified buyer, admin ships order", async () => {
  const api = client();
  const { body: p } = await api("GET", "/products/biotin-hair-nail");
  await api("POST", "/cart/items", { productId: p.product.id, quantity: 1 });
  const weak = await api("POST", "/auth/register", { email: "a@b.co", password: "short", name: "ทดสอบ" });
  assert.equal(weak.status, 400);
  const reg = await api("POST", "/auth/register", { email: "buyer@example.com", password: "Passw0rd!", name: "ผู้ซื้อ ทดสอบ" });
  assert.equal(reg.status, 201);
  const cart = await api("GET", "/cart");
  assert.equal(cart.body.count, 1, "guest cart merged into account");

  const order = await api("POST", "/orders", { email: "buyer@example.com", shipping, paymentMethod: "cod" });
  assert.equal(order.body.order.status, "processing");
  assert.equal(order.body.order.codFee, 20);
  assert.equal(order.body.order.shippingFee, 50);

  const review = await api("POST", "/products/biotin-hair-nail/reviews", { rating: 5, body: "ผมร่วงน้อยลงจริง ทานมาสองเดือนแล้ว" });
  assert.equal(review.body.verified, true);

  const mine = await api("GET", "/orders");
  assert.equal(mine.body.orders.length, 1);
  assert.equal((await api("GET", "/admin/stats")).status, 403);

  const admin = client();
  const login = await admin("POST", "/auth/login", { email: "admin@vitara.local", password: "Admin@12345" });
  assert.equal(login.status, 200);
  const bad = await admin("PATCH", `/admin/orders/${order.body.order.id}`, { status: "delivered" });
  assert.equal(bad.status, 409, "cannot skip from processing to delivered");
  const shipped = await admin("PATCH", `/admin/orders/${order.body.order.id}`, { status: "shipped", trackingNo: "TH123456789" });
  assert.equal(shipped.body.order.status, "shipped");
  assert.equal(shipped.body.order.trackingNo, "TH123456789");
  const stats = await admin("GET", "/admin/stats");
  assert.ok(stats.body.revenue > 0);
});

test("chat falls back to keyword recommendations and respects filters", async () => {
  const api = client();
  const res = await api("POST", "/chat", { messages: [{ role: "user", content: "อยากได้อาหารเสริมผิวขาว" }], filters: { age: 30, budget: 600 } });
  assert.equal(res.status, 200);
  assert.equal(res.body.source, "local");
  assert.ok(res.body.products.length > 0);
  const { body } = await api("GET", "/products?maxPrice=600");
  const cheap = new Set(body.items.map((p) => p.slug));
  assert.ok(res.body.products.every((p) => cheap.has(p.slug)));
});

test("cross-site POST is rejected", async () => {
  const res = await fetch(base + "/cart/items", {
    method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: JSON.stringify({ productId: 1 }),
  });
  assert.equal(res.status, 403);
});

test("keyword fallback is not fooled by Thai words hidden inside longer words", async () => {
  const api = client();
  const ask = async (content, filters = {}) => (await api("POST", "/chat", { messages: [{ role: "user", content }], filters })).body.products.map((p) => p.slug);
  assert.deepEqual(await ask("นอนไม่หลับ"), ["magnesium-glycinate-sleep"]); // "นอน" also appears inside "ต้านอนุมูลอิสระ"
  assert.deepEqual(await ask("ใส่ใจสุขภาพ"), []); // "ใส่" is not "ใส" (clear skin)
  const skin = await ask("ผมอายุ 30 อยากได้อาหารเสริมผิวขาว"); // "ผม" here is the pronoun, not hair
  assert.ok(skin.includes("gluta-bright-vitamin-c") && !skin.includes("biotin-hair-nail"));
});
