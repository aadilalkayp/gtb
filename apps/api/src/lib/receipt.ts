import PDFDocument from "pdfkit";
import { formatINR } from "@gtb/shared";
import { uploadObject } from "@/lib/storage";

export interface ReceiptData {
  clientName: string;
  clientCode: string;
  planName: string;
  installmentNumber: number;
  amount: number;
  paymentMethod: string;
  paidAt: Date;
  receiptId: string;
}

function methodLabel(m: string): string {
  return (
    {
      upi: "UPI",
      bank_transfer: "Bank transfer",
      cash: "Cash",
      other: "Other",
    }[m] ?? m
  );
}

/**
 * FEAT-1: generate a payment receipt PDF (SRS §8.7), store it in the private
 * documents bucket and return the Document row. Called right after a payment
 * approval; the receipt is a `payment_receipt` document (visible to staff +
 * client per SRS §16.1).
 */
export async function createPaymentReceipt(
  data: ReceiptData,
): Promise<{ id: string; fileUrl: string; fileSize: number } | null> {
  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<void>((resolve) => doc.on("end", () => resolve()));

  // Header
  doc.fontSize(18).fillColor("#1c1917").text("GTB OS — Payment Receipt", { continued: false });
  doc.moveDown(0.2);
  doc.fontSize(9).fillColor("#78716c").text(`Receipt #${data.receiptId.slice(0, 8).toUpperCase()}`);
  doc
    .fontSize(9)
    .text(`Issued ${data.paidAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}`);

  doc.moveDown(1.2);

  // Details
  const row = (label: string, value: string) => {
    doc.fontSize(10).fillColor("#78716c").text(label, 48, doc.y, { continued: true });
    doc.fontSize(10).fillColor("#1c1917").text(`  ${value}`, { align: "right" });
    doc.moveDown(0.5);
  };
  row("Client", `${data.clientName} (${data.clientCode})`);
  row("Plan", data.planName);
  row("Installment", `${data.installmentNumber} of the payment schedule`);
  row("Payment method", methodLabel(data.paymentMethod));

  doc.moveDown(0.8);

  // Amount
  doc.fontSize(11).fillColor("#1c1917").text("Amount paid", { continued: true });
  doc
    .fontSize(16)
    .fillColor("#16a34a")
    .text(`  ${formatINR(data.amount)}`, { align: "right" });
  doc.moveDown(0.3);
  doc.moveTo(48, doc.y).lineTo(595 - 48, doc.y).strokeColor("#e7e5e4").lineWidth(1).stroke();
  doc.moveDown(0.8);
  doc
    .fontSize(8)
    .fillColor("#a8a29e")
    .text("Thank you — your payment has been recorded. This receipt was generated automatically.");
  doc.moveDown(1.2);
  doc
    .fontSize(8)
    .fillColor("#a8a29e")
    .text("Groom To Be · Glow To Be — GTB OS", { align: "center" });

  doc.end();
  await done;
  const buffer = Buffer.concat(chunks);

  const path = `${data.clientCode.toLowerCase().replace(/[^a-z0-9]/g, "")}/payment_receipt/${data.receiptId}.pdf`;
  const { error } = await uploadObject(path, buffer, "application/pdf");
  if (error) {
    console.error("[GTB OS] Receipt upload failed:", error.message);
    return null;
  }
  return { id: data.receiptId, fileUrl: path, fileSize: buffer.byteLength };
}
