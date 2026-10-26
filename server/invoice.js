import PDFDocument from "pdfkit";
import { fileURLToPath } from "node:url";
const regular = fileURLToPath(new URL("./assets/fonts/NotoSansDevanagari-Regular.ttf", import.meta.url));
const bold = fileURLToPath(new URL("./assets/fonts/NotoSansDevanagari-Bold.ttf", import.meta.url));
export function invoicePdf(order, settings) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true, info: { Title: `Order ${order.orderNumber}`, Author: settings.siteName } });
    const chunks = []; doc.on("data", (chunk) => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject);
    doc.registerFont("Body", regular); doc.registerFont("Bold", bold); doc.font("Body");
    const amount = (value) => `${order.currency || "USD"} ${Number(value || 0).toFixed(2)}`;
    const width = doc.page.width - 96;
    function heading() { doc.fillColor("#2563eb").font("Bold").fontSize(24).text(settings.siteName, 48, 45); doc.fillColor("#172b4d").fontSize(12).text(order.status === "awaiting_payment" ? "PRO FORMA / PAYMENT PENDING" : "ORDER INVOICE", 48, 82); doc.font("Body").fontSize(10).text(`${order.orderNumber}  |  ${new Date(order.createdAt || Date.now()).toISOString().slice(0, 10)}`, 48, 105); doc.moveTo(48, 132).lineTo(doc.page.width - 48, 132).strokeColor("#dbe4f0").stroke(); doc.y = 150; }
    heading();
    const address = order.shippingAddress;
    doc.font("Bold").fontSize(11).text("DELIVER TO"); doc.moveDown(.4); doc.font("Body").fontSize(10).text([`${address.firstName} ${address.lastName}`, address.street, `${address.city}, ${address.state} ${address.postalCode}`, address.email, address.phone].filter(Boolean).join("\n"), { width });
    doc.moveDown(1.5); doc.font("Bold").text("ITEMS"); doc.moveDown(.7);
    for (const item of order.items) {
      const label = `${item.name}${item.variantLabel ? ` - ${item.variantLabel}` : ""}\n${item.quantity} x ${amount(item.price)}`;
      const height = Math.max(doc.font("Body").fontSize(10).heightOfString(label, { width: width - 140 }), 35) + 20;
      if (doc.y + height > 690) { doc.addPage(); doc.y = 55; }
      const y = doc.y;
      doc.fillColor("#172b4d").text(label, 48, y, { width: width - 140 });
      doc.font("Bold").text(amount(item.price * item.quantity), doc.page.width - 180, y, { width: 132, align: "right" });
      doc.moveTo(48, y + height - 10).lineTo(doc.page.width - 48, y + height - 10).strokeColor("#e8edf5").stroke(); doc.y = y + height;
    }
    if (doc.y > 550) { doc.addPage(); doc.y = 55; }
    const summary = [["Subtotal", amount(order.subtotal)], ...(order.discount ? [[`Discount (${order.couponCode || "offer"})`, `- ${amount(order.discount)}`]] : []), ["Shipping", amount(order.shipping)], ["TOTAL", amount(order.total)]];
    for (const [label, value] of summary) { const y = doc.y + 8; doc.font(label === "TOTAL" ? "Bold" : "Body").fontSize(label === "TOTAL" ? 13 : 10).text(label, 48, y, { width: width - 150 }); doc.text(value, doc.page.width - 195, y, { width: 147, align: "right" }); doc.y = y + 22; }
    doc.moveDown(); doc.font("Body").fontSize(9).fillColor("#61718c").text(`Payment: ${order.paymentMethod === "razorpay" ? "Razorpay" : "Cash on delivery"} | ${order.paymentStatus === "paid" ? "PAID" : order.paymentStatus === "refund_required" ? "REFUND REVIEW REQUIRED" : "PAYMENT PENDING"}\nOrder status: ${order.status.replaceAll("_", " ")}\n${settings.supportEmail}`, 48, doc.y, { width });
    doc.moveDown(); doc.text("This document records the order amounts. It does not add tax or confirm delivery. For a GST tax invoice, contact the store.", { width });
    const range = doc.bufferedPageRange(); for (let index = 0; index < range.count; index++) { doc.switchToPage(index); doc.fontSize(8).text(`${order.orderNumber}  |  Page ${index + 1} of ${range.count}`, 48, 780, { width, align: "center", lineBreak: false }); }
    doc.end();
  });
}
