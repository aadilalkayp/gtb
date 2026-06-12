import { Navigate, Outlet, useLocation } from "react-router-dom";
import { can, type Capability } from "@gtb/shared";
import { useAuth } from "./AuthProvider";
import { FullPageSpinner } from "@/components/ui/Spinner";

/** Requires a signed-in, provisioned user. Redirects to the right login otherwise. */
export function RequireAuth({ portal }: { portal: "staff" | "client" }) {
  const { loading, session, user, unprovisioned } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpinner />;

  const loginPath = portal === "client" ? "/portal/login" : "/login";
  if (!session) {
    return <Navigate to={loginPath} replace state={{ from: location.pathname }} />;
  }
  if (unprovisioned || !user) {
    return <UnprovisionedNotice />;
  }
  return <Outlet />;
}

/** Ensures the user belongs to the staff portal; bounces clients to their portal. */
export function RequireStaff() {
  const { isStaff } = useAuth();
  if (!isStaff) return <Navigate to="/portal" replace />;
  return <Outlet />;
}

/** Ensures the user belongs to the client portal; bounces staff to the dashboard. */
export function RequireClient() {
  const { isClient } = useAuth();
  if (!isClient) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

/** True once the client has finished onboarding (submitted first payment proof). */
function onboardingComplete(
  client: { status: string; leadPhase: string } | null | undefined,
): boolean {
  if (!client) return false;
  return client.status !== "lead" || client.leadPhase === "payment_submitted";
}

/** Keeps a not-yet-onboarded client inside the onboarding wizard until it's done. */
export function RequireOnboarded() {
  const { user } = useAuth();
  if (!onboardingComplete(user?.client)) {
    return <Navigate to="/portal/onboarding" replace />;
  }
  return <Outlet />;
}

/** Gate a route behind a specific capability. */
export function RequireCapability({ capability }: { capability: Capability }) {
  const { role } = useAuth();
  const staffRole = role && role !== "client" ? role : null;
  if (!can(staffRole, capability)) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        You don't have access to this page.
      </div>
    );
  }
  return <Outlet />;
}

function UnprovisionedNotice() {
  const { signOut } = useAuth();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-lg font-semibold">Account not set up</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Your login was verified but no GTB OS profile is linked to it yet. Please contact your
        administrator.
      </p>
      <button onClick={() => void signOut()} className="text-sm font-medium text-primary underline">
        Sign out
      </button>
    </div>
  );
}
