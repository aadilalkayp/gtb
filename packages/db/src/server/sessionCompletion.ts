import { prisma } from "../index.js";
import { SERVICE_TYPE_LABELS, type ServiceType } from "@gtb/shared";
import { logActivity } from "./activityLog.js";

/** Thrown when a concurrent completion won the race for this session. */
export class SessionConflictError extends Error {
  constructor() {
    super("This session was already completed or cancelled");
  }
}

export interface CompleteSessionInput {
  sessionId: string;
  notes?: string;
  actualDate?: Date;
}

export interface CompleteSessionResult {
  expenseCreated: boolean;
  clientUserId: string | null;
  serviceType: string;
  sessionNumber: number;
  clientName: string;
}

const CONSULTANT_FEE_CATEGORY = "Consultant Fee";

/**
 * Mark a session completed (SRS §9.3 + §15.4) — STATE-3 core.
 *
 * The status flip and the consultant-fee expense are ONE transaction. The
 * conditional updateMany (`status: { notIn: [completed, cancelled] }`) is the
 * guard: a concurrent double-complete matches 0 rows on the second call and
 * throws SessionConflictError — so a session can never pay out two consultant
 * fees. The partial unique index on Expense.sessionId (non-null) is the DB
 * backstop even if a race slips past the guard.
 */
export async function completeSession(
  input: CompleteSessionInput,
): Promise<CompleteSessionResult> {
  let result: CompleteSessionResult = {
    expenseCreated: false,
    clientUserId: null,
    serviceType: "",
    sessionNumber: 0,
    clientName: "",
  };

  await prisma.$transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: input.sessionId },
      select: {
        id: true,
        status: true,
        serviceType: true,
        sessionNumber: true,
        consultantId: true,
        client: { select: { id: true, name: true, userId: true } },
      },
    });
    if (!session) throw new Error("NOT_FOUND");
    if (session.status === "completed") throw new SessionConflictError();
    if (session.status === "cancelled") throw new SessionConflictError();

    const updated = await tx.session.updateMany({
      where: { id: session.id, status: { notIn: ["completed", "cancelled"] } },
      data: {
        status: "completed",
        actualDate: input.actualDate ?? new Date(),
        ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
      },
    });
    if (updated.count !== 1) throw new SessionConflictError();

    await logActivity(tx, {
      entityType: "session",
      entityId: session.id,
      action: "status_changed",
      performedById: session.consultantId ?? null,
      summary: "Session completed",
      changes: { status: "completed", actualDate: input.actualDate ?? new Date() },
    });

    result = {
      expenseCreated: false,
      clientUserId: session.client.userId,
      serviceType: session.serviceType as string,
      sessionNumber: session.sessionNumber,
      clientName: session.client.name,
    };

    // Auto-create the consultant payout expense (best-effort — skipped without a rate).
    if (session.consultantId) {
      const rate = await tx.consultantRate.findUnique({
        where: {
          userId_serviceType: {
            userId: session.consultantId,
            serviceType: session.serviceType,
          },
        },
      });
      const category = rate
        ? await tx.expenseCategory.findUnique({ where: { name: CONSULTANT_FEE_CATEGORY } })
        : null;
      if (rate && category) {
        const label = SERVICE_TYPE_LABELS[session.serviceType as ServiceType];
        await tx.expense.create({
          data: {
            categoryId: category.id,
            title: `${label} session ${session.sessionNumber} — ${session.client.name}`,
            amount: rate.amount,
            date: input.actualDate ?? new Date(),
            submittedById: session.consultantId,
            payeeId: session.consultantId,
            clientId: session.client.id,
            sessionId: session.id,
          },
        });
        result.expenseCreated = true;
      }
    }
  });

  return result;
}
