import Stripe from "stripe";
import { config } from "../config.js";
import { HttpError } from "../middleware/http.js";

const stripe = config.stripe.secretKey ? new Stripe(config.stripe.secretKey) : null;

/** Online payment works with Stripe, or with the sandbox outside production (or when explicitly allowed). */
export const onlinePaymentAvailable = () =>
  Boolean(stripe) || !config.isProd || process.env.ALLOW_SANDBOX_PAYMENTS === "true";

export const paymentInfo = () => ({
  mode: config.paymentMode,
  methods: onlinePaymentAvailable() ? ["promptpay", "card", "cod"] : ["cod"],
});

/**
 * Start payment for an order. Returns the URL the browser should go to.
 * - stripe: a hosted Stripe Checkout page (card or PromptPay, THB)
 * - sandbox: the shop's own test payment page (development only)
 */
export async function startPayment(order) {
  const resultUrl = `${config.appUrl}/orders/${order.orderNo}?t=${order.accessToken}`;
  if (stripe) {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: [order.paymentMethod === "promptpay" ? "promptpay" : "card"],
      customer_email: order.email,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "thb",
          unit_amount: order.total * 100, // satang
          product_data: { name: `คำสั่งซื้อ ${order.orderNo}`, description: order.items.map((i) => `${i.name} × ${i.quantity}`).join(", ").slice(0, 500) },
        },
      }],
      metadata: { orderId: String(order.id), orderNo: order.orderNo },
      client_reference_id: String(order.id),
      success_url: `${resultUrl}&paid=1`,
      cancel_url: `${resultUrl}&cancelled=1`,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 2,
    });
    return { url: session.url, provider: "stripe", ref: session.id };
  }
  if (!onlinePaymentAvailable()) {
    throw new HttpError(503, "ระบบชำระเงินออนไลน์ยังไม่เปิดใช้งาน กรุณาเลือกเก็บเงินปลายทาง");
  }
  return { url: `/pay/${order.orderNo}?t=${order.accessToken}`, provider: "sandbox", ref: null };
}

/** Verify and decode a Stripe webhook. Throws on a bad signature. */
export function parseStripeEvent(rawBody, signature) {
  if (!stripe || !config.stripe.webhookSecret) throw new HttpError(400, "Stripe webhook is not configured");
  try {
    return stripe.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
  } catch (err) {
    throw new HttpError(400, `Webhook signature verification failed: ${err.message}`);
  }
}
