import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useFindManyPlan, useCreatePlan, useUpdatePlan, useDeletePlan } from "@gtb/db/hooks";
import { formatINR, SERVICE_TYPE_LABELS, CLIENT_TYPE_LABELS } from "@gtb/shared";
import { Button, Badge, Spinner } from "@/components/ui";
import { PlanFormModal } from "./PlanFormModal";
import { emptyPlan, type PlanFormValues } from "./planSchema";

type EditTarget = { mode: "new" } | { mode: "edit"; id: string; values: PlanFormValues } | null;

function toServiceCreate(s: PlanFormValues["services"][number]) {
  return {
    serviceType: s.serviceType,
    totalSessions: s.totalSessions,
    startOffsetDays: s.startOffsetDays,
    frequencyDays: s.manual ? null : (s.frequencyDays ?? null),
  };
}

export function PlansSettings() {
  const { data: plans, isLoading } = useFindManyPlan({
    include: { services: true },
    orderBy: { createdAt: "desc" },
  });
  const createPlan = useCreatePlan();
  const updatePlan = useUpdatePlan();
  const deletePlan = useDeletePlan();

  const [target, setTarget] = useState<EditTarget>(null);
  const [error, setError] = useState<string>();

  const submitting = createPlan.isPending || updatePlan.isPending;

  async function handleSubmit(values: PlanFormValues) {
    setError(undefined);
    const scalars = {
      name: values.name,
      clientType: values.clientType,
      durationMonths: values.durationMonths,
      price: values.price,
      installmentCount: values.installmentCount,
      description: values.description || null,
      isActive: values.isActive,
    };
    try {
      if (target?.mode === "edit") {
        await updatePlan.mutateAsync({
          where: { id: target.id },
          data: {
            ...scalars,
            services: { deleteMany: {}, create: values.services.map(toServiceCreate) },
          },
        });
      } else {
        await createPlan.mutateAsync({
          data: { ...scalars, services: { create: values.services.map(toServiceCreate) } },
        });
      }
      setTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save plan");
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setError(undefined);
    try {
      await deletePlan.mutateAsync({ where: { id } });
    } catch {
      setError("Can't delete a plan that has enrolled clients — deactivate it instead.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Plans</h2>
          <p className="text-sm text-muted-foreground">
            Configure packages, pricing, and the services each one includes.
          </p>
        </div>
        <Button onClick={() => setTarget({ mode: "new" })}>
          <Plus className="h-4 w-4" /> New plan
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-danger/10 px-4 py-2 text-sm text-danger">{error}</div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6 text-muted-foreground" />
        </div>
      ) : !plans?.length ? (
        <div className="card p-12 text-center text-sm text-muted-foreground">
          No plans yet. Create your first plan.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {plans.map((plan) => (
            <div key={plan.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{plan.name}</h3>
                    {!plan.isActive && <Badge tone="neutral">Inactive</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {CLIENT_TYPE_LABELS[plan.clientType]} · {plan.durationMonths} months ·{" "}
                    {plan.installmentCount} installment{plan.installmentCount > 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() =>
                      setTarget({
                        mode: "edit",
                        id: plan.id,
                        values: {
                          name: plan.name,
                          clientType: plan.clientType,
                          durationMonths: plan.durationMonths,
                          price: plan.price,
                          installmentCount: plan.installmentCount,
                          description: plan.description ?? "",
                          isActive: plan.isActive,
                          services: plan.services.map((s) => ({
                            serviceType: s.serviceType,
                            totalSessions: s.totalSessions,
                            startOffsetDays: s.startOffsetDays,
                            manual: s.frequencyDays == null,
                            frequencyDays: s.frequencyDays ?? undefined,
                          })),
                        },
                      })
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                    aria-label="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(plan.id, plan.name)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-danger"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <p className="mt-3 text-lg font-semibold">{formatINR(plan.price)}</p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {plan.services.map((s) => (
                  <Badge key={s.id} tone="info">
                    {SERVICE_TYPE_LABELS[s.serviceType]} ×{s.totalSessions}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {target && (
        <PlanFormModal
          open
          onClose={() => setTarget(null)}
          title={target.mode === "edit" ? "Edit plan" : "New plan"}
          initialValues={target.mode === "edit" ? target.values : emptyPlan}
          onSubmit={handleSubmit}
          submitting={submitting}
        />
      )}
    </div>
  );
}
