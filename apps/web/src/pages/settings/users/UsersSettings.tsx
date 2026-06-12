import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, Send, Check, Copy, RefreshCw } from "lucide-react";
import {
  useFindManyUser,
  useUpdateUser,
  useFindManyAssignment,
  useFindManyConsultantRate,
  useUpsertConsultantRate,
} from "@gtb/db/hooks";
import {
  STAFF_ROLES,
  STAFF_ROLE_LABELS,
  CONSULTANT_ROLES,
  SERVICE_TYPE_LABELS,
  formatINR,
  type ServiceType,
  type StaffRole,
} from "@gtb/shared";
import { inviteStaff, type InviteResult } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, Button, Field, Input, Modal, Select, Spinner } from "@/components/ui";

const staffSchema = z.object({
  name: z.string().min(1, "Required"),
  email: z.string().email("Enter a valid email"),
  phone: z.string().optional(),
  role: z.enum(STAFF_ROLES),
});
type StaffFormValues = z.infer<typeof staffSchema>;

/** Maps a consultant role to the service their per-session rate applies to. */
const ROLE_TO_SERVICE: Partial<Record<StaffRole, ServiceType>> = {
  skincare_consultant: "skincare",
  fitness_trainer: "fitness",
  styling_consultant: "styling",
};

export function UsersSettings() {
  const {
    data: users,
    isLoading,
    refetch,
  } = useFindManyUser({
    where: { role: { not: "client" } },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  const { data: assignments } = useFindManyAssignment({
    where: { isActive: true },
    select: { staffId: true, clientId: true },
  });
  const { data: rates } = useFindManyConsultantRate();
  const updateUser = useUpdateUser();

  const workload = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const a of assignments ?? []) {
      if (!m.has(a.staffId)) m.set(a.staffId, new Set());
      m.get(a.staffId)!.add(a.clientId);
    }
    return m;
  }, [assignments]);

  const rateByUser = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rates ?? []) m.set(`${r.userId}:${r.serviceType}`, r.amount);
    return m;
  }, [rates]);

  const [modal, setModal] = useState<"new" | { userId: string } | null>(null);
  const [resendResult, setResendResult] = useState<{
    name: string;
    url: string;
  } | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  async function resendInvite(u: { id: string; name: string; email: string; phone: string | null; role: string }) {
    setResendingId(u.id);
    try {
      const res = await inviteStaff({
        name: u.name,
        email: u.email,
        phone: u.phone || undefined,
        role: u.role,
      });
      setResendResult({ name: u.name, url: res.registrationUrl });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to resend invite");
    } finally {
      setResendingId(null);
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    await updateUser.mutateAsync({ where: { id }, data: { isActive: !isActive } });
  }

  const editing =
    typeof modal === "object" && modal ? users?.find((u) => u.id === modal.userId) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Team & Users</h2>
          <p className="text-sm text-muted-foreground">
            Invite staff, manage roles, deactivate accounts, and set consultant rates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void refetch()}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
            aria-label="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <Button onClick={() => setModal("new")}>
            <Plus className="h-4 w-4" /> Invite staff
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6 text-muted-foreground" />
        </div>
      ) : (
        <div className="card divide-y divide-border">
          {users?.map((u) => {
            const role = u.role as StaffRole;
            const service = ROLE_TO_SERVICE[role];
            const rate = service ? rateByUser.get(`${u.id}:${service}`) : undefined;
            return (
              <div key={u.id} className="flex items-center gap-4 px-4 py-3">
                <Avatar name={u.name} src={u.avatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{u.name}</p>
                    {!u.isActive && <Badge tone="neutral">Deactivated</Badge>}
                    {!u.authId && u.isActive && <Badge tone="warning">Invite pending</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {u.email}
                    {u.phone && ` · ${u.phone}`}
                  </p>
                </div>
                <div className="hidden text-right sm:block">
                  <Badge tone="info">{STAFF_ROLE_LABELS[role]}</Badge>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {workload.get(u.id)?.size ?? 0} active clients
                    {rate != null && ` · ${formatINR(rate)}/session`}
                  </p>
                </div>
                <div className="flex gap-1">
                  {!u.authId && u.isActive && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void resendInvite(u)}
                      loading={resendingId === u.id}
                    >
                      <Send className="h-3.5 w-3.5" /> Resend invite
                    </Button>
                  )}
                  <button
                    onClick={() => setModal({ userId: u.id })}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                    aria-label="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  {u.role !== "founder" && (
                    <Button
                      size="sm"
                      variant={u.isActive ? "ghost" : "outline"}
                      onClick={() => void toggleActive(u.id, u.isActive)}
                    >
                      {u.isActive ? "Deactivate" : "Reactivate"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal === "new" && (
        <InviteStaffModal onClose={() => setModal(null)} onDone={() => void refetch()} />
      )}
      {editing && (
        <EditStaffModal
          user={editing}
          rateByUser={rateByUser}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            void refetch();
          }}
        />
      )}
      {resendResult && (
        <InviteLinkModal
          name={resendResult.name}
          url={resendResult.url}
          onClose={() => setResendResult(null)}
        />
      )}
    </div>
  );
}

function InviteStaffModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [result, setResult] = useState<InviteResult>();
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<StaffFormValues>({
    resolver: zodResolver(staffSchema),
    defaultValues: { name: "", email: "", phone: "", role: "cro" },
  });

  async function onSubmit(values: StaffFormValues) {
    setSending(true);
    setError(undefined);
    try {
      const res = await inviteStaff({
        name: values.name,
        email: values.email,
        phone: values.phone || undefined,
        role: values.role,
      });
      setResult(res);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to invite");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Invite staff member"
      size="sm"
      footer={
        result ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="staff-invite-form" loading={sending}>
              <Send className="h-4 w-4" /> Send invite
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success/15 text-success">
              <Check className="h-4 w-4" />
            </span>
            {result.emailed ? "Invitation emailed" : "Account created — share this link"}
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
            <code className="flex-1 truncate text-xs text-muted-foreground">
              {result.registrationUrl}
            </code>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(result.registrationUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium hover:bg-muted"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-success" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      ) : (
        <form id="staff-invite-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field label="Full name" error={errors.name?.message} required>
            <Input {...register("name")} autoFocus />
          </Field>
          <Field label="Email" error={errors.email?.message} required>
            <Input type="email" {...register("email")} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Phone">
              <Input {...register("phone")} />
            </Field>
            <Field label="Role" required>
              <Select {...register("role")}>
                {STAFF_ROLES.filter((r) => r !== "founder").map((r) => (
                  <option key={r} value={r}>
                    {STAFF_ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
        </form>
      )}
    </Modal>
  );
}

function EditStaffModal({
  user,
  rateByUser,
  onClose,
  onDone,
}: {
  user: { id: string; name: string; phone: string | null; role: string };
  rateByUser: Map<string, number>;
  onClose: () => void;
  onDone: () => void;
}) {
  const updateUser = useUpdateUser();
  const upsertRate = useUpsertConsultantRate();

  const role = user.role as StaffRole;
  const isConsultant = (CONSULTANT_ROLES as readonly string[]).includes(role);
  const service = ROLE_TO_SERVICE[role];

  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [newRole, setNewRole] = useState<string>(user.role);
  const [rate, setRate] = useState<string>(
    service ? String(rateByUser.get(`${user.id}:${service}`) ?? "") : "",
  );
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(undefined);
    try {
      await updateUser.mutateAsync({
        where: { id: user.id },
        data: {
          name: name.trim(),
          phone: phone.trim() || null,
          ...(user.role !== "founder" ? { role: newRole as StaffRole } : {}),
        },
      });
      if (isConsultant && service && rate.trim()) {
        await upsertRate.mutateAsync({
          where: { userId_serviceType: { userId: user.id, serviceType: service } },
          create: { userId: user.id, serviceType: service, amount: Number(rate) },
          update: { amount: Number(rate) },
        });
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${user.name}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Full name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Role">
            <Select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              disabled={user.role === "founder"}
            >
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>
                  {STAFF_ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {isConsultant && service && (
          <Field
            label={`Per-session rate — ${SERVICE_TYPE_LABELS[service]} (₹)`}
            hint="Used to auto-create a payout expense when a session is completed."
          >
            <Input type="number" min={0} value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

function InviteLinkModal({
  name,
  url,
  onClose,
}: {
  name: string;
  url: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <Modal open onClose={onClose} title={`Invite link — ${name}`} size="sm" footer={<Button onClick={onClose}>Done</Button>}>
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          A fresh invite has been emailed. You can also share this link directly:
        </p>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
          <code className="flex-1 truncate text-xs text-muted-foreground">{url}</code>
          <button
            onClick={() => {
              void navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium hover:bg-muted"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
