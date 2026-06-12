import { useState } from "react";
import { useFindUniqueClient, useUpdateClient, useUpdateUser } from "@gtb/db/hooks";
import { CLIENT_TYPE_LABELS, formatDate, humanize, type ClientType } from "@gtb/shared";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, Button, Field, Input } from "@/components/ui";
import { FullPageSpinner } from "@/components/ui/Spinner";

export function PortalProfile() {
  const { user, refetchUser } = useAuth();
  const clientId = user?.client?.id;

  const {
    data: client,
    isLoading,
    refetch,
  } = useFindUniqueClient(
    {
      where: { id: clientId ?? "" },
      include: { assessment: true },
    },
    { enabled: Boolean(clientId) },
  );

  if (isLoading || !client || !user) return <FullPageSpinner />;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">My profile</h1>

      <section className="card flex items-center gap-4 p-5">
        <Avatar name={client.name} size="lg" />
        <div>
          <p className="font-semibold">{client.name}</p>
          <p className="text-sm text-muted-foreground">
            {CLIENT_TYPE_LABELS[client.type as ClientType]} · {client.clientCode}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Wedding {formatDate(client.weddingDate)} · {client.city}
          </p>
        </div>
      </section>

      <ContactCard
        userId={user.id}
        clientId={client.id}
        initialName={client.name}
        initialPhone={client.phone}
        email={client.email}
        onSaved={() => {
          void refetch();
          refetchUser();
        }}
      />

      <PasswordCard />

      {client.assessment?.completedAt && (
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Assessment summary</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Shared with your team · completed {formatDate(client.assessment.completedAt)}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {client.assessment.skinType && (
              <SummaryItem label="Skin type" value={humanize(client.assessment.skinType)} />
            )}
            {client.assessment.skinConcerns.length > 0 && (
              <SummaryItem
                label="Skin concerns"
                value={client.assessment.skinConcerns.map(humanize).join(", ")}
              />
            )}
            {client.assessment.fitnessLevel && (
              <SummaryItem label="Fitness level" value={humanize(client.assessment.fitnessLevel)} />
            )}
            {client.assessment.fitnessGoals.length > 0 && (
              <SummaryItem
                label="Fitness goals"
                value={client.assessment.fitnessGoals.map(humanize).join(", ")}
              />
            )}
            {client.assessment.heightCm != null && client.assessment.weightKg != null && (
              <SummaryItem
                label="Height / weight"
                value={`${client.assessment.heightCm} cm · ${client.assessment.weightKg} kg`}
              />
            )}
            {client.assessment.stylePreferences.length > 0 && (
              <SummaryItem
                label="Style"
                value={client.assessment.stylePreferences.map(humanize).join(", ")}
              />
            )}
            {client.assessment.outfitBudgetRange && (
              <SummaryItem
                label="Outfit budget"
                value={humanize(client.assessment.outfitBudgetRange)}
              />
            )}
            {client.assessment.dietaryPreference && (
              <SummaryItem label="Diet" value={humanize(client.assessment.dietaryPreference)} />
            )}
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            Need to update something? Mention it to your coach at the next session.
          </p>
        </section>
      )}
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

function ContactCard({
  userId,
  clientId,
  initialName,
  initialPhone,
  email,
  onSaved,
}: {
  userId: string;
  clientId: string;
  initialName: string;
  initialPhone: string;
  email: string;
  onSaved: () => void;
}) {
  const updateUser = useUpdateUser();
  const updateClient = useUpdateClient();
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();

  const dirty = name.trim() !== initialName || phone.trim() !== initialPhone;

  async function save() {
    setError(undefined);
    setSaved(false);
    try {
      await updateUser.mutateAsync({
        where: { id: userId },
        data: { name: name.trim(), phone: phone.trim() || null },
      });
      await updateClient.mutateAsync({
        where: { id: clientId },
        data: { name: name.trim(), phone: phone.trim() },
      });
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  }

  return (
    <section className="card space-y-4 p-5">
      <h2 className="text-sm font-semibold">Contact details</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Phone">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Email" hint="Contact your coordinator to change your email.">
          <Input value={email} disabled />
        </Field>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex items-center gap-3">
        <Button
          onClick={save}
          disabled={!dirty || !name.trim()}
          loading={updateUser.isPending || updateClient.isPending}
        >
          Save changes
        </Button>
        {saved && !dirty && <Badge tone="success">Saved</Badge>}
      </div>
    </section>
  );
}

function PasswordCard() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string>();

  async function change() {
    setError(undefined);
    setDone(false);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setPassword("");
    setConfirm("");
    setDone(true);
  }

  return (
    <section className="card space-y-4 p-5">
      <h2 className="text-sm font-semibold">Change password</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="New password">
          <Input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Confirm password">
          <Input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex items-center gap-3">
        <Button onClick={change} disabled={!password || !confirm} loading={busy}>
          Update password
        </Button>
        {done && <Badge tone="success">Password updated</Badge>}
      </div>
    </section>
  );
}
