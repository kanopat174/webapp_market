import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api.js";
import { baht, GENDER_LABEL, thaiDate, useTitle } from "../lib/format.js";
import { useApp } from "../context/AppContext.jsx";
import ProductCard from "../components/ProductCard.jsx";
import { Qty } from "../components/Layout.jsx";
import { askAssistant } from "../components/ChatWidget.jsx";
import { Breadcrumb, Empty, Field, Icon, Pagination, ProductArt, SkeletonDetail, Stars, artBg } from "../components/ui.jsx";
import { reducedMotion } from "../lib/motion.js";

/** Product photos with thumbnails and a zoomable full-screen view. Falls back to the drawn packshot. */
function Gallery({ product }) {
  const photos = product.images?.length ? product.images.map((i) => i.url) : product.imageUrl ? [product.imageUrl] : [];
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(false);
  useEffect(() => { setIndex(0); }, [product.id]);
  if (!photos.length) return <TiltGallery product={product} />;
  const current = photos[Math.min(index, photos.length - 1)];
  return (
    <div className="pgallery">
      <button className="gallery photo" onClick={() => setZoom(true)} aria-label="ดูรูปขนาดใหญ่">
        <img key={current} src={current} alt={product.name} className="art-img" />
        <span className="zoom-hint"><Icon name="search" size={16} /> คลิกเพื่อขยาย</span>
      </button>
      {photos.length > 1 && (
        <div className="thumbs" role="tablist" aria-label="รูปสินค้า">
          {photos.map((url, i) => (
            <button key={url} role="tab" aria-selected={i === index} className="thumb-btn" onClick={() => setIndex(i)}>
              <img src={url} alt={`รูปที่ ${i + 1}`} loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {zoom && <Lightbox photos={photos} start={index} name={product.name} onClose={(i) => { setIndex(i); setZoom(false); }} />}
    </div>
  );
}

function Lightbox({ photos, start, name, onClose }) {
  const [i, setI] = useState(start);
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState("50% 50%");
  const go = useCallback((d) => { setZoomed(false); setI((x) => (x + d + photos.length) % photos.length); }, [photos.length]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose(i);
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("lock");
    return () => { window.removeEventListener("keydown", onKey); document.body.classList.remove("lock"); };
  }, [i, go, onClose]);
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={`รูป ${name}`} onClick={(e) => e.target === e.currentTarget && onClose(i)}>
      <button className="x lb-close" onClick={() => onClose(i)} aria-label="ปิด"><Icon name="x" /></button>
      {photos.length > 1 && <button className="lb-nav prev" onClick={() => go(-1)} aria-label="รูปก่อนหน้า"><Icon name="arrow" /></button>}
      <div className={`lb-stage ${zoomed ? "zoomed" : ""}`}
        onClick={() => setZoomed((z) => !z)}
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`); }}>
        <img key={photos[i]} src={photos[i]} alt={name} style={{ transformOrigin: origin }} />
      </div>
      {photos.length > 1 && <button className="lb-nav next" onClick={() => go(1)} aria-label="รูปถัดไป"><Icon name="arrow" /></button>}
      <div className="lb-count num">{i + 1} / {photos.length} · คลิกที่รูปเพื่อซูม</div>
    </div>
  );
}

/** Choose between buying once and Subscribe & Save. */
function PurchaseOptions({ product, mode, setMode, every, setEvery, discountPct }) {
  const subPrice = Math.round((product.price * (100 - discountPct)) / 100);
  return (
    <div className="purchase" role="radiogroup" aria-label="รูปแบบการซื้อ">
      <label className={`popt ${mode === "once" ? "on" : ""}`}>
        <input type="radio" name="mode" checked={mode === "once"} onChange={() => setMode("once")} />
        <span className="popt-main"><b>ซื้อครั้งเดียว</b><span className="num">{baht(product.price)}</span></span>
      </label>
      <label className={`popt ${mode === "sub" ? "on" : ""}`}>
        <input type="radio" name="mode" checked={mode === "sub"} onChange={() => setMode("sub")} />
        <span className="popt-main">
          <b>สมัครรับประจำ <span className="pill save">ลด {discountPct}%</span></b>
          <span className="num"><s className="muted">{baht(product.price)}</s> {baht(subPrice)}</span>
        </span>
        {mode === "sub" && (
          <span className="popt-extra">
            <span className="muted sm">ส่งทุก</span>
            {[30, 60, 90].map((d) => (
              <button type="button" key={d} className={`chip ${every === d ? "" : ""}`} aria-pressed={every === d} onClick={(e) => { e.preventDefault(); setEvery(d); }}>{d} วัน</button>
            ))}
            <span className="muted sm block-line">{product.daysSupply ? `1 ชิ้นทานได้ประมาณ ${product.daysSupply} วัน · ` : ""}พัก ข้าม หรือยกเลิกได้ทุกเมื่อในหน้าบัญชี</span>
          </span>
        )}
      </label>
    </div>
  );
}

/** Gallery that tilts slightly toward the pointer. */
function TiltGallery({ product }) {
  const ref = useRef(null);
  const onMove = (e) => {
    if (reducedMotion() || e.pointerType !== "mouse") return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    ref.current.style.setProperty("--rx", `${(-y * 8).toFixed(2)}deg`);
    ref.current.style.setProperty("--ry", `${(x * 10).toFixed(2)}deg`);
    ref.current.style.setProperty("--gx", `${(x + 0.5) * 100}%`);
    ref.current.style.setProperty("--gy", `${(y + 0.5) * 100}%`);
  };
  const reset = () => { ["--rx", "--ry"].forEach((k) => ref.current?.style.setProperty(k, "0deg")); };
  return (
    <div className="gallery" style={artBg(product.art)} ref={ref} onPointerMove={onMove} onPointerLeave={reset}>
      <span className="gallery-shine" aria-hidden="true" />
      <div className="gallery-inner"><ProductArt product={product} /></div>
    </div>
  );
}

export default function Product() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState("desc");
  const { addToCart } = useApp();
  const navigate = useNavigate();
  const galleryRef = useRef(null);
  const buyRef = useRef(null);
  const [showBar, setShowBar] = useState(false);
  const [mode, setMode] = useState("once");
  const [every, setEvery] = useState(30);
  const [discountPct, setDiscountPct] = useState(10);
  useTitle(data?.product.name);
  useEffect(() => { api.get("/checkout/config").then((c) => setDiscountPct(c.subscription.discountPct)).catch(() => {}); }, []);

  // phones: show a sticky buy bar once the main buy buttons scroll out of view
  useEffect(() => {
    if (!buyRef.current || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setShowBar(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(buyRef.current);
    return () => io.disconnect();
  }, [data]);

  useEffect(() => {
    setData(null); setError(null); setQty(1); setTab("desc");
    api.get(`/products/${slug}`).then(setData).catch((e) => setError(e));
  }, [slug]);

  if (error) return <Empty title={error.status === 404 ? "ไม่พบสินค้านี้" : "โหลดข้อมูลไม่สำเร็จ"} action={<Link className="btn" to="/shop">ดูสินค้าทั้งหมด</Link>}>{error.status === 404 ? "สินค้าอาจถูกนำออกจากร้านแล้ว" : error.message}</Empty>;
  if (!data) return <SkeletonDetail />;

  const { product: p, similar } = data;
  const off = p.compareAtPrice > p.price ? Math.round((1 - p.price / p.compareAtPrice) * 100) : 0;
  const out = p.stock <= 0;

  return (
    <>
      <Breadcrumb items={[{ to: "/", label: "หน้าแรก" }, { to: `/shop?category=${p.category}`, label: p.categoryName }, { label: p.name }]} />
      <section className="detail">
        <div ref={galleryRef}><Gallery product={p} /></div>
        <div className="minw0">
          <span className="brandname">{p.brand} · {p.categoryName}</span>
          <h1>{p.name}</h1>
          <div className="meta"><Stars value={p.rating} /> <span className="num">{p.rating.toFixed(1)}</span> · <a href="#reviews">{p.reviewCount} รีวิว</a> · ขายแล้ว <span className="num">{p.sold.toLocaleString("th-TH")}</span> ชิ้น</div>
          <p className="lead">{p.description}</p>
          <div className="price big num">{baht(p.price)}{off > 0 && <><s>{baht(p.compareAtPrice)}</s><span className="pill sale">ประหยัด {off}%</span></>}</div>
          <div className="pills">{p.tags.map((t) => <Link key={t} to={`/shop?q=${encodeURIComponent(t)}`} className="pill">{t}</Link>)}</div>
          <dl className="specs">
            <dt>ขนาด</dt><dd>{p.size}</dd>
            <dt>เหมาะกับ</dt><dd>อายุ {p.ageMin}–{p.ageMax} ปี · {GENDER_LABEL[p.gender]}</dd>
            <dt>วิธีทาน</dt><dd>{p.usage}</dd>
            {p.fdaNo && <><dt>เลข อย.</dt><dd className="num">{p.fdaNo}</dd></>}
            <dt>สถานะ</dt><dd>{out ? <span className="err">สินค้าหมดชั่วคราว</span> : p.stock <= 10 ? <span className="warn">เหลือเพียง {p.stock} ชิ้น</span> : <span className="ok">มีสินค้าพร้อมส่ง</span>}</dd>
          </dl>
          {!out && <PurchaseOptions product={p} mode={mode} setMode={setMode} every={every} setEvery={setEvery} discountPct={discountPct} />}
          <div className="buyrow" ref={buyRef}>
            <Qty value={qty} max={Math.max(1, Math.min(20, p.stock))} onChange={setQty} />
            <button className="btn primary lg" disabled={out} onClick={() => addToCart(p, qty, { from: galleryRef.current?.querySelector(".art, .art-img"), intervalDays: mode === "sub" ? every : 0 })}>
              <Icon name="bag" size={18} /> {mode === "sub" ? "สมัครรับประจำ" : "เพิ่มลงตะกร้า"}
            </button>
            <button className="btn accent lg" disabled={out} onClick={async () => { if (await addToCart(p, qty, { open: false, intervalDays: mode === "sub" ? every : 0 })) navigate("/checkout"); }}>ซื้อเลย</button>
          </div>
          <button className="linkbtn" onClick={() => askAssistant(`${p.name} เหมาะกับฉันไหม`)}>ถามผู้ช่วย AI ว่าเหมาะกับคุณไหม →</button>
        </div>
      </section>

      <div className="tabs" role="tablist">
        {[["desc", "รายละเอียด"], ["ing", "ส่วนประกอบ"], ["use", "วิธีรับประทานและคำเตือน"]].map(([k, v]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{v}</button>
        ))}
      </div>
      <div className="tabpanel" role="tabpanel">
        {tab === "desc" && <><p>{p.description}</p><p className="muted sm">ผลลัพธ์อาจแตกต่างกันในแต่ละบุคคล ควรรับประทานอาหารให้ครบ 5 หมู่ควบคู่กัน</p></>}
        {tab === "ing" && <ul>{p.ingredients.map((i) => <li key={i}>{i}</li>)}</ul>}
        {tab === "use" && <><p>{p.usage}</p><p className="muted sm">{p.warnings || "ห้ามรับประทานเกินปริมาณที่แนะนำ"}</p></>}
      </div>

      <Reviews slug={p.slug} />

      <div className="section-h"><h2>สินค้าที่คล้ายกัน</h2><span className="muted sm">หมวดหมู่และประโยชน์ใกล้เคียง</span></div>
      <div className="grid">{similar.map((s, i) => <ProductCard key={s.id} product={s} index={i} />)}</div>

      <div className={`buybar ${showBar ? "show" : ""}`} aria-hidden={!showBar}>
        <div className="minw0"><div className="nm">{p.name}</div><b className="num">{baht(p.price)}</b></div>
        <button className="btn primary" tabIndex={showBar ? 0 : -1} disabled={out} onClick={() => addToCart(p, qty, { from: null })}><Icon name="bag" size={18} /> ใส่ตะกร้า</button>
      </div>
    </>
  );
}

function Reviews({ slug }) {
  const { user, toast } = useApp();
  const [data, setData] = useState(null);
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);

  const load = useCallback(() => api.get(`/products/${slug}/reviews?sort=${sort}&page=${page}`).then(setData).catch(() => {}), [slug, sort, page]);
  useEffect(() => { load(); }, [load]);

  if (!data) return null;
  const { summary } = data;
  return (
    <>
      <div className="section-h" id="reviews"><h2>รีวิวจากผู้ใช้</h2>
        <select aria-label="เรียงรีวิว" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
          <option value="newest">ล่าสุด</option><option value="highest">คะแนนสูงสุด</option><option value="lowest">คะแนนต่ำสุด</option>
        </select>
      </div>
      <div className="reviewwrap">
        <div className="summary" data-reveal>
          <div className="bignum num">{summary.average.toFixed(1)}</div>
          <Stars value={summary.average} size={18} />
          <div className="muted sm">จาก {summary.count} รีวิว</div>
          <div className="bars">
            {[5, 4, 3, 2, 1].map((n) => (
              <div className="bar" key={n}><span>{n}★</span><i><b style={{ width: `${summary.count ? (summary.distribution[n] / summary.count) * 100 : 0}%` }} /></i><span className="num">{summary.distribution[n]}</span></div>
            ))}
          </div>
        </div>
        <div className="reviews minw0">
          {data.reviews.length === 0 && <p className="muted">ยังไม่มีรีวิว เป็นคนแรกที่รีวิวสินค้านี้</p>}
          {data.reviews.map((r) => (
            <article className="review" key={r.id}>
              <div className="review-h">
                <b>{r.name}</b>{r.age && <span className="muted">อายุ {r.age} ปี</span>}<Stars value={r.rating} />
                {r.verified && <span className="verified">✓ ผู้ซื้อจริง</span>}
                {r.isSample && <span className="muted sm">รีวิวตัวอย่าง</span>}
                <span className="muted sm">{thaiDate(r.createdAt)}</span>
                {r.mine && <button className="linkbtn sm" onClick={async () => { await api.del(`/reviews/${r.id}`); toast("ลบรีวิวแล้ว"); load(); }}>ลบรีวิวของฉัน</button>}
              </div>
              <p>{r.body}</p>
            </article>
          ))}
          <Pagination page={data.page} pages={data.pages} onPage={setPage} />
          {user ? <ReviewForm slug={slug} user={user} onDone={() => { setSort("newest"); setPage(1); load(); }} />
            : user === null && <p className="muted"><Link to={`/login?next=/products/${slug}%23reviews`}>เข้าสู่ระบบ</Link> เพื่อเขียนรีวิว</p>}
        </div>
      </div>
    </>
  );
}

function ReviewForm({ slug, user, onDone }) {
  const { toast } = useApp();
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [age, setAge] = useState("");
  const [name, setName] = useState(user.name);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErrors({});
    try {
      const d = await api.post(`/products/${slug}/reviews`, { rating, body, displayName: name, ...(age ? { age: Number(age) } : {}) });
      toast(d.verified ? "บันทึกรีวิวแล้ว (ยืนยันว่าเป็นผู้ซื้อจริง)" : "บันทึกรีวิวแล้ว ขอบคุณค่ะ", "ok");
      setBody("");
      onDone();
    } catch (err) {
      setErrors(err.fieldErrors?.() || {});
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="rform" onSubmit={submit}>
      <b>เขียนรีวิวของคุณ</b>
      <div className="starpick" role="radiogroup" aria-label="ให้คะแนน">
        {[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} role="radio" aria-checked={rating === n} aria-label={`${n} ดาว`} className={n <= rating ? "on" : ""} onClick={() => setRating(n)}>★</button>)}
      </div>
      <div className="two">
        <Field label="ชื่อที่แสดง" id="rv-name"><input id="rv-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="อายุ (ไม่บังคับ)" id="rv-age"><input id="rv-age" type="number" min={5} max={120} value={age} onChange={(e) => setAge(e.target.value)} /></Field>
      </div>
      <Field label="ประสบการณ์การใช้งาน" id="rv-body" error={errors.body}>
        <textarea id="rv-body" rows={3} value={body} maxLength={1000} onChange={(e) => setBody(e.target.value)} required minLength={10} placeholder="ทานมานานเท่าไร รู้สึกอย่างไร" />
      </Field>
      <div><button className="btn primary" disabled={busy}>{busy ? "กำลังส่ง…" : "ส่งรีวิว"}</button></div>
    </form>
  );
}
