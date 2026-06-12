import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, UserCheck } from "lucide-react";
import { useFindManyClient, useFindManyUser, useFindManyAssignment } from "@gtb/db/hooks";
import {
  CONSULTANT_ROLES,
  SERVICE_TO_CONSULTANT_ROLE,
  SERVICE_TYPE_LABELS,
  STAFF_ROLE_LABELS,
  formatDate,
  type ServiceType,
} from "@gtb/shared";
import { assignTeam, activateClient } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { Badge, Button, Select, Spinner, StatusBadge } from "@/components/ui";

interface StaffLite {
  id: string;
  name: string;
  role: string;
}
interface ActiveAssignment {
  role: string;
  staffId: string;
  staff: StaffLite | null;
}
interface ClientRow {
  id: string;
  name: string;
  clientCode: string;
  status: string;
  weddingDate: string | Date;
  conversionDate: string | Date | null;
  clientPlan: {
    planNameSnapshot: string;
    plan: { services: { serviceType: string }[] };
  } | null;
  assignments: ActiveAssignment[];
}

export function AssignmentsPage() {
  const {
    data: clients,
    isLoading,
    refetch,
  } = useFindManyClient({
    where: { status: { in: ["converted", "active"] } },
    include: {
      clientPlan: { include: { plan: { include: { services: true } } } },
      assignments: {
        where: { isActive: true },
        include: { staff: { select: { id: true, name: true, role: true } } },
      },
    },
    orderBy: { conversionDate: "desc" },
  });

  const { data: staff } = useFindManyUser({
    where: { role: { in: ["coach", ...CONSULTANT_ROLES] }, isActive: true },
    orderBy: { name: "asc" },
  });

  const { data: activeAssignments } = useFindManyAssignment({
    where: { isActive: true },
    select: { staffId: true, clientId: true },
  });

  const workload = useMemo(() => {
    const byStaff = new Map<string, Set<string>>();
    for (const a of activeAssignments ?? []) {
      if (!byStaff.has(a.staffId)) byStaff.set(a.staffId, new Set());
      byStaff.get(a.staffId)!.add(a.clientId);
    }
    const counts = new Map<string, number>();
    byStaff.forEach((set, id) => counts.set(id, set.size));
    return counts;
  }, [activeAssignments]);

  const rows = (clients ?? []) as unknown as ClientRow[];
  const staffList = (staff ?? []) as unknown as StaffLite[];

  return (
    <div className="p-6">
      <PageHeader
        title="Assignments"
        subtitle="Assign coaches and consultants to converted clients, then activate their schedule."
      />

      <div className="mt-6">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6 text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="card p-12 text-center text-sm text-muted-foreground">
            No converted clients waiting for a team.
          </div>
        ) : (
          <div className="space-y-4">
            {rows.map((c) => (
              <ClientAssignmentCard
                key={c.id}
                client={c}
                staff={staffList}
                workload={workload}
                onChanged={() => void refetch()}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ClientAssignmentCard({
  client,
  staff,
  workload,
  onChanged,
}: {
  client: ClientRow;
  staff: StaffLite[];
  workload: Map<string, number>;
  onChanged: () => void;
}) {
  const currentByRole = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of client.assignments) m[a.role] = a.staffId;
    return m;
  }, [client.assignments]);

  const serviceTypes = useMemo(
    () => [...new Set(client.clientPlan?.plan.services.map((s) => s.serviceType) ?? [])],
    [client.clientPlan],
  );

  const slots = useMemo(
    () => [
      { role: "coach", label: "Client Coach" },
      ...serviceTypes.map((st) => ({
        role: SERVICE_TO_CONSULTANT_ROLE[st as ServiceType],
        label: `${SERVICE_TYPE_LABELS[st as ServiceType]} consultant`,
      })),
    ],
    [serviceTypes],
  );

  const [sel, setSel] = useState<Record<string, string>>(currentByRole);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();

  const dirty = slots.some((s) => (sel[s.role] ?? "") !== (currentByRole[s.role] ?? ""));
  const hasConsultant = CONSULTANT_ROLES.some((r) => currentByRole[r]);
  const cro = client.assignments.find((a) => a.role === "cro");

  async function save() {
    setSaving(true);
    setError(undefined);
    setDone(undefined);
    try {
      const payload = slots
        .filter((s) => sel[s.role])
        .map((s) => ({ role: s.role, staffId: sel[s.role]! }));
      await assignTeam(client.id, payload);
      setDone("Team saved.");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the team");
    } finally {
      setSaving(false);
    }
  }

  async function activate() {
    setActivating(true);
    setError(undefined);
    setDone(undefined);
    try {
      const res = await activateClient(client.id);
      setDone(`Activated — ${res.sessionsCreated} sessions scheduled.`);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not activate");
    } finally {
      setActivating(false);
    }
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link to={`/clients/${client.id}`} className="font-semibold hover:underline">
              {client.name}
            </Link>
            <span className="text-xs text-muted-foreground">{client.clientCode}</span>
            <StatusBadge status={client.status} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {client.clientPlan?.planNameSnapshot ?? "No plan"} · Wedding{" "}
            {formatDate(client.weddingDate)}
            {cro?.staff && ` · CRO: ${cro.staff.name}`}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {slots.map((slot) => {
          const eligible = staff.filter((s) => s.role === slot.role);
          return (
            <label key={slot.role} className="block">
              <span className="mb-1.5 block text-sm font-medium">{slot.label}</span>
              <Select
                value={sel[slot.role] ?? ""}
                onChange={(e) => setSel((p) => ({ ...p, [slot.role]: e.target.value }))}
              >
                <option value="">
                  {eligible.length
                    ? "— Unassigned —"
                    : `No ${STAFF_ROLE_LABELS[slot.role as keyof typeof STAFF_ROLE_LABELS]} available`}
                </option>
                {eligible.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {workload.get(s.id) ?? 0} active
                  </option>
                ))}
              </Select>
            </label>
          );
        })}
      </div>

      {(error || done) && (
        <p className={"mt-3 text-sm " + (error ? "text-danger" : "text-success")}>
          {error ?? done}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={save} loading={saving} disabled={!dirty}>
          <UserCheck className="h-4 w-4" /> Save team
        </Button>
        {client.status === "converted" && (
          <Button
            variant="outline"
            onClick={activate}
            loading={activating}
            disabled={!hasConsultant || dirty}
          >
            <Sparkles className="h-4 w-4" /> Activate & schedule
          </Button>
        )}
        {client.status === "converted" && !hasConsultant && (
          <span className="text-xs text-muted-foreground">Assign a consultant, then activate.</span>
        )}
        {client.status === "converted" && hasConsultant && dirty && (
          <span className="text-xs text-muted-foreground">Save the team before activating.</span>
        )}
        {client.status === "active" && (
          <Badge tone="success">
            <Sparkles className="mr-1 h-3 w-3" /> Schedule generated
          </Badge>
        )}
      </div>
    </div>
  );
}
