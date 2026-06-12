import { useState } from "react";
import { FileText, Image, ExternalLink } from "lucide-react";
import { humanize, formatDate } from "@gtb/shared";
import { getDocumentUrl } from "@/lib/api";
import { Badge, Spinner } from "@/components/ui";

function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** One document line: type icon, name, meta, opens via a signed URL. */
export function DocumentRow({
  doc,
  meta,
}: {
  doc: {
    id: string;
    type: string;
    fileName: string;
    fileSize: number;
    createdAt: Date | string;
  };
  /** Extra context line (e.g. client name for the staff library). */
  meta?: string;
}) {
  const [opening, setOpening] = useState(false);
  const isImage = /\.(jpe?g|png|webp|heic)$/i.test(doc.fileName);
  const Icon = isImage ? Image : FileText;

  async function open() {
    setOpening(true);
    try {
      const url = await getDocumentUrl(doc.id);
      window.open(url, "_blank", "noopener");
    } finally {
      setOpening(false);
    }
  }

  return (
    <button
      onClick={open}
      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{doc.fileName}</span>
        <span className="block text-xs text-muted-foreground">
          {meta ? `${meta} · ` : ""}
          {prettySize(doc.fileSize)} · {formatDate(doc.createdAt)}
        </span>
      </span>
      <Badge tone="neutral">{humanize(doc.type)}</Badge>
      {opening ? (
        <Spinner className="h-4 w-4 text-muted-foreground" />
      ) : (
        <ExternalLink className="h-4 w-4 text-muted-foreground" />
      )}
    </button>
  );
}
