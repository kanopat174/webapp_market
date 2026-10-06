import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "../context/AppContext.jsx";
import { useTitle } from "../lib/format.js";
import { api } from "../lib/api.js";
import { Field, Icon } from "../components/ui.jsx";

// only same-site paths, so ?next= cannot send people to another website
const safeNext = (n) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/account");

export function Login() {
  useTitle("เข้าสู่ระบบ");
  const { user, login, toast } = useApp();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const next = safeNext(params.get("next"));

  if (user) return <Navigate to={next} replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const u = await login(email, password);
      toast(`ยินดีต้อนรับ ${u.name}`, "ok");
      navigate(u.role === "admin" && next === "/account" ? "/admin" : next, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="authbox panel">
      <h1 className="h2">เข้าสู่ระบบ</h1>
      <form className="stack" onSubmit={submit}>
        <Field label="อีเมล" id="li-email"><input id="li-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label="รหัสผ่าน" id="li-pass"><input id="li-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        <Link to="/forgot-password" className="sm forgot-link">ลืมรหัสผ่าน?</Link>
        {error && <p className="err" role="alert">{error}</p>}
        <button className="btn primary block" disabled={busy}>{busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}</button>
      </form>
      <p className="muted">ยังไม่มีบัญชี? <Link to={`/register${params.get("next") ? `?next=${encodeURIComponent(next)}` : ""}`}>สมัครสมาชิก</Link></p>
    </div>
  );
}

export function Register() {
  useTitle("สมัครสมาชิก");
  const { user, register, toast } = useApp();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const next = safeNext(params.get("next"));

  if (user) return <Navigate to={next} replace />;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    if (form.password !== form.confirm) { setErrors({ confirm: "รหัสผ่านทั้งสองช่องไม่ตรงกัน" }); return; }
    setBusy(true); setErrors({});
    try {
      const { confirm, ...body } = form;
      await register(body);
      toast("สมัครสมาชิกสำเร็จ", "ok");
      navigate(next, { replace: true });
    } catch (err) {
      setErrors({ ...err.fieldErrors?.(), form: err.details ? "" : err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="authbox panel">
      <h1 className="h2">สมัครสมาชิก</h1>
      <p className="muted">ติดตามคำสั่งซื้อ เขียนรีวิว และสั่งซื้อครั้งต่อไปได้เร็วขึ้น</p>
      <form className="stack" onSubmit={submit} noValidate>
        <Field label="ชื่อ–นามสกุล" id="rg-name" error={errors.name}><input id="rg-name" autoComplete="name" value={form.name} onChange={set("name")} required /></Field>
        <Field label="อีเมล" id="rg-email" error={errors.email}><input id="rg-email" type="email" autoComplete="email" value={form.email} onChange={set("email")} required /></Field>
        <Field label="เบอร์โทร (ไม่บังคับ)" id="rg-phone" error={errors.phone}><input id="rg-phone" type="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} /></Field>
        <Field label="รหัสผ่าน" id="rg-pass" error={errors.password} hint="อย่างน้อย 8 ตัว มีทั้งตัวอักษรภาษาอังกฤษและตัวเลข"><input id="rg-pass" type="password" autoComplete="new-password" value={form.password} onChange={set("password")} required /></Field>
        <Field label="ยืนยันรหัสผ่าน" id="rg-confirm" error={errors.confirm}><input id="rg-confirm" type="password" autoComplete="new-password" value={form.confirm} onChange={set("confirm")} required /></Field>
        {errors.form && <p className="err" role="alert">{errors.form}</p>}
        <button className="btn primary block" disabled={busy}>{busy ? "กำลังสมัคร…" : "สมัครสมาชิก"}</button>
      </form>
      <p className="muted">มีบัญชีอยู่แล้ว? <Link to="/login">เข้าสู่ระบบ</Link></p>
    </div>
  );
}

export function ForgotPassword() {
  useTitle("ลืมรหัสผ่าน");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const d = await api.post("/auth/forgot", { email });
      setSent(d.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="authbox panel">
      <h1 className="h2">ลืมรหัสผ่าน</h1>
      {sent ? (
        <div className="stack">
          <div className="sent-ill" aria-hidden="true"><Icon name="send" size={34} /></div>
          <p>{sent}</p>
          <p className="muted sm">ลิงก์ใช้ได้ภายใน 1 ชั่วโมง และใช้ได้ครั้งเดียว</p>
          <Link className="btn block" to="/login">กลับไปหน้าเข้าสู่ระบบ</Link>
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <p className="muted">กรอกอีเมลที่ใช้สมัคร ระบบจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้</p>
          <Field label="อีเมล" id="fp-email"><input id="fp-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          {error && <p className="err" role="alert">{error}</p>}
          <button className="btn primary block" disabled={busy}>{busy ? "กำลังส่ง…" : "ส่งลิงก์ตั้งรหัสผ่านใหม่"}</button>
          <Link to="/login" className="sm">กลับไปหน้าเข้าสู่ระบบ</Link>
        </form>
      )}
    </div>
  );
}

export function ResetPassword() {
  useTitle("ตั้งรหัสผ่านใหม่");
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const { setUser, refreshCart, toast } = useApp();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (password !== confirm) { setErrors({ confirm: "รหัสผ่านทั้งสองช่องไม่ตรงกัน" }); return; }
    setBusy(true); setErrors({});
    try {
      const d = await api.post("/auth/reset", { token, password });
      setUser(d.user);
      await refreshCart();
      toast("ตั้งรหัสผ่านใหม่แล้ว และออกจากระบบในอุปกรณ์อื่นทั้งหมด", "ok");
      navigate("/account", { replace: true });
    } catch (err) {
      setErrors({ ...err.fieldErrors?.(), form: err.details ? "" : err.message });
    } finally {
      setBusy(false);
    }
  }

  if (!token) return <div className="authbox panel"><h1 className="h2">ลิงก์ไม่ถูกต้อง</h1><Link className="btn primary block" to="/forgot-password">ขอลิงก์ใหม่</Link></div>;
  return (
    <div className="authbox panel">
      <h1 className="h2">ตั้งรหัสผ่านใหม่</h1>
      <form className="stack" onSubmit={submit} noValidate>
        <Field label="รหัสผ่านใหม่" id="rp-pass" error={errors.password} hint="อย่างน้อย 8 ตัว มีทั้งตัวอักษรภาษาอังกฤษและตัวเลข"><input id="rp-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        <Field label="ยืนยันรหัสผ่านใหม่" id="rp-confirm" error={errors.confirm}><input id="rp-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></Field>
        {errors.form && <p className="err" role="alert">{errors.form} <Link to="/forgot-password">ขอลิงก์ใหม่</Link></p>}
        <button className="btn primary block" disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึกรหัสผ่านใหม่"}</button>
      </form>
    </div>
  );
}
