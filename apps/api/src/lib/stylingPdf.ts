import path from "node:path";
import PDFDocument from "pdfkit";
import { prisma } from "@gtb/db";
import {
  BLUEPRINT_SECTION_LABELS,
  STYLING_ITEM_PRIORITY_LABELS,
  formatDate,
  snapshotImageIds,
  snapshotSectionHasContent,
  type BlueprintSnapshot,
  type StylingItemKind,
} from "@gtb/shared";
import { logger } from "./logger.js";
import { deleteObjects, downloadObject, uploadObject } from "./storage.js";

const log = logger.child({ mod: "styling-pdf" });

// Same font files as the share card (traced into the standalone build via
// outputFileTracingIncludes in next.config.mjs).
const FONT_DIR = path.join(process.cwd(), "src/assets/fonts");

const INK = "#1f1c19";
const MUTED = "#6f6862";
const LINE = "#e6e2dc";
const TEAL = "#16675e";
const SOFT = "#f4f1ec";

const PAGE_W = 595.28;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

export interface BlueprintPdfMeta {
  clientName: string;
  clientCode: string;
  bigDay: Date;
  stylistName: string | null;
  version: number;
  publishedAt: Date;
}

/** The bundled Inter subset has no rupee glyph; spell it out. */
function t(s: string | null | undefined): string {
  return (s ?? "").replace(/₹\s?/g, "Rs ");
}

async function loadImages(
  clientId: string,
  snapshot: BlueprintSnapshot,
): Promise<Map<string, Buffer>> {
  const ids = snapshotImageIds(snapshot);
  const out = new Map<string, Buffer>();
  if (!ids.length) return out;
  const docs = await prisma.document.findMany({
    where: { id: { in: ids }, clientId, type: "styling_image" },
    select: { id: true, fileUrl: true },
  });
  await Promise.all(
    docs.map(async (d) => {
      try {
        out.set(d.id, await downloadObject(d.fileUrl));
      } catch (error) {
        log.warn("image missing for pdf", { documentId: d.id, error });
      }
    }),
  );
  return out;
}

/** Render the Blueprint PDF. Pure layout: images are passed in. */
export async function renderBlueprintPdf(
  snapshot: BlueprintSnapshot,
  meta: BlueprintPdfMeta,
  images: Map<string, Buffer>,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    bufferPages: true,
    info: { Title: `Styling Blueprint for ${meta.clientName}` },
  });
  doc.registerFont("body", path.join(FONT_DIR, "Inter-Regular.woff"));
  doc.registerFont("bold", path.join(FONT_DIR, "Inter-Bold.woff"));
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve) => doc.on("end", () => resolve()));

  const bottom = () => doc.page.height - MARGIN - 24;
  const ensure = (h: number) => {
    if (doc.y + h > bottom()) doc.addPage();
  };
  const image = (id: string | null, x: number, y: number, w: number, h: number) => {
    const buf = id ? images.get(id) : undefined;
    doc.save().roundedRect(x, y, w, h, 6).fill(SOFT).restore();
    if (!buf) return;
    try {
      doc.save().roundedRect(x, y, w, h, 6).clip();
      doc.image(buf, x, y, { fit: [w, h], align: "center", valign: "center" });
      doc.restore();
    } catch (error) {
      doc.restore();
      log.warn("image could not be drawn", { id, error });
    }
  };
  /** `keep` = height of the first block, so a heading never ends a page alone. */
  const heading = (label: string, keep = 40) => {
    ensure(48 + keep);
    doc.moveDown(1.1);
    doc.font("bold").fontSize(13).fillColor(INK).text(label, MARGIN, doc.y);
    const y = doc.y + 4;
    doc
      .moveTo(MARGIN, y)
      .lineTo(PAGE_W - MARGIN, y)
      .lineWidth(0.8)
      .strokeColor(LINE)
      .stroke();
    doc.y = y + 10;
  };
  const para = (s: string | null | undefined, opts: { color?: string; size?: number } = {}) => {
    if (!s) return;
    doc
      .font("body")
      .fontSize(opts.size ?? 10)
      .fillColor(opts.color ?? INK)
      .text(t(s), MARGIN, doc.y, { width: CONTENT_W, lineGap: 2 });
  };
  const kv = (rows: [string, string | null | undefined][]) => {
    const shown = rows.filter((r) => r[1]);
    const colW = CONTENT_W / 2;
    for (let i = 0; i < shown.length; i += 2) {
      ensure(34);
      const y = doc.y;
      for (let j = 0; j < 2; j++) {
        const r = shown[i + j];
        if (!r) continue;
        const x = MARGIN + j * colW;
        doc
          .font("body")
          .fontSize(8.5)
          .fillColor(MUTED)
          .text(r[0].toUpperCase(), x, y, { width: colW - 12, characterSpacing: 0.4 });
        doc
          .font("bold")
          .fontSize(10.5)
          .fillColor(INK)
          .text(t(r[1]), x, y + 12, { width: colW - 12 });
      }
      doc.y = y + 34;
    }
  };
  const swatches = (colors: string[], x: number, y: number, r = 7) => {
    colors.forEach((c, i) => {
      doc
        .save()
        .circle(x + r + i * (r * 2 + 4), y + r, r)
        .fillAndStroke(c, LINE)
        .restore();
    });
  };
  const bullet = (s: string) => {
    ensure(16);
    const y = doc.y;
    doc
      .save()
      .circle(MARGIN + 3, y + 5.5, 2)
      .fill(TEAL)
      .restore();
    doc
      .font("body")
      .fontSize(10)
      .fillColor(INK)
      .text(t(s), MARGIN + 12, y, { width: CONTENT_W - 12, lineGap: 2 });
    doc.moveDown(0.25);
  };

  const has = snapshotSectionHasContent(snapshot);

  // ---- Cover band
  doc.save().rect(0, 0, PAGE_W, 150).fill(TEAL).restore();
  doc
    .font("body")
    .fontSize(9)
    .fillColor("#d6ebe7")
    .text("GROOM TO BE", MARGIN, 44, { characterSpacing: 1.2 });
  doc.font("bold").fontSize(26).fillColor("#ffffff").text("Styling Blueprint", MARGIN, 60);
  doc
    .font("body")
    .fontSize(11)
    .fillColor("#e6f2f0")
    .text(
      `${t(meta.clientName)} · ${meta.clientCode} · Big day ${formatDate(meta.bigDay)}`,
      MARGIN,
      98,
    );
  doc
    .fontSize(9)
    .fillColor("#cfe5e1")
    .text(
      `Prepared by ${t(meta.stylistName) || "your GTB stylist"} · Version ${meta.version} · ${formatDate(meta.publishedAt)}`,
      MARGIN,
      116,
    );
  doc.y = 170;

  // ---- Style Direction
  if (has.direction) {
    heading(BLUEPRINT_SECTION_LABELS.direction);
    if (snapshot.direction.tags.length) {
      doc
        .font("bold")
        .fontSize(12)
        .fillColor(TEAL)
        .text(snapshot.direction.tags.map(t).join("  ·  "), MARGIN, doc.y, { width: CONTENT_W });
      doc.moveDown(0.4);
    }
    para(snapshot.direction.description, { color: MUTED });
  }

  // ---- Style Profile
  if (has.profile) {
    heading(BLUEPRINT_SECTION_LABELS.profile);
    const p = snapshot.profile;
    kv([
      ["Face shape", p.faceShape],
      ["Skin tone", p.skinTone],
      ["Hair type", p.hairType],
      ["Beard type", p.beardType],
      ["Build", p.bodyType],
      ["Height", p.heightCm ? `${p.heightCm} cm` : null],
      ["Current style", p.existingStyle],
      ["Preferences", p.stylePreferences],
    ]);
  }

  // ---- Outfit Colours
  if (has.colours) {
    heading(BLUEPRINT_SECTION_LABELS.colours);
    for (const pal of snapshot.palettes) {
      ensure(30);
      const y = doc.y;
      swatches(pal.colors, MARGIN, y);
      const x = MARGIN + pal.colors.length * 18 + 10;
      doc
        .font("bold")
        .fontSize(10.5)
        .fillColor(INK)
        .text(t(pal.label), x, y, { width: CONTENT_W - (x - MARGIN) });
      if (pal.notes)
        doc
          .font("body")
          .fontSize(9)
          .fillColor(MUTED)
          .text(t(pal.notes), x, doc.y, { width: CONTENT_W - (x - MARGIN) });
      doc.y = Math.max(doc.y, y + 16) + 8;
    }
  }

  // ---- Best Looks
  if (has.looks) {
    heading(BLUEPRINT_SECTION_LABELS.looks, 216);
    for (const look of snapshot.looks) {
      const imgW = 150;
      const imgH = 200;
      ensure(imgH + 16);
      const y = doc.y;
      image(look.imageDocId, MARGIN, y, imgW, imgH);
      const x = MARGIN + imgW + 18;
      const w = CONTENT_W - imgW - 18;
      doc.font("bold").fontSize(12).fillColor(INK).text(t(look.title), x, y, { width: w });
      if (look.eventLabel)
        doc
          .font("body")
          .fontSize(9)
          .fillColor(MUTED)
          .text(t(look.eventLabel), x, doc.y, { width: w });
      if (look.colors.length) {
        swatches(look.colors, x, doc.y + 4, 6);
        doc.y += 20;
      }
      for (const [label, v] of [
        ["Outfit", look.outfit],
        ["Footwear", look.footwear],
        ["Accessories", look.accessories],
      ] as const) {
        if (!v) continue;
        doc
          .font("body")
          .fontSize(8.5)
          .fillColor(MUTED)
          .text(label.toUpperCase(), x, doc.y + 4, { width: w, characterSpacing: 0.4 });
        doc.font("body").fontSize(10).fillColor(INK).text(t(v), x, doc.y, { width: w });
      }
      if (look.description)
        doc
          .font("body")
          .fontSize(9.5)
          .fillColor(MUTED)
          .text(t(look.description), x, doc.y + 6, { width: w });
      if (look.stylistNote)
        doc
          .font("body")
          .fontSize(9.5)
          .fillColor(TEAL)
          .text(`"${t(look.stylistNote)}"`, x, doc.y + 6, { width: w });
      doc.y = Math.max(doc.y, y + imgH) + 16;
    }
  }

  // ---- Hair & Beard
  if (has.hair) {
    heading(
      BLUEPRINT_SECTION_LABELS.hair,
      snapshot.hair.frontDocId || snapshot.hair.sideDocId || snapshot.hair.backDocId ? 200 : 60,
    );
    const h = snapshot.hair;
    const shots = [
      ["Front", h.frontDocId],
      ["Side", h.sideDocId],
      ["Back", h.backDocId],
    ] as const;
    if (shots.some(([, id]) => id)) {
      const w = (CONTENT_W - 24) / 3;
      const imgH = w * 1.25;
      ensure(imgH + 24);
      const y = doc.y;
      shots.forEach(([label, id], i) => {
        const x = MARGIN + i * (w + 12);
        image(id, x, y, w, imgH);
        doc
          .font("body")
          .fontSize(8.5)
          .fillColor(MUTED)
          .text(label, x, y + imgH + 4, { width: w, align: "center" });
      });
      doc.y = y + imgH + 22;
    }
    if (h.barberBrief.length) {
      ensure(30);
      doc.font("bold").fontSize(10.5).fillColor(INK).text("Barber brief", MARGIN, doc.y);
      doc.moveDown(0.3);
      h.barberBrief.forEach(bullet);
    }
    if (h.notes) {
      doc.moveDown(0.3);
      para(h.notes, { color: TEAL });
    }
  }

  // ---- Item sections
  const itemSection = (kind: StylingItemKind, label: string) => {
    const items = snapshot.items.filter((i) => i.kind === kind);
    if (!items.length) return;
    heading(label, 66);
    for (const it of items) {
      const thumb = it.imageDocId && images.has(it.imageDocId) ? 54 : 0;
      ensure(Math.max(thumb, 34) + 12);
      const y = doc.y;
      if (thumb) image(it.imageDocId, MARGIN, y, thumb, thumb);
      const x = MARGIN + (thumb ? thumb + 12 : 0);
      const w = CONTENT_W - (x - MARGIN);
      doc.font("bold").fontSize(10.5).fillColor(INK).text(t(it.name), x, y, { width: w });
      const meta2 = [
        it.category,
        it.priceRange,
        it.priority ? STYLING_ITEM_PRIORITY_LABELS[it.priority] : null,
        it.recommendation,
        it.color,
        it.fit,
      ]
        .filter(Boolean)
        .map((v) => t(v))
        .join("  ·  ");
      if (meta2) doc.font("body").fontSize(9).fillColor(MUTED).text(meta2, x, doc.y, { width: w });
      if (it.notes)
        doc
          .font("body")
          .fontSize(9.5)
          .fillColor(INK)
          .text(t(it.notes), x, doc.y + 2, { width: w });
      if (it.url)
        doc
          .font("body")
          .fontSize(8.5)
          .fillColor(TEAL)
          .text(it.url, x, doc.y + 2, { width: w, link: it.url, underline: false });
      doc.y = Math.max(doc.y, y + thumb) + 10;
    }
  };
  itemSection("outfit", BLUEPRINT_SECTION_LABELS.outfits);
  itemSection("product", BLUEPRINT_SECTION_LABELS.shopping);
  itemSection("footwear", BLUEPRINT_SECTION_LABELS.footwear);
  itemSection("eyewear", BLUEPRINT_SECTION_LABELS.eyewear);

  // ---- Big Day Essentials
  if (has.essentials) {
    heading(BLUEPRINT_SECTION_LABELS.essentials);
    for (const e of snapshot.essentials) {
      ensure(18);
      const y = doc.y;
      doc
        .save()
        .roundedRect(MARGIN, y + 1, 9, 9, 2)
        .lineWidth(0.8)
        .strokeColor(MUTED)
        .stroke()
        .restore();
      doc
        .font("body")
        .fontSize(10)
        .fillColor(INK)
        .text(t(e.item) + (e.notes ? `  (${t(e.notes)})` : ""), MARGIN + 16, y, {
          width: CONTENT_W - 16,
        });
      doc.moveDown(0.3);
    }
  }

  // ---- Footer on every page
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // The footer sits inside the bottom margin; without this pdfkit treats
    // text there as overflow and appends a blank page per footer line.
    doc.page.margins.bottom = 0;
    const y = doc.page.height - MARGIN + 6;
    doc.font("body").fontSize(8).fillColor(MUTED);
    doc.text(`Styling Blueprint · ${meta.clientCode} · Version ${meta.version}`, MARGIN, y, {
      width: CONTENT_W / 2,
      lineBreak: false,
    });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, MARGIN + CONTENT_W / 2, y, {
      width: CONTENT_W / 2,
      align: "right",
      lineBreak: false,
    });
  }

  doc.end();
  await done;
  return Buffer.concat(chunks);
}

/**
 * Generate and store the PDF for a published version, replacing the PDF of
 * any earlier version so the client's documents show only the current one.
 * Returns the new Document id, or null when generation failed (logged; the
 * publish itself has already succeeded).
 */
export async function generateBlueprintPdf(
  versionId: string,
  uploadedById: string,
): Promise<string | null> {
  try {
    const version = await prisma.stylingBlueprintVersion.findUniqueOrThrow({
      where: { id: versionId },
      include: {
        publishedBy: { select: { name: true } },
        blueprint: {
          select: {
            id: true,
            client: { select: { id: true, name: true, clientCode: true, weddingDate: true } },
          },
        },
      },
    });
    const client = version.blueprint.client;
    const snapshot = version.snapshot as unknown as BlueprintSnapshot;
    const images = await loadImages(client.id, snapshot);
    const buffer = await renderBlueprintPdf(
      snapshot,
      {
        clientName: client.name,
        clientCode: client.clientCode,
        bigDay: client.weddingDate,
        stylistName: version.publishedBy.name,
        version: version.version,
        publishedAt: version.createdAt,
      },
      images,
    );

    const fileName = `${client.clientCode}-styling-blueprint-v${version.version}.pdf`;
    const objectPath = `${client.id}/styling_guide/${crypto.randomUUID()}-${fileName.toLowerCase()}`;
    const { error } = await uploadObject(objectPath, buffer, "application/pdf");
    if (error) {
      log.error("blueprint pdf upload failed", { versionId, reason: error.message });
      return null;
    }

    const previous = await prisma.stylingBlueprintVersion.findMany({
      where: {
        blueprintId: version.blueprint.id,
        id: { not: version.id },
        pdfDocumentId: { not: null },
      },
      select: { id: true, pdfDocumentId: true },
    });
    const oldDocs = await prisma.document.findMany({
      where: { id: { in: previous.map((p) => p.pdfDocumentId!) } },
      select: { id: true, fileUrl: true },
    });
    const replacingOwn = version.pdfDocumentId
      ? await prisma.document.findUnique({
          where: { id: version.pdfDocumentId },
          select: { id: true, fileUrl: true },
        })
      : null;

    const document = await prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          clientId: client.id,
          type: "styling_guide",
          fileName,
          fileUrl: objectPath,
          fileSize: buffer.byteLength,
          uploadedById,
        },
      });
      await tx.stylingBlueprintVersion.update({
        where: { id: version.id },
        data: { pdfDocumentId: created.id },
      });
      const stale = [...oldDocs, ...(replacingOwn ? [replacingOwn] : [])];
      if (stale.length) {
        await tx.stylingBlueprintVersion.updateMany({
          where: { id: { in: previous.map((p) => p.id) } },
          data: { pdfDocumentId: null },
        });
        await tx.document.deleteMany({ where: { id: { in: stale.map((d) => d.id) } } });
      }
      return created;
    });
    await deleteObjects(
      [...oldDocs, ...(replacingOwn ? [replacingOwn] : [])].map((d) => d.fileUrl),
    );
    return document.id;
  } catch (error) {
    log.error("blueprint pdf generation failed", { versionId, error });
    return null;
  }
}
