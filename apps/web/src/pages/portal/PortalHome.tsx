import { Link } from "react-router-dom";
import { CalendarCheck, Wallet, FileText, Sparkles, ArrowRight, Heart } from "lucide-react";
import { useFindUniqueClient } from "@gtb/db/hooks";
import {
  ASSIGNMENT_ROLES,
  STAFF_ROLE_LABELS,
  SERVICE_TYPE_LABELS,
  formatINR,
  formatDate,
  daysUntil,
  type AssignmentRole,
  type ServiceType,
} from "@gtb/shared";
import { useAuth } from "@/auth/AuthProvider";
import { installmentDisplayStatus, isInstallmentOverdue } from "@/lib/insights";
import { Avatar } from "@/components/ui/Avatar";
import { ProgressRing, StatusBadge } from "@/components/ui";
import { FullPageSpinner } from "@/components/ui/Spinner";

export function PortalHome() {
  const { user } = useAuth();
  const clientId = user?.client?.id;

  const { data: client, isLoading } = useFindUniqueClient(
    {
      where: { id: clientId ?? "" },
      include: {
        clientPlan: { include: { installments: true } },
        sessions: { orderBy: { scheduledDate: "asc" } },
        assignments: {
          where: { isActive: true },
          include: { staff: { select: { id: true, name: true, avatarUrl: true } } },
        },
      },
    },
    { enabled: Boolean(clientId) },
  );

  if (isLoading || !client) return <FullPageSpinner />;

  const firstName = client.name.split(" ")[0];
  const days = daysUntil(client.weddingDate);

  const sessions = client.sessions;
  const completed = sessions.filter((s) => s.status === "completed").length;
  const progress = sessions.length ? completed / sessions.length : 0;

  const nextSession = sessions.find(
    (s) => (s.status === "scheduled" || s.status === "delayed") && daysUntil(s.scheduledDate) >= 0,
  );

  const installments = client.clientPlan?.installments ?? [];
  const paid = installments
    .filter((i) => i.status === "approved")
    .reduce((sum, i) => sum + i.amount, 0);
  const total = client.clientPlan?.priceAtEnrollment ?? 0;
  const nextDue = [...installments]
    .filter((i) => i.status !== "approved" && i.status !== "waived")
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];

  // Per-service progress rings
  const services = [...new Set(sessions.map((s) => s.serviceType))] as ServiceType[];

  const team = ASSIGNMENT_ROLES.map((role) => ({
    role,
    assignment: client.assignments.find((a) => a.role === role),
  })).filter((t) => t.assignment);

  return (
    <div className="space-y-5">
      {/* Wedding countdown hero */}
      <section className="relative overflow-hidden rounded-card bg-gradient-to-br from-primary via-primary to-primary/80 p-6 text-primary-foreground shadow-card sm:p-8">
        <Heart className="absolute -right-6 -top-6 h-36 w-36 rotate-12 opacity-10" />
        <Sparkles className="absolute bottom-4 right-24 h-6 w-6 opacity-30" />
        <p className="text-sm font-medium opacity-80">Hi {firstName}, your big day is coming</p>
        <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-4">
          <div>
            <p className="text-5xl font-bold tracking-tight sm:text-6xl">
              {days >= 0 ? days : 0}
              <span className="ml-2 text-lg font-medium opacity-80">days to go</span>
            </p>
            <p className="mt-1 text-sm opacity-80">Wedding on {formatDate(client.weddingDate)}</p>
          </div>
          <div className="flex items-center gap-3">
            <ProgressRing
              value={progress}
              size={72}
              strokeWidth={7}
              className="text-primary-foreground"
            >
              <span className="text-sm font-bold">{Math.round(progress * 100)}%</span>
            </ProgressRing>
            <div className="text-sm leading-snug opacity-90">
              <p className="font-semibold">{client.clientPlan?.planNameSnapshot ?? "Your plan"}</p>
              <p className="opacity-80">
                {completed} of {sessions.length} sessions done
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Next session + payment */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link to="/portal/sessions" className="card group p-5 transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-info/10 text-info">
              <CalendarCheck className="h-[18px] w-[18px]" />
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
          {nextSession ? (
            <>
              <p className="mt-3 font-semibold">
                {SERVICE_TYPE_LABELS[nextSession.serviceType as ServiceType]} session{" "}
                {nextSession.sessionNumber}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {formatDate(nextSession.scheduledDate)}
                {daysUntil(nextSession.scheduledDate) === 0 && " · Today"}
                {daysUntil(nextSession.scheduledDate) === 1 && " · Tomorrow"}
              </p>
            </>
          ) : (
            <>
              <p className="mt-3 font-semibold">No upcoming sessions</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Your schedule will appear here.
              </p>
            </>
          )}
        </Link>

        <Link to="/portal/payments" className="card group p-5 transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/10 text-success">
              <Wallet className="h-[18px] w-[18px]" />
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
          <p className="mt-3 font-semibold">
            {formatINR(paid)}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              of {formatINR(total)} paid
            </span>
          </p>
          {nextDue ? (
            <p className="mt-0.5 text-sm text-muted-foreground">
              Next: {formatINR(nextDue.amount)} due {formatDate(nextDue.dueDate)}{" "}
              {isInstallmentOverdue(nextDue) && (
                <span className="font-medium text-danger">(overdue)</span>
              )}
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-muted-foreground">All payments settled 🎉</p>
          )}
        </Link>
      </div>

      {/* Service progress */}
      {services.length > 0 && (
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Your transformation</h2>
          <div className="mt-4 grid grid-cols-3 gap-4">
            {services.map((svc) => {
              const all = sessions.filter((s) => s.serviceType === svc);
              const done = all.filter((s) => s.status === "completed").length;
              return (
                <div key={svc} className="flex flex-col items-center gap-2 text-center">
                  <ProgressRing
                    value={all.length ? done / all.length : 0}
                    size={64}
                    className="text-primary"
                  >
                    <span className="text-xs font-bold">
                      {done}/{all.length}
                    </span>
                  </ProgressRing>
                  <p className="text-xs font-medium text-muted-foreground">
                    {SERVICE_TYPE_LABELS[svc]}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Team */}
      {team.length > 0 && (
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Your team</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {team.map(({ role, assignment }) => (
              <div key={role} className="flex items-center gap-3">
                <Avatar name={assignment!.staff.name} src={assignment!.staff.avatarUrl} size="sm" />
                <div className="leading-tight">
                  <p className="text-sm font-medium">{assignment!.staff.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {STAFF_ROLE_LABELS[role as AssignmentRole]}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent payments strip */}
      {installments.length > 0 && (
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Payments</h2>
            <Link
              to="/portal/payments"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="mt-3 space-y-2">
            {installments.slice(0, 3).map((i) => (
              <div key={i.id} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Installment {i.installmentNumber} · {formatDate(i.dueDate)}
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-medium">{formatINR(i.amount)}</span>
                  <StatusBadge status={installmentDisplayStatus(i)} />
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Quick links */}
      <div className="flex gap-3">
        <Link
          to="/portal/documents"
          className="flex flex-1 items-center justify-center gap-2 rounded-card border border-dashed border-border py-3 text-sm font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
        >
          <FileText className="h-4 w-4" /> My documents
        </Link>
        <Link
          to="/portal/profile"
          className="flex flex-1 items-center justify-center gap-2 rounded-card border border-dashed border-border py-3 text-sm font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
        >
          <Sparkles className="h-4 w-4" /> My profile
        </Link>
      </div>
    </div>
  );
}
