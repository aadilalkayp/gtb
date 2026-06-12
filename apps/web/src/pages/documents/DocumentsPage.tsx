import { useMemo, useState } from "react";
import { FolderOpen, Plus, Search } from "lucide-react";
import { useFindManyDocument, useFindManyClient } from "@gtb/db/hooks";
import { DOCUMENT_TYPES, humanize, type DocumentType } from "@gtb/shared";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { DocumentRow } from "@/components/DocumentRow";
import { FileUploadField } from "@/components/FileUploadField";
import { Button, Field, Input, Modal, Select, Spinner } from "@/components/ui";

interface DocRow {
  id: string;
  type: string;
  fileName: string;
  fileSize: number;
  createdAt: Date | string;
  client: { id: string; name: string; clientCode: string };
}

export function DocumentsPage() {
  const [type, setType] = useState<"all" | DocumentType>("all");
  const [query, setQuery] = useState("");
  const [showUpload, setShowUpload] = useState(false);

  const { data, isLoading, refetch } = useFindManyDocument({
    include: { client: { select: { id: true, name: true, clientCode: true } } },
    orderBy: { createdAt: "desc" },
  });

  const docs = (data ?? []) as unknown as DocRow[];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs.filter((d) => {
      if (type !== "all" && d.type !== type) return false;
      if (!q) return true;
      return (
        d.fileName.toLowerCase().includes(q) ||
        d.client.name.toLowerCase().includes(q) ||
        d.client.clientCode.toLowerCase().includes(q)
      );
    });
  }, [docs, type, query]);

  return (
    <div className="p-6">
      <PageHeader
        title="Documents"
        subtitle="Plans, guides, receipts, and proofs across every client."
        actions={
          <Button onClick={() => setShowUpload(true)}>
            <Plus className="h-4 w-4" /> Upload
          </Button>
        }
      />

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by file or client…"
            className="pl-9"
          />
        </div>
        <Select
          value={type}
          onChange={(e) => setType(e.target.value as "all" | DocumentType)}
          className="w-auto min-w-[180px]"
        >
          <option value="all">All types</option>
          {DOCUMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {humanize(t)}
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-5">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6 text-muted-foreground" />
          </div>
        ) : !filtered.length ? (
          <EmptyState
            icon={FolderOpen}
            title={docs.length ? "No matching documents" : "No documents yet"}
            hint={
              docs.length
                ? "Try a different type or search term."
                : "Plans and receipts uploaded across the system show up here."
            }
          />
        ) : (
          <div className="card divide-y divide-border">
            {filtered.map((d) => (
              <DocumentRow key={d.id} doc={d} meta={d.client.name} />
            ))}
          </div>
        )}
      </div>

      {showUpload && (
        <UploadDocumentModal
          onClose={() => setShowUpload(false)}
          onDone={() => {
            setShowUpload(false);
            void refetch();
          }}
        />
      )}
    </div>
  );
}

function UploadDocumentModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { data: clients } = useFindManyClient({
    where: { status: { in: ["lead", "converted", "active"] } },
    select: { id: true, name: true, clientCode: true },
    orderBy: { name: "asc" },
  });

  const [clientId, setClientId] = useState("");
  const [type, setType] = useState<DocumentType>("consultation_notes");
  const [uploaded, setUploaded] = useState(false);

  return (
    <Modal
      open
      onClose={onClose}
      title="Upload document"
      size="sm"
      footer={
        <Button onClick={uploaded ? onDone : onClose} variant={uploaded ? "primary" : "outline"}>
          {uploaded ? "Done" : "Cancel"}
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Client" required>
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">— Select —</option>
            {clients?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.clientCode})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Type" required>
          <Select value={type} onChange={(e) => setType(e.target.value as DocumentType)}>
            {DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </Select>
        </Field>
        {clientId ? (
          <Field label="File">
            <FileUploadField
              key={`${clientId}-${type}`}
              clientId={clientId}
              type={type}
              label="Choose a file"
              onUploaded={(doc) => setUploaded(Boolean(doc))}
            />
          </Field>
        ) : (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            Pick a client first to enable the upload.
          </p>
        )}
      </div>
    </Modal>
  );
}
