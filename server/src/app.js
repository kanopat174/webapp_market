import fs from "node:fs";
import path from "node:path";
import express from "express";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import { ROOT, config } from "./config.js";
import { loadUser } from "./middleware/auth.js";
import { errorHandler, HttpError, sameOrigin } from "./middleware/http.js";
import authRoutes from "./routes/auth.js";
import catalogRoutes from "./routes/catalog.js";
import shopRoutes, { stripeWebhook } from "./routes/shop.js";
import adminRoutes from "./routes/admin.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        formAction: ["'self'", "https://checkout.stripe.com"],
        upgradeInsecureRequests: config.isProd ? [] : null,
      },
    },
  }));
  app.use(compression());

  // Stripe needs the raw body, so its webhook is registered before the JSON parser.
  app.post("/api/payments/stripe/webhook", ...stripeWebhook);

  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use("/api", sameOrigin, loadUser);

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRoutes);
  app.use("/api", catalogRoutes);
  app.use("/api", shopRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api", (_req, _res, next) => next(new HttpError(404, "ไม่พบ API นี้")));

  // Product photos uploaded from the admin panel. File names are random, so they can be cached for a long time.
  app.use("/uploads", express.static(config.uploadDir, { maxAge: "30d", immutable: true, fallthrough: false,
    setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff") }));

  // In production the server also serves the built React app.
  const dist = path.join(ROOT, "client", "dist");
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: "1y", immutable: true,
      setHeaders: (res, file) => { if (file.endsWith(".html")) res.setHeader("Cache-Control", "no-cache"); } }));
    app.get("/{*splat}", (_req, res) => res.sendFile(path.join(dist, "index.html"), { headers: { "Cache-Control": "no-cache" } }));
  }

  app.use(errorHandler);
  return app;
}
