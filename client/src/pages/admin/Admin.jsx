import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, NavLink, Outlet } from "react-router-dom";
import { api, qs } from "../../lib/api.js";
import { baht, thaiDate, PAY_LABEL, useTitle } from "../../lib/format.js";
import { useApp } from "../../context/AppContext.jsx";
import { Empty, Field, Icon, Pagination, Spinner } from "../../components/ui.jsx";
import { useCountUp } from "../../lib/motion.js";

export function AdminLayout() {
  const { user } = useApp();
  if (user === undefined) return <Spinner />;
  if (!user) return <Navigate to="/login?next=/admin" replace />;
  if (user.role !== "admin") return <Empty title="สำหรับผู้ดูแลระบบเท่านั้น" action={<Link className="btn" to="/">กลับหน้าแรก</Link>} />;
  return (
    <div className="admin">
      <nav className="admin-nav">
        <NavLink end to="/admin">ภาพรวม</NavLink>
        <NavLink to="/admin/orders">คำสั่งซื้อ</NavLink>
        <NavLink to="/admin/products">สินค้า</NavLink>
        <NavLink to="/admin/coupons">โค้ดส่วนลด</NavLink>
        <NavLink to="/admin/subscriptions">สมัครรับประจำ</NavLink>
        <NavLink to="/admin/emails">อีเมล</NavLink>
      </nav>
      <Outlet />
    </div>
  );
}

function Kpi({ label, value, money, sub, attn, i }) {
  const n = useCountUp(value);
  return (
    <div className={`kpi ${attn ? "attn" : ""}`} data-reveal style={{ "--i": i }}>
      <span>{label}</span><b className="num">{money ? baht(n) : n.toLocaleString("th-TH")}</b><small>{sub}</small>
    </div>
  );
}

export function Dashboard() {
  useTitle("หลังร้าน");
  const [s, setS] = useState(null);
  useEffect(() => { api.get("/admin/stats").then(setS).catch(() => setS(false)); }, []);
  if (s === false) return <Empty title="โหลดข้อมูลไม่สำเร็จ" />;
  if (!s) return <Spinner />;
  const waiting = (s.byStatus.processing || 0) + (s.byStatus.paid || 0);
  return (
    <>
      <div className="page-h row"><h1>ภาพรวมร้าน</h1><RunJobs /></div>
      <div className="kpis">
        <Kpi label="ยอดขายรวม" value={s.revenue} money sub={`${s.paidOrders} คำสั่งซื้อ`} i={0} />
        <Kpi label="วันนี้" value={s.todayRevenue} money sub={`${s.todayOrders} คำสั่งซื้อ`} i={1} />
        <Kpi label="รอจัดส่ง" value={waiting} attn={waiting > 0} sub={<Link to="/admin/orders?status=processing">ดูรายการ →</Link>} i={2} />
        <Kpi label="ลูกค้าสมาชิก" value={s.customers} sub=" " i={3} />
      </div>
      <div className="cols even">
        <section className="panel">
          <h2 className="h3">สินค้าใกล้หมด</h2>
          {s.lowStock.length === 0 ? <p className="muted">สต็อกเพียงพอทุกรายการ</p> : (
            <table className="table"><tbody>{s.lowStock.map((p) => (
              <tr key={p.id}><td><Link to={`/products/${p.slug}`}>{p.name}</Link></td><td className="r"><span className={`status ${p.stock === 0 ? "s-cancelled" : "s-pending_payment"}`}>เหลือ {p.stock}</span></td></tr>
            ))}</tbody></table>
          )}
        </section>
        <section className="panel">
          <h2 className="h3">สินค้าขายดี</h2>
          {s.topProducts.length === 0 ? <p className="muted">ยังไม่มีคำสั่งซื้อ</p> : (
            <table className="table"><thead><tr><th>สินค้า</th><th className="r">ชิ้น</th><th className="r">ยอดขาย</th></tr></thead>
              <tbody>{s.topProducts.map((p) => <tr key={p.id}><td>{p.name}</td><td className="r num">{p.qty}</td><td className="r num">{baht(p.revenue)}</td></tr>)}</tbody></table>
          )}
        </section>
        <section className="panel">
          <h2 className="h3">ยอดขาย 14 วันล่าสุด</h2>
          {s.daily.length === 0 ? <p className="muted">ยังไม่มีคำสั่งซื้อ</p> : (
            <table className="table"><thead><tr><th>วันที่</th><th className="r">คำสั่งซื้อ</th><th className="r">ยอดขาย</th></tr></thead>
              <tbody>{[...s.daily].reverse().map((d) => <tr key={d.day}><td>{thaiDate(d.day)}</td><td className="r num">{d.orders}</td><td className="r num">{baht(d.total)}</td></tr>)}</tbody></table>
          )}
        </section>
      </div>
    </>
  );
}

export function AdminOrders() {
  useTitle("จัดการคำสั่งซื้อ");
  const { toast } = useApp();
  const initial = new URLSearchParams(window.location.search).get("status") || "";
  const [status, setStatus] = useState(initial);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);

  const load = useCallback(() => api.get(`/admin/orders${qs({ status, q, page })}`).then(setData).catch((e) => toast(e.message, "error")), [status, q, page, toast]);
  useEffect(() => { load(); }, [load]);

  async function change(order, next, trackingNo) {
    try {
      await api.patch(`/admin/orders/${order.id}`, { status: next, ...(trackingNo ? { trackingNo } : {}) });
      toast(`อัปเดต ${order.orderNo} แล้ว`, "ok");
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  return (
    <>
      <div className="page-h"><h1>คำสั่งซื้อ</h1>{data && <p className="muted">{data.total} รายการ</p>}</div>
      <div className="toolbar">
        <div className="selects">
          <select aria-label="สถานะ" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">ทุกสถานะ</option>
            {data && Object.entries(data.statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <form onSubmit={(e) => { e.preventDefault(); setQ(e.target.elements.oq.value.trim()); setPage(1); }}>
            <input name="oq" id="oq" placeholder="ค้นหาเลขที่ ชื่อ อีเมล เบอร์โทร" aria-label="ค้นหาคำสั่งซื้อ" />
          </form>
        </div>
      </div>
      {!data ? <Spinner /> : data.orders.length === 0 ? <Empty title="ไม่มีคำสั่งซื้อ" /> : (
        <div className="table-wrap panel">
          <table className="table">
            <thead><tr><th>เลขที่</th><th>วันที่</th><th>ลูกค้า</th><th>ชำระ</th><th className="r">ยอด</th><th>สถานะ</th><th /></tr></thead>
            <tbody>
              {data.orders.map((o) => (
                <OrderRow key={o.id} o={o} open={open === o.id} onToggle={() => setOpen(open === o.id ? null : o.id)} next={data.nextStatus[o.status]} labels={data.statusLabels} onChange={change} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={data.page} pages={data.pages} onPage={setPage} />}
    </>
  );
}

function OrderRow({ o, open, onToggle, next, labels, onChange }) {
  const [tracking, setTracking] = useState(o.trackingNo || "");
  return (
    <>
      <tr>
        <td><Link className="mono" to={`/orders/${o.orderNo}`}>{o.orderNo}</Link></td>
        <td>{thaiDate(o.createdAt, true)}</td>
        <td>{o.shipping.name}<div className="muted sm">{o.email}</div></td>
        <td>{PAY_LABEL[o.paymentMethod]}<div className="muted sm">{o.paymentStatus === "paid" ? "ชำระแล้ว" : o.paymentStatus === "cod_pending" ? "ปลายทาง" : "ยังไม่ชำระ"}</div></td>
        <td className="r num">{baht(o.total)}</td>
        <td><span className={`status s-${o.status}`}>{o.statusLabel}</span></td>
        <td className="r"><button className="btn sm" onClick={onToggle} aria-expanded={open}>{open ? "ปิด" : "จัดการ"}</button></td>
      </tr>
      {open && (
        <tr className="expand">
          <td colSpan={7}>
            <div className="cols even">
              <div>
                <b>สินค้า</b>
                <ul>{o.items.map((i, k) => <li key={k}>{i.name} × {i.quantity} <span className="muted num">({baht(i.unitPrice * i.quantity)})</span></li>)}</ul>
                <b>จัดส่ง</b>
                <p>{o.shipping.name} · {o.shipping.phone}<br />{o.shipping.address} {o.shipping.province} {o.shipping.postcode}</p>
                {o.note && <p><b>หมายเหตุ:</b> {o.note}</p>}
              </div>
              <div className="stack">
                {next.length === 0 ? <p className="muted">คำสั่งซื้อนี้ปิดแล้ว</p> : (
                  <>
                    {next.includes("shipped") && <Field label="เลขพัสดุ" id={`tr-${o.id}`}><input id={`tr-${o.id}`} value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="เช่น TH0123456789" /></Field>}
                    <div className="cta">
                      {next.map((s) => (
                        <button key={s} className={`btn sm ${s === "cancelled" ? "danger" : "primary"}`}
                          disabled={s === "shipped" && !tracking.trim()}
                          onClick={() => onChange(o, s, s === "shipped" ? tracking.trim() : undefined)}>
                          {s === "cancelled" ? "ยกเลิกคำสั่งซื้อ" : `เปลี่ยนเป็น “${labels[s]}”`}
                        </button>
                      ))}
                    </div>
                    {next.includes("cancelled") && <p className="muted sm">การยกเลิกจะคืนสต็อกสินค้าอัตโนมัติ หากลูกค้าชำระเงินแล้วต้องคืนเงินผ่านระบบชำระเงินด้วย</p>}
                  </>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

const EMPTY_PRODUCT = { slug: "", name: "", brand: "", category: "skin", price: 0, compareAtPrice: null, size: "", shape: "bottle", colorBg: "#e9eee8", colorAccent: "#1f6b57",
  imageUrl: "", tags: [], ageMin: 18, ageMax: 80, gender: "all", description: "", ingredients: [], usage: "", warnings: "", fdaNo: "", stock: 0, isActive: true,
  daysSupply: 30, images: [] };

export function AdminProducts() {
  useTitle("จัดการสินค้า");
  const { toast } = useApp();
  const [data, setData] = useState(null);
  const [cats, setCats] = useState([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => api.get(`/admin/products${qs({ q })}`).then(setData).catch((e) => toast(e.message, "error")), [q, toast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/categories").then((d) => setCats(d.categories)); }, []);

  const edit = (p) => setEditing(p ? {
    id: p.id, slug: p.slug, name: p.name, brand: p.brand, category: p.category, price: p.price, compareAtPrice: p.compareAtPrice, size: p.size,
    shape: p.art.shape, colorBg: p.art.bg, colorAccent: p.art.accent, imageUrl: p.externalImageUrl || "", tags: p.tags, ageMin: p.ageMin, ageMax: p.ageMax,
    gender: p.gender, description: p.description, ingredients: p.ingredients, usage: p.usage, warnings: p.warnings || "", fdaNo: p.fdaNo || "",
    stock: p.stock, isActive: p.isActive, daysSupply: p.daysSupply ?? "", images: p.images || [],
  } : { ...EMPTY_PRODUCT });

  async function remove(p) {
    try {
      const d = await api.del(`/admin/products/${p.id}`);
      toast(d.archived ? "สินค้านี้มีในคำสั่งซื้อเดิม จึงซ่อนจากร้านแทนการลบ" : "ลบสินค้าแล้ว", "ok");
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  return (
    <>
      <div className="page-h row"><h1>สินค้า</h1><button className="btn primary" onClick={() => edit(null)}>+ เพิ่มสินค้า</button></div>
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setQ(e.target.elements.pq.value.trim()); }}>
        <input name="pq" id="pq" placeholder="ค้นหาสินค้า" aria-label="ค้นหาสินค้า" />
      </form>
      {!data ? <Spinner /> : (
        <div className="table-wrap panel">
          <table className="table">
            <thead><tr><th>สินค้า</th><th>หมวด</th><th className="r">ราคา</th><th className="r">สต็อก</th><th className="r">ขายแล้ว</th><th>สถานะ</th><th /></tr></thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.name}</b><div className="muted sm">{p.brand} · {p.size}</div></td>
                  <td>{p.categoryName}</td>
                  <td className="r num">{baht(p.price)}</td>
                  <td className="r num"><span className={p.stock <= 10 ? "warn" : ""}>{p.stock}</span></td>
                  <td className="r num">{p.sold}</td>
                  <td>{p.isActive ? <span className="status s-delivered">แสดง</span> : <span className="status s-cancelled">ซ่อน</span>}</td>
                  <td className="r nowrap"><button className="btn sm" onClick={() => edit(p)}>แก้ไข</button> <ConfirmButton onConfirm={() => remove(p)}>ลบ</ConfirmButton></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <ProductForm initial={editing} cats={cats} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} onChanged={load} />}
    </>
  );
}

/** Two-step delete: the first click arms the button, the second confirms. */
function ConfirmButton({ onConfirm, children }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 3000); return () => clearTimeout(t); }, [armed]);
  return <button className={`btn sm ${armed ? "danger" : ""}`} onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>{armed ? "กดอีกครั้งเพื่อยืนยัน" : children}</button>;
}

/** Upload, reorder and delete a product's photos. The first photo is the one shown on cards. */
function ImageManager({ productId, images, onChange }) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  async function upload(files) {
    const list = [...files].filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
    if (!list.length) { toast("รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP", "error"); return; }
    const form = new FormData();
    list.forEach((f) => form.append("images", f));
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/products/${productId}/images`, { method: "POST", body: form, credentials: "same-origin" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "อัปโหลดไม่สำเร็จ");
      onChange(d.product.images);
      toast(`อัปโหลด ${list.length} รูปแล้ว`, "ok");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function move(i, d) {
    const ids = images.map((x) => x.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    try { onChange((await api.put(`/admin/products/${productId}/images/order`, { ids })).product.images); } catch (e) { toast(e.message, "error"); }
  }

  async function remove(img) {
    try { onChange((await api.del(`/admin/products/${productId}/images/${img.id}`)).product.images); } catch (e) { toast(e.message, "error"); }
  }

  return (
    <div className="img-manager">
      <span className="fld-label">รูปสินค้า (รูปแรกจะแสดงในหน้ารวมสินค้า)</span>
      <div className="img-grid">
        {images.map((img, i) => (
          <figure key={img.id} className="img-tile">
            <img src={img.url} alt={`รูปที่ ${i + 1}`} />
            {i === 0 && <span className="tag">รูปหลัก</span>}
            <figcaption>
              <button type="button" className="x" disabled={i === 0} onClick={() => move(i, -1)} aria-label="เลื่อนไปซ้าย" title="เลื่อนไปซ้าย"><Icon name="arrow" size={14} className="flip" /></button>
              <button type="button" className="x" disabled={i === images.length - 1} onClick={() => move(i, 1)} aria-label="เลื่อนไปขวา" title="เลื่อนไปขวา"><Icon name="arrow" size={14} /></button>
              <button type="button" className="x" onClick={() => remove(img)} aria-label="ลบรูป" title="ลบรูป"><Icon name="x" size={14} /></button>
            </figcaption>
          </figure>
        ))}
        <label className={`img-drop ${drag ? "drag" : ""} ${busy ? "busy" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}>
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} disabled={busy} />
          <Icon name="plus" size={22} />
          <span className="sm">{busy ? "กำลังอัปโหลด…" : "ลากรูปมาวาง หรือคลิกเพื่อเลือก"}</span>
          <span className="muted sm">JPG / PNG / WebP ไม่เกิน 5 MB</span>
        </label>
      </div>
    </div>
  );
}

function ProductForm({ initial, cats, onClose, onSaved, onChanged }) {
  const { toast } = useApp();
  const [p, setP] = useState({ ...initial, tagsText: initial.tags.join(", "), ingText: initial.ingredients.join("\n") });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k, conv = (v) => v) => (e) => setP({ ...p, [k]: conv(e.target.type === "checkbox" ? e.target.checked : e.target.value) });
  const int = (v) => (v === "" ? "" : Number(v));

  async function save(e) {
    e.preventDefault();
    setBusy(true); setErrors({});
    const { id, tagsText, ingText, images, ...rest } = p;
    const body = {
      ...rest,
      compareAtPrice: rest.compareAtPrice ? Number(rest.compareAtPrice) : null,
      price: Number(rest.price), stock: Number(rest.stock), ageMin: Number(rest.ageMin), ageMax: Number(rest.ageMax),
      daysSupply: rest.daysSupply ? Number(rest.daysSupply) : null,
      tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean),
      ingredients: ingText.split("\n").map((t) => t.trim()).filter(Boolean),
      imageUrl: rest.imageUrl || null, warnings: rest.warnings || null, fdaNo: rest.fdaNo || null,
    };
    try {
      if (id) {
        await api.put(`/admin/products/${id}`, body);
        toast("บันทึกสินค้าแล้ว", "ok");
        onSaved();
      } else {
        // keep the form open so photos can be added to the new product right away
        const d = await api.post("/admin/products", body);
        setP((prev) => ({ ...prev, id: d.product.id }));
        toast("สร้างสินค้าแล้ว เพิ่มรูปด้านล่างได้เลย", "ok");
        onChanged();
      }
    } catch (err) {
      setErrors(err.fieldErrors?.() || {});
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-label="แก้ไขสินค้า">
        <form className="mbox stack" onSubmit={save}>
          <div className="dhead"><h2>{p.id ? "แก้ไขสินค้า" : "เพิ่มสินค้า"}</h2><button type="button" className="x" onClick={onClose} aria-label="ปิด">✕</button></div>
          <div className="mbody stack">
            <div className="two">
              <Field label="ชื่อสินค้า" id="pf-name" error={errors.name}><input id="pf-name" value={p.name} onChange={set("name")} required /></Field>
              <Field label="slug (ใช้ใน URL)" id="pf-slug" error={errors.slug} hint="a-z, 0-9 และ -"><input id="pf-slug" value={p.slug} onChange={set("slug")} required /></Field>
            </div>
            <div className="three">
              <Field label="แบรนด์" id="pf-brand" error={errors.brand}><input id="pf-brand" value={p.brand} onChange={set("brand")} required /></Field>
              <Field label="หมวดหมู่" id="pf-cat" error={errors.category}><select id="pf-cat" value={p.category} onChange={set("category")}>{cats.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></Field>
              <Field label="ขนาด" id="pf-size" error={errors.size}><input id="pf-size" value={p.size} onChange={set("size")} placeholder="30 แคปซูล" required /></Field>
            </div>
            <div className="three">
              <Field label="ราคาขาย (บาท)" id="pf-price" error={errors.price}><input id="pf-price" type="number" min={0} value={p.price} onChange={set("price", int)} required /></Field>
              <Field label="ราคาก่อนลด (ไม่บังคับ)" id="pf-cmp" error={errors.compareAtPrice}><input id="pf-cmp" type="number" min={0} value={p.compareAtPrice ?? ""} onChange={set("compareAtPrice", int)} /></Field>
              <Field label="สต็อก" id="pf-stock" error={errors.stock}><input id="pf-stock" type="number" min={0} value={p.stock} onChange={set("stock", int)} required /></Field>
            </div>
            <div className="three">
              <Field label="อายุต่ำสุด" id="pf-amin" error={errors.ageMin}><input id="pf-amin" type="number" min={0} max={120} value={p.ageMin} onChange={set("ageMin", int)} /></Field>
              <Field label="อายุสูงสุด" id="pf-amax" error={errors.ageMax}><input id="pf-amax" type="number" min={0} max={120} value={p.ageMax} onChange={set("ageMax", int)} /></Field>
              <Field label="เพศ" id="pf-g"><select id="pf-g" value={p.gender} onChange={set("gender")}><option value="all">ทุกเพศ</option><option value="female">ผู้หญิง</option><option value="male">ผู้ชาย</option></select></Field>
            </div>
            <Field label="แท็กประโยชน์ (คั่นด้วย ,)" id="pf-tags" hint="ใช้ในการค้นหาและให้ AI แนะนำ เช่น ผิวขาว, กระจ่างใส"><input id="pf-tags" value={p.tagsText} onChange={set("tagsText")} /></Field>
            <Field label="รายละเอียด" id="pf-desc" error={errors.description}><textarea id="pf-desc" rows={3} value={p.description} onChange={set("description")} required /></Field>
            <Field label="ส่วนประกอบ (บรรทัดละ 1 รายการ)" id="pf-ing"><textarea id="pf-ing" rows={3} value={p.ingText} onChange={set("ingText")} /></Field>
            <div className="two">
              <Field label="วิธีรับประทาน" id="pf-use" error={errors.usage}><input id="pf-use" value={p.usage} onChange={set("usage")} required /></Field>
              <Field label="เลข อย." id="pf-fda"><input id="pf-fda" value={p.fdaNo} onChange={set("fdaNo")} /></Field>
            </div>
            <Field label="คำเตือน" id="pf-warn"><input id="pf-warn" value={p.warnings} onChange={set("warnings")} /></Field>
            <Field label="ทานได้กี่วันต่อ 1 ชิ้น" id="pf-days" error={errors.daysSupply} hint="ใช้คำนวณวันส่งอีเมลเตือนลูกค้าว่าสินค้าใกล้หมด"><input id="pf-days" type="number" min={1} max={365} value={p.daysSupply} onChange={set("daysSupply", int)} /></Field>
            {p.id
              ? <ImageManager productId={p.id} images={p.images || []} onChange={(images) => { setP((prev) => ({ ...prev, images })); onChanged(); }} />
              : <p className="notice sm">บันทึกสินค้าก่อน แล้วจึงอัปโหลดรูปได้</p>}
            <Field label="หรือใช้ลิงก์รูปภายนอก (ไม่บังคับ)" id="pf-img" error={errors.imageUrl} hint="ถ้าไม่มีรูปเลย ระบบจะวาดภาพบรรจุภัณฑ์ให้จากสีด้านล่าง"><input id="pf-img" type="url" value={p.imageUrl} onChange={set("imageUrl")} /></Field>
            <div className="three">
              <Field label="รูปทรงบรรจุภัณฑ์" id="pf-shape"><select id="pf-shape" value={p.shape} onChange={set("shape")}><option value="bottle">ขวด</option><option value="jar">กระปุก</option><option value="tub">ถัง</option><option value="box">กล่อง</option></select></Field>
              <Field label="สีพื้น" id="pf-bg"><input id="pf-bg" type="color" value={p.colorBg} onChange={set("colorBg")} /></Field>
              <Field label="สีหลัก" id="pf-ac"><input id="pf-ac" type="color" value={p.colorAccent} onChange={set("colorAccent")} /></Field>
            </div>
            <label className="check"><input type="checkbox" checked={p.isActive} onChange={set("isActive")} /> แสดงสินค้าในร้าน</label>
          </div>
          <div className="dfoot row"><button type="button" className="btn" onClick={onClose}>ยกเลิก</button><button className="btn primary" disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึก"}</button></div>
        </form>
      </div>
    </>
  );
}

export function AdminCoupons() {
  useTitle("โค้ดส่วนลด");
  const { toast } = useApp();
  const [list, setList] = useState(null);
  const blank = { code: "", description: "", kind: "percent", value: 10, minSubtotal: 0, maxDiscount: "", isActive: true, expiresAt: "" };
  const [form, setForm] = useState(blank);
  const load = useCallback(() => api.get("/admin/coupons").then((d) => setList(d.coupons)), []);
  useEffect(() => { load(); }, [load]);

  async function save(e) {
    e.preventDefault();
    try {
      const { code, ...c } = form;
      await api.put(`/admin/coupons/${encodeURIComponent(code)}`, {
        ...c, value: Number(c.value), minSubtotal: Number(c.minSubtotal) || 0, maxDiscount: c.maxDiscount ? Number(c.maxDiscount) : null, expiresAt: c.expiresAt || null,
      });
      toast(`บันทึกโค้ด ${code.toUpperCase()} แล้ว`, "ok");
      setForm(blank);
      load();
    } catch (err) {
      toast(err.details?.[0]?.message || err.message, "error");
    }
  }
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  return (
    <>
      <div className="page-h"><h1>โค้ดส่วนลด</h1></div>
      <div className="cols">
        <div className="table-wrap panel minw0">
          {!list ? <Spinner /> : (
            <table className="table">
              <thead><tr><th>โค้ด</th><th>รายละเอียด</th><th className="r">ส่วนลด</th><th className="r">ขั้นต่ำ</th><th>สถานะ</th><th /></tr></thead>
              <tbody>{list.map((c) => (
                <tr key={c.code}>
                  <td className="mono">{c.code}</td><td>{c.description}</td>
                  <td className="r num">{c.kind === "percent" ? `${c.value}%` : baht(c.value)}{c.max_discount ? ` (สูงสุด ${baht(c.max_discount)})` : ""}</td>
                  <td className="r num">{baht(c.min_subtotal)}</td>
                  <td>{c.is_active ? <span className="status s-delivered">ใช้งาน</span> : <span className="status s-cancelled">ปิด</span>}{c.expires_at && <div className="muted sm">หมดอายุ {thaiDate(c.expires_at)}</div>}</td>
                  <td className="r"><button className="btn sm" onClick={() => setForm({ code: c.code, description: c.description, kind: c.kind, value: c.value, minSubtotal: c.min_subtotal, maxDiscount: c.max_discount || "", isActive: Boolean(c.is_active), expiresAt: c.expires_at || "" })}>แก้ไข</button></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
        <form className="panel stack" onSubmit={save}>
          <h2 className="h3">เพิ่ม / แก้ไขโค้ด</h2>
          <Field label="โค้ด" id="cp-code"><input id="cp-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} required /></Field>
          <Field label="คำอธิบาย" id="cp-desc"><input id="cp-desc" value={form.description} onChange={set("description")} required /></Field>
          <div className="two">
            <Field label="ประเภท" id="cp-kind"><select id="cp-kind" value={form.kind} onChange={set("kind")}><option value="percent">เปอร์เซ็นต์</option><option value="amount">จำนวนเงิน</option></select></Field>
            <Field label={form.kind === "percent" ? "ลด (%)" : "ลด (บาท)"} id="cp-val"><input id="cp-val" type="number" min={1} value={form.value} onChange={set("value")} required /></Field>
          </div>
          <div className="two">
            <Field label="ยอดขั้นต่ำ (บาท)" id="cp-min"><input id="cp-min" type="number" min={0} value={form.minSubtotal} onChange={set("minSubtotal")} /></Field>
            <Field label="ลดสูงสุด (บาท)" id="cp-max"><input id="cp-max" type="number" min={1} value={form.maxDiscount} onChange={set("maxDiscount")} /></Field>
          </div>
          <Field label="วันหมดอายุ (ไม่บังคับ)" id="cp-exp"><input id="cp-exp" type="date" value={form.expiresAt?.slice(0, 10) || ""} onChange={set("expiresAt")} /></Field>
          <label className="check"><input type="checkbox" checked={form.isActive} onChange={set("isActive")} /> เปิดใช้งาน</label>
          <button className="btn primary">บันทึกโค้ด</button>
        </form>
      </div>
    </>
  );
}

/** Runs the background jobs now instead of waiting for the 30-minute timer. */
function RunJobs() {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  return (
    <button className="btn sm" disabled={busy} title="สร้างคำสั่งซื้อรอบใหม่ของสมาชิกรายเดือน ส่งอีเมลเตือนสินค้าใกล้หมด และยกเลิกคำสั่งซื้อที่ไม่ชำระเกิน 24 ชม."
      onClick={async () => {
        setBusy(true);
        try {
          const d = await api.post("/admin/jobs/run");
          toast(`รอบสมัครรับประจำ ${d.renewals} · อีเมลเตือน ${d.reminders} · ยกเลิกค้างชำระ ${d.expired}`, "ok");
        } catch (e) { toast(e.message, "error"); } finally { setBusy(false); }
      }}>
      <Icon name="refresh" size={15} /> {busy ? "กำลังทำงาน…" : "รันงานอัตโนมัติตอนนี้"}
    </button>
  );
}

const KIND_LABEL = {
  order_placed: "ยืนยันคำสั่งซื้อ", payment_received: "ได้รับชำระเงิน", order_shipped: "จัดส่งแล้ว", order_cancelled: "ยกเลิก",
  password_reset: "ตั้งรหัสผ่านใหม่", welcome: "ต้อนรับสมาชิก", runout_reminder: "เตือนใกล้หมด", subscription_renewal: "รอบสมัครรับประจำ",
};

export function AdminEmails() {
  useTitle("อีเมล");
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState(null);
  useEffect(() => { api.get(`/admin/emails?page=${page}`).then(setData).catch(() => setData({ emails: [], pages: 1, page: 1 })); }, [page]);

  async function open(e) {
    const d = await api.get(`/admin/emails/${e.id}`);
    setPreview({ ...e, html: d.html });
  }

  return (
    <>
      <div className="page-h"><h1>อีเมลที่ระบบส่ง</h1>
        <p className="muted">ถ้ายังไม่ได้ตั้งค่า RESEND_API_KEY อีเมลจะไม่ถูกส่งจริง แต่จะถูกเก็บไว้ที่นี่ (สถานะ "บันทึกไว้") เพื่อตรวจหน้าตาและลิงก์ได้</p>
      </div>
      {!data ? <Spinner /> : data.emails.length === 0 ? <Empty title="ยังไม่มีอีเมล" /> : (
        <div className="table-wrap panel">
          <table className="table">
            <thead><tr><th>เวลา</th><th>ถึง</th><th>ประเภท</th><th>หัวข้อ</th><th>สถานะ</th><th /></tr></thead>
            <tbody>
              {data.emails.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap">{thaiDate(e.createdAt, true)}</td>
                  <td>{e.toEmail}</td>
                  <td>{KIND_LABEL[e.kind] || e.kind}</td>
                  <td className="clip">{e.subject}</td>
                  <td><span className={`status ${e.status === "sent" ? "s-delivered" : e.status === "failed" ? "s-cancelled" : "s-pending_payment"}`} title={e.error || ""}>{e.status === "sent" ? "ส่งแล้ว" : e.status === "failed" ? "ส่งไม่สำเร็จ" : "บันทึกไว้"}</span></td>
                  <td className="r"><button className="btn sm" onClick={() => open(e)}>ดู</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={data.page} pages={data.pages} onPage={setPage} />}
      {preview && (
        <>
          <div className="scrim" onClick={() => setPreview(null)} />
          <div className="modal" role="dialog" aria-modal="true" aria-label="ตัวอย่างอีเมล">
            <div className="mbox">
              <div className="dhead"><div className="minw0"><b>{preview.subject}</b><div className="muted sm">ถึง {preview.toEmail}</div></div><button className="x" onClick={() => setPreview(null)} aria-label="ปิด"><Icon name="x" /></button></div>
              {/* sandboxed: the email cannot run scripts or navigate this page */}
              <iframe className="email-frame" title="ตัวอย่างอีเมล" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={preview.html} />
            </div>
          </div>
        </>
      )}
    </>
  );
}

export function AdminSubscriptions() {
  useTitle("สมัครรับประจำ");
  const [list, setList] = useState(null);
  useEffect(() => { api.get("/admin/subscriptions").then((d) => setList(d.subscriptions)).catch(() => setList([])); }, []);
  const active = list?.filter((s) => s.status === "active") || [];
  const monthly = active.reduce((sum, s) => sum + Math.round((s.price * (100 - s.discountPct) / 100 * s.quantity * 30) / s.intervalDays), 0);
  return (
    <>
      <div className="page-h"><h1>สมัครรับประจำ</h1></div>
      {list && (
        <div className="kpis">
          <Kpi label="กำลังใช้งาน" value={active.length} sub="รายการ" i={0} />
          <Kpi label="ยอดประจำโดยประมาณ" value={monthly} money sub="ต่อเดือน (หลังส่วนลด)" i={1} />
          <Kpi label="พักไว้" value={list.filter((s) => s.status === "paused").length} sub="รายการ" i={2} />
        </div>
      )}
      {!list ? <Spinner /> : list.length === 0 ? <Empty title="ยังไม่มีลูกค้าสมัครรับประจำ" /> : (
        <div className="table-wrap panel">
          <table className="table">
            <thead><tr><th>ลูกค้า</th><th>สินค้า</th><th className="r">จำนวน</th><th>รอบ</th><th>รอบถัดไป</th><th>ชำระ</th><th>สถานะ</th></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}<div className="muted sm">{s.email}</div></td>
                  <td>{s.product}</td>
                  <td className="r num">{s.quantity}</td>
                  <td>ทุก {s.intervalDays} วัน</td>
                  <td>{s.status === "active" ? thaiDate(s.nextDate) : "–"}</td>
                  <td>{PAY_LABEL[s.paymentMethod]}</td>
                  <td><span className={`status ${s.status === "active" ? "s-delivered" : s.status === "paused" ? "s-pending_payment" : "s-cancelled"}`}>{{ active: "ใช้งาน", paused: "พักไว้", cancelled: "ยกเลิก" }[s.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
