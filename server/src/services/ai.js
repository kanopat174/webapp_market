import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { activeProducts } from "./products.js";
import { localRecommend } from "./recommender.js";

const client = config.anthropic.enabled ? new Anthropic({ timeout: 45_000, maxRetries: 1 }) : null;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string", description: "ข้อความตอบลูกค้าเป็นภาษาไทย" },
    product_ids: { type: "array", items: { type: "integer" }, description: "id สินค้าที่แนะนำ 0-3 รายการ เรียงจากเหมาะที่สุด" },
  },
  required: ["reply", "product_ids"],
  additionalProperties: false,
};

const GENDER = { all: "ทุกเพศ", female: "ผู้หญิง", male: "ผู้ชาย" };

// The catalogue sits in the system prompt so it stays identical across requests and can be cached.
function systemPrompt(products) {
  const catalogue = products.map((p) =>
    `- id ${p.id}: ${p.name} (${p.brand}) | หมวด ${p.categoryName} | ฿${p.price} | อายุ ${p.ageMin}-${p.ageMax} ปี | ${GENDER[p.gender]} | `
    + `คงเหลือ ${p.stock} | คะแนน ${p.rating}/5 | แท็ก: ${p.tags.join(", ")} | ${p.description} | ส่วนประกอบ: ${p.ingredients.join(", ")}`).join("\n");
  return `คุณคือ "น้องวี" ผู้ช่วยแนะนำอาหารเสริมของร้านออนไลน์ Vitara คุยกับลูกค้าเป็นภาษาไทย สุภาพ เป็นกันเอง ใช้ "ค่ะ"

หน้าที่: ช่วยลูกค้าเลือกสินค้าจากแคตตาล็อกด้านล่างให้ตรงกับเป้าหมาย อายุ เพศ และงบประมาณ

วิธีตอบ
- แนะนำ 1-3 รายการที่ตรงที่สุด พร้อมเหตุผลสั้นๆ ว่าทำไมเหมาะกับลูกค้าคนนี้ ใส่ id ของสินค้านั้นใน product_ids
- แนะนำได้เฉพาะสินค้าในแคตตาล็อก และต้องอยู่ในเงื่อนไขของลูกค้า (ช่วงอายุ เพศ งบ) ที่ระบุมาในข้อความ ไม่แนะนำสินค้าที่หมดสต็อก
- ถ้าคำขอกว้างเกินไป ถามกลับ 1 คำถามที่ช่วยให้เลือกได้ดีขึ้น และ product_ids เป็นรายการว่างได้
- ถ้าไม่มีสินค้าที่เหมาะ บอกตรงๆ และแนะนำให้ปรับตัวกรอง
- ตอบกระชับ ไม่เกิน 5 ประโยค ไม่ใช้ markdown

ความปลอดภัย
- อาหารเสริมไม่ใช่ยา ห้ามวินิจฉัยโรค ห้ามอ้างว่ารักษาหรือป้องกันโรค
- ถ้าลูกค้าตั้งครรภ์ ให้นมบุตร มีโรคประจำตัว หรือใช้ยาอยู่ ให้แนะนำปรึกษาแพทย์หรือเภสัชกรก่อนเสมอ
- ถ้าอาการฟังดูรุนแรงหรือเรื้อรัง แนะนำให้พบแพทย์
- ถ้าคำถามไม่เกี่ยวกับสุขภาพหรือสินค้าในร้าน ตอบสั้นๆ แล้วชวนกลับมาที่การเลือกสินค้า

แคตตาล็อกสินค้า
${catalogue}`;
}

const describeFilters = (f) => [
  `อายุ: ${f.age ?? "ไม่ระบุ"}`,
  `เพศ: ${f.gender === "female" ? "หญิง" : f.gender === "male" ? "ชาย" : "ไม่ระบุ"}`,
  `งบต่อชิ้น: ${f.budget ? `ไม่เกิน ฿${f.budget}` : "ไม่จำกัด"}`,
].join(", ");

export const eligible = (products, f) => products.filter((p) =>
  p.stock > 0
  && (!f.age || (f.age >= p.ageMin && f.age <= p.ageMax))
  && (!f.gender || p.gender === "all" || p.gender === f.gender)
  && (!f.budget || p.price <= f.budget));

/**
 * Recommend products for a chat conversation.
 * messages: [{role: "user"|"assistant", content}] ending on the user's newest message.
 */
export async function recommend(messages, filters) {
  const products = activeProducts();
  const allowed = eligible(products, filters);
  const allowedIds = new Set(allowed.map((p) => p.id));
  const latest = messages[messages.length - 1].content;

  if (!client) return { ...localRecommend(latest, allowed), source: "local" };

  const apiMessages = messages.map((m, i) => (i === messages.length - 1
    ? { role: "user", content: `[เงื่อนไขของลูกค้า: ${describeFilters(filters)}]\n${m.content}` }
    : m));

  try {
    const response = await client.beta.messages.create({
      model: config.anthropic.model,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      system: [{ type: "text", text: systemPrompt(products), cache_control: { type: "ephemeral" } }],
      messages: apiMessages,
    });

    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      return { ...localRecommend(latest, allowed), source: "local" };
    }
    const text = response.content.find((b) => b.type === "text")?.text;
    const parsed = JSON.parse(text);
    const productIds = [...new Set(parsed.product_ids.map(Number))].filter((id) => allowedIds.has(id)).slice(0, 3);
    return { reply: String(parsed.reply).trim(), productIds, source: "ai" };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) console.error("[ai] ANTHROPIC_API_KEY ถูกปฏิเสธ ตรวจสอบคีย์ใน .env");
    else if (err instanceof Anthropic.RateLimitError) console.warn("[ai] rate limited, using local recommender");
    else if (err instanceof Anthropic.APIError) console.error(`[ai] API error ${err.status}: ${err.message}`);
    else if (err instanceof SyntaxError) console.error("[ai] could not parse model output");
    else console.error("[ai]", err);
    return { ...localRecommend(latest, allowed), source: "local" };
  }
}

export const aiStatus = () => ({ enabled: Boolean(client), model: client ? config.anthropic.model : null });
