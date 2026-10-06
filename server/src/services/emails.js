// Email templates. Table layout and inline styles, because email clients ignore most CSS.
import { config } from "../config.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const baht = (n) => `฿${Number(n || 0).toLocaleString("th-TH")}`;
const PAY = { promptpay: "พร้อมเพย์ (QR)", card: "บัตรเครดิต/เดบิต", cod: "เก็บเงินปลายทาง" };
const orderUrl = (o) => `${config.appUrl}/orders/${o.orderNo}?t=${o.accessToken}`;

function layout({ preheader, title, body, cta }) {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f4f7f3;font-family:'IBM Plex Sans Thai',Tahoma,Arial,sans-serif;color:#12302a">
<span style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f3;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dbe4da">
<tr><td style="background:#1d6b55;padding:20px 28px;color:#fff;font-size:22px;font-weight:600">Vitara</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 12px;font-size:21px;line-height:1.35;color:#12302a">${esc(title)}</h1>
${body}
${cta ? `<p style="margin:24px 0 4px"><a href="${esc(cta.url)}" style="display:inline-block;background:#1d6b55;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600">${esc(cta.label)}</a></p>
<p style="margin:8px 0 0;font-size:12px;color:#5d7169">ถ้าปุ่มกดไม่ได้ คัดลอกลิงก์นี้ไปเปิด: <br><span style="word-break:break-all">${esc(cta.url)}</span></p>` : ""}
</td></tr>
<tr><td style="padding:16px 28px;background:#edf2ec;font-size:12px;color:#5d7169">อีเมลนี้ส่งจากร้าน Vitara · ผลิตภัณฑ์เสริมอาหารไม่มีผลในการป้องกันหรือรักษาโรค</td></tr>
</table></td></tr></table></body></html>`;
}

const p = (html) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6">${html}</p>`;

function itemsTable(order) {
  const rows = order.items.map((i) => `<tr><td style="padding:8px 0;border-bottom:1px solid #edf2ec;font-size:14px">${esc(i.name)} × ${i.quantity}${i.intervalDays ? `<br><span style="font-size:12px;color:#1d6b55">สมัครรับทุก ${i.intervalDays} วัน</span>` : ""}</td>
    <td align="right" style="padding:8px 0;border-bottom:1px solid #edf2ec;font-size:14px;white-space:nowrap">${baht(i.unitPrice * i.quantity)}</td></tr>`).join("");
  const line = (label, value, bold) => `<tr><td style="padding:4px 0;font-size:14px;${bold ? "font-weight:700" : "color:#5d7169"}">${label}</td><td align="right" style="padding:4px 0;font-size:14px;${bold ? "font-weight:700" : ""}">${value}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 16px">${rows}
    ${line("ยอดรวมสินค้า", baht(order.subtotal))}
    ${order.discount ? line(`ส่วนลด ${esc(order.couponCode || "")}`, `−${baht(order.discount)}`) : ""}
    ${line("ค่าจัดส่ง", order.shippingFee ? baht(order.shippingFee) : "ฟรี")}
    ${order.codFee ? line("ค่าบริการปลายทาง", baht(order.codFee)) : ""}
    ${line("ยอดชำระ", baht(order.total), true)}</table>`;
}

const shipBlock = (o) => p(`<b>จัดส่งถึง</b><br>${esc(o.shipping.name)} · ${esc(o.shipping.phone)}<br>${esc(o.shipping.address)} ${esc(o.shipping.province)} ${esc(o.shipping.postcode)}`);

export function orderPlacedEmail(order) {
  const unpaid = order.paymentMethod !== "cod" && order.paymentStatus === "unpaid";
  const title = unpaid ? `ได้รับคำสั่งซื้อ ${order.orderNo} แล้ว รอชำระเงิน` : `ขอบคุณสำหรับคำสั่งซื้อ ${order.orderNo}`;
  return {
    to: order.email, kind: "order_placed",
    subject: unpaid ? `รอชำระเงิน คำสั่งซื้อ ${order.orderNo}` : `ยืนยันคำสั่งซื้อ ${order.orderNo}`,
    html: layout({
      preheader: `ยอดชำระ ${baht(order.total)} · ${PAY[order.paymentMethod]}`,
      title,
      body: p(unpaid ? "กรุณาชำระเงินภายใน 24 ชั่วโมง สินค้าจะถูกจองไว้ให้จนถึงตอนนั้น" : "ร้านกำลังเตรียมสินค้า และจะแจ้งเลขพัสดุเมื่อจัดส่ง")
        + itemsTable(order) + p(`วิธีชำระเงิน: ${PAY[order.paymentMethod]}`) + shipBlock(order),
      cta: { label: unpaid ? "ชำระเงิน / ดูคำสั่งซื้อ" : "ติดตามคำสั่งซื้อ", url: orderUrl(order) },
    }),
    text: `${title}\nยอดชำระ ${baht(order.total)}\nดูคำสั่งซื้อ: ${orderUrl(order)}`,
  };
}

export function paymentReceivedEmail(order) {
  return {
    to: order.email, kind: "payment_received", subject: `ชำระเงินสำเร็จ คำสั่งซื้อ ${order.orderNo}`,
    html: layout({
      preheader: `ได้รับยอด ${baht(order.total)} แล้ว`, title: "ได้รับการชำระเงินแล้ว",
      body: p(`ร้านได้รับยอด <b>${baht(order.total)}</b> สำหรับคำสั่งซื้อ ${esc(order.orderNo)} แล้ว และกำลังเตรียมจัดส่ง`) + itemsTable(order),
      cta: { label: "ติดตามคำสั่งซื้อ", url: orderUrl(order) },
    }),
    text: `ได้รับการชำระเงิน ${baht(order.total)} สำหรับ ${order.orderNo}\n${orderUrl(order)}`,
  };
}

export function shippedEmail(order) {
  return {
    to: order.email, kind: "order_shipped", subject: `จัดส่งแล้ว คำสั่งซื้อ ${order.orderNo}`,
    html: layout({
      preheader: order.trackingNo ? `เลขพัสดุ ${order.trackingNo}` : "สินค้ากำลังเดินทางถึงคุณ", title: "สินค้าของคุณถูกจัดส่งแล้ว",
      body: (order.trackingNo ? p(`เลขพัสดุ: <b style="font-family:monospace;font-size:16px">${esc(order.trackingNo)}</b>`) : "")
        + p("โดยปกติจะถึงภายใน 1–2 วันทำการ") + shipBlock(order),
      cta: { label: "ดูสถานะคำสั่งซื้อ", url: orderUrl(order) },
    }),
    text: `จัดส่งแล้ว ${order.orderNo}${order.trackingNo ? ` เลขพัสดุ ${order.trackingNo}` : ""}\n${orderUrl(order)}`,
  };
}

export function cancelledEmail(order, reason) {
  return {
    to: order.email, kind: "order_cancelled", subject: `ยกเลิกคำสั่งซื้อ ${order.orderNo}`,
    html: layout({
      preheader: reason || "คำสั่งซื้อถูกยกเลิก", title: `คำสั่งซื้อ ${order.orderNo} ถูกยกเลิก`,
      body: p(esc(reason || "คำสั่งซื้อนี้ถูกยกเลิกแล้ว")) + p(order.paymentStatus === "paid" ? "ร้านจะคืนเงินผ่านช่องทางเดิมภายใน 7 วันทำการ" : "หากต้องการสินค้า สามารถสั่งซื้อใหม่ได้ทุกเมื่อ"),
      cta: { label: "เลือกซื้อสินค้า", url: `${config.appUrl}/shop` },
    }),
    text: `ยกเลิกคำสั่งซื้อ ${order.orderNo}. ${reason || ""}`,
  };
}

export function passwordResetEmail(user, url) {
  return {
    to: user.email, kind: "password_reset", subject: "ตั้งรหัสผ่านใหม่สำหรับบัญชี Vitara",
    html: layout({
      preheader: "ลิงก์นี้ใช้ได้ภายใน 1 ชั่วโมง", title: "ตั้งรหัสผ่านใหม่",
      body: p(`สวัสดีคุณ ${esc(user.name)}`) + p("มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีนี้ กดปุ่มด้านล่างภายใน 1 ชั่วโมง ลิงก์ใช้ได้ครั้งเดียว")
        + p("ถ้าคุณไม่ได้ขอ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้ตามปกติ"),
      cta: { label: "ตั้งรหัสผ่านใหม่", url },
    }),
    text: `ตั้งรหัสผ่านใหม่ (ใช้ได้ 1 ชั่วโมง): ${url}`,
  };
}

export function welcomeEmail(user) {
  return {
    to: user.email, kind: "welcome", subject: "ยินดีต้อนรับสู่ Vitara",
    html: layout({
      preheader: "ใช้โค้ด WELCOME10 ลด 10% ในคำสั่งซื้อแรก", title: `ยินดีต้อนรับ คุณ ${user.name}`,
      body: p("ขอบคุณที่สมัครสมาชิก ตอนนี้คุณติดตามคำสั่งซื้อ เขียนรีวิว และสมัครรับสินค้าประจำได้แล้ว")
        + p("ไม่แน่ใจว่าควรเริ่มจากตัวไหน? ลองทำแบบทดสอบสุขภาพ 1 นาที แล้วรับชุดอาหารเสริมที่เหมาะกับคุณ"),
      cta: { label: "ทำแบบทดสอบสุขภาพ", url: `${config.appUrl}/quiz` },
    }),
    text: `ยินดีต้อนรับสู่ Vitara\nแบบทดสอบสุขภาพ: ${config.appUrl}/quiz`,
  };
}

export function runOutReminderEmail({ email, name, items }) {
  const list = items.map((i) => `<li style="margin:0 0 6px">${esc(i.name)}</li>`).join("");
  const url = `${config.appUrl}/account#runout`;
  return {
    to: email, kind: "runout_reminder", subject: "อาหารเสริมของคุณใกล้หมดแล้ว",
    html: layout({
      preheader: "สั่งซ้ำได้ในคลิกเดียว", title: "ใกล้หมดแล้ว สั่งต่อเลยไหม?",
      body: p(`สวัสดีคุณ ${esc(name || "ลูกค้า")} จากวันที่สั่งซื้อ สินค้าเหล่านี้น่าจะเหลืออีกไม่กี่วัน`)
        + `<ul style="padding-left:20px;margin:0 0 12px;font-size:15px">${list}</ul>`
        + p(`สมัครรับประจำเพื่อรับส่วนลด ${config.subscription.discountPct}% และไม่ต้องคอยสั่งเองอีก`),
      cta: { label: "สั่งซ้ำ", url },
    }),
    text: `สินค้าใกล้หมด: ${items.map((i) => i.name).join(", ")}\nสั่งซ้ำ: ${url}`,
  };
}

export function renewalEmail(order, sub) {
  const unpaid = order.paymentMethod !== "cod";
  return {
    to: order.email, kind: "subscription_renewal", subject: `รอบจัดส่งถัดไป ${sub.productName} (${order.orderNo})`,
    html: layout({
      preheader: unpaid ? `ชำระ ${baht(order.total)} เพื่อจัดส่งรอบนี้` : "เตรียมจัดส่งรอบถัดไปแล้ว",
      title: "ถึงรอบจัดส่งสินค้าที่สมัครรับประจำ",
      body: p(`ร้านสร้างคำสั่งซื้อรอบใหม่ให้แล้ว (ทุก ${sub.intervalDays} วัน ลด ${sub.discountPct}%)`)
        + p(unpaid ? "กรุณาชำระเงินภายใน 24 ชั่วโมงเพื่อให้จัดส่งตรงรอบ หากต้องการข้ามรอบนี้ ไปที่หน้าบัญชีของคุณ" : "จะจัดส่งแบบเก็บเงินปลายทางตามที่อยู่เดิม")
        + itemsTable(order) + shipBlock(order),
      cta: { label: unpaid ? "ชำระเงินรอบนี้" : "ดูคำสั่งซื้อ", url: orderUrl(order) },
    }),
    text: `รอบจัดส่งใหม่ ${order.orderNo} ยอด ${baht(order.total)}\n${orderUrl(order)}`,
  };
}
