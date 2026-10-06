// Keyword recommender: answers when the Claude API is not configured or not reachable.
//
// Thai is written without spaces, so short words hide inside longer ones ("นอน" in "ต้านอนุมูลอิสระ",
// "ใส" in "ใส่", "ผม" the pronoun). Each goal therefore has separate trigger phrases (looked for in
// the customer's message) and product tags (matched exactly against the curated tags on each product).

const GOALS = [
  { label: "ผิวขาว กระจ่างใส", triggers: ["ผิวขาว", "ขาวใส", "หน้าใส", "ผิวใส", "กระจ่าง", "ด่างดำ", "ฝ้า", "หมองคล้ำ", "white", "gluta", "กลูต้า", "บำรุงผิว"], tags: ["ผิวขาว", "กระจ่างใส", "จุดด่างดำ"] },
  { label: "สิว", triggers: ["สิว", "หน้ามัน", "ผิวมัน", "acne"], tags: ["สิว", "ผิวมัน"] },
  { label: "ริ้วรอย คอลลาเจน", triggers: ["ริ้วรอย", "เหี่ยว", "คอลลาเจน", "collagen", "ชุ่มชื้น", "บำรุงผิว", "ผิวแห้ง"], tags: ["คอลลาเจน", "ริ้วรอย", "ผิวชุ่มชื้น"] },
  { label: "การนอนหลับ", triggers: ["หลับ", "เครียด", "sleep", "ตะคริว", "ผ่อนคลาย", "นอนน้อย"], tags: ["นอนหลับ", "ความเครียด", "ตะคริว", "ผ่อนคลาย"] },
  { label: "ข้อเข่า", triggers: ["ปวดข้อ", "ข้อเข่า", "เข่า", "ข้อต่อ", "joint"], tags: ["ข้อ", "ข้อเข่า"] },
  { label: "กระดูก", triggers: ["กระดูก", "แคลเซียม", "calcium", "พรุน"], tags: ["กระดูก", "แคลเซียม"] },
  { label: "ภูมิคุ้มกัน", triggers: ["ภูมิ", "หวัด", "ป่วย", "immune", "วิตามินซี"], tags: ["ภูมิคุ้มกัน", "หวัด", "วิตามินซี"] },
  { label: "เด็ก", triggers: ["เด็ก", "ลูก", "ขวบ", "kid"], tags: ["เด็ก"] },
  { label: "สายตา", triggers: ["สายตา", "ตาล้า", "ตาแห้ง", "ตามัว", "จ้องจอ", "จอคอม", "หน้าจอ", "eye"], tags: ["สายตา", "จ้องจอ", "ตาล้า"] },
  { label: "ควบคุมน้ำหนัก", triggers: ["ลดน้ำหนัก", "น้ำหนัก", "อ้วน", "หุ่น", "เผาผลาญ", "ลดพุง", "ลดไขมัน", "diet"], tags: ["ลดน้ำหนัก", "เผาผลาญ", "หุ่นดี"] },
  { label: "ขับถ่าย ลำไส้", triggers: ["ขับถ่าย", "ท้องผูก", "ลำไส้", "ท้องอืด", "ไฟเบอร์"], tags: ["ขับถ่าย", "ท้องผูก", "ลำไส้", "ท้องอืด", "ไฟเบอร์"] },
  { label: "ผมและเล็บ", triggers: ["ผมร่วง", "ผมบาง", "เส้นผม", "บำรุงผม", "เล็บ", "hair"], tags: ["ผมร่วง", "ผม", "เล็บ"] },
  { label: "โปรตีน สร้างกล้าม", triggers: ["โปรตีน", "กล้าม", "เวย์", "whey", "ฟิตเนส", "ยิม", "ออกกำลัง"], tags: ["โปรตีน", "สร้างกล้าม", "ออกกำลังกาย"] },
  { label: "สมอง ความจำ", triggers: ["ความจำ", "สมอง", "โฟกัส", "สมาธิ", "ขี้ลืม"], tags: ["ความจำ", "สมอง", "สมาธิ"] },
  { label: "พลังงาน", triggers: ["เพลีย", "เหนื่อย", "พลังงาน", "ไม่มีแรง"], tags: ["พลังงาน", "อ่อนเพลีย"] },
  { label: "วัยทอง", triggers: ["วัยทอง", "ร้อนวูบวาบ", "หมดประจำเดือน"], tags: ["วัยทอง"] },
  { label: "หัวใจ", triggers: ["หัวใจ", "คอเลสเตอรอล", "ไขมันในเลือด"], tags: ["หัวใจ", "ไขมัน"] },
];

const CAUTION = /ตั้งครรภ์|ตั้งท้อง|มีครรภ์|ให้นม|โรคประจำตัว|เบาหวาน|ความดัน|โรคไต|โรคตับ|กินยา|ทานยา|ใช้ยา|ยาละลายลิ่มเลือด/;

export function localRecommend(text, candidates) {
  const t = text.toLowerCase();
  const goals = GOALS.filter((g) => g.triggers.some((w) => t.includes(w)));
  const wanted = new Set(goals.flatMap((g) => g.tags));

  const scored = candidates
    .map((p) => ({ p, hits: p.tags.filter((tag) => wanted.has(tag)).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits || b.p.rating - a.p.rating || b.p.sold - a.p.sold)
    .slice(0, 3)
    .map((x) => x.p);

  const caution = CAUTION.test(text)
    ? "\n\nหากตั้งครรภ์ ให้นมบุตร มีโรคประจำตัว หรือใช้ยาอยู่ กรุณาปรึกษาแพทย์หรือเภสัชกรก่อนรับประทานนะคะ"
    : "";
  const topics = goals.map((g) => g.label).join(" / ");
  let reply;
  if (!goals.length) {
    reply = "บอกน้องวีเพิ่มอีกนิดได้ไหมคะ ว่าอยากดูแลเรื่องไหนเป็นพิเศษ เช่น ผิวขาวกระจ่างใส สิว การนอนหลับ ข้อเข่า สายตา หรือควบคุมน้ำหนัก";
  } else if (!scored.length) {
    reply = `ตอนนี้ยังไม่มีสินค้าเรื่อง${topics}ที่ตรงกับตัวกรองที่เลือกไว้ค่ะ ลองปรับงบประมาณหรือช่วงอายุดูนะคะ`;
  } else {
    reply = `สำหรับเรื่อง${topics} น้องวีแนะนำตามนี้ค่ะ\n`
      + scored.map((p, i) => `${i + 1}. ${p.name} (฿${p.price.toLocaleString("th-TH")}) ${p.description}`).join("\n");
  }
  return { reply: reply + caution, productIds: scored.map((p) => p.id) };
}
