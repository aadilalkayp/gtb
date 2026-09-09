import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { PRODUCT_NAME } from "@/components/ScanReportView";

/** Header + page frame shared by the public scan funnel and report pages. */
export function ScanShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4">
          <Link to="/scan" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 font-display text-xs font-semibold text-primary-foreground shadow-button">
              G
            </div>
            <span className="text-sm font-semibold">GTB · {PRODUCT_NAME}</span>
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
