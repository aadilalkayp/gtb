import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import {
  RequireAuth,
  RequireStaff,
  RequireClient,
  RequireOnboarded,
  RequireCapability,
} from "@/auth/guards";
import { StaffLayout } from "@/layouts/StaffLayout";
import { ClientLayout } from "@/layouts/ClientLayout";
import { LoginPage } from "@/pages/auth/LoginPage";
import { FullPageSpinner } from "@/components/ui/Spinner";

// Route pages are code-split so the initial bundle stays small — each lazy
// import becomes its own chunk that loads on navigation. The pages are named
// exports, so we map the named export to `default` for React.lazy. The
// recharts-heavy Dashboard/Reports pages keep that dependency out of the
// entry chunk entirely (see manualChunks in vite.config.ts).
const DashboardPage = lazy(() =>
  import("@/pages/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const ReportsPage = lazy(() =>
  import("@/pages/reports/ReportsPage").then((m) => ({ default: m.ReportsPage })),
);
const MediaPage = lazy(() =>
  import("@/pages/media/MediaPage").then((m) => ({ default: m.MediaPage })),
);
const AlertsPage = lazy(() =>
  import("@/pages/alerts/AlertsPage").then((m) => ({ default: m.AlertsPage })),
);
const ConsultationsPage = lazy(() =>
  import("@/pages/consultations/ConsultationsPage").then((m) => ({
    default: m.ConsultationsPage,
  })),
);
const ClientProfilePage = lazy(() =>
  import("@/pages/clients/ClientProfilePage").then((m) => ({ default: m.ClientProfilePage })),
);
const ClientsPage = lazy(() =>
  import("@/pages/clients/ClientsPage").then((m) => ({ default: m.ClientsPage })),
);
const NewClientPage = lazy(() =>
  import("@/pages/clients/NewClientPage").then((m) => ({ default: m.NewClientPage })),
);
const PaymentsPage = lazy(() =>
  import("@/pages/payments/PaymentsPage").then((m) => ({ default: m.PaymentsPage })),
);
const AssignmentsPage = lazy(() =>
  import("@/pages/assignments/AssignmentsPage").then((m) => ({ default: m.AssignmentsPage })),
);
const StylingOperationsPage = lazy(() =>
  import("@/pages/styling/StylingOperationsPage").then((m) => ({
    default: m.StylingOperationsPage,
  })),
);
const CroTrackingPage = lazy(() =>
  import("@/pages/cro/CroTrackingPage").then((m) => ({ default: m.CroTrackingPage })),
);
const ExpensesPage = lazy(() =>
  import("@/pages/expenses/ExpensesPage").then((m) => ({ default: m.ExpensesPage })),
);
const DocumentsPage = lazy(() =>
  import("@/pages/documents/DocumentsPage").then((m) => ({ default: m.DocumentsPage })),
);
const TeamTasksPage = lazy(() =>
  import("@/pages/tasks/TeamTasksPage").then((m) => ({ default: m.TeamTasksPage })),
);
const SettingsPage = lazy(() =>
  import("@/pages/settings/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const RegisterPage = lazy(() =>
  import("@/pages/portal/RegisterPage").then((m) => ({ default: m.RegisterPage })),
);
const OnboardingWizard = lazy(() =>
  import("@/pages/portal/onboarding/OnboardingWizard").then((m) => ({
    default: m.OnboardingWizard,
  })),
);
const PortalHome = lazy(() =>
  import("@/pages/portal/PortalHome").then((m) => ({ default: m.PortalHome })),
);
const PortalSessions = lazy(() =>
  import("@/pages/portal/PortalSessions").then((m) => ({ default: m.PortalSessions })),
);
const PortalPayments = lazy(() =>
  import("@/pages/portal/PortalPayments").then((m) => ({ default: m.PortalPayments })),
);
const PortalDocuments = lazy(() =>
  import("@/pages/portal/PortalDocuments").then((m) => ({ default: m.PortalDocuments })),
);
const PortalProfile = lazy(() =>
  import("@/pages/portal/PortalProfile").then((m) => ({ default: m.PortalProfile })),
);

/** Sends users to their portal home based on auth state. */
function IndexRedirect() {
  const { loading, session, isClient } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!session) return <Navigate to="/login" replace />;
  return <Navigate to={isClient ? "/portal" : "/dashboard"} replace />;
}

export default function App() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage portal="staff" />} />
        <Route path="/portal/login" element={<LoginPage portal="client" />} />
        {/* Reached from the invite email; Supabase establishes the session from the link. */}
        <Route path="/portal/register" element={<RegisterPage />} />

        {/* Staff portal */}
        <Route element={<RequireAuth portal="staff" />}>
          <Route element={<RequireStaff />}>
            <Route element={<StaffLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/clients" element={<ClientsPage />} />
              <Route path="/clients/new" element={<NewClientPage />} />
              <Route path="/clients/:id" element={<ClientProfilePage />} />
              <Route path="/consultations" element={<ConsultationsPage />} />
              <Route path="/styling-operations" element={<StylingOperationsPage />} />
              <Route path="/payments" element={<PaymentsPage />} />
              <Route path="/cro-tracking" element={<CroTrackingPage />} />
              <Route path="/team-tasks" element={<TeamTasksPage />} />
              <Route path="/documents" element={<DocumentsPage />} />
              <Route path="/expenses" element={<ExpensesPage />} />

              <Route element={<RequireCapability capability="client.assign_consultants" />}>
                <Route path="/assignments" element={<AssignmentsPage />} />
              </Route>
              <Route element={<RequireCapability capability="media.manage" />}>
                <Route path="/media" element={<MediaPage />} />
              </Route>
              <Route element={<RequireCapability capability="report.view_all" />}>
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/alerts" element={<AlertsPage />} />
              </Route>
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>
        </Route>

        {/* Client portal */}
        <Route element={<RequireAuth portal="client" />}>
          <Route element={<RequireClient />}>
            <Route path="/portal/onboarding" element={<OnboardingWizard />} />
            <Route element={<RequireOnboarded />}>
              <Route element={<ClientLayout />}>
                <Route path="/portal" element={<PortalHome />} />
                <Route path="/portal/sessions" element={<PortalSessions />} />
                <Route path="/portal/payments" element={<PortalPayments />} />
                <Route path="/portal/documents" element={<PortalDocuments />} />
                <Route path="/portal/profile" element={<PortalProfile />} />
              </Route>
            </Route>
          </Route>
        </Route>

        {/* Fallbacks */}
        <Route path="/" element={<IndexRedirect />} />
        <Route path="*" element={<IndexRedirect />} />
      </Routes>
    </Suspense>
  );
}
