import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../context/AppContext.jsx";
import { baht } from "../lib/format.js";
import { Icon, ProductArt, Stars, artBg } from "./ui.jsx";

export default function ProductCard({ product: p, index = 0 }) {
  const { addToCart } = useApp();
  const shotRef = useRef(null);
  const [added, setAdded] = useState(false);
  const off = p.compareAtPrice > p.price ? Math.round((1 - p.price / p.compareAtPrice) * 100) : 0;
  const out = p.stock <= 0;

  async function add() {
    if (await addToCart(p, 1, { from: shotRef.current?.querySelector(".art, .art-img") })) {
      setAdded(true);
      setTimeout(() => setAdded(false), 1400);
    }
  }

  return (
    <article className="card" data-reveal style={{ "--i": index % 8 }}>
      <Link to={`/products/${p.slug}`} className="shot" style={artBg(p.art)} aria-label={p.name} tabIndex={-1} ref={shotRef}>
        <span className="shot-glow" aria-hidden="true" />
        <ProductArt product={p} />
        <span className="tag">{p.categoryName}</span>
        {off > 0 && <span className="tag sale">-{off}%</span>}
        {out ? <span className="tag soldout">สินค้าหมด</span> : p.stock <= 10 && <span className="tag low">เหลือ {p.stock} ชิ้น</span>}
      </Link>
      <div className="body">
        <span className="brandname">{p.brand}</span>
        <h3><Link to={`/products/${p.slug}`}>{p.name}</Link></h3>
        <span className="meta"><Stars value={p.rating} /> <span className="num">{p.rating.toFixed(1)}</span> · {p.reviewCount} รีวิว</span>
        <div className="pricerow">
          <span className="price num">{baht(p.price)}{off > 0 && <s>{baht(p.compareAtPrice)}</s>}</span>
          <button className={`add ${added ? "added" : ""}`} disabled={out} onClick={add} aria-label={`เพิ่ม ${p.name} ลงตะกร้า`} title={out ? "สินค้าหมด" : "เพิ่มลงตะกร้า"}>
            <Icon name={added ? "check" : "plus"} size={18} stroke={2.4} />
          </button>
        </div>
      </div>
    </article>
  );
}
