import { useState } from "react";
import { LoadMoreButton } from "@/components/LoadMoreButton";
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
import { Badge, Button, Modal, PillFilter, Spinner, StatusBadge } from "@/components/ui";
import { QueryErrorState } from "@/components/QueryErrorState";
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

  const [filter, setFilterState] = useState<StatusFilter>("all");
  const [invite, setInvite] = useState<InviteTarget | null>(null);

  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  function setFilter(f: StatusFilter) {
    setFilterState(f);
    setPage(0); // a grown page size must not carry over to the next filter
  }
  const {
    data: clients,
    isLoading,
    isError,
    error,
    refetch,
  } = useFindManyClient({
    where: filter === "all" ? undefined : { status: filter },
    include: { leadSource: true },
    orderBy: { createdAt: "desc" },
    take: (page + 1) * PAGE_SIZE,
  });

  return (
    <div className="page">
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

      <PillFilter
        className="mt-6"
        options={FILTERS.map((f) => ({
          id: f,
          label: f === "all" ? "All" : CLIENT_STATUS_LABELS[f],
        }))}
        active={filter}
        onChange={setFilter}
      />

      <div className="mt-6">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6 text-muted-foreground" />
          </div>
        ) : isError ? (
          <QueryErrorState
            message={error instanceof Error ? error.message : undefined}
            onRetry={() => void refetch()}
          />
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
                <div
                  key={c.id}
                  className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/50"
                >
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
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted active:scale-[0.98]"
                    aria-label="Open client"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              );
            })}
          </div>
        )}
        {!isLoading && !isError && (clients?.length ?? 0) >= (page + 1) * PAGE_SIZE && (
          <LoadMoreButton onClick={() => setPage((p) => p + 1)} />
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
