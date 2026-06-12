import { useState } from "react";
import { Check } from "lucide-react";
import { useFindManyPlan } from "@gtb/db/hooks";
import { formatINR, SERVICE_TYPE_LABELS } from "@gtb/shared";
import { enrollClient } from "@/lib/api";
import { Badge, Button, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";

export function PlanStep({
  client,
  onDone,
}: {
  client: { id: string; type: "groom" | "bride" };
  onDone: () => void | Promise<void>;
}) {
  const { data: plans, isLoading } = useFindManyPlan({
    where: { clientType: client.type, isActive: true },
    include: { services: true },
    orderBy: { price: "asc" },
  });

  const [selected, setSelected] = useState<string>();
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState<string>();

  async function confirm() {
    if (!selected) return;
    setEnrolling(true);
    setError(undefined);
    try {
      await enrollClient(client.id, selected);
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
        wedding date.
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
                "card relative p-4 text-left transition-shadow hover:shadow-md",
                active && "ring-2 ring-primary",
              )}
            >
              {active && (
                <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-4 w-4" />
                </span>
              )}
              <h3 className="font-semibold">{plan.name}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {plan.durationMonths} months ·{" "}
                {plan.installmentCount > 1
                  ? `${plan.installmentCount} installments`
                  : "Full payment"}
              </p>
              <p className="mt-2 text-xl font-semibold">{formatINR(plan.price)}</p>
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

      <div className="flex justify-end">
        <Button size="lg" disabled={!selected} loading={enrolling} onClick={confirm}>
          Continue to payment
        </Button>
      </div>
    </div>
  );
}
