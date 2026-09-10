import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { PRODUCT_NAME } from "@/components/ScanReportView";

/** Header + page frame shared by the public scan funnel and report pages. */
export function ScanShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4">
          <Link to="/scan" className="flex items-center gap-2.5" aria-label={`GTB · ${PRODUCT_NAME}`}>
            <img src="/logo.png" alt="GTB" className="h-9 w-9 rounded-lg" />
            <span className="text-[9px] font-medium uppercase tracking-[0.3em] text-muted-foreground">
              Groom To Be
            </span>
          </Link>
          <Link to="/portal/login" className="text-xs font-medium text-primary hover:underline">
            Client login
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-8 pb-16">{children}</main>
    </div>
  );
}
