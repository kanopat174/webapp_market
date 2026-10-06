import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api.js";
import { baht, PAY_LABEL, thaiDate, useTitle } from "../lib/format.js";
import { useApp } from "../context/AppContext.jsx";
import { Empty, ProductArt, SkeletonDetail, Spinner, artBg } from "../components/ui.jsx";
import { confetti } from "../lib/motion.js";

const FLOW = ["pending_payment", "paid", "processing", "shipped", "delivered"];

export default function Order() {
  const { orderNo } = useParams();
  const [params] = useSearchParams();
  const token = params.get("t");
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const { toast, setCart, setCartOpen } = useApp();
  const celebrated = useRef(false);
  useTitle(`คำสั่งซื้อ ${orderNo}`);

  // celebrate once, right after a successful payment or a cash-on-delivery order
  useEffect(() => {
    if (!order || celebrated.current || !params.has("t") || params.get("cancelled")) return;
    if (order.paymentStatus === "paid" || order.paymentStatus === "cod_pending") {
      celebrated.current = true;
      setTimeout(() => confetti(), 250);
    }
  }, [order, params]);

  useEffect(() => {
    let timer;
    let tries = 0;
    const load = () => api.get(`/orders/${orderNo}${token ? `?t=${encodeURIComponent(token)}` : ""}`)
      .then((d) => {
        setOrder(d.order);
        // returning from Stripe: the webhook may land a few seconds after the redirect
        if (params.get("paid") && d.order.paymentStatus === "unpaid" && tries++ < 10) timer = setTimeout(load, 2000);
      })
      .catch(setError);
    load();
    return () => clearTimeout(timer);
  }, [orderNo, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const steps = useMemo(() => {
    if (!order) return [];
    const flow = order.paymentMethod === "cod" ? FLOW.filter((s) => s !== "pending_payment" && s !== "paid") : FLOW;
    const idx = flow.indexOf(order.status);
    return flow.map((s, i) => ({ s, done: i <= idx }));
  }, [order]);

  async function payAgain() {
    try {
      const d = await api.post(`/orders/${orderNo}/pay${token ? `?t=${encodeURIComponent(token)}` : ""}`);
      window.location.assign(d.next);
    } catch (e) {
      toast(e.message, "error");
    }
  }

  if (error) return <Empty title="ไม่พบคำสั่งซื้อ" action={<Link className="btn" to="/account">ดูคำสั่งซื้อของฉัน</Link>}>ตรวจสอบลิงก์อีกครั้ง หรือเข้าสู่ระบบด้วยบัญชีที่ใช้สั่งซื้อ</Empty>;
  if (!order) return <SkeletonDetail />;

  const labels = { pending_payment: "รอชำระเงิน", paid: "ชำระเงินแล้ว", processing: "เตรียมสินค้า", shipped: "จัดส่งแล้ว", delivered: "ได้รับสินค้า" };
  const justPlaced = params.has("t") && !params.get("cancelled");

  return (
    <>
      {order.status === "cancelled" ? (
        <div className="banner err">คำสั่งซื้อนี้ถูกยกเลิกแล้ว</div>
      ) : order.paymentStatus === "unpaid" && order.paymentMethod !== "cod" ? (
        <div className="banner warn">
          <span>{params.get("cancelled") ? "การชำระเงินยังไม่สำเร็จ" : "คำสั่งซื้อนี้ยังรอชำระเงิน"} สินค้าจะถูกจองไว้ 24 ชั่วโมง</span>
          <button className="btn accent sm" onClick={payAgain}>ชำระเงินตอนนี้</button>
        </div>
      ) : justPlaced ? (
        <div className="success">
          <svg className="success-check" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24" /><path d="m15 27 7.5 7.5L38 19" /></svg>
          <div><h2>สั่งซื้อสำเร็จ ขอบคุณค่ะ</h2><p className="muted">บันทึกลิงก์หน้านี้ไว้เพื่อติดตามสถานะคำสั่งซื้อ</p></div>
        </div>
      ) : null}

      <div className="page-h">
        <h1>คำสั่งซื้อ <span className="mono">{order.orderNo}</span></h1>
        <p className="muted">สั่งเมื่อ {thaiDate(order.createdAt, true)} · <b>{order.statusLabel}</b></p>
      </div>

      {order.status !== "cancelled" && (
        <ol className="tracker">
          {steps.map(({ s, done }) => <li key={s} className={done ? "done" : ""}><span className="dot" />{labels[s]}</li>)}
        </ol>
      )}

      <div className="cols">
        <div className="stack minw0">
          <section className="panel">
            <h2 className="h3">รายการสินค้า</h2>
            {order.items.map((i, k) => (
              <div className="line" key={k}>
                <div className="thumb" style={artBg(i.art)}><ProductArt art={i.art} name={i.name} brand={i.brand} imageUrl={i.imageUrl} /></div>
                <div className="minw0">{i.slug ? <Link to={`/products/${i.slug}`} className="nm">{i.name}</Link> : <span className="nm">{i.name}</span>}<div className="muted sm num">{baht(i.unitPrice)} × {i.quantity}</div>{i.intervalDays > 0 && <span className="subtag">สมัครรับประจำ ทุก {i.intervalDays} วัน</span>}</div>
                <b className="num">{baht(i.unitPrice * i.quantity)}</b>
              </div>
            ))}
          </section>
          <section className="panel">
            <h2 className="h3">ประวัติสถานะ</h2>
            <ul className="events">
              {[...order.events].reverse().map((e, k) => <li key={k}><b>{e.label}</b>{e.note && <span> · {e.note}</span>}<span className="muted sm"> · {thaiDate(e.at, true)}</span></li>)}
            </ul>
          </section>
        </div>
        <aside className="stack">
          <div className="osum">
            <b>สรุปยอด</b>
            <div className="it"><span>ยอดรวมสินค้า</span><span className="num">{baht(order.subtotal)}</span></div>
            {order.discount > 0 && <div className="it ok"><span>ส่วนลด {order.couponCode}</span><span className="num">−{baht(order.discount)}</span></div>}
            <div className="it"><span>ค่าจัดส่ง</span><span className="num">{order.shippingFee ? baht(order.shippingFee) : "ฟรี"}</span></div>
            {order.codFee > 0 && <div className="it"><span>ค่าบริการปลายทาง</span><span className="num">{baht(order.codFee)}</span></div>}
            <div className="it grand"><span>ยอดชำระ</span><span className="num">{baht(order.total)}</span></div>
            <div className="muted sm">{PAY_LABEL[order.paymentMethod]} · {order.paymentStatus === "paid" ? "ชำระแล้ว" : order.paymentStatus === "cod_pending" ? "ชำระเมื่อรับสินค้า" : "ยังไม่ชำระ"}</div>
          </div>
          <div className="panel sm">
            <b>จัดส่งถึง</b>
            <p>{order.shipping.name} · {order.shipping.phone}<br />{order.shipping.address}<br />{order.shipping.province} {order.shipping.postcode}</p>
            {order.trackingNo && <p>เลขพัสดุ <b className="mono">{order.trackingNo}</b></p>}
          </div>
          {order.items.some((i) => i.productId) && (
            <button className="btn block" onClick={async () => {
              try {
                const d = await api.post(`/orders/${orderNo}/reorder${token ? `?t=${encodeURIComponent(token)}` : ""}`);
                setCart(d);
                setCartOpen(true);
                if (d.skipped?.length) toast(`เพิ่มไม่ได้: ${d.skipped.join(", ")}`, "error");
              } catch (e) { toast(e.message, "error"); }
            }}>ซื้อรายการนี้อีกครั้ง</button>
          )}
        </aside>
      </div>
    </>
  );
}

/** Development payment page used when Stripe is not configured. */
export function SandboxPay() {
  const { orderNo } = useParams();
  const [params] = useSearchParams();
  const token = params.get("t") || "";
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useApp();
  useTitle("ชำระเงิน");

  useEffect(() => { api.get(`/orders/${orderNo}?t=${encodeURIComponent(token)}`).then((d) => setOrder(d.order)).catch(() => setOrder(false)); }, [orderNo, token]);

  async function pay(outcome) {
    setBusy(true);
    try {
      await api.post(`/payments/sandbox/${orderNo}?t=${encodeURIComponent(token)}`, { outcome });
      navigate(`/orders/${orderNo}?t=${encodeURIComponent(token)}${outcome === "success" ? "&paid=1" : "&cancelled=1"}`);
    } catch (e) {
      toast(e.message, "error");
      setBusy(false);
    }
  }

  if (order === false) return <Empty title="ไม่พบคำสั่งซื้อ" />;
  if (!order) return <Spinner />;
  return (
    <div className="paybox panel stack">
      <span className="pill">โหมดทดสอบ · ไม่มีการตัดเงินจริง</span>
      <h1 className="h2">ชำระเงิน {baht(order.total)}</h1>
      <p className="muted">คำสั่งซื้อ <span className="mono">{order.orderNo}</span> · {PAY_LABEL[order.paymentMethod]}</p>
      <p className="sm">หน้านี้จำลองหน้าชำระเงินของผู้ให้บริการ เมื่อใส่ STRIPE_SECRET_KEY ในไฟล์ .env ลูกค้าจะถูกส่งไปชำระเงินจริงที่ Stripe แทน</p>
      <div className="cta">
        <button className="btn primary" disabled={busy} onClick={() => pay("success")}>จำลองชำระเงินสำเร็จ</button>
        <button className="btn" disabled={busy} onClick={() => pay("fail")}>จำลองชำระเงินไม่สำเร็จ</button>
      </div>
    </div>
  );
}
