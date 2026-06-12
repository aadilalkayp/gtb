import { useState } from "react";
import { Download, TrendingUp, Wallet, Target, Award, Receipt, Activity } from "lucide-react";
import {
  useFindManyClient,
  useFindManyExpense,
  useFindManyFollowUp,
  useFindManyUser,
  useFindManyStylingOperation,
  useFindManyTask,
} from "@gtb/db/hooks";
import { formatINR, humanize, type ServiceType, SERVICE_TYPE_LABELS } from "@gtb/shared";
import { asDate, isInstallmentOverdue, downloadCsv } from "@/lib/insights";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";
import { Button, Select, Spinner, Tabs, type TabDef } from "@/components/ui";
import { RevenueChart } from "@/pages/dashboard/widgets";
import { cn } from "@/lib/utils";

// ---- Period presets ---------------------------------------------------------

type Period = "this_month" | "last_3" | "last_6" | "ytd" | "all";
const PERIOD_LABELS: Record<Period, string> = {
  this_month: "This month",
  last_3: "Last 3 months",
  last_6: "Last 6 months",
  ytd: "This year",
  all: "All time",
};

function periodStart(p: Period): Date {
  const now = new Date();
  switch (p) {
    case "this_month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "last_3":
      return new Date(now.getFullYear(), now.getMonth() - 2, 1);
    case "last_6":
      return new Date(now.getFullYear(), now.getMonth() - 5, 1);
    case "ytd":
      return new Date(now.getFullYear(), 0, 1);
    case "all":
      return new Date(2000, 0, 1);
  }
}

function monthsInRange(start: Date): { key: string; label: string; year: number; month: number }[] {
  const out: { key: string; label: string; year: number; month: number }[] = [];
  const now = new Date();
  // Cap at 12 months for chart readability.
  const cur = new Date(
    Math.max(start.getTime(), new Date(now.getFullYear(), now.getMonth() - 11, 1).getTime()),
  );
  cur.setDate(1);
  while (cur <= now) {
    out.push({
      key: `${cur.getFullYear()}-${cur.getMonth()}`,
      label: cur.toLocaleString("en-IN", { month: "short" }),
      year: cur.getFullYear(),
      month: cur.getMonth(),
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

// ---- Raw shapes -------------------------------------------------------------

interface InstallmentLite {
  amount: number;
  dueDate: string | Date;
  status: string;
  approvedAt: string | Date | null;
}
interface SessionLite {
  status: string;
  rating: number | null;
  serviceType: string;
  actualDate: string | Date | null;
  scheduledDate: string | Date;
  consultantId: string | null;
}
interface ClientLite {
  id: string;
  name: string;
  type: "groom" | "bride";
  status: string;
  createdAt: string | Date;
  conversionDate: string | Date | null;
  convertedById: string | null;
  leadSource: { name: string } | null;
  convertedBy: { id: string; name: string } | null;
  clientPlan: {
    planNameSnapshot: string;
    priceAtEnrollment: number;
    installments: InstallmentLite[];
  } | null;
  sessions: SessionLite[];
}
interface ExpenseLite {
  amount: number;
  date: string | Date;
  status: string;
  payeeId: string | null;
  category: { name: string } | null;
  payee: { id: string; name: string } | null;
}

type TabId = "revenue" | "collections" | "sales" | "performance" | "expenses" | "operations";

export function ReportsPage() {
  const [tab, setTab] = useState<TabId>("revenue");
  const [period, setPeriod] = useState<Period>("last_6");

  const clientsQ = useFindManyClient({
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      createdAt: true,
      conversionDate: true,
      convertedById: true,
      leadSource: { select: { name: true } },
      convertedBy: { select: { id: true, name: true } },
      clientPlan: {
        select: {
          planNameSnapshot: true,
          priceAtEnrollment: true,
          installments: { select: { amount: true, dueDate: true, status: true, approvedAt: true } },
        },
      },
      sessions: {
        select: {
          status: true,
          rating: true,
          serviceType: true,
          actualDate: true,
          scheduledDate: true,
          consultantId: true,
        },
      },
    },
  });
  const expensesQ = useFindManyExpense({
    include: { category: { select: { name: true } }, payee: { select: { id: true, name: true } } },
  });
  const followUpsQ = useFindManyFollowUp({ select: { croId: true, status: true } });
  const staffQ = useFindManyUser({
    where: { role: { not: "client" } },
    select: { id: true, name: true, role: true },
  });
  const stylingQ = useFindManyStylingOperation({ select: { status: true } });
  const tasksQ = useFindManyTask({ select: { status: true } });

  const clients = (clientsQ.data ?? []) as unknown as ClientLite[];
  const expenses = (expensesQ.data ?? []) as unknown as ExpenseLite[];
  const followUps = (followUpsQ.data ?? []) as unknown as { croId: string; status: string }[];
  const staff = (staffQ.data ?? []) as unknown as { id: string; name: string; role: string }[];
  const stylingOps = (stylingQ.data ?? []) as unknown as { status: string }[];
  const tasks = (tasksQ.data ?? []) as unknown as { status: string }[];

  const isLoading = clientsQ.isLoading || expensesQ.isLoading;
  const start = periodStart(period);
  const inRange = (d: string | Date | null) => d != null && asDate(d) >= start;

  const tabs: TabDef<TabId>[] = [
    { id: "revenue", label: "Revenue" },
    { id: "collections", label: "Collections" },
    { id: "sales", label: "Sales" },
    { id: "performance", label: "Performance" },
    { id: "expenses", label: "Expenses" },
    { id: "operations", label: "Operations" },
  ];

  return (
    <div className="p-6">
      <PageHeader
        title="Reports"
        subtitle="Revenue, collections, sales, performance, and spend — exportable to CSV."
        actions={
          <Select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className="w-auto"
          >
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <option key={p} value={p}>
                {PERIOD_LABELS[p]}
              </option>
            ))}
          </Select>
        }
      />

      <Tabs tabs={tabs} active={tab} onChange={setTab} className="mt-5" />

      <div className="mt-6">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6 text-muted-foreground" />
          </div>
        ) : (
          <>
            {tab === "revenue" && (
              <RevenueReport clients={clients} start={start} inRange={inRange} />
            )}
            {tab === "collections" && <CollectionsReport clients={clients} inRange={inRange} />}
            {tab === "sales" && <SalesReport clients={clients} inRange={inRange} />}
            {tab === "performance" && (
              <PerformanceReport
                clients={clients}
                staff={staff}
                followUps={followUps}
                inRange={inRange}
              />
            )}
            {tab === "expenses" && (
              <ExpensesReport clients={clients} expenses={expenses} inRange={inRange} />
            )}
            {tab === "operations" && (
              <OperationsReport
                clients={clients}
                stylingOps={stylingOps}
                tasks={tasks}
                inRange={inRange}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---- Shared presentational --------------------------------------------------

function ReportCard({
  title,
  icon: Icon,
  onExport,
  children,
  className,
}: {
  title: string;
  icon?: typeof TrendingUp;
  onExport?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("card p-5", className)}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
          {title}
        </h2>
        {onExport && (
          <Button size="sm" variant="outline" onClick={onExport}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
        )}
      </div>
      {children}
    </section>
  );
}

function DataTable({
  headers,
  rows,
  align,
}: {
  headers: string[];
  rows: (string | number)[][];
  /** Right-align columns by index. */
  align?: number[];
}) {
  const right = new Set(align ?? []);
  if (!rows.length) return <EmptyState title="No data" hint="Nothing in this period yet." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            {headers.map((h, i) => (
              <th key={h} className={cn("pb-2 font-medium", right.has(i) && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((cell, ci) => (
                <td
                  key={ci}
                  className={cn("py-2.5", right.has(ci) ? "text-right tabular-nums" : "")}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- Revenue ----------------------------------------------------------------

function approvedInRange(c: ClientLite, inRange: (d: string | Date | null) => boolean): number {
  return (c.clientPlan?.installments ?? [])
    .filter((i) => i.status === "approved" && inRange(i.approvedAt))
    .reduce((t, i) => t + i.amount, 0);
}

function RevenueReport({
  clients,
  start,
  inRange,
}: {
  clients: ClientLite[];
  start: Date;
  inRange: (d: string | Date | null) => boolean;
}) {
  const months = monthsInRange(start);
  const series = months.map((m) => {
    const collections = clients.reduce(
      (t, c) =>
        t +
        (c.clientPlan?.installments ?? [])
          .filter(
            (i) =>
              i.status === "approved" && i.approvedAt && sameMonth(i.approvedAt, m.year, m.month),
          )
          .reduce((s, i) => s + i.amount, 0),
      0,
    );
    const sales = clients
      .filter((c) => c.conversionDate && sameMonth(c.conversionDate, m.year, m.month))
      .reduce((t, c) => t + (c.clientPlan?.priceAtEnrollment ?? 0), 0);
    return { label: m.label, sales, collections };
  });

  const groomRevenue = clients
    .filter((c) => c.type === "groom")
    .reduce((t, c) => t + approvedInRange(c, inRange), 0);
  const brideRevenue = clients
    .filter((c) => c.type === "bride")
    .reduce((t, c) => t + approvedInRange(c, inRange), 0);
  const byType = [
    { type: "groom" as const, amount: groomRevenue },
    { type: "bride" as const, amount: brideRevenue },
  ];
  const typeTotal = groomRevenue + brideRevenue || 1;

  const byPlan = new Map<string, { count: number; amount: number }>();
  for (const c of clients) {
    const plan = c.clientPlan?.planNameSnapshot;
    if (!plan) continue;
    const amt = approvedInRange(c, inRange);
    const cur = byPlan.get(plan) ?? { count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += amt;
    byPlan.set(plan, cur);
  }
  const planRows = [...byPlan.entries()].sort((a, b) => b[1].amount - a[1].amount);

  const totalRevenue = byType.reduce((t, r) => t + r.amount, 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={Wallet}
          label="Revenue (period)"
          value={formatINR(totalRevenue)}
          accent="success"
        />
        <StatCard
          icon={TrendingUp}
          label="Groom revenue"
          value={formatINR(groomRevenue)}
          accent="groom"
        />
        <StatCard
          icon={TrendingUp}
          label="Bride revenue"
          value={formatINR(brideRevenue)}
          accent="bride"
        />
      </div>

      <ReportCard title="Revenue vs collections" icon={TrendingUp}>
        <RevenueChart data={series} />
      </ReportCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <ReportCard
          title="Client-type revenue"
          onExport={() =>
            downloadCsv(
              "revenue-by-type.csv",
              ["Type", "Revenue", "Share %"],
              byType.map((r) => [
                humanize(r.type),
                r.amount,
                ((r.amount / typeTotal) * 100).toFixed(1),
              ]),
            )
          }
        >
          <DataTable
            headers={["Type", "Revenue", "Share"]}
            align={[1, 2]}
            rows={byType.map((r) => [
              humanize(r.type),
              formatINR(r.amount),
              `${((r.amount / typeTotal) * 100).toFixed(0)}%`,
            ])}
          />
        </ReportCard>

        <ReportCard
          title="Package-wise revenue"
          onExport={() =>
            downloadCsv(
              "revenue-by-plan.csv",
              ["Plan", "Clients", "Revenue"],
              planRows.map(([plan, v]) => [plan, v.count, v.amount]),
            )
          }
        >
          <DataTable
            headers={["Plan", "Clients", "Revenue"]}
            align={[1, 2]}
            rows={planRows.map(([plan, v]) => [plan, v.count, formatINR(v.amount)])}
          />
        </ReportCard>
      </div>
    </div>
  );
}

// ---- Collections ------------------------------------------------------------

function CollectionsReport({
  clients,
  inRange,
}: {
  clients: ClientLite[];
  inRange: (d: string | Date | null) => boolean;
}) {
  const allInstallments = clients.flatMap((c) => c.clientPlan?.installments ?? []);
  const collected = allInstallments
    .filter((i) => i.status === "approved" && inRange(i.approvedAt))
    .reduce((t, i) => t + i.amount, 0);
  const due = allInstallments.filter((i) => inRange(i.dueDate)).reduce((t, i) => t + i.amount, 0);
  const rate = due ? Math.round((collected / due) * 100) : 0;

  const outstanding = clients
    .map((c) => {
      const ins = c.clientPlan?.installments ?? [];
      const amount = ins
        .filter((i) => i.status !== "approved" && i.status !== "waived")
        .reduce((t, i) => t + i.amount, 0);
      const overdue = ins.filter(isInstallmentOverdue).reduce((t, i) => t + i.amount, 0);
      return { id: c.id, name: c.name, amount, overdue };
    })
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const totalOutstanding = outstanding.reduce((t, r) => t + r.amount, 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={Wallet}
          label="Collected (period)"
          value={formatINR(collected)}
          accent="success"
        />
        <StatCard
          icon={Target}
          label="Collection rate"
          value={`${rate}%`}
          accent="info"
          footnote={`of ${formatINR(due)} due`}
        />
        <StatCard
          icon={TrendingUp}
          label="Total outstanding"
          value={formatINR(totalOutstanding)}
          accent="warning"
        />
      </div>

      <ReportCard
        title="Outstanding by client"
        icon={Wallet}
        onExport={() =>
          downloadCsv(
            "outstanding.csv",
            ["Client", "Outstanding", "Overdue"],
            outstanding.map((r) => [r.name, r.amount, r.overdue]),
          )
        }
      >
        <DataTable
          headers={["Client", "Outstanding", "Overdue"]}
          align={[1, 2]}
          rows={outstanding.map((r) => [
            r.name,
            formatINR(r.amount),
            r.overdue ? formatINR(r.overdue) : "—",
          ])}
        />
      </ReportCard>
    </div>
  );
}

// ---- Sales ------------------------------------------------------------------

function SalesReport({
  clients,
  inRange,
}: {
  clients: ClientLite[];
  inRange: (d: string | Date | null) => boolean;
}) {
  const leads = clients.filter((c) => inRange(c.createdAt));
  const conversions = clients.filter((c) => inRange(c.conversionDate));
  const convRate = leads.length
    ? Math.round((leads.filter((c) => c.status !== "lead").length / leads.length) * 100)
    : 0;
  const dealValue = conversions.reduce((t, c) => t + (c.clientPlan?.priceAtEnrollment ?? 0), 0);
  const avgDeal = conversions.length ? Math.round(dealValue / conversions.length) : 0;

  // Lead source analysis.
  const bySource = new Map<string, { leads: number; conversions: number }>();
  for (const c of clients) {
    const src = c.leadSource?.name ?? "Unknown";
    const cur = bySource.get(src) ?? { leads: 0, conversions: 0 };
    if (inRange(c.createdAt)) cur.leads += 1;
    if (inRange(c.conversionDate)) cur.conversions += 1;
    bySource.set(src, cur);
  }
  const sourceRows = [...bySource.entries()]
    .filter(([, v]) => v.leads || v.conversions)
    .sort((a, b) => b[1].conversions - a[1].conversions);

  // CRO-wise conversions.
  const byCro = new Map<string, { name: string; conversions: number; value: number }>();
  for (const c of conversions) {
    if (!c.convertedBy) continue;
    const cur = byCro.get(c.convertedBy.id) ?? {
      name: c.convertedBy.name,
      conversions: 0,
      value: 0,
    };
    cur.conversions += 1;
    cur.value += c.clientPlan?.priceAtEnrollment ?? 0;
    byCro.set(c.convertedBy.id, cur);
  }
  const croRows = [...byCro.values()].sort((a, b) => b.conversions - a.conversions);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={Target}
          label="Conversion rate"
          value={`${convRate}%`}
          accent="success"
          footnote={`${conversions.length} of ${leads.length} leads`}
        />
        <StatCard
          icon={TrendingUp}
          label="New sales value"
          value={formatINR(dealValue)}
          accent="primary"
        />
        <StatCard icon={Award} label="Avg deal size" value={formatINR(avgDeal)} accent="info" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ReportCard
          title="Lead source analysis"
          onExport={() =>
            downloadCsv(
              "lead-sources.csv",
              ["Source", "Leads", "Conversions", "Rate %"],
              sourceRows.map(([s, v]) => [
                s,
                v.leads,
                v.conversions,
                v.leads ? ((v.conversions / v.leads) * 100).toFixed(1) : "0",
              ]),
            )
          }
        >
          <DataTable
            headers={["Source", "Leads", "Conv.", "Rate"]}
            align={[1, 2, 3]}
            rows={sourceRows.map(([s, v]) => [
              s,
              v.leads,
              v.conversions,
              `${v.leads ? Math.round((v.conversions / v.leads) * 100) : 0}%`,
            ])}
          />
        </ReportCard>

        <ReportCard
          title="CRO-wise conversions"
          onExport={() =>
            downloadCsv(
              "cro-conversions.csv",
              ["CRO", "Conversions", "Value"],
              croRows.map((r) => [r.name, r.conversions, r.value]),
            )
          }
        >
          <DataTable
            headers={["CRO", "Conversions", "Value"]}
            align={[1, 2]}
            rows={croRows.map((r) => [r.name, r.conversions, formatINR(r.value)])}
          />
        </ReportCard>
      </div>
    </div>
  );
}

// ---- Performance ------------------------------------------------------------

function PerformanceReport({
  clients,
  staff,
  followUps,
  inRange,
}: {
  clients: ClientLite[];
  staff: { id: string; name: string; role: string }[];
  followUps: { croId: string; status: string }[];
  inRange: (d: string | Date | null) => boolean;
}) {
  const cros = staff.filter((s) => s.role === "cro");
  const croRows = cros.map((cro) => {
    const managed = clients.filter((c) => c.convertedById === cro.id).length;
    const conversions = clients.filter(
      (c) => c.convertedById === cro.id && inRange(c.conversionDate),
    ).length;
    const fu = followUps.filter((f) => f.croId === cro.id);
    const completion = fu.length
      ? Math.round((fu.filter((f) => f.status === "completed").length / fu.length) * 100)
      : 0;
    return { name: cro.name, managed, conversions, completion };
  });

  // Consultant performance — sessions completed in range + avg rating.
  const consultantRoles = new Set([
    "skincare_consultant",
    "fitness_trainer",
    "styling_consultant",
    "coach",
  ]);
  const consultants = staff.filter((s) => consultantRoles.has(s.role));
  const allSessions = clients.flatMap((c) => c.sessions);
  const consultantRows = consultants.map((con) => {
    const mine = allSessions.filter((s) => s.consultantId === con.id);
    const completed = mine.filter((s) => s.status === "completed" && inRange(s.actualDate)).length;
    const rated = mine.filter((s) => s.rating != null);
    const avg = rated.length
      ? (rated.reduce((t, s) => t + (s.rating ?? 0), 0) / rated.length).toFixed(1)
      : "—";
    return { name: con.name, role: con.role, completed, avg };
  });

  return (
    <div className="space-y-5">
      <ReportCard
        title="CRO performance"
        icon={Award}
        onExport={() =>
          downloadCsv(
            "cro-performance.csv",
            ["CRO", "Clients managed", "Conversions (period)", "Follow-up completion %"],
            croRows.map((r) => [r.name, r.managed, r.conversions, r.completion]),
          )
        }
      >
        <DataTable
          headers={["CRO", "Managed", "Conversions", "Follow-up rate"]}
          align={[1, 2, 3]}
          rows={croRows.map((r) => [r.name, r.managed, r.conversions, `${r.completion}%`])}
        />
      </ReportCard>

      <ReportCard
        title="Consultant performance"
        icon={Award}
        onExport={() =>
          downloadCsv(
            "consultant-performance.csv",
            ["Consultant", "Role", "Sessions completed", "Avg rating"],
            consultantRows.map((r) => [r.name, r.role, r.completed, r.avg]),
          )
        }
      >
        <DataTable
          headers={["Consultant", "Role", "Completed", "Avg rating"]}
          align={[2, 3]}
          rows={consultantRows.map((r) => [r.name, humanize(r.role), r.completed, r.avg])}
        />
      </ReportCard>
    </div>
  );
}

// ---- Expenses ---------------------------------------------------------------

function ExpensesReport({
  clients,
  expenses,
  inRange,
}: {
  clients: ClientLite[];
  expenses: ExpenseLite[];
  inRange: (d: string | Date | null) => boolean;
}) {
  const approved = expenses.filter((e) => e.status === "approved" && inRange(e.date));
  const totalExpense = approved.reduce((t, e) => t + e.amount, 0);

  const revenue = clients.reduce((t, c) => t + approvedInRange(c, inRange), 0);
  const profit = revenue - totalExpense;

  const byCategory = new Map<string, number>();
  for (const e of approved) {
    const cat = e.category?.name ?? "Uncategorised";
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + e.amount);
  }
  const categoryRows = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);

  const byPayee = new Map<string, { name: string; amount: number }>();
  for (const e of approved) {
    if (!e.payee) continue;
    const cur = byPayee.get(e.payee.id) ?? { name: e.payee.name, amount: 0 };
    cur.amount += e.amount;
    byPayee.set(e.payee.id, cur);
  }
  const payeeRows = [...byPayee.values()].sort((a, b) => b.amount - a.amount);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={Wallet}
          label="Revenue (period)"
          value={formatINR(revenue)}
          accent="success"
        />
        <StatCard
          icon={Receipt}
          label="Expenses (period)"
          value={formatINR(totalExpense)}
          accent="warning"
        />
        <StatCard
          icon={TrendingUp}
          label="Net profit"
          value={formatINR(profit)}
          accent={profit >= 0 ? "success" : "danger"}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ReportCard
          title="Spend by category"
          icon={Receipt}
          onExport={() =>
            downloadCsv(
              "expenses-by-category.csv",
              ["Category", "Amount"],
              categoryRows.map(([c, a]) => [c, a]),
            )
          }
        >
          <DataTable
            headers={["Category", "Amount"]}
            align={[1]}
            rows={categoryRows.map(([c, a]) => [c, formatINR(a)])}
          />
        </ReportCard>

        <ReportCard
          title="Consultant payouts"
          icon={Award}
          onExport={() =>
            downloadCsv(
              "consultant-payouts.csv",
              ["Payee", "Amount"],
              payeeRows.map((r) => [r.name, r.amount]),
            )
          }
        >
          <DataTable
            headers={["Payee", "Amount"]}
            align={[1]}
            rows={payeeRows.map((r) => [r.name, formatINR(r.amount)])}
          />
        </ReportCard>
      </div>
    </div>
  );
}

// ---- Operations -------------------------------------------------------------

function OperationsReport({
  clients,
  stylingOps,
  tasks,
  inRange,
}: {
  clients: ClientLite[];
  stylingOps: { status: string }[];
  tasks: { status: string }[];
  inRange: (d: string | Date | null) => boolean;
}) {
  const allSessions = clients.flatMap((c) => c.sessions);
  const inPeriod = allSessions.filter((s) => inRange(s.actualDate ?? s.scheduledDate));
  const completed = inPeriod.filter((s) => s.status === "completed").length;
  const sessionRate = inPeriod.length ? Math.round((completed / inPeriod.length) * 100) : 0;

  const taskDone = tasks.filter((t) => t.status === "completed").length;
  const taskRate = tasks.length ? Math.round((taskDone / tasks.length) * 100) : 0;

  const styling = {
    upcoming: stylingOps.filter((o) => o.status === "upcoming").length,
    in_progress: stylingOps.filter((o) => o.status === "in_progress").length,
    completed: stylingOps.filter((o) => o.status === "completed").length,
  };

  // Per-service completion breakdown.
  const serviceRows = (["skincare", "fitness", "styling"] as ServiceType[]).map((svc) => {
    const all = inPeriod.filter((s) => s.serviceType === svc);
    const done = all.filter((s) => s.status === "completed").length;
    return { svc, all: all.length, done };
  });

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={Activity}
          label="Session completion"
          value={`${sessionRate}%`}
          accent="success"
          footnote={`${completed} of ${inPeriod.length}`}
        />
        <StatCard
          icon={Target}
          label="Task completion"
          value={`${taskRate}%`}
          accent="info"
          footnote={`${taskDone} of ${tasks.length}`}
        />
        <StatCard
          icon={Award}
          label="Styling completed"
          value={styling.completed}
          accent="bride"
          footnote={`${styling.upcoming} upcoming · ${styling.in_progress} in progress`}
        />
      </div>

      <ReportCard
        title="Session completion by service"
        icon={Activity}
        onExport={() =>
          downloadCsv(
            "session-completion.csv",
            ["Service", "Total", "Completed", "Rate %"],
            serviceRows.map((r) => [
              SERVICE_TYPE_LABELS[r.svc],
              r.all,
              r.done,
              r.all ? ((r.done / r.all) * 100).toFixed(0) : "0",
            ]),
          )
        }
      >
        <DataTable
          headers={["Service", "Total", "Completed", "Rate"]}
          align={[1, 2, 3]}
          rows={serviceRows.map((r) => [
            SERVICE_TYPE_LABELS[r.svc],
            r.all,
            r.done,
            `${r.all ? Math.round((r.done / r.all) * 100) : 0}%`,
          ])}
        />
      </ReportCard>
    </div>
  );
}

// ---- helpers ----------------------------------------------------------------

function sameMonth(d: string | Date, year: number, month: number): boolean {
  const x = asDate(d);
  return x.getFullYear() === year && x.getMonth() === month;
}
