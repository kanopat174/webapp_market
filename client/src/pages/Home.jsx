import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { useTitle } from "../lib/format.js";
import ProductCard from "../components/ProductCard.jsx";
import { askAssistant } from "../components/ChatWidget.jsx";
import { CATEGORY_ICON, Icon, ProductArt, SkeletonGrid, artBg } from "../components/ui.jsx";

const GOALS = [
  ["ผิวขาว กระจ่างใส", "อยากได้อาหารเสริมผิวขาว กระจ่างใส"],
  ["นอนไม่หลับ", "นอนไม่ค่อยหลับ เครียดบ่อย"],
  ["ปวดข้อเข่า", "ปวดข้อเข่า อายุ 60"],
  ["ลดน้ำหนัก", "อยากลดน้ำหนัก ออกกำลังกายอยู่"],
];

// shown in the hero before the catalogue loads, so the first frame is never empty
const PLACEHOLDER_ART = [
  { name: "Gluta", brand: "Lumière Lab", art: { shape: "jar", bg: "#f6e3c8", accent: "#d9a441" } },
  { name: "Omega-3", brand: "Seaflora", art: { shape: "bottle", bg: "#fff1c9", accent: "#c99410" } },
  { name: "Collagen", brand: "Seaflora", art: { shape: "tub", bg: "#d7ecf2", accent: "#3c8fb0" } },
];

const TRUST = [
  ["truck", "ส่งไว 1–2 วัน", "ส่งฟรีเมื่อซื้อครบ ฿990"],
  ["shield", "ชำระเงินปลอดภัย", "พร้อมเพย์ บัตร หรือเก็บเงินปลายทาง"],
  ["return", "เปลี่ยนคืนได้ 7 วัน", "ถ้าสินค้าเสียหายหรือผิดรายการ"],
  ["chat", "ปรึกษาฟรีด้วย AI", "แนะนำตามอายุ เพศ และงบ"],
];

const words = (text, start = 0) => text.split(" ").map((w, i) => <span key={i} className="word" style={{ "--d": `${start + i * 70}ms` }}>{w}&nbsp;</span>);

export default function Home() {
  useTitle("");
  const [popular, setPopular] = useState(null);
  const [deals, setDeals] = useState(null);
  const [cats, setCats] = useState([]);

  useEffect(() => {
    api.get("/products?sort=popular&pageSize=8").then((d) => setPopular(d.items)).catch(() => setPopular([]));
    api.get("/products?sort=rating&pageSize=24").then((d) => setDeals(d.items.filter((p) => p.compareAtPrice > p.price).slice(0, 4))).catch(() => setDeals([]));
    api.get("/categories").then((d) => setCats(d.categories)).catch(() => {});
  }, []);

  const avgRating = popular?.length ? popular.reduce((s, p) => s + p.rating, 0) / popular.length : 0;
  const heroItems = popular?.length >= 3 ? [popular[2], popular[0], popular[1]] : PLACEHOLDER_ART;

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow rise" style={{ "--d": "0ms" }}><Icon name="sparkle" size={14} /> ผู้ช่วย AI เลือกอาหารเสริมให้คุณ</p>
          <h1 className="hero-title">
            {words("อาหารเสริมที่")}<em>{words("เหมาะกับคุณ", 210)}</em><br />{words("เลือกง่ายใน 1 นาที", 420)}
          </h1>
          <p className="lead rise" style={{ "--d": "650ms" }}>บอกเป้าหมาย อายุ และงบประมาณ น้องวีจะเลือกสินค้าที่ตรงที่สุดพร้อมอธิบายเหตุผล</p>
          <div className="cta rise" style={{ "--d": "780ms" }}>
            <button className="btn primary lg glow" onClick={() => askAssistant()}><Icon name="chat" size={18} /> ปรึกษาผู้ช่วย AI</button>
            <Link className="btn lg ghost" to="/quiz"><Icon name="sparkle" size={18} /> ทำแบบทดสอบ 1 นาที</Link>
          </div>
          <div className="goal-chips rise" style={{ "--d": "900ms" }}>
            <span className="muted sm">ยอดนิยม:</span>
            {GOALS.map(([label, q]) => <button key={label} className="chip" onClick={() => askAssistant(q)}>{label}</button>)}
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <span className="blob b1" /><span className="blob b2" /><span className="ring" />
          {heroItems.map((p, i) => (
            <div key={p.slug || p.name} className={`float-pack p${i}`} style={artBg(p.art)}><ProductArt product={p} /></div>
          ))}
          {avgRating > 0 && <div className="float-chip c1"><Icon name="star" size={14} /> คะแนนเฉลี่ย {avgRating.toFixed(1)} จากรีวิว</div>}
          <div className="float-chip c2"><Icon name="truck" size={14} /> ส่งฟรีเมื่อซื้อครบ ฿990</div>
        </div>
      </section>

      <section className="trust">
        {TRUST.map(([icon, title, sub], i) => (
          <div className="trust-item" key={title} data-reveal style={{ "--i": i }}>
            <span className="trust-ic"><Icon name={icon} size={20} /></span>
            <div><b>{title}</b><span className="muted sm">{sub}</span></div>
          </div>
        ))}
      </section>

      <section className="quiz-band" data-reveal>
        <div className="qb-steps" aria-hidden="true">
          {["ตอบ 8 คำถาม", "AI จัดชุดให้", "รับตารางการทาน"].map((t, i) => <span key={t} style={{ "--i": i }}><b className="num">{i + 1}</b>{t}</span>)}
        </div>
        <div className="qb-copy">
          <h2>ไม่แน่ใจว่าควรทานอะไร?</h2>
          <p className="muted">ทำแบบทดสอบสุขภาพ 1 นาที แล้วรับชุดอาหารเสริมเฉพาะคุณ ภายในงบที่ตั้งไว้ พร้อมเวลาทานแต่ละตัว</p>
        </div>
        <Link className="btn primary lg" to="/quiz">เริ่มแบบทดสอบ <Icon name="arrow" size={18} /></Link>
      </section>

      <section>
        <div className="section-h" data-reveal><h2>เลือกตามเป้าหมาย</h2><Link to="/shop" className="more">ดูทั้งหมด <Icon name="arrow" size={16} /></Link></div>
        <div className="catgrid">
          {cats.map((c, i) => (
            <Link key={c.slug} to={`/shop?category=${c.slug}`} className="cat" data-reveal style={{ "--i": i }}>
              <span className="cat-ic"><Icon name={CATEGORY_ICON[c.slug] || "pill"} size={22} /></span>
              <b>{c.name}</b><span className="muted num">{c.count} รายการ</span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="section-h" data-reveal><h2>ขายดี</h2><Link to="/shop?sort=popular" className="more">ดูทั้งหมด <Icon name="arrow" size={16} /></Link></div>
        {popular ? <div className="grid">{popular.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}</div> : <SkeletonGrid count={8} />}
      </section>

      <section className="ai-band" data-reveal>
        <div className="ai-copy">
          <p className="eyebrow light"><Icon name="sparkle" size={14} /> น้องวี · ผู้ช่วย AI</p>
          <h2>ไม่รู้จะเริ่มจากตัวไหน?<br />เล่าให้น้องวีฟังได้เลย</h2>
          <p>พิมพ์เป้าหมายเป็นภาษาธรรมดา เลือกอายุ เพศ และงบ แล้วรับคำแนะนำพร้อมเหตุผลภายในไม่กี่วินาที</p>
          <button className="btn accent lg" onClick={() => askAssistant("อยากได้อาหารเสริมผิวขาว")}>ลองถามเลย <Icon name="arrow" size={18} /></button>
        </div>
        <div className="ai-demo" aria-hidden="true">
          <div className="demo-msg me" style={{ "--d": "200ms" }}>อายุ 28 อยากได้อาหารเสริมผิวขาว งบไม่เกิน 700</div>
          <div className="demo-typing" style={{ "--d": "700ms" }}><i /><i /><i /></div>
          <div className="demo-msg bot" style={{ "--d": "1500ms" }}>แนะนำ Gluta Bright + Vitamin C ค่ะ มีกลูต้าไธโอนคู่วิตามินซี เหมาะกับช่วงอายุและอยู่ในงบพอดี</div>
          <div className="demo-card" style={{ "--d": "1900ms" }}>
            <span className="demo-thumb" style={artBg(PLACEHOLDER_ART[0].art)}><ProductArt product={PLACEHOLDER_ART[0]} /></span>
            <span><b>Gluta Bright + Vitamin C</b><small>฿690 · ★ 4.7</small></span>
            <span className="demo-add"><Icon name="plus" size={16} stroke={2.4} /></span>
          </div>
        </div>
      </section>

      {deals?.length > 0 && (
        <section>
          <div className="section-h" data-reveal><h2>ราคาพิเศษ</h2><Link to="/shop" className="more">ดูทั้งหมด <Icon name="arrow" size={16} /></Link></div>
          <div className="grid">{deals.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}</div>
        </section>
      )}
    </>
  );
}
