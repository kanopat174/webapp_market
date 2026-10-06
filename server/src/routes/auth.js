import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { one, run } from "../db/database.js";
import { setSession, clearSession, requireUser } from "../middleware/auth.js";
import { HttpError, validate } from "../middleware/http.js";
import { mergeGuestCart } from "../services/cart.js";
import crypto from "node:crypto";
import { config } from "../config.js";
import { tx } from "../db/database.js";
import { queueEmail } from "../services/mailer.js";
import { passwordResetEmail, welcomeEmail } from "../services/emails.js";

const r = Router();
const limiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอ 15 นาที" } });

const email = z.string().trim().toLowerCase().email("อีเมลไม่ถูกต้อง").max(120);
const password = z.string().min(8, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร").max(100)
  .regex(/[A-Za-z]/, "รหัสผ่านต้องมีตัวอักษรภาษาอังกฤษ").regex(/\d/, "รหัสผ่านต้องมีตัวเลข");
const phone = z.string().trim().regex(/^0\d{8,9}$/, "เบอร์โทรต้องเป็นตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0").optional().or(z.literal(""));

// compared against when the email is unknown, so response time does not reveal which emails exist
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, phone: u.phone, role: u.role, createdAt: u.created_at });

r.post("/register", limiter, validate(z.object({
  email, password, name: z.string().trim().min(2, "กรุณากรอกชื่อ").max(80), phone,
})), (req, res) => {
  const { email, password, name, phone } = req.body;
  if (one("SELECT id FROM users WHERE email = ?", email)) throw new HttpError(409, "อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบ");
  const id = Number(run("INSERT INTO users (email, password_hash, name, phone) VALUES (?, ?, ?, ?)",
    email, bcrypt.hashSync(password, 12), name, phone || null).lastInsertRowid);
  const user = one("SELECT * FROM users WHERE id = ?", id);
  setSession(res, user);
  mergeGuestCart(req, res, id);
  queueEmail(welcomeEmail(user));
  res.status(201).json({ user: publicUser(user) });
});

r.post("/login", limiter, validate(z.object({ email, password: z.string().min(1).max(100) })), (req, res) => {
  const user = one("SELECT * FROM users WHERE email = ?", req.body.email);
  const ok = bcrypt.compareSync(req.body.password, user?.password_hash || DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
  setSession(res, user);
  mergeGuestCart(req, res, user.id);
  res.json({ user: publicUser(user) });
});

r.post("/logout", (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

r.get("/me", (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));

r.patch("/me", requireUser, validate(z.object({ name: z.string().trim().min(2).max(80), phone })), (req, res) => {
  run("UPDATE users SET name = ?, phone = ? WHERE id = ?", req.body.name, req.body.phone || null, req.user.id);
  res.json({ user: publicUser(one("SELECT * FROM users WHERE id = ?", req.user.id)) });
});

r.post("/password", requireUser, limiter, validate(z.object({ current: z.string().min(1), next: password })), (req, res) => {
  const user = one("SELECT * FROM users WHERE id = ?", req.user.id);
  if (!bcrypt.compareSync(req.body.current, user.password_hash)) throw new HttpError(400, "รหัสผ่านปัจจุบันไม่ถูกต้อง");
  run("UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?", bcrypt.hashSync(req.body.next, 12), user.id);
  // other devices are signed out; keep this one signed in
  setSession(res, one("SELECT * FROM users WHERE id = ?", user.id));
  res.json({ ok: true });
});

/* ---------- forgot / reset password ---------- */
const resetLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "ขอรีเซ็ตรหัสผ่านบ่อยเกินไป กรุณารอ 15 นาที" } });
const hashToken = (t) => crypto.createHash("sha256").update(t).digest("hex");

r.post("/forgot", resetLimiter, validate(z.object({ email })), (req, res) => {
  const user = one("SELECT * FROM users WHERE email = ?", req.body.email);
  if (user) {
    const token = crypto.randomBytes(32).toString("base64url");
    run("INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, datetime('now', '+1 hour'))", user.id, hashToken(token));
    queueEmail(passwordResetEmail(user, `${config.appUrl}/reset-password?token=${token}`));
  }
  // same answer either way, so this form cannot be used to find out who has an account
  res.json({ ok: true, message: "ถ้าอีเมลนี้มีบัญชีอยู่ เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปแล้ว กรุณาตรวจกล่องจดหมาย (และโฟลเดอร์สแปม)" });
});

r.post("/reset", resetLimiter, validate(z.object({ token: z.string().min(20).max(200), password })), (req, res) => {
  const user = tx(() => {
    const row = one(`SELECT id, user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')`, hashToken(req.body.token));
    if (!row) throw new HttpError(400, "ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว กรุณาขอลิงก์ใหม่");
    run("UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?", bcrypt.hashSync(req.body.password, 12), row.user_id);
    // every outstanding link for this account stops working
    run("UPDATE password_resets SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL", row.user_id);
    return one("SELECT * FROM users WHERE id = ?", row.user_id);
  });
  setSession(res, user);
  mergeGuestCart(req, res, user.id);
  res.json({ user: publicUser(user) });
});

export default r;
