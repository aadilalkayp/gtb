import { Construction } from "lucide-react";
import { PageHeader } from "./PageHeader";

/** Temporary stub for routes not yet implemented. Replaced as modules land. */
export function PagePlaceholder({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="p-6">
      <PageHeader title={title} subtitle={subtitle} />
      <div className="card mt-6 flex flex-col items-center justify-center gap-2 p-16 text-center">
        <Construction className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Coming together</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          This module is being built. The data layer and access policies are already in place.
        </p>
      </div>
    </div>
  );
}
