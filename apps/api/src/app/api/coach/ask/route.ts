import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { computeGroomScore, computePrepProgress, daysUntil, type SelfReport } from "@gtb/shared";
import { coachAnswer, type CoachTool, type CoachTurn } from "@/lib/gemini";
import { buildCoachSystem, coachPromptFingerprint, rankArticles } from "@/lib/coachPrompt";
import { searchArticlesByVector, syncArticleEmbeddings } from "@/lib/embeddings";
import { authorizeScanAccess, clientIp, rateLimit } from "@/lib/scan";
import { featureFlags } from "@/lib/flags";
import { getAdminUserIds, notifyUsers } from "@/lib/notify";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { requestLog } from "@/lib/logger";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

const MESSAGES_PER_DAY_PER_SCAN = 40;
const MAX_QUESTION_CHARS = 800;
const MAX_ARTICLES = 6;
/** A vector hit below this cosine similarity is noise — fall back to keywords. */
const MIN_SIMILARITY = 0.35;

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

type KbArticle = { id: string; title: string; category: string; tags: string[]; content: string };

/** Semantic retrieval with keyword fallback. The vector path fails soft at
 *  every step (no migration, no embeddings yet, provider down) so the coach
 *  never breaks because retrieval got fancier. */
async function retrieveArticles(
  question: string,
  articles: KbArticle[],
): Promise<{ articles: KbArticle[]; mode: "vector" | "keyword" }> {
  // Self-healing index: embed a few changed/new articles per request.
  await syncArticleEmbeddings(articles);
  const hits = await searchArticlesByVector(question, MAX_ARTICLES);
  if (hits) {
    const byId = new Map(articles.map((a) => [a.id, a]));
    const found = hits
      .filter((h) => h.similarity >= MIN_SIMILARITY)
      .map((h) => byId.get(h.articleId))
      .filter((a): a is KbArticle => Boolean(a));
    if (found.length) return { articles: found, mode: "vector" };
  }
  return { articles: rankArticles(question, articles, MAX_ARTICLES), mode: "keyword" };
}

/** Live-data tools, closed over data this request is already authorized for. */
function buildTools(args: {
  scan: {
    id: string;
    clientId: string | null;
    readinessScore: number | null;
    fitnessScore: number | null;
    confidenceScore: number | null;
    selfReport: unknown;
  };
  conversationId: string;
}): CoachTool[] {
  const { scan } = args;
  if (!scan.clientId) return [];
  const clientId = scan.clientId;

  return [
    {
      name: "get_prep_checklist",
      description:
        "The person's full preparation roadmap: every item with its due date, whether it is done, and whether it is overdue.",
      execute: async () => {
        const items = await prisma.roadmapItem.findMany({
          where: { clientId },
          orderBy: { dueDate: "asc" },
          select: {
            title: true,
            category: true,
            kind: true,
            dueDate: true,
            weekNumber: true,
            isDone: true,
          },
        });
        const now = Date.now();
        return {
          items: items.map((i) => ({
            title: i.title,
            category: i.category,
            kind: i.kind,
            week: i.weekNumber,
            dueDate: i.dueDate.toISOString().slice(0, 10),
            done: i.isDone,
            overdue: !i.isDone && i.dueDate.getTime() < now,
          })),
        };
      },
    },
    {
      name: "get_score_breakdown",
      description:
        "How the person's current Groom Score is composed: each input's value and weight, which inputs are missing, and what would move the number.",
      execute: async () => {
        if (scan.readinessScore == null) return { error: "scan not scored yet" };
        const roadmap = await prisma.roadmapItem.findMany({
          where: { clientId },
          select: { dueDate: true, isDone: true },
        });
        const prepProgress = computePrepProgress(roadmap);
        const groom = computeGroomScore({
          appearance: scan.readinessScore,
          fitness: scan.fitnessScore,
          confidence: scan.confidenceScore,
          prepProgress,
        });
        const selfReport = (scan.selfReport as SelfReport | null) ?? null;
        return {
          overall: groom.overall,
          components: {
            appearance: { value: scan.readinessScore, weight: "55%, from the photo scan" },
            fitness: {
              value: scan.fitnessScore,
              weight: "15%, self-reported",
              missing: scan.fitnessScore == null,
            },
            confidence: {
              value: scan.confidenceScore,
              weight: "10%, self-reported",
              missing: scan.confidenceScore == null,
            },
            prep: {
              value: prepProgress,
              weight: "20%, share of due roadmap items done",
              missing: prepProgress == null,
            },
          },
          note: "Weights renormalize over the inputs present. Missing inputs are the fastest way to move the number: answer the self-assessment, add a full-body photo, tick due roadmap items.",
          selfReportAnswered: selfReport != null && Object.keys(selfReport).length > 0,
        };
      },
    },
    {
      name: "request_human_followup",
      description:
        "Flag this conversation for a human GTB coach to follow up, e.g. for prices, bookings, rescheduling, or anything the AI coach must not answer. Include a one-line reason.",
      parameters: {
        type: "OBJECT",
        properties: {
          reason: { type: "STRING", description: "one line on what the person needs" },
        },
        required: ["reason"],
      },
      execute: async (a) => {
        const reason = String(a.reason ?? "").slice(0, 200) || "Coach flagged for follow-up";
        await notifyUsers(await getAdminUserIds(), {
          type: "coach_followup",
          title: "Coach chat needs a human follow-up",
          body: reason,
          linkPath: clientId ? `/clients/${clientId}` : undefined,
        });
        return { ok: true, message: "A GTB coach has been notified and will follow up." };
      },
    },
  ];
}

/**
 * The GTB coach (Step 8 of the brief). Answers ONLY from GTB's knowledge
 * articles + the user's own scan context, in GTB's voice, with hard scope
 * rules: grooming/style/wedding-prep only, no medical advice, no prices or
 * bookings (hands off to a human — now via the request_human_followup tool).
 * Retrieval is semantic (pgvector) with keyword fallback; for claimed scans
 * the model can call read-tools over the person's live roadmap and score.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  if (!featureFlags.coach) {
    return json(
      req,
      { error: "The coach isn't available yet. Reply to any GTB email instead." },
      503,
    );
  }
  let body: { scanId?: string; conversationId?: string; message?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  const message = body.message?.trim();
  if (!message) return json(req, { error: "Ask something first" }, 400);
  if (message.length > MAX_QUESTION_CHARS)
    return json(req, { error: "Keep questions under 800 characters" }, 400);

  const access = await authorizeScanAccess(req, body.scanId, { requireClaimed: true });
  if (!access.ok) return json(req, { error: access.error }, access.status);
  const { scan } = access;

  if (
    !rateLimit(
      `coach:${scan.id}:${new Date().toISOString().slice(0, 10)}`,
      MESSAGES_PER_DAY_PER_SCAN,
    )
  ) {
    return json(
      req,
      { error: "That's a lot of questions for one day. The coach is back tomorrow." },
      429,
    );
  }
  if (!rateLimit(`coach-ip:${clientIp(req)}`, 120))
    return json(req, { error: "Too many requests" }, 429);

  // Thread: continue the given one (must belong to this scan/client) or start one.
  let conversation = body.conversationId
    ? await prisma.coachConversation.findFirst({
        where: {
          id: body.conversationId,
          OR: [{ scanId: scan.id }, ...(scan.clientId ? [{ clientId: scan.clientId }] : [])],
        },
      })
    : null;
  if (!conversation) {
    conversation = await prisma.coachConversation.create({
      data: { scanId: scan.id, clientId: scan.clientId },
    });
  }

  const [history, allArticles, roadmap] = await Promise.all([
    prisma.coachMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      take: 20,
    }),
    prisma.coachArticle.findMany({ where: { isActive: true } }),
    scan.clientId
      ? prisma.roadmapItem.findMany({
          where: { clientId: scan.clientId, isDone: false, dueDate: { gte: new Date() } },
          orderBy: { dueDate: "asc" },
          take: 4,
          select: { title: true, dueDate: true, kind: true },
        })
      : Promise.resolve([]),
  ]);

  const retrieval = await retrieveArticles(message, allArticles);
  const tools = buildTools({ scan, conversationId: conversation.id });

  const system = buildCoachSystem(
    {
      type: scan.type as "groom" | "bride",
      daysToWedding: daysUntil(access.scan.client?.weddingDate ?? scan.weddingDate),
      scores: {
        skin: scan.skinScore,
        hair: scan.hairScore,
        beard: scan.beardScore,
        style: scan.styleScore,
      },
      focusAreas: (scan.focusAreas as { area: string; weight: number }[] | null) ?? [],
      roadmap,
      toolsAvailable: tools.length > 0,
    },
    retrieval.articles,
  );

  const turns: CoachTurn[] = history.map((m) => ({ role: m.role, content: m.content }));

  try {
    const answer = await coachAnswer({ system, history: turns, question: message, tools });
    const sources = retrieval.articles.map((a) => a.title);
    const [, assistant] = await prisma.$transaction([
      prisma.coachMessage.create({
        data: { conversationId: conversation.id, role: "user", content: message },
      }),
      prisma.coachMessage.create({
        data: { conversationId: conversation.id, role: "assistant", content: answer.text, sources },
      }),
      prisma.coachConversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      }),
    ]);
    requestLog(req).info("coach answered", {
      conversationId: conversation.id,
      retrieval: retrieval.mode,
      toolCalls: answer.toolCalls,
      prompt: coachPromptFingerprint,
    });
    return json(req, {
      ok: true,
      conversationId: conversation.id,
      message: {
        id: assistant.id,
        role: "assistant",
        content: assistant.content,
        sources,
        createdAt: assistant.createdAt,
      },
      knowledgeArticles: allArticles.length,
    });
  } catch (e) {
    requestLog(req).error("coach answer failed", { conversationId: conversation.id, error: e });
    return json(
      req,
      { error: "The coach is unavailable right now. Please try again in a minute." },
      502,
    );
  }
}

/** Thread history for a scan (latest thread). */
async function handleGet(req: NextRequest): Promise<Response> {
  if (!featureFlags.coach) {
    return json(req, { error: "The coach isn't available yet." }, 503);
  }
  const access = await authorizeScanAccess(req, req.nextUrl.searchParams.get("scanId"), {
    requireScored: false,
  });
  if (!access.ok) return json(req, { error: access.error }, access.status);
  const { scan } = access;
  const conversation = await prisma.coachConversation.findFirst({
    where: scan.clientId ? { clientId: scan.clientId } : { scanId: scan.id },
    orderBy: { updatedAt: "desc" },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 60 } },
  });
  const articleCount = await prisma.coachArticle.count({ where: { isActive: true } });
  return json(req, {
    conversationId: conversation?.id ?? null,
    messages: (conversation?.messages ?? []).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      sources: m.sources,
      createdAt: m.createdAt.toISOString(),
    })),
    knowledgeArticles: articleCount,
  });
}

export const POST = withRequestLog(handlePost);
export const GET = withRequestLog(handleGet);
