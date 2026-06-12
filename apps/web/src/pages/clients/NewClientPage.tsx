import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Check, UserPlus } from "lucide-react";
import { useCreateClient, useFindManyLeadSource } from "@gtb/db/hooks";
import { CLIENT_TYPES, CLIENT_TYPE_LABELS, generateClientCode, type ClientType } from "@gtb/shared";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { InviteClientPanel } from "./InviteClientPanel";
import { leadSchema, emptyLead, type LeadFormValues } from "./leadSchema";

interface CreatedLead {
  id: string;
  name: string;
  clientCode: string;
  type: ClientType;
}

export function NewClientPage() {
  const navigate = useNavigate();
  const { data: leadSources } = useFindManyLeadSource({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
  const createClient = useCreateClient();
  const [created, setCreated] = useState<CreatedLead>();
  const [error, setError] = useState<string>();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: emptyLead,
  });

  async function onSubmit(values: LeadFormValues) {
    setError(undefined);
    const base = {
      name: values.name.trim(),
      phone: values.phone.trim(),
      email: values.email.trim().toLowerCase(),
      type: values.type,
      weddingDate: new Date(values.weddingDate),
      city: values.city.trim(),
      leadSourceId: values.leadSourceId || undefined,
      notes: values.notes?.trim() || undefined,
    };

    // clientCode is random; retry the rare unique collision.
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const client = await createClient.mutateAsync({
          data: { ...base, clientCode: generateClientCode(values.type) },
        });
        if (!client) {
          setError("Failed to create lead");
          return;
        }
        setCreated({
          id: client.id,
          name: client.name,
          clientCode: client.clientCode,
          type: client.type,
        });
        return;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (/unique|clientcode|already exists/i.test(msg) && attempt < 3) continue;
        setError(msg || "Failed to create lead");
        return;
      }
    }
  }

  if (created) {
    return (
      <div className="p-6">
        <PageHeader title="Lead created" subtitle={`${created.name} · ${created.clientCode}`} />
        <div className="mt-6 max-w-xl space-y-5">
          <div className="card flex items-start gap-3 p-4">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
              <Check className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">{CLIENT_TYPE_LABELS[created.type]} lead added</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Invite them to register and complete their onboarding assessment.
              </p>
            </div>
          </div>

          <div className="card p-4">
            <h3 className="mb-3 text-sm font-semibold">Send registration invite</h3>
            <InviteClientPanel clientId={created.id} />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/clients")}>
              Go to leads
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setCreated(undefined);
                setError(undefined);
              }}
            >
              <UserPlus className="h-4 w-4" /> Add another
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <Link
        to="/clients"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Leads
      </Link>
      <PageHeader
        title="New lead"
        subtitle="Capture a prospect, then send them a registration invite."
      />

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 max-w-xl space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Field label="Full name" error={errors.name?.message} required>
              <Input {...register("name")} placeholder="Rahul Sharma" autoFocus />
            </Field>
          </div>
          <Field label="Phone" error={errors.phone?.message} required>
            <Input {...register("phone")} placeholder="+91 98765 43210" inputMode="tel" />
          </Field>
          <Field label="Email" error={errors.email?.message} required>
            <Input {...register("email")} type="email" placeholder="rahul@example.com" />
          </Field>
          <Field label="Program" required>
            <Select {...register("type")}>
              {CLIENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CLIENT_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Wedding date" error={errors.weddingDate?.message} required>
            <Input {...register("weddingDate")} type="date" />
          </Field>
          <Field label="City" error={errors.city?.message} required>
            <Input {...register("city")} placeholder="Bengaluru" />
          </Field>
          <Field label="Lead source">
            <Select {...register("leadSourceId")}>
              <option value="">—</option>
              {leadSources?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="col-span-2">
            <Field label="Notes">
              <Textarea
                {...register("notes")}
                rows={2}
                placeholder="Context from the first conversation…"
              />
            </Field>
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-danger/10 px-4 py-2 text-sm text-danger">{error}</div>
        )}

        <div className="flex gap-2">
          <Button type="submit" loading={createClient.isPending}>
            Create lead
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate("/clients")}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
