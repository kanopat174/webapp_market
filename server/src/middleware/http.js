import { ZodError } from "zod";
import { config } from "../config.js";

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const notFound = (msg = "ไม่พบข้อมูลที่ต้องการ") => new HttpError(404, msg);

/** Parse and replace req.body / req.query with the schema's output. */
export const validate = (schema, where = "body") => (req, _res, next) => {
  const parsed = schema.safeParse(req[where] ?? {});
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
    return next(badRequest("ข้อมูลไม่ถูกต้อง", details));
  }
  if (where === "query") req.validQuery = parsed.data;
  else req[where] = parsed.data;
  next();
};

/**
 * Cookie-authenticated JSON API: reject cross-site state-changing requests.
 * SameSite=Lax cookies already block most CSRF; this also checks Origin when the browser sends it.
 */
export function sameOrigin(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (!origin) return next();
  const allowed = new Set([config.appUrl, `${req.protocol}://${req.get("host")}`]);
  if (allowed.has(origin)) return next();
  next(new HttpError(403, "คำขอถูกปฏิเสธ (origin ไม่ถูกต้อง)"));
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) err = badRequest("ข้อมูลไม่ถูกต้อง");
  if (err?.type === "entity.parse.failed") err = badRequest("รูปแบบ JSON ไม่ถูกต้อง");
  if (err?.name === "MulterError") {
    err = badRequest(err.code === "LIMIT_FILE_SIZE" ? "รูปแต่ละไฟล์ต้องไม่เกิน 5 MB" : err.code === "LIMIT_FILE_COUNT" ? "อัปโหลดได้ครั้งละไม่เกิน 10 รูป" : "อัปโหลดไฟล์ไม่สำเร็จ");
  }
  const status = err.status || 500;
  if (status >= 500) console.error(`[${req.method} ${req.originalUrl}]`, err);
  res.status(status).json({
    error: status >= 500 ? "ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง" : err.message,
    ...(err.details ? { details: err.details } : {}),
  });
}
