import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { one } from "../db/database.js";
import { HttpError } from "./http.js";

const COOKIE = "vt_session";

/** user.token_version is baked into the session; bumping it (password change/reset) signs out every device. */
export function setSession(res, user) {
  const token = jwt.sign({ sub: String(user.id), role: user.role, v: user.token_version || 0 }, config.jwtSecret, { expiresIn: `${config.sessionDays}d` });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProd,
    maxAge: config.sessionDays * 864e5,
    path: "/",
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: "/" });
}

/** Attach req.user when a valid session cookie is present. Never rejects. */
export function loadUser(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  if (token) {
    try {
      const { sub, v = 0 } = jwt.verify(token, config.jwtSecret);
      const user = one("SELECT id, email, name, phone, role, created_at, token_version FROM users WHERE id = ?", Number(sub));
      req.user = user && user.token_version === v ? user : null;
    } catch {
      req.user = null;
    }
  }
  next();
}

export function requireUser(req, _res, next) {
  if (!req.user) return next(new HttpError(401, "กรุณาเข้าสู่ระบบ"));
  next();
}

export function requireAdmin(req, _res, next) {
  if (!req.user) return next(new HttpError(401, "กรุณาเข้าสู่ระบบ"));
  if (req.user.role !== "admin") return next(new HttpError(403, "สำหรับผู้ดูแลระบบเท่านั้น"));
  next();
}
