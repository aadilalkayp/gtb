import { useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Scissors } from "lucide-react";
import { useFindManyStylingBlueprint } from "@gtb/db/hooks";
import {
  blueprintCompletion,
  blueprintDisplayStatus,
  formatDate,
  isBlueprintLate,
  type BlueprintStatus,
} from "@gtb/shared";
import { useAuth } from "@/auth/AuthProvider";
import { sendPhotoReminder } from "@/lib/stylingApi";
import { Badge, Button, PillFilter, Spinner, StatusBadge } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import { PaymentClearanceBadge, useStylingPaymentStatus } from "./paymentClearance";

type Filter = "under_review" | "retake_requested" | "awaiting_photos" | "published" | "all";

/**
 * Screen S1: every Styling Blueprint waiting on the styling team, due soonest
 * first. Rows are policy-scoped: a stylist sees the clients assigned to them,
 * admins see everyone. Archived (programme ended) Blueprints are left out.
 */
export function BlueprintQueue() {
  const { user, role } = useAuth();
  const isAdmin = role === "founder" || role === "ops_head";
  const [filter, setFilter] = useState<Filter>("under_review");
  const [notice, setNotice] = useState<string>();
  const { data: paymentStatus } = useStylingPaymentStatus();

  const { data, isLoading } = useFindManyStylingBlueprint({
    where: { client: { status: { notIn: ["completed", "cancelled"] } } },
    include: {
      client: {
        select: {
          id: true,
          name: true,
          clientCode: true,
          status: true,
          weddingDate: true,
          clientPlan: { select: { planNameSnapshot: true } },
          assignments: {
            where: { isActive: true, role: "styling_consultant" },
            select: { staffId: true, staff: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
  });

  // Stylists see only their own clients here (policies also let other assigned
  // roles read, but this queue is the styling team's desk).
  const rows = (data ?? []).filter(
    (b) => isAdmin || b.client.assignments.some((a) => a.staffId === user?.id),
  );
  const count = (s: BlueprintStatus) => rows.filter((r) => r.status === s).length;
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  return (
    <div className="space-y-4">
      <PillFilter
        options={[
          { id: "under_review", label: `Under review (${count("under_review")})` },
          { id: "retake_requested", label: `Retake requested (${count("retake_requested")})` },
          { id: "awaiting_photos", label: `Awaiting photos (${count("awaiting_photos")})` },
          { id: "published", label: `Published (${count("published")})` },
          { id: "all", label: `All (${rows.length})` },
        ]}
        active={filter}
        onChange={setFilter}
      />
      {notice && (
        <p className="rounded-lg bg-success/10 px-4 py-2 text-sm text-success">{notice}</p>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6 text-muted-foreground" />
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Scissors}
          title="Nothing here"
          hint={
            filter === "under_review"
              ? "No Blueprints are waiting on you right now."
              : "No Blueprints in this list."
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3">Client</th>
                <th className="px-5 py-3">Programme</th>
                <th className="px-5 py-3">Big day</th>
                <th className="px-5 py-3">Photos sent</th>
                <th className="px-5 py-3">Due back</th>
                <th className="px-5 py-3">Completion</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((b) => {
                const comp = blueprintCompletion(b.sectionsDone);
                const awaiting = b.status === "under_review" || b.status === "retake_requested";
                const late = awaiting && isBlueprintLate(b.dueAt);
                return (
                  <tr key={b.id} className="transition-colors hover:bg-muted/50">
                    <td className="px-5 py-3.5">
                      <Link
                        to={`/clients/${b.client.id}?tab=styling`}
                        className="font-semibold hover:underline"
                      >
                        {b.client.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {b.client.clientCode}
                        {isAdmin && b.client.assignments[0]
                          ? ` · ${b.client.assignments[0].staff.name}`
                          : ""}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">
                      {b.client.clientPlan?.planNameSnapshot ?? "-"}
                    </td>
                    <td className="font-num px-5 py-3.5">{formatDate(b.client.weddingDate)}</td>
                    <td className="font-num px-5 py-3.5">
                      {b.photosSubmittedAt ? formatDate(b.photosSubmittedAt) : "-"}
                    </td>
                    <td className={cn("font-num px-5 py-3.5", late && "font-semibold text-danger")}>
                      {awaiting && b.dueAt ? `${formatDate(b.dueAt)}${late ? " · late" : ""}` : "-"}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                          <span
                            className="block h-full rounded-full bg-primary"
                            style={{ width: `${comp.ratio * 100}%` }}
                          />
                        </span>
                        <span className="font-num text-xs text-muted-foreground">
                          {comp.done}/{comp.total}
                        </span>
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge
                          status={blueprintDisplayStatus(
                            b.status as BlueprintStatus,
                            b.client.status,
                          )}
                        />
                        {late && <Badge tone="danger">Late</Badge>}
                        <PaymentClearanceBadge status={paymentStatus?.[b.client.id]} />
                        {b.status === "awaiting_photos" && (
                          <RemindButton
                            clientId={b.client.id}
                            onNotice={(sent) =>
                              setNotice(
                                sent
                                  ? `Reminder sent to ${b.client.name}.`
                                  : `${b.client.name} already got a reminder today.`,
                              )
                            }
                          />
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RemindButton({
  clientId,
  onNotice,
}: {
  clientId: string;
  onNotice: (sent: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(undefined);
          try {
            const r = await sendPhotoReminder(clientId);
            onNotice(r.sent);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Bell className="h-3.5 w-3.5" /> Send reminder
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </>
  );
}
