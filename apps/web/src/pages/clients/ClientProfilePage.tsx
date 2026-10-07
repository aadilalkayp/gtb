import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  AlertTriangle,
  CalendarHeart,
  MapPin,
  Phone,
  Mail,
  PauseCircle,
  Pencil,
  PlayCircle,
  XCircle,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { useFindUniqueClient, useUpdateClient } from "@gtb/db/hooks";
import {
  CLIENT_TYPE_LABELS,
  STAFF_ROLE_LABELS,
  SERVICE_TYPE_LABELS,
  MANUAL_UPLOAD_DOCUMENT_TYPES,
  CONSULTATION_PLAN_TYPES,
  isVersionedPlanType,
  LEAD_PHASE_LABELS,
  formatINR,
  formatDate,
  daysUntil,
  humanize,
  type AssignmentRole,
  type ClientType,
  type LeadPhase,
  type ServiceType,
} from "@gtb/shared";
import { useAuth } from "@/auth/AuthProvider";
import {
  cancelClient,
  completeClient,
  deleteLead,
  previewLeadDeletion,
  updateWeddingDate,
  type LeadDeletionPreview,
} from "@/lib/api";
import {
  deriveAtRisk,
  averageRating,
  planPace,
  milestonePaces,
  milestoneDisplayStatus,
} from "@/lib/insights";
import { Avatar } from "@/components/ui/Avatar";
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  ProgressRing,
  Select,
  StatusBadge,
  Tabs,
  Textarea,
  type TabDef,
} from "@/components/ui";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
import { RatingStars } from "@/components/RatingStars";
import { FileUploadField } from "@/components/FileUploadField";
import { cn } from "@/lib/utils";
import { InviteClientPanel } from "./InviteClientPanel";
import { ClientScansTab } from "./ClientScansTab";
import { PreConsultationTab } from "./PreConsultationTab";
import { ConsultationPlanUploadModal, DocumentTimeline } from "./DocumentTimeline";
import { MilestoneScheduleModal } from "../payments/MilestoneScheduleModal";
import { EditPaymentModal, type EditablePayment } from "../payments/EditPaymentModal";
import { PaymentMarkers } from "../payments/PaymentMarkers";
import { sendActivityEvent } from "@/lib/heartbeat";

type TabId = "overview" | "sessions" | "payments" | "documents" | "assessment" | "scans" | "styling" | "history";

const TAB_IDS: TabId[] = ["overview", "sessions", "payments", "documents", "assessment", "scans", "styling", "history"];

// Styling Blueprint editor: its own chunk, loaded only when the tab opens.
const BlueprintTab = lazy(() =>
  import("@/pages/styling/blueprint/BlueprintTab").then((m) => ({ default: m.BlueprintTab })),
);

// Team Pulse client history (founders only): its own chunk, never loaded for staff.
const ClientHistory = lazy(() =>
  import("@/pages/team-pulse/ActivityLogView").then((m) => ({ default: m.ActivityLogView })),
);

export function ClientProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { role } = useAuth();
  const isAdmin = role === "founder" || role === "ops_head";
  const canEditTerms = isAdmin || role === "cro";
  // Pre-consultation answers and skin photos: admins, CRO, skincare and fitness.
  const canSeeAssessment =
    isAdmin || role === "cro" || role === "skincare_consultant" || role === "fitness_trainer";
  const planUploadTypes = CONSULTATION_PLAN_TYPES.filter(
    (t) =>
      isAdmin ||
      (t === "skincare_plan" && role === "skincare_consultant") ||
      (t === "fitness_plan" && role === "fitness_trainer"),
  );
  // ?tab=styling deep links (notifications) open a tab directly.
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") as TabId | null;
  const [tab, setTabState] = useState<TabId>(initialTab && TAB_IDS.includes(initialTab) ? initialTab : "overview");
  const setTab = (next: TabId) => {
    setTabState(next);
    setSearchParams(next === "overview" ? {} : { tab: next }, { replace: true });
  };
  const [statusAction, setStatusAction] = useState<"hold" | "cancel" | "complete" | null>(null);
  const [editingTerms, setEditingTerms] = useState(false);
  const [editingPayment, setEditingPayment] = useState<EditablePayment | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showPlanUpload, setShowPlanUpload] = useState(false);
  const [showWeddingEdit, setShowWeddingEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const navigate = useNavigate();

  // Team Pulse: opening a client profile is a key view (server dedupes repeats).
  useEffect(() => {
    if (id) void sendActivityEvent({ verb: "client.viewed", entityId: id });
  }, [id]);

  const {
    data: client,
    isLoading,
    refetch,
  } = useFindUniqueClient(
    {
      where: { id: id ?? "" },
      include: {
        leadSource: true,
        convertedBy: { select: { name: true } },
        clientPlan: {
          include: {
            milestones: { orderBy: { milestoneNumber: "asc" } },
            payments: { orderBy: { createdAt: "desc" } },
          },
        },
        sessions: {
          orderBy: { scheduledDate: "asc" },
          include: { consultant: { select: { name: true } } },
        },
        assignments: {
          where: { isActive: true },
          include: { staff: { select: { id: true, name: true, avatarUrl: true } } },
        },
        // Styling photos and stylist edits live on the Styling tab, skin
        // photos on the Pre-consultation tab.
        documents: {
          where: { type: { notIn: ["styling_photo", "styling_image", "chat_attachment", "skin_photo"] } },
          orderBy: { createdAt: "desc" },
          include: { uploadedBy: { select: { name: true } } },
        },
        assessment: true,
        stylingBlueprint: { select: { id: true } },
      },
    },
    { enabled: Boolean(id) },
  );

  const updateClient = useUpdateClient();

  const risk = useMemo(
    () =>
      client
        ? deriveAtRisk({
            status: client.status,
            sessions: client.sessions,
            plan: client.clientPlan ?? null,
          })
        : { atRisk: false, reasons: [] },
    [client],
  );

  if (isLoading) return <FullPageSpinner />;
  if (!client) {
    return (
      <div className="page">
        <p className="text-sm text-muted-foreground">Client not found or not visible to you.</p>
      </div>
    );
  }

  const plan = client.clientPlan ?? null;
  const pace = plan ? planPace(plan) : null;
  const paces = plan ? milestonePaces(plan) : [];
  const payments = plan?.payments ?? [];
  // Null until staff record the negotiated fee.
  const total = plan?.agreedPrice ?? null;
  const paid = pace?.paidTotal ?? 0;
  const outstanding = pace?.balance ?? 0;
  const avg = averageRating(client.sessions);
  const days = daysUntil(client.weddingDate);

  const tabs: TabDef<TabId>[] = [
    { id: "overview", label: "Overview" },
    { id: "sessions", label: "Sessions", count: client.sessions.length },
    { id: "payments", label: "Payments", count: payments.length },
    { id: "documents", label: "Documents", count: client.documents.length },
    ...(canSeeAssessment ? [{ id: "assessment" as const, label: "Pre-consultation" }] : []),
    { id: "scans", label: "Scans" },
    ...(client.stylingBlueprint ? [{ id: "styling" as const, label: "Styling" }] : []),
    ...(role === "founder" ? [{ id: "history" as const, label: "History" }] : []),
  ];

  async function resume() {
    await updateClient.mutateAsync({
      where: { id: client!.id },
      data: { status: "active", onHoldReason: null },
    });
    await refetch();
  }

  return (
    <div className="page">
      <Link
        to="/clients"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Clients
      </Link>

      {/* Header */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar name={client.name} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-semibold tracking-display">
                {client.name}
              </h1>
              <span className="text-sm text-muted-foreground">{client.clientCode}</span>
              <StatusBadge status={client.status} />
              {client.status === "lead" && (
                <Badge tone="neutral">{LEAD_PHASE_LABELS[client.leadPhase as LeadPhase]}</Badge>
              )}
              <Badge tone={client.type === "groom" ? "info" : "danger"}>
                {CLIENT_TYPE_LABELS[client.type as ClientType]}
              </Badge>
              {risk.atRisk && (
                <Badge tone="danger">
                  <AlertTriangle className="mr-1 h-3 w-3" /> At risk
                </Badge>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CalendarHeart className="h-4 w-4" />
                {formatDate(client.weddingDate)}
                {days >= 0 && <span className="font-medium text-foreground">({days}d)</span>}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowWeddingEdit(true)}
                    className="text-muted-foreground transition-colors duration-150 hover:text-foreground"
                    title="Change big day date"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" /> {client.city}
              </span>
              <span className="flex items-center gap-1.5">
                <Phone className="h-4 w-4" /> {client.phone}
              </span>
              <span className="flex items-center gap-1.5">
                <Mail className="h-4 w-4" /> {client.email}
              </span>
            </div>
            {risk.atRisk && <p className="mt-2 text-xs text-danger">{risk.reasons.join(" · ")}</p>}
          </div>

          {/* Status actions */}
          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              {client.status === "active" && (
                <>
                  <Button size="sm" variant="outline" onClick={() => setStatusAction("hold")}>
                    <PauseCircle className="h-4 w-4" /> Put on hold
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setStatusAction("complete")}>
                    <CheckCircle2 className="h-4 w-4" /> Complete
                  </Button>
                </>
              )}
              {client.status === "on_hold" && (
                <Button size="sm" onClick={resume} loading={updateClient.isPending}>
                  <PlayCircle className="h-4 w-4" /> Resume
                </Button>
              )}
              {(client.status === "active" ||
                client.status === "converted" ||
                client.status === "on_hold") && (
                <Button size="sm" variant="ghost" onClick={() => setStatusAction("cancel")}>
                  <XCircle className="h-4 w-4" /> Cancel
                </Button>
              )}
              {role === "founder" && client.status === "lead" && (
                <Button size="sm" variant="ghost" onClick={() => setShowDelete(true)}>
                  <Trash2 className="h-4 w-4" /> Delete lead
                </Button>
              )}
            </div>
          )}
        </div>
        {client.status === "on_hold" && client.onHoldReason && (
          <p className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
            On hold: {client.onHoldReason}
          </p>
        )}
        {client.status === "cancelled" && client.cancellationReason && (
          <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            Cancelled: {client.cancellationReason}
          </p>
        )}
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} className="mt-5" />

      <div className="mt-5">
        {tab === "overview" && (
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Plan + payment summary */}
            <div className="card p-5 lg:col-span-2">
              <h2 className="text-sm font-semibold">Plan & payments</h2>
              {client.clientPlan ? (
                <div className="mt-4 flex flex-wrap items-center gap-6">
                  <ProgressRing
                    value={total ? Math.min(paid / total, 1) : 0}
                    size={84}
                    strokeWidth={8}
                    className="text-primary"
                  >
                    <span className="font-num text-sm font-bold">
                      {total ? `${Math.min(Math.round((paid / total) * 100), 100)}%` : "–"}
                    </span>
                  </ProgressRing>
                  <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Plan</p>
                      <p className="mt-0.5 font-medium">{client.clientPlan.planNameSnapshot}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Agreed price</p>
                      {total != null ? (
                        <p className="font-num mt-0.5 font-medium">{formatINR(total)}</p>
                      ) : (
                        <p className="mt-0.5 font-medium text-warning">Not set yet</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Paid</p>
                      <p className="font-num mt-0.5 font-medium text-success">{formatINR(paid)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Outstanding</p>
                      <p className="font-num mt-0.5 font-medium">
                        {total != null ? formatINR(outstanding) : "–"}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No plan selected yet.</p>
              )}

              <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-4 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Lead source</p>
                  <p className="mt-0.5 font-medium">{client.leadSource?.name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Converted by</p>
                  <p className="mt-0.5 font-medium">{client.convertedBy?.name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Conversion date</p>
                  <p className="mt-0.5 font-medium">{formatDate(client.conversionDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Satisfaction</p>
                  <p className="mt-0.5 font-medium">
                    {avg != null ? (
                      <span className="flex items-center gap-1.5">
                        {avg.toFixed(1)} <RatingStars value={avg} />
                      </span>
                    ) : (
                      "Not rated yet"
                    )}
                  </p>
                </div>
              </div>

              {client.notes && (
                <div className="mt-4 border-t border-border pt-4">
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{client.notes}</p>
                </div>
              )}

              {client.status === "lead" && (
                <div className="mt-4 border-t border-border pt-4">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Registration invite
                  </p>
                  <InviteClientPanel clientId={client.id} onInvited={() => void refetch()} />
                </div>
              )}
            </div>

            {/* Team */}
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Team</h2>
                {isAdmin && (
                  <Link
                    to="/assignments"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Manage
                  </Link>
                )}
              </div>
              {client.assignments.length ? (
                <div className="mt-3 space-y-3">
                  {client.assignments.map((a) => (
                    <div key={a.id} className="flex items-center gap-3">
                      <Avatar name={a.staff.name} src={a.staff.avatarUrl} size="sm" />
                      <div className="leading-tight">
                        <p className="text-sm font-medium">{a.staff.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {STAFF_ROLE_LABELS[a.role as AssignmentRole]}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No team assigned yet.</p>
              )}
            </div>
          </div>
        )}

        {tab === "sessions" &&
          (client.sessions.length ? (
            <div className="card divide-y divide-border">
              {client.sessions.map((s) => (
                <div key={s.id} className="flex items-center gap-3 px-5 py-3.5">
                  <Badge tone="info">{SERVICE_TYPE_LABELS[s.serviceType as ServiceType]}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      Session {s.sessionNumber}
                      {s.consultant && (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          · {s.consultant.name}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(s.actualDate ?? s.scheduledDate)}
                      {s.notes && ` · ${s.notes}`}
                    </p>
                  </div>
                  {s.rating != null && <RatingStars value={s.rating} />}
                  <StatusBadge status={s.status} />
                </div>
              ))}
            </div>
          ) : (
            <p className="card p-10 text-center text-sm text-muted-foreground">
              No sessions yet. They're generated when the client is activated.
            </p>
          ))}

        {tab === "payments" &&
          (plan ? (
            <div className="space-y-4">
              {/* Expected schedule — pace checkpoints, not invoices. */}
              <div className="card divide-y divide-border">
                <div className="flex items-center justify-between px-5 py-3.5">
                  <h3 className="text-sm font-semibold">Expected schedule</h3>
                  <div className="flex items-center gap-3">
                    {pace && (
                      <span className="text-xs text-muted-foreground">
                        {pace.balance == null ? (
                          <span className="font-medium text-warning">Agreed price not set</span>
                        ) : (
                          <>{formatINR(pace.balance)} outstanding</>
                        )}
                        {pace.behindAmount > 0 && (
                          <span className="font-medium text-danger">
                            {" "}
                            · {formatINR(pace.behindAmount)} behind
                          </span>
                        )}
                      </span>
                    )}
                    {canEditTerms &&
                      client.status !== "cancelled" &&
                      client.status !== "completed" && (
                      <Button size="sm" variant="outline" onClick={() => setEditingTerms(true)}>
                        <Pencil className="h-4 w-4" />{" "}
                        {plan.agreedPrice == null ? "Set price" : "Edit"}
                      </Button>
                    )}
                  </div>
                </div>
                {paces.length ? (
                  paces.map((p, i) => (
                    <div key={i} className="flex items-center justify-between px-5 py-3.5">
                      <div>
                        <p className="text-sm font-medium">Milestone {i + 1} of {paces.length}</p>
                        <p className="text-xs text-muted-foreground">
                          Expected by {formatDate(p.milestone.dueDate)}
                          {p.status !== "paid" && p.remaining < p.milestone.amount && (
                            <> · {formatINR(p.remaining)} remaining</>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-num text-sm font-semibold">
                          {formatINR(p.milestone.amount)}
                        </span>
                        <StatusBadge status={milestoneDisplayStatus(p)} />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="px-5 py-3.5 text-sm text-muted-foreground">
                    {plan.agreedPrice == null
                      ? "The client's fee hasn't been recorded yet. Payments they submit are still logged below."
                      : "No schedule set. The client can pay in any amounts."}
                  </p>
                )}
              </div>

              {/* The ledger — what actually arrived. */}
              <div className="card divide-y divide-border">
                <div className="px-5 py-3.5">
                  <h3 className="text-sm font-semibold">Payments</h3>
                </div>
                {payments.length ? (
                  payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-5 py-3.5">
                      <div>
                        <p className="flex items-center gap-2 text-sm font-medium">
                          <span>
                            {p.kind === "waiver" ? "Waiver" : "Payment"}
                            {p.paymentMethod && (
                              <span className="font-normal text-muted-foreground">
                                {" "}
                                · {humanize(p.paymentMethod)}
                              </span>
                            )}
                          </span>
                          <PaymentMarkers editedAt={p.editedAt} legacyImported={p.legacyImported} />
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(p.approvedAt ?? p.createdAt)}
                          {p.status === "rejected" && p.rejectionReason && (
                            <span className="text-danger"> · {p.rejectionReason}</span>
                          )}
                          {p.status === "voided" && p.voidReason && <> · Voided: {p.voidReason}</>}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "font-num text-sm font-semibold",
                            p.status === "voided" && "text-muted-foreground line-through",
                          )}
                        >
                          {formatINR(p.amount)}
                        </span>
                        <StatusBadge status={p.status} />
                        {(isAdmin || (role === "cro" && p.kind === "payment")) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingPayment(p)}
                            title="Edit payment"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="px-5 py-3.5 text-sm text-muted-foreground">No payments yet.</p>
                )}
                <div className="px-5 py-3.5 text-right">
                  <Link to="/payments" className="text-xs font-medium text-primary hover:underline">
                    Review, record & edit payments on the Payments page →
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <p className="card p-10 text-center text-sm text-muted-foreground">
              No plan yet. The payment schedule appears when the client selects a plan.
            </p>
          ))}

        {tab === "documents" && (
          <DocumentTimeline
            clientId={client.id}
            documents={client.documents}
            assessmentSubmittedAt={client.assessment?.submittedAt ?? null}
            canUploadPlan={planUploadTypes.length > 0}
            onUploadPlan={() => setShowPlanUpload(true)}
            onUploadOther={() => setShowUpload(true)}
          />
        )}

        {tab === "assessment" && canSeeAssessment && (
          <PreConsultationTab
            clientId={client.id}
            isAdmin={isAdmin}
            legacy={client.assessment ? <AssessmentDetail assessment={client.assessment} /> : null}
          />
        )}

        {tab === "scans" && <ClientScansTab clientId={client.id} />}
        {tab === "styling" && client.stylingBlueprint && (
          <Suspense fallback={<div className="flex justify-center py-16"><Spinner className="h-6 w-6 text-muted-foreground" /></div>}>
            <BlueprintTab clientId={client.id} />
          </Suspense>
        )}
        {tab === "history" && role === "founder" && (
          <Suspense fallback={<Spinner className="mx-auto my-12 h-5 w-5 text-muted-foreground" />}>
            <ClientHistory clientId={client.id} showActor includeFounders />
          </Suspense>
        )}
      </div>

      {editingPayment && (
        <EditPaymentModal
          payment={editingPayment}
          clientName={client.name}
          clientStatus={client.status}
          canManageWaivers={isAdmin}
          onClose={() => setEditingPayment(null)}
          onDone={() => {
            setEditingPayment(null);
            void refetch();
          }}
        />
      )}
      {editingTerms && plan && pace && (
        <MilestoneScheduleModal
          clientId={client.id}
          clientName={client.name}
          agreedPrice={plan.agreedPrice}
          paidTotal={pace.paidTotal}
          milestones={plan.milestones}
          onClose={() => setEditingTerms(false)}
          onDone={() => {
            setEditingTerms(false);
            void refetch();
          }}
        />
      )}

      {/* Status modals */}
      {statusAction && (
        <StatusChangeModal
          action={statusAction}
          clientName={client.name}
          pendingSessions={
            client.sessions.filter((s) => s.status === "scheduled" || s.status === "delayed").length
          }
          outstanding={outstanding}
          onClose={() => setStatusAction(null)}
          onConfirm={async (reason) => {
            if (statusAction === "cancel") {
              // SYS-3: the server cascade (future sessions cancelled, balance
              // waived, portal login blocked) — one transaction.
              await cancelClient(client.id, reason);
            } else if (statusAction === "complete") {
              // SYS-3: server-enforced preconditions (all sessions closed, no
              // mandatory outstanding payments).
              await completeClient(client.id);
            } else {
              await updateClient.mutateAsync({
                where: { id: client.id },
                data: { status: "on_hold", onHoldReason: reason },
              });
            }
            setStatusAction(null);
            await refetch();
          }}
        />
      )}

      {showPlanUpload && (
        <ConsultationPlanUploadModal
          clientId={client.id}
          allowedTypes={planUploadTypes}
          onClose={() => setShowPlanUpload(false)}
          onDone={() => {
            setShowPlanUpload(false);
            void refetch();
          }}
        />
      )}

      {showUpload && (
        <UploadDocumentModal
          clientId={client.id}
          onClose={() => setShowUpload(false)}
          onDone={() => {
            setShowUpload(false);
            void refetch();
          }}
        />
      )}

      {showDelete && (
        <DeleteLeadModal
          clientId={client.id}
          clientName={client.name}
          onClose={() => setShowDelete(false)}
          onDeleted={() => navigate("/clients", { replace: true })}
        />
      )}

      {showWeddingEdit && (
        <WeddingDateModal
          clientName={client.name}
          currentDate={client.weddingDate}
          onClose={() => setShowWeddingEdit(false)}
          onDone={() => {
            setShowWeddingEdit(false);
            void refetch();
          }}
          clientId={client.id}
        />
      )}
    </div>
  );
}

function AssessmentDetail({
  assessment,
}: {
  assessment: Record<string, unknown> & { completedAt: Date | string | null };
}) {
  const sections: { title: string; fields: [string, unknown][] }[] = [
    {
      title: "General",
      fields: [
        ["Age", assessment.age],
        ["Gender", assessment.gender],
      ],
    },
    {
      title: "Skincare",
      fields: [
        ["Skin type", assessment.skinType],
        ["Concerns", assessment.skinConcerns],
        ["Routine", assessment.skincareRoutine],
        ["Allergies", assessment.allergies],
        ["Dermatological notes", assessment.dermatologicalNotes],
      ],
    },
    {
      title: "Fitness",
      fields: [
        ["Level", assessment.fitnessLevel],
        ["Height (cm)", assessment.heightCm],
        ["Weight (kg)", assessment.weightKg],
        ["Goals", assessment.fitnessGoals],
        ["Diet", assessment.dietaryPreference],
        ["Health conditions", assessment.healthConditions],
      ],
    },
    {
      title: "Styling",
      fields: [
        ["Body type", assessment.bodyType],
        ["Style preferences", assessment.stylePreferences],
        ["Outfit budget", assessment.outfitBudgetRange],
        ["Colour preferences", assessment.colorPreferences],
        ["Requirements", assessment.stylingNotes],
      ],
    },
  ];

  function render(v: unknown): string {
    if (v == null || v === "") return "—";
    if (Array.isArray(v)) return v.length ? v.map((x) => humanize(String(x))).join(", ") : "—";
    if (typeof v === "string") return /^[a-z0-9_]+$/.test(v) ? humanize(v) : v;
    return String(v);
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {sections.map((s) => (
        <div key={s.title} className="card p-5">
          <h3 className="text-sm font-semibold">{s.title}</h3>
          <dl className="mt-3 space-y-2.5 text-sm">
            {s.fields.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="shrink-0 text-muted-foreground">{label}</dt>
                <dd className="text-right font-medium">{render(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

function StatusChangeModal({
  action,
  clientName,
  pendingSessions,
  outstanding,
  onClose,
  onConfirm,
}: {
  action: "hold" | "cancel" | "complete";
  clientName: string;
  pendingSessions: number;
  outstanding: number;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const needsReason = action !== "complete";
  const titles = {
    hold: `Put ${clientName} on hold`,
    cancel: `Cancel ${clientName}'s program`,
    complete: `Mark ${clientName} as completed`,
  };

  async function confirm() {
    if (needsReason && !reason.trim()) {
      setError("Please give a reason.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await onConfirm(reason.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update status");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={titles[action]}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Back
          </Button>
          <Button
            variant={action === "cancel" ? "danger" : "primary"}
            onClick={confirm}
            loading={busy}
          >
            Confirm
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {action === "hold" && (
          <p className="text-sm text-muted-foreground">
            Pauses reminders and follow-ups. Sessions are kept and can be rescheduled on resume.
          </p>
        )}
        {action === "cancel" && (
          <p className="text-sm text-muted-foreground">
            This is permanent. A cancelled client can't be reactivated. If they return, create a
            new client entry.
          </p>
        )}
        {action === "complete" && (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Marks the program as delivered.</p>
            {(pendingSessions > 0 || outstanding > 0) && (
              <p className="rounded-lg bg-warning/10 px-3 py-2 text-warning">
                Heads up:{" "}
                {pendingSessions > 0 && `${pendingSessions} sessions are still scheduled. `}
                {outstanding > 0 && `${formatINR(outstanding)} is still outstanding.`}
              </p>
            )}
          </div>
        )}
        {needsReason && (
          <Field label="Reason" required>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

/** Founder only: permanently delete a fresh lead. The server decides
 *  eligibility (no plan, no delivered work, never signed in); a lead that
 *  doesn't qualify shows why instead of the reason field. */
function DeleteLeadModal({
  clientId,
  clientName,
  onClose,
  onDeleted,
}: {
  clientId: string;
  clientName: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [preview, setPreview] = useState<LeadDeletionPreview>();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    previewLeadDeletion(clientId)
      .then(setPreview)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not check this lead"));
  }, [clientId]);

  async function confirm() {
    if (!reason.trim()) {
      setError("Please give a reason.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await deleteLead(clientId, reason.trim());
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete this lead");
      setBusy(false);
    }
  }

  const c = preview?.counts;
  const removed = c
    ? [
        [c.assignments, "staff assignment", "staff assignments"],
        [c.followUps, "follow-up", "follow-ups"],
        [c.assessment, "assessment", "assessments"],
        [c.scans, "readiness scan", "readiness scans"],
        [c.outfitChecks, "outfit check", "outfit checks"],
        [c.lookPreviews, "look preview", "look previews"],
        [c.coachThreads, "coach chat", "coach chats"],
        [c.portalAccount, "unused portal invite", "unused portal invites"],
      ]
        .filter(([n]) => (n as number) > 0)
        .map(([n, one, many]) => `${n} ${n === 1 ? one : many}`)
    : [];

  return (
    <Modal
      open
      onClose={onClose}
      title={`Delete ${clientName}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Back
          </Button>
          {preview?.deletable && (
            <Button variant="danger" onClick={confirm} loading={busy}>
              Delete permanently
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {!preview && !error && <Spinner />}
        {preview && !preview.deletable && (
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">This lead can't be deleted:</p>
            <ul className="list-disc space-y-1 pl-5">
              {preview.blockerLabels.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        )}
        {preview?.deletable && (
          <>
            <p className="text-sm text-muted-foreground">
              This removes the lead for good. It can't be undone. The deletion is recorded in the
              activity log.
            </p>
            {removed.length > 0 && (
              <p className="text-sm text-muted-foreground">Also removed: {removed.join(", ")}.</p>
            )}
            {c && c.tasksUnlinked > 0 && (
              <p className="text-sm text-muted-foreground">
                {c.tasksUnlinked === 1 ? "1 task stays" : `${c.tasksUnlinked} tasks stay`}, no
                longer linked to this lead.
              </p>
            )}
            <Field label="Reason" required>
              <Textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Duplicate, test entry, spam…"
              />
            </Field>
          </>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

/** FEAT-5 (SRS §24.1): change the wedding date through the server route, which
 *  regenerates future sessions from the enrollment snapshot and audit-logs the
 *  change — the gateway write this replaces silently left the old schedule. */
function WeddingDateModal({
  clientId,
  clientName,
  currentDate,
  onClose,
  onDone,
}: {
  clientId: string;
  clientName: string;
  currentDate: string | Date;
  onClose: () => void;
  onDone: () => void;
}) {
  const [date, setDate] = useState(() => {
    const d = new Date(currentDate);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<number>();

  async function save() {
    if (!date) {
      setError("Pick a date.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const res = await updateWeddingDate(clientId, date);
      setResult(res.sessionsRescheduled);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the date");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={result != null ? onDone : onClose}
      title={`Change ${clientName}'s big day`}
      size="sm"
      footer={
        result != null ? (
          <Button onClick={onDone}>Done</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              Back
            </Button>
            <Button onClick={save} loading={busy}>
              Update date
            </Button>
          </>
        )
      }
    >
      {result != null ? (
        <p className="text-sm text-muted-foreground">
          Big day updated. {result} future session{result === 1 ? "" : "s"} rescheduled.
        </p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Future sessions are rescheduled around the new date; completed and cancelled sessions
            are untouched. The team is notified.
          </p>
          <Field label="Big day date" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      )}
    </Modal>
  );
}

function UploadDocumentModal({
  clientId,
  onClose,
  onDone,
}: {
  clientId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  // Consultation plans have their own "Upload Consultation Plan PDF" flow.
  const types = MANUAL_UPLOAD_DOCUMENT_TYPES.filter((t) => !isVersionedPlanType(t));
  const [type, setType] = useState<string>(types[0] ?? "consultation_notes");
  const [uploaded, setUploaded] = useState(false);

  return (
    <Modal
      open
      onClose={onClose}
      title="Upload document"
      size="sm"
      footer={<Button onClick={uploaded ? onDone : onClose}>{uploaded ? "Done" : "Close"}</Button>}
    >
      <div className="space-y-4">
        <Field label="Document type" required>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {/* Diet plans are uploaded from their fitness plan, which they link to. */}
            {types.map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </Select>
        </Field>
        <FileUploadField
          key={type}
          clientId={clientId}
          type={type}
          label="Choose file"
          onUploaded={(doc) => setUploaded(Boolean(doc))}
        />
      </div>
    </Modal>
  );
}
