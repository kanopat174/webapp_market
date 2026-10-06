import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "../..");

const env = process.env;
const isProd = env.NODE_ENV === "production";

if (isProd && (!env.JWT_SECRET || env.JWT_SECRET.length < 32)) {
  throw new Error("JWT_SECRET must be set (32+ characters) in production");
}

export const config = {
  isProd,
  port: Number(env.PORT || 4000),
  appUrl: (env.APP_URL || "http://localhost:5173").replace(/\/$/, ""),
  dbPath: env.DB_PATH || path.join(ROOT, "data", "vitara.db"),
  jwtSecret: env.JWT_SECRET || "dev-only-secret-change-me-dev-only-secret",
  sessionDays: 7,
  admin: { email: env.ADMIN_EMAIL || "admin@vitara.local", password: env.ADMIN_PASSWORD || "Admin@12345" },
  anthropic: {
    enabled: Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN),
    model: env.ANTHROPIC_MODEL || "claude-opus-5-5",
  },
  stripe: {
    secretKey: env.STRIPE_SECRET_KEY || "",
    webhookSecret: env.STRIPE_WEBHOOK_SECRET || "",
  },
  // "stripe" when keys exist, otherwise a sandbox gateway for development
  get paymentMode() {
    return this.stripe.secretKey ? "stripe" : "sandbox";
  },
  shop: { freeShippingMin: 990, shippingFee: 50, codFee: 20 },
  mail: {
    // Resend (https://resend.com). Without a key, emails are written to the log and the admin "อีเมล" page instead.
    resendKey: env.RESEND_API_KEY || "",
    from: env.MAIL_FROM || "Vitara <onboarding@resend.dev>",
    replyTo: env.MAIL_REPLY_TO || "",
  },
  subscription: {
    discountPct: Number(env.SUBSCRIBE_DISCOUNT_PCT || 10),
    intervals: [30, 60, 90],
    // renewal orders are created this many days before the delivery date
    leadDays: 3,
  },
  // days before a one-time purchase runs out that the reminder email goes out
  reminderLeadDays: 5,
  uploadDir: env.UPLOAD_DIR || path.join(ROOT, "data", "uploads"),
};
