import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin", className)} />;
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner className="h-6 w-6 text-muted-foreground" />
    </div>
  );
}

/**
 * Loader sized to fill a layout's content region (not the whole viewport), so
 * the surrounding shell — sidebar, header — stays visible while a lazy route
 * chunk loads. Used as the Suspense fallback inside StaffLayout/ClientLayout.
 */
export function ContentSpinner() {
  return (
    <div className="flex h-full min-h-[50vh] items-center justify-center">
      <Spinner className="h-6 w-6 text-muted-foreground" />
    </div>
  );
}
