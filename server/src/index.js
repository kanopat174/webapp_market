import { createApp } from "./app.js";
import { config } from "./config.js";
import { seedIfEmpty } from "./db/seed.js";
import { expireUnpaidOrders } from "./services/orders.js";
import { runSubscriptionRenewals, sendRunOutReminders } from "./services/subscriptions.js";
import { aiStatus } from "./services/ai.js";

seedIfEmpty();

/** Background jobs. Each is idempotent, so running them often (or after a restart) is safe. */
const JOBS = [
  ["expire unpaid orders", () => expireUnpaidOrders(24), (n) => `cancelled ${n} unpaid order(s) older than 24h`],
  ["subscription renewals", () => runSubscriptionRenewals(), (n) => `created ${n} subscription order(s)`],
  ["run-out reminders", () => sendRunOutReminders(), (n) => `sent ${n} run-out reminder(s)`],
];
const sweep = () => {
  for (const [name, job, describe] of JOBS) {
    try {
      const n = job();
      if (n) console.log(`[jobs] ${describe(n)}`);
    } catch (err) {
      console.error(`[jobs] ${name} failed:`, err);
    }
  }
};
sweep();
setInterval(sweep, 30 * 60_000).unref();

const server = createApp().listen(config.port, () => {
  const ai = aiStatus();
  console.log(`Vitara API on http://localhost:${config.port}`);
  console.log(`  AI assistant: ${ai.enabled ? `Claude (${ai.model})` : "keyword fallback (set ANTHROPIC_API_KEY to enable Claude)"}`);
  console.log(`  Payments: ${config.paymentMode}`);
  console.log(`  Email: ${config.mail.resendKey ? "Resend" : "not sent; saved to the admin Emails page (set RESEND_API_KEY to send)"}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
