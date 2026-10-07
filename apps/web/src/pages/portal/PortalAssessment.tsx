import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Lock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDate } from "@gtb/shared";
import { PreConsultationForm } from "@/components/assessment/PreConsultationForm";
import { QueryErrorState } from "@/components/QueryErrorState";
import { FullPageSpinner } from "@/components/ui";
import { useAssessment } from "@/lib/assessmentApi";
import { ASSESSMENT_SUBMITTED_MESSAGE } from "./onboarding/AssessmentStep";

/**
 * The Pre-Consultation Assessment outside onboarding: reached when the team
 * reopens a submitted form so the client can update it. Otherwise it shows
 * that the assessment is in and locked.
 */
export function PortalAssessment() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useAssessment();
  const [submitted, setSubmitted] = useState(false);

  if (isLoading) return <FullPageSpinner />;
  if (isError || !data) return <QueryErrorState message={error?.message} onRetry={() => void refetch()} />;

  const header = (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-display">
        Pre-consultation assessment
      </h1>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Helps your GTB consultant prepare before your consultation.
      </p>
    </div>
  );

  if (submitted || (!data.editable && data.assessment?.submittedAt)) {
    return (
      <div className="animate-fade-up space-y-5">
        {header}
        <div className="card flex flex-col items-center gap-4 p-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
            {submitted ? <CheckCircle2 className="h-6 w-6" /> : <Lock className="h-5 w-5" />}
          </span>
          <p className="max-w-md text-sm" role="status">
            {submitted
              ? ASSESSMENT_SUBMITTED_MESSAGE
              : `Submitted on ${formatDate(data.assessment!.submittedAt!)}. If something has changed, let your team know and they can reopen it for you.`}
          </p>
          <Link to="/portal" className="text-sm font-medium text-primary hover:underline">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up space-y-5">
      {header}
      {data.assessment?.reopenedAt && (
        <p className="rounded-lg bg-info/10 px-4 py-2.5 text-sm text-info">
          Your team has reopened your assessment. Update anything that has changed, then submit it
          again.
        </p>
      )}
      <PreConsultationForm
        assessment={data.assessment}
        photos={data.photos}
        onSubmitted={async () => {
          await queryClient.invalidateQueries({ queryKey: ["assessment"] });
          setSubmitted(true);
          window.scrollTo({ top: 0 });
        }}
      />
    </div>
  );
}
