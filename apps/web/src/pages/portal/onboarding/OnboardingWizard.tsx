import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PartyPopper, LogOut } from "lucide-react";
import { useFindUniqueClient } from "@gtb/db/hooks";
import { CLIENT_TYPE_LABELS } from "@gtb/shared";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { Stepper, type Step } from "./Stepper";
import { AssessmentStep } from "./AssessmentStep";
import { PlanStep } from "./PlanStep";
import { PaymentStep } from "./PaymentStep";

type StepKey = "assessment" | "plan" | "payment";

const STEPS: (Step & { key: StepKey })[] = [
  { key: "assessment", label: "Assessment" },
  { key: "plan", label: "Choose plan" },
  { key: "payment", label: "Review & pay" },
];
const STEP_INDEX: Record<StepKey | "done", number> = {
  assessment: 0,
  plan: 1,
  payment: 2,
  done: 3,
};

export function OnboardingWizard() {
  const navigate = useNavigate();
  const { user, signOut, refetchUser } = useAuth();
  const clientId = user?.client?.id;
  const type = user?.client?.type ?? "groom";
  // The step the client navigated back to, if any. Progress itself is derived
  // from the server below; this only lets them revisit (and edit) a finished
  // step before the payment goes in.
  const [viewing, setViewing] = useState<StepKey | null>(null);

  const {
    data: client,
    isLoading,
    refetch,
  } = useFindUniqueClient(
    {
      where: { id: clientId ?? "" },
      include: {
        assessment: true,
        clientPlan: {
          include: {
            plan: { include: { services: true } },
            milestones: { orderBy: { milestoneNumber: "asc" } },
            payments: { select: { amount: true, status: true, kind: true } },
          },
        },
      },
    },
    { enabled: Boolean(clientId) },
  );

  /** A step saved: refresh, then move to the step after it (a revisit walks
   *  forward one step at a time rather than jumping to the end). */
  async function handleStepDone(next: StepKey) {
    await refetch();
    refetchUser();
    setViewing(next);
    window.scrollTo({ top: 0 });
  }

  function goTo(step: StepKey) {
    setViewing(step);
    window.scrollTo({ top: 0 });
  }

  if (isLoading || !client) return <FullPageSpinner />;

  // The payment step is done once something has been submitted (or approved):
  // a pending or approved payment counts as "money is on its way" (rejected
  // and voided rows don't).
  const hasLivePayment = (client.clientPlan?.payments ?? []).some(
    (p) => p.status === "pending_review" || p.status === "approved",
  );

  // How far the client has got (server truth). Once a payment is in, the
  // wizard is done and earlier steps lock: changes go through the team.
  const progressKey: StepKey | "done" =
    client.status !== "lead"
      ? "done"
      : !client.assessment?.completedAt
        ? "assessment"
        : !client.clientPlan
          ? "plan"
          : hasLivePayment
            ? "done"
            : "payment";

  const progressIndex = STEP_INDEX[progressKey];
  // A revisited step is only honoured while it's at or behind the progress.
  const stepKey: StepKey | "done" =
    progressKey !== "done" && viewing && STEP_INDEX[viewing] <= progressIndex
      ? viewing
      : progressKey;
  const currentIndex = STEP_INDEX[stepKey];

  return (
    <div data-theme={type === "bride" ? "bride" : undefined} className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
              G
            </div>
            <span className="text-sm font-semibold">{CLIENT_TYPE_LABELS[type]}</span>
          </div>
          <button
            onClick={() => void signOut()}
            className="flex items-center gap-1.5 rounded-lg text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground active:scale-[0.98]"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl animate-fade-up px-4 py-8">
        {stepKey === "done" ? (
          <DoneScreen onContinue={() => navigate("/portal")} />
        ) : (
          <>
            <div className="mb-6">
              <h1 className="font-display text-2xl font-semibold tracking-display">
                Welcome, {user?.name?.split(" ")[0] ?? "there"} 👋
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                A few quick steps to get your transformation started.
              </p>
            </div>

            <div className="mb-8">
              <Stepper
                steps={STEPS}
                currentIndex={currentIndex}
                completedThrough={progressIndex}
                onSelect={(i) => {
                  const step = STEPS[i];
                  if (step) goTo(step.key);
                }}
              />
            </div>

            {stepKey === "assessment" && (
              <AssessmentStep
                client={{ id: client.id, type: client.type, leadPhase: client.leadPhase }}
                assessment={client.assessment ?? null}
                onDone={() => handleStepDone("plan")}
              />
            )}
            {stepKey === "plan" && (
              <PlanStep
                client={{ id: client.id }}
                currentPlanId={client.clientPlan?.planId ?? null}
                onBack={() => goTo("assessment")}
                onDone={() => handleStepDone("payment")}
              />
            )}
            {stepKey === "payment" && client.clientPlan && (
              <PaymentStep
                client={{ id: client.id, leadPhase: client.leadPhase }}
                assessment={client.assessment ?? null}
                clientPlan={client.clientPlan}
                onEdit={goTo}
                onDone={() => handleStepDone("payment")}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function DoneScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="card flex animate-scale-in flex-col items-center gap-4 p-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
        <PartyPopper className="h-7 w-7" />
      </span>
      <div>
        <h2 className="text-lg font-semibold">You're all set!</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Your payment proof is in and your CRO will verify it shortly. Once confirmed, your team
          will be assigned and your schedule will appear in your portal.
        </p>
      </div>
      <Button size="lg" onClick={onContinue}>
        Go to my portal
      </Button>
    </div>
  );
}
