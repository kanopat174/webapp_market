import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext.jsx";
import { baht, useTitle } from "../lib/format.js";
import { Qty } from "../components/Layout.jsx";
import { Empty, ProductArt, artBg } from "../components/ui.jsx";

export default function Cart() {
  useTitle("ตะกร้าสินค้า");
  const { cart, setQty } = useApp();
  const navigate = useNavigate();
  const blocked = cart.items.some((i) => !i.available);

  if (!cart.items.length) {
    return <Empty title="ยังไม่มีสินค้าในตะกร้า" action={<Link className="btn primary" to="/shop">เลือกซื้อสินค้า</Link>}>เลือกสินค้าที่ต้องการ หรือให้ผู้ช่วย AI ช่วยแนะนำ</Empty>;
  }
  return (
    <>
      <div className="page-h"><h1>ตะกร้าสินค้า</h1><p className="muted"><span className="num">{cart.count}</span> ชิ้น</p></div>
      <div className="cols">
        <div className="panel minw0">
          {cart.items.map(({ product: p, quantity, lineTotal, available, intervalDays, unitPrice }) => (
            <div className="line" key={p.id}>
              <Link to={`/products/${p.slug}`} className="thumb" style={artBg(p.art)} aria-label={p.name}><ProductArt product={p} /></Link>
              <div className="minw0">
                <Link to={`/products/${p.slug}`} className="nm">{p.name}</Link>
                <div className="muted sm num">{p.brand} · {p.size} · {baht(unitPrice)}{intervalDays > 0 && <s className="was"> {baht(p.price)}</s>}</div>
                <select className="mode-select" aria-label="รูปแบบการซื้อ" value={intervalDays} onChange={(e) => setQty(p.id, quantity, Number(e.target.value))}>
                  <option value={0}>ซื้อครั้งเดียว</option>
                  {[30, 60, 90].map((d) => <option key={d} value={d}>สมัครรับประจำ ส่งทุก {d} วัน (ลด {cart.subscribeDiscountPct}%)</option>)}
                </select>
                {!available && <div className="err sm">เหลือ {p.stock} ชิ้น กรุณาลดจำนวน</div>}
                <button className="linkbtn sm" onClick={() => setQty(p.id, 0)}>ลบออก</button>
              </div>
              <div className="line-end"><b className="num">{baht(lineTotal)}</b><Qty value={quantity} max={Math.min(20, Math.max(p.stock, 1))} onChange={(q) => setQty(p.id, q)} /></div>
            </div>
          ))}
        </div>
        <aside className="osum">
          <b>สรุป</b>
          {cart.hasSubscription && <div className="notice sm">รายการที่สมัครรับประจำจะสร้างคำสั่งซื้อรอบถัดไปให้อัตโนมัติ และส่งอีเมลแจ้งก่อนทุกรอบ ต้องเข้าสู่ระบบเพื่อสมัคร</div>}
          <div className="it"><span>ยอดรวมสินค้า</span><span className="num">{baht(cart.subtotal)}</span></div>
          <div className="muted sm">ค่าจัดส่งและส่วนลดจะคำนวณในขั้นตอนชำระเงิน</div>
          <button className="btn primary block" disabled={blocked} onClick={() => navigate("/checkout")}>ดำเนินการชำระเงิน</button>
          <Link className="btn block" to="/shop">เลือกซื้อสินค้าต่อ</Link>
        </aside>
      </div>
    </>
  );
}
