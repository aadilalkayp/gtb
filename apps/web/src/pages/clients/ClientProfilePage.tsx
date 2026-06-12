import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  AlertTriangle,
  CalendarHeart,
  MapPin,
  Phone,
  Mail,
  PauseCircle,
  PlayCircle,
  XCircle,
  CheckCircle2,
  Upload,
} from "lucide-react";
import { useFindUniqueClient, useUpdateClient } from "@gtb/db/hooks";
import {
  CLIENT_TYPE_LABELS,
  STAFF_ROLE_LABELS,
  SERVICE_TYPE_LABELS,
  DOCUMENT_TYPES,
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
import { deriveAtRisk, installmentDisplayStatus, averageRating } from "@/lib/insights";
import { Avatar } from "@/components/ui/Avatar";
import {
  Badge,
  Button,
  Field,
  Modal,
  ProgressRing,
  Select,
  StatusBadge,
  Tabs,
  Textarea,
  type TabDef,
} from "@/components/ui";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { RatingStars } from "@/components/RatingStars";
import { DocumentRow } from "@/components/DocumentRow";
import { FileUploadField } from "@/components/FileUploadField";
import { InviteClientPanel } from "./InviteClientPanel";

type TabId = "overview" | "sessions" | "payments" | "documents" | "assessment";

export function ClientProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { role } = useAuth();
  const isAdmin = role === "founder" || role === "ops_head";
  const [tab, setTab] = useState<TabId>("overview");
  const [statusAction, setStatusAction] = useState<"hold" | "cancel" | "complete" | null>(null);
  const [showUpload, setShowUpload] = useState(false);

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
        clientPlan: { include: { installments: { orderBy: { installmentNumber: "asc" } } } },
        sessions: {
          orderBy: { scheduledDate: "asc" },
          include: { consultant: { select: { name: true } } },
        },
        assignments: {
          where: { isActive: true },
          include: { staff: { select: { id: true, name: true, avatarUrl: true } } },
        },
        documents: { orderBy: { createdAt: "desc" } },
        assessment: true,
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
            installments: client.clientPlan?.installments ?? [],
          })
        : { atRisk: false, reasons: [] },
    [client],
  );

  if (isLoading) return <FullPageSpinner />;
  if (!client) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Client not found or not visible to you.</p>
      </div>
    );
  }

  const installments = client.clientPlan?.installments ?? [];
  const total = client.clientPlan?.priceAtEnrollment ?? 0;
  const paid = installments
    .filter((i) => i.status === "approved")
    .reduce((s, i) => s + i.amount, 0);
  const avg = averageRating(client.sessions);
  const days = daysUntil(client.weddingDate);

  const tabs: TabDef<TabId>[] = [
    { id: "overview", label: "Overview" },
    { id: "sessions", label: "Sessions", count: client.sessions.length },
    { id: "payments", label: "Payments", count: installments.length },
    { id: "documents", label: "Documents", count: client.documents.length },
    { id: "assessment", label: "Assessment" },
  ];

  async function resume() {
    await updateClient.mutateAsync({
      where: { id: client!.id },
      data: { status: "active", onHoldReason: null },
    });
    await refetch();
  }

  return (
    <div className="p-6">
      <Link
        to="/clients"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Clients
      </Link>

      {/* Header */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar name={client.name} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{client.name}</h1>
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
            </div>
          )}
        </div>
        {client.status === "on_hold" && client.onHoldReason && (
          <p className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-sm text-[hsl(35_92%_38%)]">
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
                    value={total ? paid / total : 0}
                    size={84}
                    strokeWidth={8}
                    className="text-primary"
                  >
                    <span className="text-sm font-bold">
                      {total ? Math.round((paid / total) * 100) : 0}%
                    </span>
                  </ProgressRing>
                  <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Plan</p>
                      <p className="mt-0.5 font-medium">{client.clientPlan.planNameSnapshot}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Value</p>
                      <p className="mt-0.5 font-medium">{formatINR(total)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Paid</p>
                      <p className="mt-0.5 font-medium text-success">{formatINR(paid)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Outstanding</p>
                      <p className="mt-0.5 font-medium">{formatINR(Math.max(total - paid, 0))}</p>
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
                <div key={s.id} className="flex items-center gap-3 px-4 py-3">
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
                      {s.notes && ` — ${s.notes}`}
                    </p>
                  </div>
                  {s.rating != null && <RatingStars value={s.rating} />}
                  <StatusBadge status={s.status} />
                </div>
              ))}
            </div>
          ) : (
            <p className="card p-10 text-center text-sm text-muted-foreground">
              No sessions yet — they're generated when the client is activated.
            </p>
          ))}

        {tab === "payments" &&
          (installments.length ? (
            <div className="card divide-y divide-border">
              {installments.map((i) => (
                <div key={i.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">
                      Installment {i.installmentNumber} of {installments.length}
                    </p>
                    <p className="text-xs text-muted-foreground">Due {formatDate(i.dueDate)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">{formatINR(i.amount)}</span>
                    <StatusBadge status={installmentDisplayStatus(i)} />
                  </div>
                </div>
              ))}
              <div className="px-4 py-3 text-right">
                <Link to="/payments" className="text-xs font-medium text-primary hover:underline">
                  Review & approve on the Payments page →
                </Link>
              </div>
            </div>
          ) : (
            <p className="card p-10 text-center text-sm text-muted-foreground">
              No installments yet — generated when the client selects a plan.
            </p>
          ))}

        {tab === "documents" && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setShowUpload(true)}>
                <Upload className="h-4 w-4" /> Upload document
              </Button>
            </div>
            {client.documents.length ? (
              <div className="card divide-y divide-border">
                {client.documents.map((d) => (
                  <DocumentRow key={d.id} doc={d} />
                ))}
              </div>
            ) : (
              <p className="card p-10 text-center text-sm text-muted-foreground">
                No documents uploaded yet.
              </p>
            )}
          </div>
        )}

        {tab === "assessment" &&
          (client.assessment?.completedAt ? (
            <AssessmentDetail assessment={client.assessment} />
          ) : (
            <p className="card p-10 text-center text-sm text-muted-foreground">
              The client hasn't completed their onboarding assessment yet.
            </p>
          ))}
      </div>

      {/* Status modals */}
      {statusAction && (
        <StatusChangeModal
          action={statusAction}
          clientName={client.name}
          pendingSessions={
            client.sessions.filter((s) => s.status === "scheduled" || s.status === "delayed").length
          }
          outstanding={Math.max(total - paid, 0)}
          onClose={() => setStatusAction(null)}
          onConfirm={async (reason) => {
            const data =
              statusAction === "hold"
                ? { status: "on_hold" as const, onHoldReason: reason }
                : statusAction === "cancel"
                  ? { status: "cancelled" as const, cancellationReason: reason }
                  : { status: "completed" as const };
            await updateClient.mutateAsync({ where: { id: client.id }, data });
            setStatusAction(null);
            await refetch();
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
            This is permanent — a cancelled client can't be reactivated. If they return, create a
            new client entry.
          </p>
        )}
        {action === "complete" && (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Marks the program as delivered.</p>
            {(pendingSessions > 0 || outstanding > 0) && (
              <p className="rounded-lg bg-warning/10 px-3 py-2 text-[hsl(35_92%_38%)]">
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

function UploadDocumentModal({
  clientId,
  onClose,
  onDone,
}: {
  clientId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [type, setType] = useState<string>("skincare_plan");
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
            {DOCUMENT_TYPES.map((t) => (
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
