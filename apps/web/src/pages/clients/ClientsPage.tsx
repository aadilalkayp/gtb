import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, ChevronRight } from "lucide-react";
import { useFindManyClient } from "@gtb/db/hooks";
import {
  CLIENT_STATUSES,
  CLIENT_STATUS_LABELS,
  CLIENT_TYPE_LABELS,
  LEAD_PHASE_LABELS,
  LEAD_PHASE_ORDER,
  can,
  formatDate,
  type StaffRole,
} from "@gtb/shared";
import { useAuth } from "@/auth/AuthProvider";
import { PageHeader } from "@/components/PageHeader";
import { Badge, Button, Modal, Spinner, StatusBadge } from "@/components/ui";
import { InviteClientPanel } from "./InviteClientPanel";

type StatusFilter = "all" | (typeof CLIENT_STATUSES)[number];
const FILTERS: StatusFilter[] = ["all", ...CLIENT_STATUSES];

interface InviteTarget {
  id: string;
  name: string;
  alreadyInvited: boolean;
}

export function ClientsPage() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const staffRole = (role && role !== "client" ? role : null) as StaffRole | null;
  const canCreate = can(staffRole, "client.create");

  const [filter, setFilter] = useState<StatusFilter>("all");
  const [invite, setInvite] = useState<InviteTarget | null>(null);

  const {
    data: clients,
    isLoading,
    refetch,
  } = useFindManyClient({
    where: filter === "all" ? undefined : { status: filter },
    include: { leadSource: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="p-6">
      <PageHeader
        title="Clients"
        subtitle="Leads and active clients across both programs."
        actions={
          canCreate && (
            <Button onClick={() => navigate("/clients/new")}>
              <Plus className="h-4 w-4" /> New lead
            </Button>
          )
        }
      />

      <div className="mt-5 flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={
              "rounded-full px-3 py-1 text-sm font-medium transition-colors " +
              (filter === f
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted")
            }
          >
            {f === "all" ? "All" : CLIENT_STATUS_LABELS[f]}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6 text-muted-foreground" />
          </div>
        ) : !clients?.length ? (
          <div className="card p-12 text-center text-sm text-muted-foreground">
            {filter === "all"
              ? "No clients yet."
              : `No ${CLIENT_STATUS_LABELS[filter].toLowerCase()} clients.`}
          </div>
        ) : (
          <div className="card divide-y divide-border">
            {clients.map((c) => {
              const isLead = c.status === "lead";
              const alreadyInvited = LEAD_PHASE_ORDER[c.leadPhase] >= LEAD_PHASE_ORDER.invited;
              return (
                <div key={c.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/clients/${c.id}`}
                        className="truncate font-medium hover:underline"
                      >
                        {c.name}
                      </Link>
                      <span className="shrink-0 text-xs text-muted-foreground">{c.clientCode}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{CLIENT_TYPE_LABELS[c.type]}</span>
                      <span>Wedding {formatDate(c.weddingDate)}</span>
                      <span>{c.city}</span>
                      {c.leadSource && <span>via {c.leadSource.name}</span>}
                    </div>
                  </div>

                  <div className="hidden shrink-0 sm:block">
                    {isLead ? (
                      <Badge tone="neutral">{LEAD_PHASE_LABELS[c.leadPhase]}</Badge>
                    ) : (
                      <StatusBadge status={c.status} />
                    )}
                  </div>

                  {isLead && canCreate && (
                    <Button
                      size="sm"
                      variant={alreadyInvited ? "ghost" : "outline"}
                      onClick={() => setInvite({ id: c.id, name: c.name, alreadyInvited })}
                    >
                      {alreadyInvited ? "Resend" : "Invite"}
                    </Button>
                  )}

                  <Link
                    to={`/clients/${c.id}`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                    aria-label="Open client"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {invite && (
        <Modal open onClose={() => setInvite(null)} title={`Invite ${invite.name}`} size="sm">
          <InviteClientPanel
            clientId={invite.id}
            alreadyInvited={invite.alreadyInvited}
            onInvited={() => void refetch()}
          />
        </Modal>
      )}
    </div>
  );
}
