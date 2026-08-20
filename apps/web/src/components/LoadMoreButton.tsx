import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui";

/** PERF-1: "Load more" pagination footer for list pages (take-based). */
export function LoadMoreButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex justify-center pt-4">
      <Button variant="outline" size="sm" onClick={onClick}>
        <ChevronDown className="mr-1.5 h-3.5 w-3.5" /> Load more
      </Button>
    </div>
  );
}
