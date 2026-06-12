import {
  LayoutDashboard,
  Users,
  UserCog,
  CalendarCheck,
  Scissors,
  Wallet,
  PhoneCall,
  ListTodo,
  Megaphone,
  FileText,
  BarChart3,
  Bell,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { canAny, type StaffRole } from "@gtb/shared";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  visible: (role: StaffRole) => boolean;
}

/** Staff sidebar (SRS dashboards + modules). Each item is filtered by capability. */
export const STAFF_NAV: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, visible: () => true },
  {
    label: "Clients",
    to: "/clients",
    icon: Users,
    visible: (r) => canAny(r, ["client.view_all", "client.view_assigned"]),
  },
  {
    label: "Assignments",
    to: "/assignments",
    icon: UserCog,
    visible: (r) => canAny(r, ["client.assign_consultants"]),
  },
  {
    label: "Consultations",
    to: "/consultations",
    icon: CalendarCheck,
    visible: (r) => canAny(r, ["client.view_all", "session.mark_complete"]),
  },
  {
    label: "Styling Operations",
    to: "/styling-operations",
    icon: Scissors,
    visible: (r) => canAny(r, ["client.view_all", "session.mark_complete"]),
  },
  {
    label: "Payments",
    to: "/payments",
    icon: Wallet,
    visible: (r) => canAny(r, ["payment.view_all", "payment.view_assigned"]),
  },
  {
    label: "CRO Tracking",
    to: "/cro-tracking",
    icon: PhoneCall,
    visible: (r) => canAny(r, ["followup.conduct", "report.view_all"]),
  },
  { label: "Team Tasks", to: "/team-tasks", icon: ListTodo, visible: () => true },
  {
    label: "Media",
    to: "/media",
    icon: Megaphone,
    visible: (r) => canAny(r, ["media.manage"]),
  },
  {
    label: "Documents",
    to: "/documents",
    icon: FileText,
    visible: (r) => canAny(r, ["client.view_all", "client.view_assigned"]),
  },
  {
    label: "Reports",
    to: "/reports",
    icon: BarChart3,
    visible: (r) => canAny(r, ["report.view_all"]),
  },
  {
    label: "Expenses",
    to: "/expenses",
    icon: Wallet,
    visible: (r) => canAny(r, ["expense.submit"]),
  },
  {
    label: "Alerts",
    to: "/alerts",
    icon: Bell,
    visible: (r) => canAny(r, ["report.view_all"]),
  },
  {
    label: "Settings",
    to: "/settings",
    icon: Settings,
    visible: (r) => canAny(r, ["settings.manage", "leadsource.manage", "user.manage"]),
  },
];
