import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { PreConsultationForm } from "@/components/assessment/PreConsultationForm";
import { QueryErrorState } from "@/components/QueryErrorState";
import { Button, Spinner } from "@/components/ui";
import { useAssessment } from "@/lib/assessmentApi";

export const ASSESSMENT_SUBMITTED_MESSAGE =
  "Assessment submitted successfully. Your GTB consultant will review your information before your consultation.";

/**
 * Onboarding step 1: the Pre-Consultation Assessment. Answers and photos stay
 * editable until the client's payment is in (the wizard's usual lock).
 */
export function AssessmentStep({ onDone }: { onDone: () => void | Promise<void> }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useAssessment();
  const [submitted, setSubmitted] = useState(false);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6 text-muted-foreground" />
      </div>
    );
  }
  if (isError || !data) return <QueryErrorState message={error?.message} onRetry={() => void refetch()} />;

  if (submitted) {
    return (
      <div className="card flex animate-scale-in flex-col items-center gap-4 p-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
          <CheckCircle2 className="h-6 w-6" />
        </span>
        <p className="max-w-md text-sm" role="status">
          {ASSESSMENT_SUBMITTED_MESSAGE}
        </p>
        <Button size="lg" onClick={() => void onDone()}>
          Continue to choose your plan
        </Button>
      </div>
    );
  }

  return (
    <PreConsultationForm
      assessment={data.assessment}
      photos={data.photos}
      onSubmitted={async () => {
        await queryClient.invalidateQueries({ queryKey: ["assessment"] });
        setSubmitted(true);
        window.scrollTo({ top: 0 });
      }}
    />
  );
}
