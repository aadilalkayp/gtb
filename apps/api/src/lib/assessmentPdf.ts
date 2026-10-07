import path from "node:path";
import PDFDocument from "pdfkit";
import { prisma } from "@gtb/db";
import {
  CLIENT_TYPE_LABELS,
  STAFF_ROLE_LABELS,
  SKIN_PHOTO_ANGLES,
  preConsultLabel,
  preConsultationFileName,
  type SkinPhotoAngle,
} from "@gtb/shared";
import { logger } from "./logger.js";
import { downloadObject } from "./storage.js";

const log = logger.child({ mod: "assessment-pdf" });

const FONT_DIR = path.join(process.cwd(), "src/assets/fonts");

const INK = "#1f1c19";
const MUTED = "#6f6862";
const LINE = "#e6e2dc";
const SOFT = "#f4f1ec";
/** Brand band colour: teal for Groom To Be, rose for Glow To Be. */
const BRAND = { groom: "#16675e", bride: "#9a3f5c" } as const;

const PAGE_W = 595.28;
const MARGIN = 44;
const CONTENT_W = PAGE_W - MARGIN * 2;

const ANGLE_CAPTIONS: Record<SkinPhotoAngle, string> = {
  front: "FRONT VIEW",
  left: "LEFT VIEW",
  right: "RIGHT VIEW",
};

/** The bundled Inter subset has no rupee glyph; spell it out. */
function t(s: string | null | undefined): string {
  return (s ?? "").replace(/₹\s?/g, "Rs ");
}

function yesNo(flag: boolean | null, details: string | null): string {
  if (flag == null) return "Not answered";
  return flag ? `Yes. ${details ?? ""}`.trim() : "No";
}

function dateTime(d: Date): string {
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export interface AssessmentPdfData {
  clientName: string;
  clientCode: string;
  clientType: "groom" | "bride";
  programme: string | null;
  consultants: { role: string; name: string }[];
  submittedAt: Date;
  generatedAt: Date;
  a: {
    skinType: string | null;
    skinConcerns: string[];
    skinConcernOther: string | null;
    skincareRoutine: string | null;
    skinAllergyFlag: boolean | null;
    allergies: string | null;
    dermTreatmentFlag: boolean | null;
    dermatologicalNotes: string | null;
    activityLevel: string | null;
    fitnessGoal: string | null;
    fitnessGoalOther: string | null;
    heightCm: number | null;
    weightKg: number | null;
    healthConditionFlag: boolean | null;
    healthConditions: string | null;
    dietaryPreference: string | null;
    dietaryPreferenceOther: string | null;
    dietaryRestrictions: string | null;
    consentAccuracy: boolean;
    consentProfessionalReview: boolean;
  };
  photos: Partial<Record<SkinPhotoAngle, Buffer>>;
}

/** Render the internal Pre-Consultation Assessment PDF. Pure layout. */
export async function renderAssessmentPdf(d: AssessmentPdfData): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    bufferPages: true,
    info: { Title: `Pre-Consultation Assessment: ${d.clientName}` },
  });
  doc.registerFont("body", path.join(FONT_DIR, "Inter-Regular.woff"));
  doc.registerFont("bold", path.join(FONT_DIR, "Inter-Bold.woff"));
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve) => doc.on("end", () => resolve()));

  const brand = BRAND[d.clientType];
  const bottom = () => doc.page.height - MARGIN - 20;
  const ensure = (h: number) => {
    if (doc.y + h > bottom()) doc.addPage();
  };
  const heading = (label: string, keep = 40) => {
    ensure(44 + keep);
    doc.moveDown(0.9);
    doc.font("bold").fontSize(12).fillColor(brand).text(label.toUpperCase(), MARGIN, doc.y, {
      characterSpacing: 0.8,
    });
    const y = doc.y + 4;
    doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).lineWidth(0.8).strokeColor(LINE).stroke();
    doc.y = y + 10;
  };
  /** Label/value pairs in two columns; `wide` rows span the full width. */
  const kv = (rows: [string, string, boolean?][]) => {
    const colW = CONTENT_W / 2;
    let col = 0;
    let rowTop = doc.y;
    let rowBottom = doc.y;
    const place = (label: string, value: string, x: number, w: number, y: number) => {
      doc.font("body").fontSize(8).fillColor(MUTED).text(label.toUpperCase(), x, y, {
        width: w,
        characterSpacing: 0.4,
      });
      doc.font("bold").fontSize(10.5).fillColor(INK).text(t(value) || "-", x, doc.y + 2, {
        width: w,
        lineGap: 1.5,
      });
      return doc.y;
    };
    for (const [label, value, wide] of rows) {
      if (wide) {
        if (col === 1) {
          doc.y = rowBottom + 10;
          col = 0;
        }
        ensure(36);
        rowBottom = place(label, value, MARGIN, CONTENT_W, doc.y);
        doc.y = rowBottom + 10;
        continue;
      }
      if (col === 0) {
        ensure(36);
        rowTop = doc.y;
        rowBottom = place(label, value, MARGIN, colW - 14, rowTop);
        col = 1;
      } else {
        rowBottom = Math.max(rowBottom, place(label, value, MARGIN + colW, colW - 14, rowTop));
        doc.y = rowBottom + 10;
        col = 0;
      }
    }
    if (col === 1) doc.y = rowBottom + 10;
  };

  // ---- Header band
  doc.save().rect(0, 0, PAGE_W, 132).fill(brand).restore();
  doc
    .font("body")
    .fontSize(9)
    .fillColor("#ffffff", 0.78)
    .text(CLIENT_TYPE_LABELS[d.clientType].toUpperCase() + "  ·  GTB OS", MARGIN, 36, {
      characterSpacing: 1.2,
    });
  doc.font("bold").fontSize(23).fillColor("#ffffff", 1).text("Pre-Consultation Assessment", MARGIN, 52);
  doc
    .font("body")
    .fontSize(10.5)
    .fillColor("#ffffff", 1)
    .text(`${t(d.clientName)}  ·  ${d.clientCode}`, MARGIN, 86);
  doc
    .fontSize(8.5)
    .fillColor("#ffffff", 0.78)
    .text("Internal consultant document. Contains health information and facial photos.", MARGIN, 104);
  // pdfkit keeps the last fill opacity; reset it for the body.
  doc.fillOpacity(1);
  doc.y = 150;

  // ---- Client details
  heading("Client");
  const consultants = d.consultants.length
    ? d.consultants.map((c) => `${c.name} (${c.role})`).join(", ")
    : "Not assigned yet";
  kv([
    ["Client name", d.clientName],
    ["Client ID", d.clientCode],
    ["Submitted", dateTime(d.submittedAt)],
    ["Programme / package", d.programme ?? "Not chosen yet"],
    ["Assigned consultants", consultants, true],
  ]);

  // ---- Skincare
  const concerns = d.a.skinConcerns
    .map((c) => (c === "other" && d.a.skinConcernOther ? `Other: ${d.a.skinConcernOther}` : preConsultLabel(c)))
    .join(", ");
  heading("Skincare");
  kv([
    ["Skin type", preConsultLabel(d.a.skinType)],
    ["Current skin concerns", concerns || "None selected"],
    ["Current skincare routine", d.a.skincareRoutine ?? "Not provided", true],
    ["Known skin allergies / product reactions", yesNo(d.a.skinAllergyFlag, d.a.allergies), true],
    ["Current dermatological treatment", yesNo(d.a.dermTreatmentFlag, d.a.dermatologicalNotes), true],
  ]);

  // ---- Skin photos: three across, labelled
  heading("Skin assessment photos", 230);
  {
    const gap = 12;
    const w = (CONTENT_W - gap * 2) / 3;
    const h = w * (4 / 3);
    ensure(h + 26);
    const y = doc.y;
    SKIN_PHOTO_ANGLES.forEach((angle, i) => {
      const x = MARGIN + i * (w + gap);
      doc.save().roundedRect(x, y, w, h, 6).fill(SOFT).restore();
      const buf = d.photos[angle];
      if (buf) {
        try {
          doc.save().roundedRect(x, y, w, h, 6).clip();
          doc.image(buf, x, y, { cover: [w, h], align: "center", valign: "center" });
          doc.restore();
        } catch (error) {
          doc.restore();
          log.warn("skin photo could not be drawn", { angle, error });
        }
      } else {
        doc.font("body").fontSize(9).fillColor(MUTED).text("Photo missing", x, y + h / 2 - 6, {
          width: w,
          align: "center",
        });
      }
      doc.font("bold").fontSize(8.5).fillColor(INK).text(ANGLE_CAPTIONS[angle], x, y + h + 6, {
        width: w,
        align: "center",
        characterSpacing: 0.8,
      });
    });
    doc.y = y + h + 24;
  }

  // ---- Fitness
  heading("Fitness");
  const goal =
    d.a.fitnessGoal === "other" && d.a.fitnessGoalOther
      ? `Other: ${d.a.fitnessGoalOther}`
      : preConsultLabel(d.a.fitnessGoal);
  kv([
    ["Current activity level", preConsultLabel(d.a.activityLevel)],
    ["Primary fitness goal", goal],
    ["Height", d.a.heightCm != null ? `${d.a.heightCm} cm` : "-"],
    ["Weight", d.a.weightKg != null ? `${d.a.weightKg} kg` : "-"],
    [
      "Injury, medical condition or physical limitation",
      yesNo(d.a.healthConditionFlag, d.a.healthConditions),
      true,
    ],
  ]);

  // ---- Nutrition
  heading("Nutrition");
  const diet =
    d.a.dietaryPreference === "other" && d.a.dietaryPreferenceOther
      ? `Other: ${d.a.dietaryPreferenceOther}`
      : preConsultLabel(d.a.dietaryPreference);
  kv([
    ["Dietary preference", diet],
    ["Food allergies / dietary restrictions", d.a.dietaryRestrictions ?? "None mentioned"],
  ]);

  // ---- Consent
  heading("Consent");
  for (const [ok, text] of [
    [d.a.consentAccuracy, "The information provided is accurate to the best of the client's knowledge."],
    [
      d.a.consentProfessionalReview,
      "The client understands the information and photos will be reviewed by the relevant GTB professionals.",
    ],
  ] as const) {
    ensure(20);
    const y = doc.y;
    doc.save().roundedRect(MARGIN, y + 1, 10, 10, 2).lineWidth(0.8).strokeColor(ok ? brand : MUTED).stroke().restore();
    if (ok) {
      doc.save().moveTo(MARGIN + 2.2, y + 6).lineTo(MARGIN + 4.6, y + 8.6).lineTo(MARGIN + 8, y + 3.4).lineWidth(1.4).strokeColor(brand).stroke().restore();
    }
    doc.font("body").fontSize(9.5).fillColor(INK).text(`${ok ? "Confirmed" : "Not confirmed"}: ${text}`, MARGIN + 18, y, {
      width: CONTENT_W - 18,
    });
    doc.moveDown(0.4);
  }

  // ---- Footer on every page
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Inside the bottom margin; without this pdfkit adds a blank page per line.
    doc.page.margins.bottom = 0;
    const y = doc.page.height - MARGIN + 8;
    doc.font("body").fontSize(7.5).fillColor(MUTED);
    doc.text(
      `${d.clientCode} · Generated ${dateTime(d.generatedAt)} · Confidential`,
      MARGIN,
      y,
      { width: CONTENT_W * 0.7, lineBreak: false },
    );
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, MARGIN + CONTENT_W * 0.7, y, {
      width: CONTENT_W * 0.3,
      align: "right",
      lineBreak: false,
    });
  }

  doc.end();
  await done;
  return Buffer.concat(chunks);
}

/**
 * Build the PDF for a client's submitted assessment from the database (the
 * structured answers are the source of truth). Returns null when nothing has
 * been submitted.
 */
export async function buildAssessmentPdf(
  clientId: string,
): Promise<{ buffer: Buffer; fileName: string } | null> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      name: true,
      clientCode: true,
      type: true,
      clientPlan: { select: { plan: { select: { name: true } } } },
      assignments: {
        where: { isActive: true, role: { in: ["skincare_consultant", "fitness_trainer"] } },
        orderBy: { role: "asc" },
        select: { role: true, staff: { select: { name: true } } },
      },
      assessment: {
        include: {
          skinPhotos: { select: { angle: true, previewPath: true, document: { select: { fileUrl: true } } } },
        },
      },
    },
  });
  const a = client?.assessment;
  if (!client || !a?.submittedAt) return null;

  const photos: Partial<Record<SkinPhotoAngle, Buffer>> = {};
  await Promise.all(
    a.skinPhotos.map(async (p) => {
      try {
        photos[p.angle] = await downloadObject(p.previewPath ?? p.document.fileUrl);
      } catch (error) {
        log.warn("skin photo missing for pdf", { clientId, angle: p.angle, error });
      }
    }),
  );

  const buffer = await renderAssessmentPdf({
    clientName: client.name,
    clientCode: client.clientCode,
    clientType: client.type,
    programme: client.clientPlan?.plan.name ?? null,
    consultants: client.assignments.map((x) => ({
      role: STAFF_ROLE_LABELS[x.role as "skincare_consultant" | "fitness_trainer"],
      name: x.staff.name,
    })),
    submittedAt: a.submittedAt,
    generatedAt: new Date(),
    a,
    photos,
  });
  return {
    buffer,
    fileName: preConsultationFileName(client.name, client.clientCode, a.submittedAt),
  };
}

