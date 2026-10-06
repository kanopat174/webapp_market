import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, qs } from "../lib/api.js";
import { AGE_OPTIONS, useTitle } from "../lib/format.js";
import ProductCard from "../components/ProductCard.jsx";
import { askAssistant } from "../components/ChatWidget.jsx";
import { CATEGORY_ICON, Empty, Icon, Pagination, SkeletonGrid } from "../components/ui.jsx";

const SORTS = [["popular", "ยอดนิยม"], ["rating", "คะแนนรีวิว"], ["price_asc", "ราคา ต่ำ → สูง"], ["price_desc", "ราคา สูง → ต่ำ"], ["newest", "สินค้าใหม่"]];
const PRICES = [["", "ทุกราคา"], ["0-500", "ไม่เกิน ฿500"], ["500-800", "฿500–800"], ["800-1200", "฿800–1,200"], ["1200-", "฿1,200 ขึ้นไป"]];

/** All products. Every filter lives in the URL so results can be shared and survive reloads. */
export default function Shop() {
  const [params, setParams] = useSearchParams();
  const [cats, setCats] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const f = {
    q: params.get("q") || "",
    category: params.get("category") || "",
    age: params.get("age") || "",
    gender: params.get("gender") || "",
    price: params.get("price") || "",
    sort: params.get("sort") || "popular",
    inStock: params.get("inStock") || "",
    page: Number(params.get("page")) || 1,
  };
  const catName = cats.find((c) => c.slug === f.category)?.name;
  useTitle(f.q ? `ค้นหา “${f.q}”` : catName || "สินค้าทั้งหมด");

  useEffect(() => { api.get("/categories").then((d) => setCats(d.categories)).catch(() => {}); }, []);

  useEffect(() => {
    const [minPrice, maxPrice] = f.price.split("-");
    setLoading(true);
    setError(null);
    api.get(`/products${qs({ q: f.q, category: f.category, age: f.age, gender: f.gender, minPrice, maxPrice, sort: f.sort, inStock: f.inStock, page: f.page, pageSize: 24 })}`)
      .then((d) => setData({ ...d, key: params.toString() }))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.toString()]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  };
  const clear = () => setParams(f.q ? { q: f.q } : {});
  const filtered = f.category || f.age || f.gender || f.price || f.inStock;

  return (
    <>
      <div className="page-h">
        <h1>{f.q ? <>ผลการค้นหา “{f.q}”</> : catName || "สินค้าทั้งหมด"}</h1>
        {data && <p className="muted">พบ <b className="num" key={data.total}>{data.total}</b> รายการ</p>}
      </div>

      <div className="chips" role="group" aria-label="หมวดหมู่">
        <button className="chip" aria-pressed={!f.category} onClick={() => set("category", "")}>ทั้งหมด</button>
        {cats.map((c) => <button key={c.slug} className="chip" aria-pressed={f.category === c.slug} onClick={() => set("category", c.slug)}><Icon name={CATEGORY_ICON[c.slug] || "pill"} size={15} />{c.name}</button>)}
      </div>

      <div className="toolbar">
        <div className="selects">
          <select aria-label="ช่วงอายุ" value={f.age} onChange={(e) => set("age", e.target.value)}>{AGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          <select aria-label="เพศ" value={f.gender} onChange={(e) => set("gender", e.target.value)}><option value="">ทุกเพศ</option><option value="female">ผู้หญิง</option><option value="male">ผู้ชาย</option></select>
          <select aria-label="ช่วงราคา" value={f.price} onChange={(e) => set("price", e.target.value)}>{PRICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <label className="check"><input type="checkbox" checked={Boolean(f.inStock)} onChange={(e) => set("inStock", e.target.checked ? "1" : "")} /> มีสินค้าพร้อมส่ง</label>
          {filtered && <button className="linkbtn" onClick={clear}>ล้างตัวกรอง</button>}
        </div>
        <select aria-label="เรียงลำดับ" value={f.sort} onChange={(e) => set("sort", e.target.value)}>{SORTS.map(([v, l]) => <option key={v} value={v}>เรียงตาม: {l}</option>)}</select>
      </div>

      {error ? <Empty title="โหลดสินค้าไม่สำเร็จ">{error}</Empty>
        : !data ? <SkeletonGrid count={12} />
        : data.items.length === 0 ? (
          <Empty title={f.q ? `ไม่พบสินค้าที่ตรงกับ “${f.q}”` : "ไม่พบสินค้าตามตัวกรองนี้"}
            action={<div className="cta center"><button className="btn" onClick={clear}>ล้างตัวกรอง</button><button className="btn primary" onClick={() => askAssistant(f.q || undefined)}>ถามผู้ช่วย AI</button></div>}>
            ลองใช้คำค้นอื่น หรือให้ผู้ช่วย AI ช่วยเลือกให้
          </Empty>
        ) : (
          <>
            <div className={`grid ${loading ? "refreshing" : ""}`} key={data.key}>{data.items.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}</div>
            <Pagination page={data.page} pages={data.pages} onPage={(n) => { set("page", String(n)); window.scrollTo(0, 0); }} />
          </>
        )}
    </>
  );
}
