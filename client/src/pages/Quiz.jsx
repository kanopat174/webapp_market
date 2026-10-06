import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { baht, useTitle } from "../lib/format.js";
import { useApp } from "../context/AppContext.jsx";
import { Icon, ProductArt, artBg } from "../components/ui.jsx";

const GOAL_ICON = {
  skin_bright: "sparkle", acne: "drop", anti_aging: "drop", sleep: "moon", energy: "dumbbell", immune: "shield", joint: "bone",
  brain: "chat", eye: "eye", weight: "scale", gut: "leaf", hair: "sparkle", muscle: "dumbbell", heart: "star",
};
const TIMING = {
  morning: ["เช้า", "หลังตื่นนอน / ก่อนอาหารเช้า"],
  meal: ["พร้อมอาหาร", "ระหว่างหรือหลังมื้ออาหาร"],
  workout: ["ออกกำลังกาย", "ก่อนหรือหลังออกกำลังกาย"],
  evening: ["ก่อนนอน", "30 นาทีก่อนเข้านอน"],
};
const STORE = "vt_quiz";
const load = () => { try { return JSON.parse(sessionStorage.getItem(STORE)) || null; } catch { return null; } };
const save = (v) => { try { sessionStorage.setItem(STORE, JSON.stringify(v)); } catch { /* storage unavailable */ } };

const EMPTY = { gender: "", age: 30, goals: [], sleep: "", exercise: "", screen: "", diet: "", conditions: [], budget: null };

/** One question per step: [key, title, hint, render]. */
const STEPS = [
  { key: "basics", title: "เริ่มจากข้อมูลพื้นฐาน", hint: "ใช้เลือกสินค้าที่เหมาะกับวัยและเพศ", done: (a) => a.age >= 4 },
  { key: "goals", title: "อยากดูแลเรื่องไหนมากที่สุด?", hint: "เลือกได้สูงสุด 3 ข้อ เรียงตามลำดับที่กด", done: (a) => a.goals.length > 0 },
  { key: "sleep", title: "ช่วงนี้นอนหลับเป็นอย่างไร?", options: [["good", "หลับดี ตื่นมาสดชื่น"], ["ok", "หลับๆ ตื่นๆ บ้าง"], ["poor", "นอนหลับยาก หรือตื่นกลางดึกบ่อย"]], done: (a) => a.sleep },
  { key: "exercise", title: "ออกกำลังกายบ่อยแค่ไหน?", options: [["none", "แทบไม่ได้ออก"], ["some", "1–2 ครั้งต่อสัปดาห์"], ["often", "3 ครั้งขึ้นไปต่อสัปดาห์"]], done: (a) => a.exercise },
  { key: "screen", title: "ใช้หน้าจอวันละกี่ชั่วโมง?", hint: "รวมมือถือ คอมพิวเตอร์ และทีวี", options: [["low", "ไม่ถึง 4 ชั่วโมง"], ["mid", "4–8 ชั่วโมง"], ["high", "มากกว่า 8 ชั่วโมง"]], done: (a) => a.screen },
  { key: "diet", title: "การกินโดยรวมเป็นแบบไหน?", options: [["balanced", "ทานครบหมู่ เป็นเวลา"], ["busy", "ทานไม่เป็นเวลา ฟาสต์ฟู้ดบ่อย"], ["plant", "มังสวิรัติ / วีแกน"]], done: (a) => a.diet },
  { key: "conditions", title: "มีข้อใดตรงกับคุณไหม?", hint: "ช่วยให้แนะนำได้อย่างปลอดภัย เลือกได้หลายข้อ", done: () => true },
  { key: "budget", title: "งบต่อเดือนสำหรับอาหารเสริม", hint: "ระบบคำนวณจากจำนวนวันที่แต่ละชิ้นใช้ได้", options: [[500, "ไม่เกิน ฿500"], [1000, "ไม่เกิน ฿1,000"], [1500, "ไม่เกิน ฿1,500"], [2500, "ไม่เกิน ฿2,500"], [0, "ไม่จำกัด"]], done: (a) => a.budget !== null },
];
const CONDITIONS = [["pregnant", "ตั้งครรภ์"], ["breastfeeding", "ให้นมบุตร"], ["medication", "ใช้ยาประจำ"], ["chronic", "มีโรคประจำตัว"]];

export default function Quiz() {
  useTitle("แบบทดสอบสุขภาพ");
  const saved = load();
  const [goals, setGoals] = useState([]);
  const [answers, setAnswers] = useState(saved?.answers || EMPTY);
  const [step, setStep] = useState(saved?.result ? STEPS.length : 0);
  const [dir, setDir] = useState(1);
  const [result, setResult] = useState(saved?.result || null);
  const [error, setError] = useState("");

  useEffect(() => { api.get("/quiz/options").then((d) => setGoals(d.goals)).catch(() => {}); }, []);

  const set = (patch) => setAnswers((a) => ({ ...a, ...patch }));
  const current = STEPS[step];
  const go = (d) => { setDir(d); setStep((s) => s + d); };

  async function submit() {
    setDir(1);
    setStep(STEPS.length);
    setResult(null);
    setError("");
    const started = Date.now();
    try {
      const plan = await api.post("/quiz", { ...answers, budget: answers.budget || 0 });
      // keep the "putting your set together" moment visible briefly even when the answer is instant
      await new Promise((r) => setTimeout(r, Math.max(0, 1400 - (Date.now() - started))));
      setResult(plan);
      save({ answers, result: plan });
    } catch (e) {
      setError(e.message);
    }
  }

  function restart() {
    save(null);
    setAnswers(EMPTY);
    setResult(null);
    setError("");
    setDir(-1);
    setStep(0);
  }

  if (step >= STEPS.length) {
    if (error) return <div className="quiz-shell"><div className="quiz-card"><h2>จัดชุดไม่สำเร็จ</h2><p className="err">{error}</p><div className="cta"><button className="btn primary" onClick={submit}>ลองอีกครั้ง</button><button className="btn" onClick={restart}>เริ่มใหม่</button></div></div></div>;
    if (!result) return <Thinking />;
    return <Result result={result} answers={answers} goals={goals} onRestart={restart} />;
  }

  return (
    <div className="quiz-shell">
      <div className="quiz-top">
        <span className="eyebrow"><Icon name="sparkle" size={14} /> แบบทดสอบสุขภาพ 1 นาที</span>
        <div className="quiz-progress" aria-label={`ข้อ ${step + 1} จาก ${STEPS.length}`}><b style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
        <span className="muted sm num">{step + 1}/{STEPS.length}</span>
      </div>

      <section className={`quiz-card dir-${dir > 0 ? "next" : "prev"}`} key={step}>
        <h1 className="h2">{current.title}</h1>
        {current.hint && <p className="muted">{current.hint}</p>}

        {current.key === "basics" && (
          <div className="stack">
            <div className="opt-row">
              {[["female", "หญิง"], ["male", "ชาย"], ["", "ไม่ระบุ"]].map(([v, l]) => (
                <button key={l} className="opt" aria-pressed={answers.gender === v} onClick={() => set({ gender: v })}>{l}</button>
              ))}
            </div>
            <label className="age-pick">
              <span>อายุ <b className="num age-num">{answers.age}</b> ปี</span>
              <input type="range" min={4} max={90} value={answers.age} onChange={(e) => set({ age: Number(e.target.value) })} aria-label="อายุ" />
            </label>
          </div>
        )}

        {current.key === "goals" && (
          <div className="goal-grid">
            {goals.map((g) => {
              const order = answers.goals.indexOf(g.value);
              const on = order >= 0;
              return (
                <button key={g.value} className="goal" aria-pressed={on} disabled={!on && answers.goals.length >= 3}
                  onClick={() => set({ goals: on ? answers.goals.filter((x) => x !== g.value) : [...answers.goals, g.value] })}>
                  <span className="goal-ic"><Icon name={GOAL_ICON[g.value] || "pill"} size={20} /></span>
                  <span>{g.label}</span>
                  {on && <span className="goal-n num">{order + 1}</span>}
                </button>
              );
            })}
          </div>
        )}

        {current.options && (
          <div className="opt-col">
            {current.options.map(([v, l]) => (
              <button key={l} className="opt big" aria-pressed={answers[current.key] === v}
                onClick={() => { set({ [current.key]: v }); if (step < STEPS.length - 1) setTimeout(() => go(1), 220); }}>
                <span>{l}</span><Icon name="check" size={18} className="opt-check" />
              </button>
            ))}
          </div>
        )}

        {current.key === "conditions" && (
          <div className="opt-col">
            {CONDITIONS.map(([v, l]) => {
              const on = answers.conditions.includes(v);
              return (
                <button key={v} className="opt big" aria-pressed={on} onClick={() => set({ conditions: on ? answers.conditions.filter((x) => x !== v) : [...answers.conditions, v] })}>
                  <span>{l}</span><Icon name="check" size={18} className="opt-check" />
                </button>
              );
            })}
            <button className="opt big" aria-pressed={answers.conditions.length === 0} onClick={() => set({ conditions: [] })}><span>ไม่มีข้อใดเลย</span><Icon name="check" size={18} className="opt-check" /></button>
          </div>
        )}

        <div className="quiz-nav">
          <button className="btn ghost" onClick={() => go(-1)} disabled={step === 0}>ย้อนกลับ</button>
          {step < STEPS.length - 1
            ? <button className="btn primary" disabled={!current.done(answers)} onClick={() => go(1)}>ถัดไป <Icon name="arrow" size={18} /></button>
            : <button className="btn accent lg" disabled={!current.done(answers)} onClick={submit}><Icon name="sparkle" size={18} /> ดูชุดที่เหมาะกับฉัน</button>}
        </div>
      </section>
      <p className="muted sm center-text">คำแนะนำนี้เป็นข้อมูลประกอบการเลือกซื้อ ไม่ใช่คำวินิจฉัยทางการแพทย์</p>
    </div>
  );
}

function Thinking() {
  const lines = ["วิเคราะห์เป้าหมายของคุณ", "เทียบกับสินค้า 20 รายการ", "จัดตารางการทานให้"];
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => Math.min(lines.length - 1, x + 1)), 550); return () => clearInterval(t); }, [lines.length]);
  return (
    <div className="quiz-shell">
      <div className="thinking" role="status">
        <div className="orbit" aria-hidden="true"><span /><span /><span /><i className="logo-cap"><b /><b /></i></div>
        <h2>กำลังจัดชุดอาหารเสริมให้คุณ</h2>
        <ul>{lines.map((l, k) => <li key={l} className={k <= i ? "on" : ""}><Icon name="check" size={16} /> {l}</li>)}</ul>
      </div>
    </div>
  );
}

function Result({ result, answers, goals, onRestart }) {
  const { addMany } = useApp();
  const [discount, setDiscount] = useState(10);
  useEffect(() => { api.get("/checkout/config").then((c) => setDiscount(c.subscription.discountPct)).catch(() => {}); }, []);
  const add = (intervalDays) => addMany(result.items.map((i) => ({ productId: i.product.id, quantity: 1, intervalDays })));
  const goalLabels = answers.goals.map((g) => goals.find((x) => x.value === g)?.label).filter(Boolean);
  const byTiming = Object.keys(TIMING).map((t) => [t, result.items.filter((i) => i.timing === t)]).filter(([, list]) => list.length);
  const setPrice = result.items.reduce((s, i) => s + i.product.price, 0);

  return (
    <div className="quiz-result">
      <section className="result-hero">
        <span className="eyebrow light"><Icon name="sparkle" size={14} /> {result.source === "ai" ? "จัดชุดโดย Claude AI" : "ชุดแนะนำของคุณ"}</span>
        <h1>ชุดอาหารเสริมเฉพาะคุณ</h1>
        <p>{result.summary}</p>
        <div className="pills">{goalLabels.map((g) => <span key={g} className="pill">{g}</span>)}</div>
      </section>

      {result.caution && <div className="banner warn"><span><Icon name="shield" size={16} /> {result.caution}</span></div>}

      {result.items.length === 0 ? (
        <div className="empty"><h3>ยังไม่มีชุดที่ตรงกับงบนี้</h3><p>ลองเพิ่มงบประมาณ หรือเลือกเป้าหมายให้น้อยลง</p><button className="btn primary" onClick={onRestart}>ทำแบบทดสอบใหม่</button></div>
      ) : (
        <div className="cols">
          <div className="stack minw0">
            {result.items.map((it, i) => (
              <article className="plan-item panel" key={it.product.id} style={{ "--i": i }}>
                <Link to={`/products/${it.product.slug}`} className="sub-thumb" style={artBg(it.product.art)}><ProductArt product={it.product} /></Link>
                <div className="minw0 stack tight">
                  <div className="row"><Link to={`/products/${it.product.slug}`} className="plan-name">{it.product.name}</Link><span className="timing-chip">{TIMING[it.timing]?.[0] || "พร้อมอาหาร"}</span></div>
                  <p className="sm">{it.reason}</p>
                  <span className="muted sm num">{baht(it.product.price)} · {it.product.size} · ≈ {baht(it.monthlyCost)}/เดือน</span>
                </div>
              </article>
            ))}

            <section className="panel">
              <h2 className="h3">ตารางการทานต่อวัน</h2>
              <ol className="schedule">
                {byTiming.map(([t, list]) => (
                  <li key={t}>
                    <span className="sch-dot" />
                    <div><b>{TIMING[t][0]}</b> <span className="muted sm">{TIMING[t][1]}</span>
                      <div className="sch-items">{list.map((i) => <span key={i.product.id} className="pill">{i.product.name}</span>)}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {result.tips?.length > 0 && (
              <section className="panel">
                <h2 className="h3">คำแนะนำเพิ่มเติม</h2>
                <ul className="tips">{result.tips.map((t) => <li key={t}><Icon name="leaf" size={16} /> {t}</li>)}</ul>
              </section>
            )}
          </div>

          <aside className="osum">
            <b>สรุปชุดของคุณ</b>
            <div className="it"><span>{result.items.length} รายการ</span><span className="num">{baht(setPrice)}</span></div>
            <div className="it"><span>ค่าใช้จ่ายโดยประมาณ</span><span className="num">{baht(result.monthlyTotal)}/เดือน</span></div>
            <button className="btn primary block lg" onClick={() => add(30)}><Icon name="refresh" size={18} /> สมัครรับประจำทั้งชุด ลด {discount}%</button>
            <button className="btn block" onClick={() => add(0)}><Icon name="bag" size={18} /> ซื้อครั้งเดียวทั้งชุด</button>
            <p className="muted sm">สมัครรับประจำ: ส่งทุก 30 วัน พัก ข้าม หรือยกเลิกได้ทุกเมื่อ</p>
            <button className="linkbtn sm" onClick={onRestart}>ทำแบบทดสอบใหม่</button>
          </aside>
        </div>
      )}
    </div>
  );
}
