import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * CALC-8: a failed query must never render as an empty/"all clear" state.
 * Every list/dashboard page renders this when its query errored, with a retry.
 */
export function QueryErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="card flex flex-col items-center gap-3 p-10 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-danger/10 text-danger">
        <AlertTriangle className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-semibold">Couldn't load this data</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {message ?? "The request failed. Nothing is shown until it succeeds."}
        </p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Try again
        </Button>
      )}
    </div>
  );
}
