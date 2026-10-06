import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { baht } from "../lib/format.js";
import { useApp } from "../context/AppContext.jsx";
import { Icon, ProductArt, artBg } from "./ui.jsx";
import { usePresence } from "../lib/motion.js";

const QUICK = ["อยากได้อาหารเสริมผิวขาว", "ลดน้ำหนัก", "นอนไม่ค่อยหลับ", "ปวดข้อเข่า", "วิตามินสำหรับเด็ก", "ผมร่วง", "ตาล้าจากจอคอม"];
const AGES = [["", "ไม่ระบุ"], ["10", "ต่ำกว่า 13"], ["16", "13–19"], ["27", "20–34"], ["42", "35–49"], ["57", "50–64"], ["70", "65+"]];
const GREETING = "สวัสดีค่ะ น้องวีเองค่ะ บอกได้เลยว่าอยากดูแลเรื่องไหน เช่น ผิวขาว นอนไม่หลับ หรือปวดข้อ\nเลือกอายุ เพศ และงบด้านบนไว้ จะได้แนะนำได้ตรงขึ้นค่ะ";

const STORE_KEY = "vt_chat";
const load = () => { try { return JSON.parse(sessionStorage.getItem(STORE_KEY)) || null; } catch { return null; } };

/** Floating AI assistant. Opens from anywhere via window event "vitara:chat" with an optional message. */
export default function ChatWidget() {
  const saved = load();
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState(saved?.log || [{ role: "assistant", content: GREETING, products: [] }]);
  const [filters, setFilters] = useState(saved?.filters || { age: "", gender: "", budget: "" });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const { addToCart } = useApp();
  const { mounted, closing } = usePresence(open, 240);

  useEffect(() => {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ log: log.slice(-30), filters })); } catch { /* storage unavailable */ }
  }, [log, filters]);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [log, busy, open]);

  useEffect(() => {
    api.get("/chat/status").then((s) => setSource(s.enabled ? "ai" : "local")).catch(() => {});
  }, []);

  // re-registered every render so the handler always sees the latest conversation
  useEffect(() => {
    const onAsk = (e) => { setOpen(true); if (e.detail) send(e.detail); else setTimeout(() => inputRef.current?.focus(), 50); };
    window.addEventListener("vitara:chat", onAsk);
    return () => window.removeEventListener("vitara:chat", onAsk);
  });

  async function send(text) {
    text = String(text || "").trim();
    if (!text || busy) return;
    setInput("");
    const next = [...log, { role: "user", content: text }];
    setLog(next);
    setBusy(true);
    try {
      // the greeting is UI only; the API conversation must start with a user turn
      const history = next.filter((m, i) => !(i === 0 && m.role === "assistant")).slice(-12).map(({ role, content }) => ({ role, content }));
      const d = await api.post("/chat", {
        messages: history,
        filters: {
          age: filters.age ? Number(filters.age) : null,
          gender: filters.gender || null,
          budget: filters.budget ? Number(filters.budget) : null,
        },
      });
      setSource(d.source);
      setLog((l) => [...l, { role: "assistant", content: d.reply, products: d.products }]);
    } catch (e) {
      setLog((l) => [...l, { role: "assistant", content: e.message, products: [], error: true }]);
    } finally {
      setBusy(false);
    }
  }

  const reset = () => setLog([{ role: "assistant", content: GREETING, products: [] }]);

  const openChat = () => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 80); };

  return (
    <>
      <button className={`fab ${open ? "away" : ""}`} onClick={openChat} aria-hidden={open} tabIndex={open ? -1 : 0}>
        <span className="fab-ic"><Icon name="chat" size={18} /></span>
        <span>ผู้ช่วย AI แนะนำสินค้า</span>
        <span className="pulse" aria-hidden="true" />
      </button>
      {mounted && (
        <section className={`chat ${closing ? "closing" : ""}`} aria-label="ผู้ช่วยแนะนำสินค้า">
          <div className="chead">
            <span className="av">V<i className="online" /></span>
            <div><b>น้องวี ผู้ช่วยเลือกอาหารเสริม</b><small>{source === "ai" ? "ตอบโดย Claude AI" : "ออนไลน์ · ตอบทันที"}</small></div>
            <button className="x" onClick={reset} title="เริ่มบทสนทนาใหม่" aria-label="เริ่มบทสนทนาใหม่"><Icon name="refresh" size={18} /></button>
            <button className="x" onClick={() => setOpen(false)} aria-label="ปิดแชท"><Icon name="x" size={18} /></button>
          </div>
          <div className="cfilters">
            <label>อายุ<select value={filters.age} onChange={(e) => setFilters({ ...filters, age: e.target.value })}>{AGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label>เพศ<select value={filters.gender} onChange={(e) => setFilters({ ...filters, gender: e.target.value })}><option value="">ไม่ระบุ</option><option value="female">หญิง</option><option value="male">ชาย</option></select></label>
            <label>งบต่อชิ้น<select value={filters.budget} onChange={(e) => setFilters({ ...filters, budget: e.target.value })}><option value="">ไม่จำกัด</option><option value="500">≤ ฿500</option><option value="800">≤ ฿800</option><option value="1200">≤ ฿1,200</option></select></label>
          </div>
          <div className="msgs" ref={listRef} aria-live="polite">
            {log.map((m, i) => (
              <div key={i} className="msg-wrap">
                <div className={`msg ${m.role === "user" ? "me" : "bot"} ${m.error ? "error" : ""}`}>{m.content}</div>
                {m.products?.length > 0 && (
                  <div className="recs">
                    {m.products.map((p, k) => (
                      <div className="rec" key={p.id} style={{ "--i": k }}>
                        <Link to={`/products/${p.slug}`} className="thumb" style={artBg(p.art)} aria-label={p.name}><ProductArt product={p} /></Link>
                        <div className="minw0"><Link to={`/products/${p.slug}`} className="rec-name">{p.name}</Link><span className="num">{baht(p.price)} · ★ {p.rating.toFixed(1)}</span></div>
                        <button className="btn sm" onClick={(e) => addToCart(p, 1, { from: e.currentTarget.closest(".rec").querySelector(".art, .art-img") })}><Icon name="plus" size={14} stroke={2.4} /> ตะกร้า</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="msg bot typing" aria-label="กำลังพิมพ์"><i /><i /><i /></div>}
          </div>
          <div className="quick">{QUICK.map((q) => <button key={q} type="button" onClick={() => send(q)} disabled={busy}>{q}</button>)}</div>
          <form className="cin" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <input ref={inputRef} id="chat-input" value={input} onChange={(e) => setInput(e.target.value)} maxLength={1000} placeholder="เช่น อยากได้อาหารเสริมผิวขาว" aria-label="พิมพ์ข้อความ" autoComplete="off" />
            <button type="submit" disabled={busy || !input.trim()} aria-label="ส่ง"><Icon name="send" size={18} /></button>
          </form>
          <p className="chat-note">คำแนะนำนี้ไม่ใช่คำวินิจฉัยทางการแพทย์</p>
        </section>
      )}
    </>
  );
}

export const askAssistant = (text) => window.dispatchEvent(new CustomEvent("vitara:chat", { detail: text }));
