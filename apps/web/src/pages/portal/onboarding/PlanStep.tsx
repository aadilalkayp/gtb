import { useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { useFindManyPlan } from "@gtb/db/hooks";
import { SERVICE_TYPE_LABELS } from "@gtb/shared";
import { changePlan, enrollClient } from "@/lib/api";
import { Badge, Button, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";

export function PlanStep({
  client,
  currentPlanId,
  onBack,
  onDone,
}: {
  client: { id: string };
  /** Set when the client came back to change an already chosen plan. */
  currentPlanId: string | null;
  onBack: () => void;
  onDone: () => void | Promise<void>;
}) {
  const { data: plans, isLoading } = useFindManyPlan({
    where: { isActive: true },
    include: { services: true },
    orderBy: { durationMonths: "asc" },
  });

  const [selected, setSelected] = useState<string | undefined>(currentPlanId ?? undefined);
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState<string>();

  async function confirm() {
    if (!selected) return;
    setEnrolling(true);
    setError(undefined);
    try {
      // Unchanged plan → just move on; a different one switches in place.
      if (!currentPlanId) await enrollClient(client.id, selected);
      else if (selected !== currentPlanId) await changePlan(client.id, selected);
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not enroll in this plan");
      setEnrolling(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6 text-muted-foreground" />
      </div>
    );
  }

  if (!plans?.length) {
    return (
      <div className="card p-10 text-center text-sm text-muted-foreground">
        No plans are available for your program right now. Please contact your coordinator.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Choose the program that fits your timeline. Your team will tailor the sessions to your
        big day, and your coordinator will confirm the price with you personally.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {plans.map((plan) => {
          const active = selected === plan.id;
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => setSelected(plan.id)}
              className={cn(
                "card relative p-4 text-left transition duration-150 ease-out-strong hover:border-border-strong hover:shadow-md active:scale-[0.99]",
                active && "border-primary ring-4 ring-ring/10 hover:border-primary",
              )}
            >
              {active && (
                <span className="absolute right-3 top-3 flex h-6 w-6 animate-scale-in items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-4 w-4" />
                </span>
              )}
              <h3 className="font-semibold">{plan.name}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {plan.durationMonths} {plan.durationMonths === 1 ? "month" : "months"}
              </p>
              {plan.description && (
                <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {plan.services.map((s) => (
                  <Badge key={s.id} tone="info">
                    {SERVICE_TYPE_LABELS[s.serviceType]} ×{s.totalSessions}
                  </Badge>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="rounded-lg bg-danger/10 px-4 py-2 text-sm text-danger">{error}</div>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="lg" onClick={onBack} disabled={enrolling}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button size="lg" disabled={!selected} loading={enrolling} onClick={confirm}>
          Continue to payment
        </Button>
      </div>
    </div>
  );
}
