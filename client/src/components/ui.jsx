import { Link } from "react-router-dom";

/** Generated packshot used when a product has no photo. */
export function ProductArt({ product, art = product?.art, name = product?.name, brand = product?.brand, imageUrl = product?.imageUrl, className = "" }) {
  if (imageUrl) return <img className={`art-img ${className}`} src={imageUrl} alt={name} loading="lazy" />;
  const bg = art?.bg || "#e9eee8";
  const ac = art?.accent || "#1f6b57";
  const short = (name || "").split(" ")[0].slice(0, 11);
  const label = (
    <>
      <text x="60" y="96" textAnchor="middle" fontFamily="Mitr,sans-serif" fontSize="13" fill={ac}>{short}</text>
      <text x="60" y="110" textAnchor="middle" fontFamily="IBM Plex Sans Thai,sans-serif" fontSize="7" fill="#556">{brand}</text>
    </>
  );
  const shape = art?.shape || "bottle";
  return (
    <svg className={`art ${className}`} viewBox="0 0 120 150" role="img" aria-label={name}>
      <ellipse cx="60" cy="143" rx="40" ry="5" fill="#000" opacity=".08" />
      {shape === "jar" && <><rect x="30" y="34" width="60" height="12" rx="3" fill={ac} /><rect x="24" y="46" width="72" height="92" rx="14" fill="#fff" /><rect x="24" y="78" width="72" height="40" fill={bg} /></>}
      {shape === "tub" && <><rect x="18" y="40" width="84" height="14" rx="4" fill={ac} /><path d="M20 54h80l-6 86H26z" fill="#fff" /><rect x="22" y="80" width="76" height="40" fill={bg} /></>}
      {shape === "box" && <><rect x="22" y="30" width="76" height="110" rx="4" fill="#fff" /><rect x="22" y="30" width="76" height="22" rx="4" fill={ac} /><rect x="22" y="78" width="76" height="42" fill={bg} /></>}
      {shape === "bottle" && <><rect x="44" y="18" width="32" height="16" rx="3" fill={ac} /><rect x="48" y="34" width="24" height="8" fill="#e8ece8" /><rect x="26" y="42" width="68" height="98" rx="16" fill="#fff" /><rect x="26" y="78" width="68" height="42" fill={bg} /></>}
      {label}
      <rect x="30" y="50" width="6" height="80" rx="3" fill="#fff" opacity=".5" />
    </svg>
  );
}

export const artBg = (art) => ({
  background: `linear-gradient(160deg, ${art?.bg || "#e9eee8"}, color-mix(in srgb, ${art?.bg || "#e9eee8"} 55%, var(--surface)))`,
});

export function Stars({ value, size }) {
  const n = Math.round(value || 0);
  return <span className="stars" style={size ? { fontSize: size } : undefined} aria-label={`${value} จาก 5 ดาว`}>{"★★★★★".slice(0, n)}<span className="off">{"★★★★★".slice(0, 5 - n)}</span></span>;
}

export function Spinner({ label = "กำลังโหลด…" }) {
  return <div className="spinner" role="status"><span className="dot" /><span>{label}</span></div>;
}

/* Line icons: 24px grid, drawn with currentColor so they follow the text colour. */
const ICONS = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  bag: <><path d="M5 8h14l-1.2 11.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></>,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  truck: <><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17.5" cy="17.5" r="1.8" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  sparkle: <path d="M12 3.5 13.8 10 20.5 12l-6.7 2L12 20.5 10.2 14 3.5 12l6.7-2z" />,
  shield: <><path d="M12 3 5 6v5.5c0 4.3 3 7.9 7 9.5 4-1.6 7-5.2 7-9.5V6z" /><path d="m9 12 2.2 2.2L15.5 10" /></>,
  bone: <path d="M7.5 4.5a2.5 2.5 0 0 0-2.4 3.2A2.5 2.5 0 1 0 8.3 11L13 15.7a2.5 2.5 0 1 0 3.3 3.2 2.5 2.5 0 1 0 3.2-3.3 2.5 2.5 0 0 0-3.2-2.4L11.6 8.5A2.5 2.5 0 0 0 7.5 4.5z" />,
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  scale: <><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M9 9.5a4 4 0 0 1 6 0l-2 2.5" /></>,
  leaf: <><path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14z" /><path d="M5 19 13 11" /></>,
  drop: <path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5z" />,
  dumbbell: <path d="M3 10v4M6 7.5v9M18 7.5v9M21 10v4M6 12h12" />,
  pill: <><rect x="3.5" y="8.5" width="17" height="7" rx="3.5" transform="rotate(-35 12 12)" /><path d="m9.6 8.6 4.8 6.8" /></>,
  chat: <path d="M4.5 5.5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4.5 3.5v-3.5h-1a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z" />,
  send: <path d="M4 12 20 4l-6 16-2.5-6.5z" />,
  refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 5v6h-6" /></>,
  star: <path d="m12 3.8 2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.8l-5.1 2.6 1-5.6-4.1-4 5.7-.8z" />,
  return: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>,
};

export const CATEGORY_ICON = { skin: "drop", immune: "shield", bone: "bone", brain: "moon", eye: "eye", weight: "scale", gut: "leaf", hair: "sparkle", sport: "dumbbell", vital: "pill" };

export function Icon({ name, size = 20, className = "", stroke = 1.9 }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>
  );
}

/** Placeholder cards with a shimmer, shaped like the real grid so nothing jumps when data arrives. */
export function SkeletonGrid({ count = 8 }) {
  return (
    <div className="grid" aria-busy="true" aria-label="กำลังโหลดสินค้า">
      {Array.from({ length: count }, (_, i) => (
        <div className="card skel-card" key={i} style={{ "--i": i }}>
          <div className="skel shot-skel" />
          <div className="body"><div className="skel line-skel w40" /><div className="skel line-skel w80" /><div className="skel line-skel w60" /><div className="skel line-skel w30 tall" /></div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonDetail() {
  return (
    <div className="detail" aria-busy="true" aria-label="กำลังโหลด">
      <div className="skel gallery-skel" />
      <div className="stack"><div className="skel line-skel w30" /><div className="skel line-skel w80 xl" /><div className="skel line-skel w60" /><div className="skel line-skel w90" /><div className="skel line-skel w40 xl" /><div className="skel block-skel" /></div>
    </div>
  );
}

export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Field({ label, error, hint, children, id }) {
  return (
    <label className="fld" htmlFor={id}>
      <span className="fld-label">{label}</span>
      {children}
      {error ? <span className="fld-err">{error}</span> : hint ? <span className="fld-hint">{hint}</span> : null}
    </label>
  );
}

export function Pagination({ page, pages, onPage }) {
  if (pages <= 1) return null;
  const nums = [];
  for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++) nums.push(i);
  return (
    <nav className="pager" aria-label="เปลี่ยนหน้า">
      <button className="btn sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>ก่อนหน้า</button>
      {nums.map((n) => <button key={n} className={`btn sm ${n === page ? "primary" : ""}`} aria-current={n === page ? "page" : undefined} onClick={() => onPage(n)}>{n}</button>)}
      <button className="btn sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>ถัดไป</button>
    </nav>
  );
}

export function Breadcrumb({ items }) {
  return (
    <nav className="crumbs" aria-label="breadcrumb">
      {items.map((it, i) => (
        <span key={i}>{it.to ? <Link to={it.to}>{it.label}</Link> : <span aria-current="page">{it.label}</span>}{i < items.length - 1 && <span className="sep">/</span>}</span>
      ))}
    </nav>
  );
}
