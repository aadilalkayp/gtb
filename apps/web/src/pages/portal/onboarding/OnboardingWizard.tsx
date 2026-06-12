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

const STEPS: Step[] = [
  { key: "assessment", label: "Assessment" },
  { key: "plan", label: "Choose plan" },
  { key: "payment", label: "Payment" },
];

const PAYABLE = new Set(["pending", "overdue", "rejected"]);

export function OnboardingWizard() {
  const navigate = useNavigate();
  const { user, signOut, refetchUser } = useAuth();
  const clientId = user?.client?.id;
  const type = user?.client?.type ?? "groom";

  const {
    data: client,
    isLoading,
    refetch,
  } = useFindUniqueClient(
    {
      where: { id: clientId ?? "" },
      include: {
        assessment: true,
        clientPlan: { include: { plan: { include: { services: true } }, installments: true } },
      },
    },
    { enabled: Boolean(clientId) },
  );

  async function handleStepDone() {
    await refetch();
    refetchUser();
  }

  if (isLoading || !client) return <FullPageSpinner />;

  const firstInstallment = client.clientPlan?.installments
    ?.slice()
    .sort((a, b) => a.installmentNumber - b.installmentNumber)[0];

  const stepKey: "assessment" | "plan" | "payment" | "done" =
    client.status !== "lead"
      ? "done"
      : !client.assessment?.completedAt
        ? "assessment"
        : !client.clientPlan
          ? "plan"
          : firstInstallment && PAYABLE.has(firstInstallment.status)
            ? "payment"
            : "done";

  const currentIndex =
    stepKey === "assessment" ? 0 : stepKey === "plan" ? 1 : stepKey === "payment" ? 2 : 3;

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
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        {stepKey === "done" ? (
          <DoneScreen onContinue={() => navigate("/portal")} />
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-xl font-semibold">
                Welcome, {user?.name?.split(" ")[0] ?? "there"} 👋
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                A few quick steps to get your transformation started.
              </p>
            </div>

            <div className="mb-8">
              <Stepper steps={STEPS} currentIndex={currentIndex} />
            </div>

            {stepKey === "assessment" && (
              <AssessmentStep
                client={{ id: client.id, type: client.type, leadPhase: client.leadPhase }}
                assessment={client.assessment ?? null}
                onDone={handleStepDone}
              />
            )}
            {stepKey === "plan" && (
              <PlanStep client={{ id: client.id, type: client.type }} onDone={handleStepDone} />
            )}
            {stepKey === "payment" && client.clientPlan && (
              <PaymentStep
                client={{ id: client.id, leadPhase: client.leadPhase }}
                clientPlan={client.clientPlan}
                onDone={handleStepDone}
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
    <div className="card flex flex-col items-center gap-4 p-10 text-center">
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
