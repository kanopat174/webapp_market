import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "../context/AppContext.jsx";
import { baht } from "../lib/format.js";
import { usePresence, useRevealRoot } from "../lib/motion.js";
import { Icon, ProductArt, artBg } from "./ui.jsx";
import ChatWidget from "./ChatWidget.jsx";

function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Vitara หน้าแรก">
      <span className="logo-cap" aria-hidden="true"><i /><i /></span>
      <span className="logo-word">Vitara</span>
    </Link>
  );
}

function SearchBox() {
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [q, setQ] = useState(params.get("q") || "");
  useEffect(() => { if (pathname === "/shop") setQ(params.get("q") || ""); }, [params, pathname]);
  return (
    <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); navigate(`/shop${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`); }}>
      <Icon name="search" size={17} />
      <input id="site-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา เช่น ผิวขาว, คอลลาเจน, นอนหลับ" aria-label="ค้นหาสินค้า" />
      <kbd className="hide-sm" aria-hidden="true">/</kbd>
    </form>
  );
}

function Header() {
  const { user, cart, setCartOpen } = useApp();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    // "/" jumps to search, like most modern shops
    const onKey = (e) => {
      if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement?.tagName)) { e.preventDefault(); document.getElementById("site-search")?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("keydown", onKey); };
  }, []);
  return (
    <header className={`site-header ${scrolled ? "scrolled" : ""}`}>
      <div className="wrap hbar">
        <Logo />
        <SearchBox />
        <nav className="hnav">
          <NavLink to="/shop" className="hlink hide-sm">สินค้าทั้งหมด</NavLink>
          <NavLink to="/quiz" className="hlink hide-sm quiz-link"><Icon name="sparkle" size={15} /> แบบทดสอบสุขภาพ</NavLink>
          {user?.role === "admin" && <NavLink to="/admin" className="hlink hide-sm">หลังร้าน</NavLink>}
          {user ? (
            <NavLink to="/account" className="hlink" aria-label="บัญชีของฉัน">
              <span className="avatar" aria-hidden="true">{user.name.trim().charAt(0)}</span>
              <span className="hide-sm">{user.name.split(" ")[0]}</span>
            </NavLink>
          ) : user === null ? (
            <NavLink to="/login" className="hlink">เข้าสู่ระบบ</NavLink>
          ) : null}
          <button id="cart-button" className="cartbtn" onClick={() => setCartOpen(true)} aria-label={`ตะกร้าสินค้า ${cart.count} ชิ้น`}>
            <Icon name="bag" size={18} />
            <span className="hide-sm">ตะกร้า</span>
            <span className="badge num" key={cart.count}>{cart.count}</span>
          </button>
        </nav>
      </div>
    </header>
  );
}

const FREE = 990;

export function CartDrawer() {
  const { cart, cartOpen, setCartOpen, setQty } = useApp();
  const { mounted, closing } = usePresence(cartOpen, 260);
  const navigate = useNavigate();
  useEffect(() => {
    if (!cartOpen) return;
    const onKey = (e) => e.key === "Escape" && setCartOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.classList.add("lock");
    return () => { window.removeEventListener("keydown", onKey); document.body.classList.remove("lock"); };
  }, [cartOpen, setCartOpen]);
  if (!mounted) return null;
  const left = Math.max(0, FREE - cart.subtotal);
  const go = (to) => { setCartOpen(false); navigate(to); };
  return (
    <div className={`overlay ${closing ? "closing" : ""}`}>
      <div className="scrim" onClick={() => setCartOpen(false)} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="ตะกร้าสินค้า">
        <div className="dhead"><h2>ตะกร้าสินค้า <span className="muted num">({cart.count})</span></h2><button className="x" onClick={() => setCartOpen(false)} aria-label="ปิด"><Icon name="x" /></button></div>
        {cart.items.length > 0 && (
          <div className="ship-meter">
            <div className="sm">{left ? <>ซื้อเพิ่มอีก <b className="num">{baht(left)}</b> รับส่งฟรี</> : <><Icon name="truck" size={16} /> ได้รับสิทธิ์ส่งฟรีแล้ว</>}</div>
            <div className="prog"><b style={{ width: `${Math.min(100, (cart.subtotal / FREE) * 100)}%` }} /></div>
          </div>
        )}
        <div className="dbody">
          {cart.items.length === 0 ? (
            <div className="empty-cart">
              <span className="empty-ill" aria-hidden="true"><Icon name="bag" size={40} /></span>
              <h3>ยังไม่มีสินค้าในตะกร้า</h3>
              <p className="muted sm">ลองให้ผู้ช่วย AI ช่วยเลือกสินค้าที่เหมาะกับคุณ</p>
              <button className="btn primary" onClick={() => go("/shop")}>เลือกซื้อสินค้า</button>
            </div>
          ) : cart.items.map(({ product: p, quantity, lineTotal, available, intervalDays, unitPrice }, i) => (
            <div className="line" key={p.id} style={{ "--i": i }}>
              <button className="thumb" style={artBg(p.art)} onClick={() => go(`/products/${p.slug}`)} aria-label={p.name}><ProductArt product={p} /></button>
              <div className="minw0">
                <div className="nm">{p.name}</div>
                {intervalDays > 0 && <span className="subtag"><Icon name="refresh" size={12} /> ส่งทุก {intervalDays} วัน</span>}
                <div className="muted sm num">{baht(unitPrice)} · {p.size}</div>
                {!available && <div className="err sm">เหลือ {p.stock} ชิ้น กรุณาลดจำนวน</div>}
                <button className="linkbtn sm" onClick={() => setQty(p.id, 0)}>ลบออก</button>
              </div>
              <div className="line-end">
                <b className="num">{baht(lineTotal)}</b>
                <Qty value={quantity} max={Math.min(20, p.stock)} onChange={(q) => setQty(p.id, q)} />
              </div>
            </div>
          ))}
        </div>
        {cart.items.length > 0 && (
          <div className="dfoot">
            <div className="tot grand"><span>ยอดรวมสินค้า</span><span className="num">{baht(cart.subtotal)}</span></div>
            <button className="btn primary block lg" onClick={() => go("/checkout")}>ดำเนินการชำระเงิน <Icon name="arrow" size={18} /></button>
            <button className="btn ghost block" onClick={() => go("/cart")}>ดูตะกร้าแบบเต็ม</button>
          </div>
        )}
      </aside>
    </div>
  );
}

export function Qty({ value, onChange, max = 20, min = 1 }) {
  return (
    <div className="qty">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="ลดจำนวน">−</button>
      <span className="num" aria-live="polite" key={value}>{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="เพิ่มจำนวน">+</button>
    </div>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap fgrid">
        <div className="fbrand">
          <Logo />
          <p className="muted sm">ร้านอาหารเสริมออนไลน์ เลือกสินค้าที่เหมาะกับคุณด้วยผู้ช่วย AI จัดส่งทั่วประเทศภายใน 1–2 วันทำการ</p>
          <div className="paylogos" aria-label="ช่องทางชำระเงิน"><span>PromptPay</span><span>VISA</span><span>Mastercard</span><span>เก็บเงินปลายทาง</span></div>
        </div>
        <div><h4>ช้อปปิ้ง</h4><Link to="/shop">สินค้าทั้งหมด</Link><Link to="/shop?sort=rating">รีวิวดีที่สุด</Link><Link to="/shop?sort=newest">สินค้าใหม่</Link></div>
        <div><h4>บัญชี</h4><Link to="/account">บัญชีของฉัน</Link><Link to="/account">ติดตามคำสั่งซื้อ</Link><Link to="/cart">ตะกร้าสินค้า</Link></div>
        <div><h4>ช่วยเหลือ</h4><Link to="/help">การจัดส่งและคืนสินค้า</Link><Link to="/help#privacy">นโยบายความเป็นส่วนตัว</Link></div>
      </div>
      <div className="wrap legal">ผลิตภัณฑ์เสริมอาหารไม่มีผลในการป้องกันหรือรักษาโรค ควรปรึกษาแพทย์หรือเภสัชกรก่อนใช้ โดยเฉพาะผู้ตั้งครรภ์ ให้นมบุตร หรือมีโรคประจำตัว · © {new Date().getFullYear()} Vitara</div>
    </footer>
  );
}

function ScrollTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow(window.scrollY > 900);
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <button className={`to-top ${show ? "show" : ""}`} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="กลับขึ้นด้านบน" tabIndex={show ? 0 : -1}>
      <Icon name="up" size={18} />
    </button>
  );
}

export default function Layout() {
  const { pathname } = useLocation();
  const mainRef = useRef(null);
  useRevealRoot(mainRef);
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return (
    <>
      <a href="#main" className="skip">ข้ามไปเนื้อหาหลัก</a>
      <Header />
      <main id="main" className="wrap page" ref={mainRef}>
        {/* keyed by path so each page plays its entrance */}
        <div className="route" key={pathname}><Outlet /></div>
      </main>
      <Footer />
      <CartDrawer />
      <ScrollTop />
      <ChatWidget />
    </>
  );
}
