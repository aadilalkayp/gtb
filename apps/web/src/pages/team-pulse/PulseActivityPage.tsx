import { PageHeader } from "@/components/PageHeader";
import { ActivityLogView } from "./ActivityLogView";
import { PulseTabs } from "./pulseUi";

/** Everyone's activity, newest first (TEAM_PULSE_DESIGN.md §8.3). Founders only. */
export function PulseActivityPage() {
  return (
    <div className="page">
      <PageHeader
        title="Team Pulse"
        subtitle="When the team works, what they get done, and how promptly it's logged. Visible to founders only."
      />
      <PulseTabs />
      <div className="mt-6">
        <ActivityLogView showActor foundersToggle />
      </div>
    </div>
  );
}
