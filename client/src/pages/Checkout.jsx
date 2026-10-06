import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { baht, PAY_LABEL, PROVINCES, useTitle } from "../lib/format.js";
import { useApp } from "../context/AppContext.jsx";
import { Empty, Field, Icon, Spinner } from "../components/ui.jsx";

const DRAFT_KEY = "vt_checkout";
const loadDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)) || {}; } catch { return {}; } };

export default function Checkout() {
  useTitle("ชำระเงิน");
  const { user, cart, refreshCart, toast } = useApp();
  const navigate = useNavigate();
  const draft = loadDraft();
  const [form, setForm] = useState({
    email: user?.email || draft.email || "",
    name: draft.name || user?.name || "",
    phone: draft.phone || user?.phone || "",
    address: draft.address || "",
    province: draft.province || "",
    postcode: draft.postcode || "",
    note: "",
  });
  const [method, setMethod] = useState("promptpay");
  const [coupon, setCoupon] = useState("");
  const [applied, setApplied] = useState("");
  const [quote, setQuote] = useState(null);
  const [config, setConfig] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get("/checkout/config").then(setConfig).catch(() => {}); }, []);
  useEffect(() => { if (config && !config.payment.methods.includes(method)) setMethod(config.payment.methods[0]); }, [config, method]);
  useEffect(() => { if (user && !form.email) setForm((f) => ({ ...f, email: user.email })); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api.post("/checkout/quote", { paymentMethod: method, ...(applied ? { couponCode: applied } : {}) })
      .then((q) => {
        setQuote(q);
        if (q.couponError) { toast(q.couponError, "error"); setApplied(""); }
      })
      .catch(() => {});
  }, [method, applied, cart.subtotal, toast]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const { email, note, ...shipping } = form;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ email, ...shipping })); } catch { /* storage unavailable */ }
    try {
      const d = await api.post("/orders", { email, shipping, paymentMethod: method, ...(applied ? { couponCode: applied } : {}), ...(note ? { note } : {}) });
      await refreshCart();
      // our own pages come back as paths; Stripe Checkout is an absolute URL
      if (d.next.startsWith("/")) navigate(d.next);
      else window.location.assign(d.next);
    } catch (err) {
      const fe = err.fieldErrors?.() || {};
      setErrors(Object.fromEntries(Object.entries(fe).map(([k, v]) => [k.replace("shipping.", ""), v])));
      toast(err.message, "error");
      if (err.status === 409) refreshCart();
    } finally {
      setBusy(false);
    }
  }

  if (!cart.items.length && !busy) {
    return <Empty title="ตะกร้าว่าง" action={<Link className="btn primary" to="/shop">เลือกซื้อสินค้า</Link>}>เพิ่มสินค้าลงตะกร้าก่อนชำระเงิน</Empty>;
  }
  if (!quote) return <Spinner />;
  if (quote.cart.hasSubscription && user === null) {
    return (
      <Empty title="เข้าสู่ระบบเพื่อสมัครรับประจำ" action={<div className="cta center"><Link className="btn primary" to="/login?next=/checkout">เข้าสู่ระบบ</Link><Link className="btn" to="/register?next=/checkout">สมัครสมาชิก</Link><Link className="btn ghost" to="/cart">เปลี่ยนเป็นซื้อครั้งเดียว</Link></div>}>
        ตะกร้ามีสินค้าแบบสมัครรับประจำ ต้องมีบัญชีเพื่อจัดการรอบจัดส่ง พัก หรือยกเลิกได้เอง
      </Empty>
    );
  }
  const sandbox = config?.payment.mode === "sandbox";

  return (
    <>
      <div className="page-h"><h1>ชำระเงิน</h1>{!user && <p className="muted">มีบัญชีแล้ว? <Link to="/login?next=/checkout">เข้าสู่ระบบ</Link> เพื่อติดตามคำสั่งซื้อได้ง่ายขึ้น</p>}</div>
      <form className="cols" onSubmit={submit} noValidate>
        <div className="stack minw0">
          <section className="panel stack">
            <h2 className="h3">ที่อยู่จัดส่ง</h2>
            <Field label="อีเมล (สำหรับติดต่อเรื่องคำสั่งซื้อ)" id="co-email" error={errors.email}><input id="co-email" type="email" autoComplete="email" value={form.email} onChange={set("email")} required /></Field>
            <div className="two">
              <Field label="ชื่อ–นามสกุลผู้รับ" id="co-name" error={errors.name}><input id="co-name" autoComplete="name" value={form.name} onChange={set("name")} required /></Field>
              <Field label="เบอร์โทรศัพท์" id="co-phone" error={errors.phone}><input id="co-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0812345678" value={form.phone} onChange={set("phone")} required /></Field>
            </div>
            <Field label="ที่อยู่ (บ้านเลขที่ ถนน แขวง/ตำบล เขต/อำเภอ)" id="co-addr" error={errors.address}><textarea id="co-addr" rows={2} autoComplete="street-address" value={form.address} onChange={set("address")} required /></Field>
            <div className="two">
              <Field label="จังหวัด" id="co-prov" error={errors.province}>
                <select id="co-prov" value={form.province} onChange={set("province")} required><option value="">เลือกจังหวัด</option>{PROVINCES.map((p) => <option key={p}>{p}</option>)}</select>
              </Field>
              <Field label="รหัสไปรษณีย์" id="co-zip" error={errors.postcode}><input id="co-zip" inputMode="numeric" maxLength={5} autoComplete="postal-code" value={form.postcode} onChange={set("postcode")} required /></Field>
            </div>
            <Field label="หมายเหตุถึงร้าน (ไม่บังคับ)" id="co-note"><input id="co-note" maxLength={300} value={form.note} onChange={set("note")} /></Field>
          </section>

          <section className="panel stack">
            <h2 className="h3">วิธีชำระเงิน</h2>
            <div className="payopts" role="radiogroup">
              {(config?.payment.methods || ["promptpay", "card", "cod"]).map((m) => (
                <label key={m} className="payopt">
                  <input type="radio" name="pay" value={m} checked={method === m} onChange={() => setMethod(m)} />
                  <span><b>{PAY_LABEL[m]}</b><span className="muted sm">{m === "promptpay" ? "สแกนจ่ายผ่านแอปธนาคาร" : m === "card" ? "Visa, Mastercard, JCB" : `ชำระเงินสดเมื่อได้รับสินค้า (+${baht(config?.shop.codFee ?? 20)})`}</span></span>
                </label>
              ))}
            </div>
            {sandbox && method !== "cod" && <p className="notice">ระบบชำระเงินอยู่ในโหมดทดสอบ (ยังไม่ได้ตั้งค่า Stripe) จะไม่มีการตัดเงินจริง</p>}
          </section>
        </div>

        <aside className="osum">
          <b>สรุปคำสั่งซื้อ</b>
          {quote.cart.items.map((i) => (
            <div className="it" key={i.product.id}>
              <span>{i.product.name} × {i.quantity}{i.intervalDays > 0 && <span className="subtag"><Icon name="refresh" size={12} /> ส่งทุก {i.intervalDays} วัน</span>}</span>
              <span className="num">{baht(i.lineTotal)}</span>
            </div>
          ))}
          {quote.cart.hasSubscription && <div className="muted sm">รอบถัดไปจะใช้ที่อยู่และวิธีชำระเงินนี้ แก้ไขได้ในหน้าบัญชี</div>}
          <hr />
          <div className="it"><span>ยอดรวมสินค้า</span><span className="num">{baht(quote.subtotal)}</span></div>
          {quote.discount > 0 && <div className="it ok"><span>ส่วนลด {quote.coupon?.code}</span><span className="num">−{baht(quote.discount)}</span></div>}
          <div className="it"><span>ค่าจัดส่ง</span><span className="num">{quote.shippingFee ? baht(quote.shippingFee) : "ฟรี"}</span></div>
          {quote.codFee > 0 && <div className="it"><span>ค่าบริการเก็บเงินปลายทาง</span><span className="num">{baht(quote.codFee)}</span></div>}
          <div className="it grand"><span>ยอดชำระ</span><span className="num">{baht(quote.total)}</span></div>
          {quote.shippingFee > 0 && <div className="muted sm">ซื้ออีก {baht(quote.freeShippingMin - (quote.subtotal - quote.discount))} เพื่อรับส่งฟรี</div>}
          <div className="coupon">
            <input aria-label="โค้ดส่วนลด" placeholder="โค้ดส่วนลด" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} />
            {applied ? <button type="button" className="btn sm" onClick={() => { setApplied(""); setCoupon(""); }}>เอาออก</button>
              : <button type="button" className="btn sm" disabled={!coupon.trim()} onClick={() => setApplied(coupon.trim())}>ใช้โค้ด</button>}
          </div>
          {quote.coupon && <div className="ok sm">{quote.coupon.description}</div>}
          <button className="btn primary block" disabled={busy}>{busy ? "กำลังสร้างคำสั่งซื้อ…" : method === "cod" ? "ยืนยันคำสั่งซื้อ" : `ชำระเงิน ${baht(quote.total)}`}</button>
          <p className="muted sm">การกดยืนยันถือว่าคุณยอมรับ <Link to="/help">เงื่อนไขการสั่งซื้อและการคืนสินค้า</Link></p>
        </aside>
      </form>
    </>
  );
}
