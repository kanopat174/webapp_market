import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { baht, PAY_LABEL, thaiDate, useTitle } from "../lib/format.js";
import { useApp } from "../context/AppContext.jsx";
import { Empty, Field, Icon, ProductArt, Spinner, artBg } from "../components/ui.jsx";

const TABS = [
  ["orders", "คำสั่งซื้อ", "bag"],
  ["subscriptions", "สมัครรับประจำ", "refresh"],
  ["runout", "ใกล้หมด", "truck"],
  ["profile", "ข้อมูลส่วนตัว", "shield"],
];

export default function Account() {
  useTitle("บัญชีของฉัน");
  const { user, logout } = useApp();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const tab = TABS.some(([k]) => `#${k}` === hash) ? hash.slice(1) : "orders";

  if (user === undefined) return <Spinner />;
  if (!user) return <Navigate to={`/login?next=/account${hash}`} replace />;

  return (
    <>
      <div className="page-h account-h">
        <span className="avatar xl" aria-hidden="true">{user.name.trim().charAt(0)}</span>
        <div><h1>สวัสดี {user.name}</h1><p className="muted">{user.email}</p></div>
        <button className="btn ghost sm" onClick={logout}>ออกจากระบบ</button>
      </div>
      <div className="tabs account-tabs" role="tablist">
        {TABS.map(([k, label, icon]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => navigate({ hash: k }, { replace: true })}><Icon name={icon} size={16} /> {label}</button>
        ))}
      </div>
      <div className="tabpanel wide" key={tab}>
        {tab === "orders" && <Orders />}
        {tab === "subscriptions" && <Subscriptions />}
        {tab === "runout" && <RunningLow />}
        {tab === "profile" && <Profile />}
      </div>
    </>
  );
}

function Orders() {
  const { addMany } = useApp();
  const [orders, setOrders] = useState(null);
  useEffect(() => { api.get("/orders").then((d) => setOrders(d.orders)).catch(() => setOrders([])); }, []);
  if (!orders) return <Spinner />;
  if (!orders.length) return <Empty title="ยังไม่มีคำสั่งซื้อ" action={<Link className="btn primary" to="/shop">เลือกซื้อสินค้า</Link>} />;
  return (
    <div className="order-list">
      {orders.map((o, i) => (
        <article className="order-card panel" key={o.id} data-reveal style={{ "--i": i }}>
          <header className="row">
            <div><Link to={`/orders/${o.orderNo}`} className="mono">{o.orderNo}</Link><div className="muted sm">{thaiDate(o.createdAt, true)} · {PAY_LABEL[o.paymentMethod]}</div></div>
            <span className={`status s-${o.status}`}>{o.statusLabel}</span>
          </header>
          <div className="order-items">
            {o.items.map((it, k) => (
              <div className="oi" key={k} title={it.name}>
                <span className="oi-thumb" style={artBg(it.art)}><ProductArt art={it.art} name={it.name} brand={it.brand} imageUrl={it.imageUrl} /></span>
                <span className="minw0"><span className="oi-name">{it.name}</span><span className="muted sm">× {it.quantity}{it.intervalDays ? ` · ส่งทุก ${it.intervalDays} วัน` : ""}</span></span>
              </div>
            ))}
          </div>
          <footer className="row">
            <b className="num">{baht(o.total)}</b>
            <div className="cta">
              <Link className="btn sm ghost" to={`/orders/${o.orderNo}`}>ดูรายละเอียด</Link>
              {o.items.some((it) => it.productId) && (
                <button className="btn sm primary" onClick={() => addMany(o.items.filter((it) => it.productId).map((it) => ({ productId: it.productId, quantity: it.quantity, intervalDays: 0 })))}>
                  <Icon name="refresh" size={15} /> ซื้ออีกครั้ง
                </button>
              )}
            </div>
          </footer>
        </article>
      ))}
    </div>
  );
}

function Subscriptions() {
  const { toast } = useApp();
  const [subs, setSubs] = useState(null);
  const [busy, setBusy] = useState(null);
  const load = useCallback(() => api.get("/account/subscriptions").then((d) => setSubs(d.subscriptions)).catch(() => setSubs([])), []);
  useEffect(() => { load(); }, [load]);

  async function act(s, body, done) {
    setBusy(s.id);
    try {
      const d = await api.patch(`/account/subscriptions/${s.id}`, body);
      setSubs((list) => list.map((x) => (x.id === s.id ? d.subscription : x)));
      toast(done, "ok");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  }

  if (!subs) return <Spinner />;
  if (!subs.length) {
    return (
      <Empty title="ยังไม่ได้สมัครรับสินค้าประจำ" action={<Link className="btn primary" to="/shop">เลือกสินค้า</Link>}>
        เลือก "สมัครรับประจำ" ในหน้าสินค้า รับส่วนลดทุกรอบ และไม่ต้องคอยสั่งเอง
      </Empty>
    );
  }
  return (
    <div className="sub-list">
      {subs.map((s, i) => (
        <article className={`sub-card panel ${s.status}`} key={s.id} data-reveal style={{ "--i": i }}>
          <Link to={`/products/${s.product?.slug}`} className="sub-thumb" style={artBg(s.product?.art)}><ProductArt product={s.product} /></Link>
          <div className="minw0 stack tight">
            <div className="row"><b>{s.product?.name}</b><span className={`status ${s.status === "active" ? "s-delivered" : s.status === "paused" ? "s-pending_payment" : "s-cancelled"}`}>{s.statusLabel}</span></div>
            <div className="muted sm num">{baht(s.unitPrice)} × {s.quantity} · ลด {s.discountPct}% · {PAY_LABEL[s.paymentMethod]}</div>
            {s.status === "active" && <div className="next-date"><Icon name="truck" size={16} /> รอบถัดไป <b>{thaiDate(s.nextDate)}</b> <span className="muted sm">(ร้านจะสร้างคำสั่งซื้อและส่งอีเมลแจ้งก่อน 3 วัน)</span></div>}
            {s.lastOrder && <div className="muted sm">รอบล่าสุด <Link to={`/orders/${s.lastOrder.orderNo}`} className="mono">{s.lastOrder.orderNo}</Link> · {s.lastOrder.statusLabel}</div>}
            {s.status !== "cancelled" && (
              <div className="sub-controls">
                <label className="sm">ส่งทุก
                  <select value={s.intervalDays} disabled={busy === s.id} onChange={(e) => act(s, { action: "update", intervalDays: Number(e.target.value) }, "เปลี่ยนรอบจัดส่งแล้ว")}>
                    {[30, 60, 90].map((d) => <option key={d} value={d}>{d} วัน</option>)}
                  </select>
                </label>
                <label className="sm">จำนวน
                  <select value={s.quantity} disabled={busy === s.id} onChange={(e) => act(s, { action: "update", quantity: Number(e.target.value) }, "เปลี่ยนจำนวนแล้ว")}>
                    {Array.from({ length: 6 }, (_, n) => n + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label className="sm">ชำระด้วย
                  <select value={s.paymentMethod} disabled={busy === s.id} onChange={(e) => act(s, { action: "update", paymentMethod: e.target.value }, "เปลี่ยนวิธีชำระเงินแล้ว")}>
                    {["promptpay", "card", "cod"].map((m) => <option key={m} value={m}>{PAY_LABEL[m]}</option>)}
                  </select>
                </label>
                <div className="cta">
                  {s.status === "active" ? (
                    <>
                      <button className="btn sm" disabled={busy === s.id} onClick={() => act(s, { action: "skip" }, "ข้ามรอบนี้แล้ว")}>ข้ามรอบนี้</button>
                      <button className="btn sm" disabled={busy === s.id} onClick={() => act(s, { action: "pause" }, "พักการจัดส่งแล้ว")}>พักไว้ก่อน</button>
                    </>
                  ) : (
                    <button className="btn sm primary" disabled={busy === s.id} onClick={() => act(s, { action: "resume" }, "กลับมาจัดส่งตามรอบแล้ว")}>เริ่มจัดส่งต่อ</button>
                  )}
                  <ConfirmCancel disabled={busy === s.id} onConfirm={() => act(s, { action: "cancel" }, "ยกเลิกการสมัครรับประจำแล้ว")} />
                </div>
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function ConfirmCancel({ onConfirm, disabled }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 3500); return () => clearTimeout(t); }, [armed]);
  return <button className={`btn sm ${armed ? "danger" : "ghost"}`} disabled={disabled} onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>{armed ? "กดอีกครั้งเพื่อยืนยันการยกเลิก" : "ยกเลิก"}</button>;
}

function RunningLow() {
  const { addToCart, addMany } = useApp();
  const [items, setItems] = useState(null);
  useEffect(() => { api.get("/account/running-low").then((d) => setItems(d.items)).catch(() => setItems([])); }, []);
  if (!items) return <Spinner />;
  if (!items.length) {
    return <Empty title="ยังไม่มีสินค้าที่ใกล้หมด">ระบบจะคำนวณจากวันที่สั่งซื้อและจำนวนวันที่สินค้าแต่ละชิ้นใช้ได้ แล้วแจ้งเตือนทางอีเมลก่อนหมดประมาณ 5 วัน</Empty>;
  }
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="stack">
      <div className="row">
        <p className="muted">คำนวณจากวันที่สั่งและปริมาณที่แนะนำต่อวัน</p>
        <button className="btn primary sm" onClick={() => addMany(items.map((i) => ({ productId: i.product.id, quantity: 1, intervalDays: 0 })))}>สั่งซ้ำทั้งหมด</button>
      </div>
      <div className="low-list">
        {items.map(({ product: p, remindAt }, i) => (
          <article className="low-card panel" key={p.id} data-reveal style={{ "--i": i }}>
            <Link to={`/products/${p.slug}`} className="sub-thumb" style={artBg(p.art)}><ProductArt product={p} /></Link>
            <div className="minw0 stack tight">
              <b>{p.name}</b>
              <span className={remindAt <= today ? "warn sm" : "muted sm"}>{remindAt <= today ? "น่าจะใกล้หมดแล้ว" : `น่าจะหมดราว ${thaiDate(remindAt)}`}</span>
              <div className="cta">
                <button className="btn sm primary" onClick={() => addToCart(p, 1, { intervalDays: 0 })}>สั่งซ้ำ {baht(p.price)}</button>
                <button className="btn sm" onClick={() => addToCart(p, 1, { intervalDays: 30 })}>สมัครรับประจำ (ลดเพิ่ม)</button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function Profile() {
  const { user, setUser, toast } = useApp();
  const [profile, setProfile] = useState({ name: user.name, phone: user.phone || "" });
  const [pw, setPw] = useState({ current: "", next: "" });
  const [errors, setErrors] = useState({});

  async function saveProfile(e) {
    e.preventDefault();
    try {
      const d = await api.patch("/auth/me", profile);
      setUser(d.user);
      toast("บันทึกข้อมูลแล้ว", "ok");
    } catch (err) {
      setErrors(err.fieldErrors?.() || {});
      toast(err.message, "error");
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    try {
      await api.post("/auth/password", pw);
      setPw({ current: "", next: "" });
      setErrors({});
      toast("เปลี่ยนรหัสผ่านแล้ว อุปกรณ์อื่นถูกออกจากระบบ", "ok");
    } catch (err) {
      setErrors(err.fieldErrors?.() || {});
      toast(err.message, "error");
    }
  }

  return (
    <div className="cols even">
      <form className="panel stack" onSubmit={saveProfile}>
        <h2 className="h3">ข้อมูลส่วนตัว</h2>
        <Field label="ชื่อ–นามสกุล" id="ac-name" error={errors.name}><input id="ac-name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></Field>
        <Field label="เบอร์โทร" id="ac-phone" error={errors.phone}><input id="ac-phone" type="tel" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></Field>
        <button className="btn primary">บันทึก</button>
      </form>
      <form className="panel stack" onSubmit={changePassword}>
        <h2 className="h3">เปลี่ยนรหัสผ่าน</h2>
        <Field label="รหัสผ่านปัจจุบัน" id="ac-cur"><input id="ac-cur" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
        <Field label="รหัสผ่านใหม่" id="ac-new" error={errors.next} hint="อย่างน้อย 8 ตัว มีตัวอักษรภาษาอังกฤษและตัวเลข"><input id="ac-new" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
        <button className="btn">เปลี่ยนรหัสผ่าน</button>
      </form>
    </div>
  );
}
