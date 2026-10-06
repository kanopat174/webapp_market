// Health quiz: turns a short questionnaire into a personal supplement set with a daily schedule.
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { activeProducts } from "./products.js";

const client = config.anthropic.enabled ? new Anthropic({ timeout: 60_000, maxRetries: 1 }) : null;

/** Goal options shown in the quiz, and the product tags each one maps to (used by the rule-based fallback). */
export const QUIZ_GOALS = {
  skin_bright: { label: "ผิวกระจ่างใส", tags: ["ผิวขาว", "กระจ่างใส", "จุดด่างดำ"] },
  acne: { label: "ลดปัญหาสิว", tags: ["สิว", "ผิวมัน"] },
  anti_aging: { label: "ริ้วรอย ผิวชุ่มชื้น", tags: ["คอลลาเจน", "ริ้วรอย", "ผิวชุ่มชื้น"] },
  sleep: { label: "นอนหลับดีขึ้น", tags: ["นอนหลับ", "ผ่อนคลาย", "ความเครียด"] },
  energy: { label: "เพิ่มพลังงาน ลดอ่อนเพลีย", tags: ["พลังงาน", "อ่อนเพลีย", "วิตามินรวม"] },
  immune: { label: "ภูมิคุ้มกัน", tags: ["ภูมิคุ้มกัน", "หวัด", "วิตามินซี"] },
  joint: { label: "ข้อและกระดูก", tags: ["ข้อ", "ข้อเข่า", "กระดูก", "แคลเซียม"] },
  brain: { label: "สมอง ความจำ สมาธิ", tags: ["สมอง", "ความจำ", "สมาธิ"] },
  eye: { label: "สายตา", tags: ["สายตา", "จ้องจอ", "ตาล้า"] },
  weight: { label: "ควบคุมน้ำหนัก", tags: ["ลดน้ำหนัก", "เผาผลาญ", "หุ่นดี"] },
  gut: { label: "ระบบขับถ่าย", tags: ["ขับถ่าย", "ลำไส้", "ท้องผูก", "ท้องอืด"] },
  hair: { label: "ผมและเล็บ", tags: ["ผมร่วง", "ผม", "เล็บ"] },
  muscle: { label: "สร้างกล้ามเนื้อ", tags: ["โปรตีน", "สร้างกล้าม"] },
  heart: { label: "หัวใจ หลอดเลือด", tags: ["หัวใจ", "ไขมัน"] },
};

const LABELS = {
  sleep: { good: "หลับดี", ok: "หลับๆ ตื่นๆ บ้าง", poor: "นอนหลับยาก" },
  exercise: { none: "แทบไม่ออกกำลังกาย", some: "1–2 ครั้ง/สัปดาห์", often: "3 ครั้งขึ้นไป/สัปดาห์" },
  screen: { low: "ไม่ถึง 4 ชม./วัน", mid: "4–8 ชม./วัน", high: "มากกว่า 8 ชม./วัน" },
  diet: { balanced: "ทานครบหมู่", busy: "ทานไม่เป็นเวลา ฟาสต์ฟู้ด", plant: "มังสวิรัติ/วีแกน" },
  conditions: { pregnant: "ตั้งครรภ์", breastfeeding: "ให้นมบุตร", medication: "ใช้ยาประจำ", chronic: "มีโรคประจำตัว" },
};

const monthlyCost = (p) => Math.round(p.price * (30 / (p.daysSupply || 30)));

const timingFromUsage = (usage = "") =>
  /ก่อนนอน/.test(usage) ? "evening" : /ออกกำลังกาย/.test(usage) ? "workout" : /เช้า/.test(usage) ? "morning" : "meal";

const eligible = (a) => activeProducts().filter((p) => p.stock > 0
  && a.age >= p.ageMin && a.age <= p.ageMax
  && (p.gender === "all" || !a.gender || p.gender === a.gender));

function cautionFor(a) {
  if (!a.conditions?.length) return null;
  const list = a.conditions.map((c) => LABELS.conditions[c]).join(" / ");
  return `คุณระบุว่า${list} กรุณาปรึกษาแพทย์หรือเภสัชกรก่อนเริ่มรับประทานผลิตภัณฑ์เสริมอาหารทุกชนิด`;
}

/** Rule-based set: the best product for each goal, within the monthly budget. */
function ruleBased(a, pool) {
  const chosen = [];
  let spent = 0;
  for (const g of a.goals) {
    const tags = QUIZ_GOALS[g].tags;
    const best = pool
      .filter((p) => !chosen.some((c) => c.product.id === p.id))
      .map((p) => ({ p, hits: p.tags.filter((t) => tags.includes(t)).length }))
      .filter((x) => x.hits > 0 && (!a.budget || spent + monthlyCost(x.p) <= a.budget))
      .sort((x, y) => y.hits - x.hits || y.p.rating - x.p.rating || x.p.price - y.p.price)[0];
    if (best) {
      spent += monthlyCost(best.p);
      chosen.push({ product: best.p, reason: `ตอบโจทย์เรื่อง${QUIZ_GOALS[g].label} (${best.p.description})`, timing: timingFromUsage(best.p.usage) });
    }
  }
  const tips = [];
  if (a.sleep === "poor") tips.push("งดคาเฟอีนหลังบ่ายสอง และปิดหน้าจอ 30 นาทีก่อนนอน");
  if (a.screen === "high") tips.push("ใช้กฎ 20-20-20: ทุก 20 นาที มองไกล 20 ฟุต นาน 20 วินาที");
  if (a.exercise === "none") tips.push("เริ่มจากเดินเร็ววันละ 20–30 นาที สัปดาห์ละ 3 วัน");
  if (a.diet === "busy") tips.push("เพิ่มผักและโปรตีนในมื้อหลัก อาหารเสริมช่วยเติม แต่ไม่ทดแทนอาหาร");
  tips.push("ดื่มน้ำวันละ 6–8 แก้ว และทานอาหารเสริมให้ต่อเนื่องอย่างน้อย 4–8 สัปดาห์ก่อนประเมินผล");
  return {
    summary: chosen.length
      ? `จากคำตอบของคุณ ชุดนี้เน้น${a.goals.map((g) => QUIZ_GOALS[g].label).join(" · ")} ภายในงบที่ตั้งไว้`
      : "ยังไม่มีสินค้าที่ตรงกับเป้าหมายในงบนี้ ลองเพิ่มงบหรือเลือกเป้าหมายน้อยลง",
    items: chosen,
    tips: tips.slice(0, 4),
  };
}

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "สรุปภาพรวมสั้นๆ 1-2 ประโยค ว่าชุดนี้ออกแบบมาเพื่ออะไร" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          product_id: { type: "integer" },
          reason: { type: "string", description: "เหตุผล 1 ประโยค ที่เชื่อมกับคำตอบของลูกค้า" },
          timing: { type: "string", enum: ["morning", "meal", "evening", "workout"] },
        },
        required: ["product_id", "reason", "timing"],
        additionalProperties: false,
      },
    },
    tips: { type: "array", items: { type: "string" }, description: "คำแนะนำไลฟ์สไตล์ 2-4 ข้อ ที่ไม่ใช่การขายสินค้า" },
  },
  required: ["summary", "items", "tips"],
  additionalProperties: false,
};

function describe(a) {
  return [
    `เพศ: ${a.gender === "female" ? "หญิง" : a.gender === "male" ? "ชาย" : "ไม่ระบุ"}`,
    `อายุ: ${a.age} ปี`,
    `เป้าหมาย (เรียงตามความสำคัญ): ${a.goals.map((g) => QUIZ_GOALS[g].label).join(", ")}`,
    `การนอน: ${LABELS.sleep[a.sleep]}`,
    `ออกกำลังกาย: ${LABELS.exercise[a.exercise]}`,
    `ใช้หน้าจอ: ${LABELS.screen[a.screen]}`,
    `การกิน: ${LABELS.diet[a.diet]}`,
    `ภาวะสุขภาพ: ${a.conditions?.length ? a.conditions.map((c) => LABELS.conditions[c]).join(", ") : "ไม่มี"}`,
    `งบต่อเดือน: ${a.budget ? `ไม่เกิน ฿${a.budget}` : "ไม่จำกัด"}`,
  ].join("\n");
}

async function aiBased(a, pool) {
  const catalogue = pool.map((p) => `- id ${p.id}: ${p.name} | ${p.categoryName} | ฿${p.price} (ใช้ได้ ${p.daysSupply || 30} วัน ≈ ฿${monthlyCost(p)}/เดือน) | แท็ก: ${p.tags.join(", ")} | ${p.description} | ส่วนประกอบ: ${p.ingredients.join(", ")} | วิธีทาน: ${p.usage}`).join("\n");
  const system = `คุณคือผู้ช่วยจัดชุดอาหารเสริมของร้าน Vitara ตอบเป็นภาษาไทยที่เป็นกันเอง
จัดชุดอาหารเสริม 2-4 รายการจากแคตตาล็อกที่ให้มาเท่านั้น ให้ตรงกับเป้าหมายและไลฟ์สไตล์ของลูกค้า
กติกา
- รวมค่าใช้จ่ายต่อเดือน (ราคา/เดือน ในแคตตาล็อก) ต้องไม่เกินงบของลูกค้า
- หลีกเลี่ยงสินค้าที่มีส่วนประกอบซ้ำซ้อนกันมาก เช่น วิตามินซีขนาดสูงหลายตัว
- timing: morning = เช้า, meal = พร้อมหรือหลังอาหาร, evening = ก่อนนอน, workout = ก่อน/หลังออกกำลังกาย ให้สอดคล้องกับวิธีทานของสินค้า
- ห้ามวินิจฉัยหรืออ้างว่ารักษาโรค ถ้าลูกค้าตั้งครรภ์ ให้นมบุตร ใช้ยา หรือมีโรคประจำตัว ให้เลือกอย่างระมัดระวังและแนะนำให้ปรึกษาแพทย์ใน summary
- tips เป็นคำแนะนำไลฟ์สไตล์ที่ทำได้จริง เชื่อมกับคำตอบ ไม่ใช่การขายของ

แคตตาล็อก
${catalogue}`;

  const response = await client.beta.messages.create({
    model: config.anthropic.model,
    max_tokens: 6000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `คำตอบแบบทดสอบของลูกค้า\n${describe(a)}` }],
  });
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return null;
  const out = JSON.parse(response.content.find((b) => b.type === "text")?.text || "null");
  if (!out) return null;
  const byId = new Map(pool.map((p) => [p.id, p]));
  const seen = new Set();
  const items = out.items
    .map((i) => ({ product: byId.get(Number(i.product_id)), reason: String(i.reason), timing: i.timing }))
    .filter((i) => i.product && !seen.has(i.product.id) && seen.add(i.product.id))
    .slice(0, 4);
  if (!items.length) return null;
  return { summary: String(out.summary), items, tips: out.tips.map(String).slice(0, 4) };
}

export async function buildPlan(answers) {
  const pool = eligible(answers);
  let plan = null;
  let source = "rules";
  if (client) {
    try {
      plan = await aiBased(answers, pool);
      if (plan) source = "ai";
    } catch (err) {
      console.error("[quiz] AI plan failed, using rules:", err.message);
    }
  }
  plan ||= ruleBased(answers, pool);
  return {
    ...plan,
    items: plan.items.map((i) => ({ ...i, monthlyCost: monthlyCost(i.product) })),
    monthlyTotal: plan.items.reduce((s, i) => s + monthlyCost(i.product), 0),
    caution: cautionFor(answers),
    source,
  };
}
