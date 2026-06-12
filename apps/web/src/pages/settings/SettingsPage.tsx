import { useState } from "react";
import { can, type Capability, type StaffRole } from "@gtb/shared";
import { useAuth } from "@/auth/AuthProvider";
import { PageHeader } from "@/components/PageHeader";
import { cn } from "@/lib/utils";
import { PlansSettings } from "./plans/PlansSettings";
import { LeadSourcesSettings, ExpenseCategoriesSettings } from "./LookupSettings";
import { UsersSettings } from "./users/UsersSettings";

interface Tab {
  id: string;
  label: string;
  capability: Capability;
  render: () => React.ReactNode;
}

const TABS: Tab[] = [
  { id: "plans", label: "Plans", capability: "plan.manage", render: () => <PlansSettings /> },
  {
    id: "lead-sources",
    label: "Lead Sources",
    capability: "leadsource.manage",
    render: () => <LeadSourcesSettings />,
  },
  {
    id: "categories",
    label: "Expense Categories",
    capability: "settings.manage",
    render: () => <ExpenseCategoriesSettings />,
  },
  {
    id: "users",
    label: "Team & Users",
    capability: "user.manage",
    render: () => <UsersSettings />,
  },
];

export function SettingsPage() {
  const { role } = useAuth();
  const staffRole = (role && role !== "client" ? role : null) as StaffRole | null;
  const available = TABS.filter((t) => can(staffRole, t.capability));
  const [active, setActive] = useState(available[0]?.id ?? "plans");
  const activeTab = available.find((t) => t.id === active) ?? available[0];

  return (
    <div className="p-6">
      <PageHeader title="Settings" subtitle="Configure plans, lookups, and team access." />

      <div className="mt-5 flex gap-1 border-b border-border">
        {available.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={cn(
              "border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              activeTab?.id === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">{activeTab?.render()}</div>
    </div>
  );
}
