import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardList,
  Download,
  ExternalLink,
  Footprints,
  Glasses,
  ImageOff,
  Maximize2,
  Scissors,
  Shirt,
  ShoppingBag,
  UserRound,
  X,
} from "lucide-react";
import {
  STYLING_ITEM_PRIORITY_LABELS,
  formatDate,
  snapshotSectionHasContent,
  type BlueprintSnapshot,
  type StylingItemKind,
} from "@gtb/shared";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Renders a Styling Blueprint snapshot: the client portal's published view
 * and the stylist's "Preview client view" use this same component, so the
 * preview is exactly what the client gets. Sections with no content are
 * hidden, matching the publish rule.
 */
export type BlueprintArea = "home" | "style" | "looks" | "hair" | "shopping";

export interface BlueprintViewProps {
  snapshot: BlueprintSnapshot;
  images: Record<string, string | null | undefined>;
  stylistName?: string | null;
  publishedAt?: string | Date | null;
  checkedEssentialIds?: string[];
  /** Absent in preview / archived: essentials render read-only. */
  onToggleEssential?: (id: string, checked: boolean) => void;
  /** Absent when there is no PDF yet. */
  onDownloadPdf?: () => void;
  pdfLoading?: boolean;
  /** Small print under the home cards (e.g. how to reach the stylist). */
  footer?: React.ReactNode;
  initialArea?: BlueprintArea;
}

export function BlueprintView(props: BlueprintViewProps) {
  const [area, setArea] = useState<BlueprintArea>(props.initialArea ?? "home");
  const has = snapshotSectionHasContent(props.snapshot);
  const back = () => setArea("home");

  if (area === "style") return <MyStyle {...props} onBack={back} />;
  if (area === "looks") return <MyLooks {...props} onBack={back} />;
  if (area === "hair") return <HairGrooming {...props} onBack={back} />;
  if (area === "shopping") return <ShoppingList {...props} onBack={back} />;

  const s = props.snapshot;
  const kinds = (k: StylingItemKind) => s.items.filter((i) => i.kind === k).length;
  const shoppingCount = kinds("product") + kinds("footwear") + kinds("eyewear");
  const cards: {
    id: BlueprintArea;
    title: string;
    hint: string;
    icon: typeof Shirt;
    show: boolean;
  }[] = [
    {
      id: "style",
      title: "My Style",
      hint: has.colours ? "Your profile and colours" : "Your style profile",
      icon: UserRound,
      show: has.profile || has.colours,
    },
    {
      id: "looks",
      title: "My Looks",
      hint: s.looks.length
        ? `${s.looks.length} ${s.looks.length === 1 ? "look" : "looks"} for your events`
        : "Outfit ideas for you",
      icon: Shirt,
      show: has.looks || has.outfits,
    },
    {
      id: "hair",
      title: "Hair & Grooming",
      hint: "Your look and barber brief",
      icon: Scissors,
      show: has.hair,
    },
    {
      id: "shopping",
      title: "Shopping List",
      hint:
        [
          shoppingCount ? `${shoppingCount} ${shoppingCount === 1 ? "item" : "items"}` : null,
          has.essentials ? "essentials" : null,
        ]
          .filter(Boolean)
          .join(" and ") || "Your list",
      icon: ShoppingBag,
      show: has.shopping || has.footwear || has.eyewear || has.essentials,
    },
  ];

  return (
    <div className="animate-fade-up space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-display">
          Your Style Blueprint
        </h1>
        {(props.publishedAt || props.stylistName) && (
          <p className="mt-1 text-sm text-muted-foreground">
            {props.publishedAt ? `Published ${formatDate(props.publishedAt)}` : "Draft"}
            {props.stylistName ? ` by ${props.stylistName}` : ""}
          </p>
        )}
      </div>

      {has.direction && (
        <section className="card space-y-3 border-transparent bg-primary/[0.06] p-5 shadow-none">
          {s.direction.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {s.direction.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-primary/20 bg-surface px-3 py-1 text-sm font-medium text-primary"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          {s.direction.description && (
            <p className="text-sm leading-relaxed">{s.direction.description}</p>
          )}
        </section>
      )}

      <div className="stagger-children grid grid-cols-2 gap-3">
        {cards
          .filter((c) => c.show)
          .map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setArea(c.id)}
              className="card group flex flex-col items-start gap-2 p-4 text-left transition-[box-shadow,border-color,transform] duration-150 ease-out-strong hover:border-border-strong hover:shadow-md active:scale-[0.99]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <c.icon className="h-[18px] w-[18px]" />
              </span>
              <span className="font-semibold">{c.title}</span>
              <span className="text-xs text-muted-foreground">{c.hint}</span>
              <ArrowRight className="mt-auto h-4 w-4 self-end text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          ))}
      </div>

      {props.onDownloadPdf && (
        <button
          type="button"
          onClick={props.onDownloadPdf}
          disabled={props.pdfLoading}
          className="flex w-full items-center justify-center gap-2 rounded-card border border-border bg-surface py-3 text-sm font-medium transition-colors hover:border-border-strong disabled:opacity-60"
        >
          <Download className="h-4 w-4" />{" "}
          {props.pdfLoading ? "Preparing PDF..." : "Download Blueprint PDF"}
        </button>
      )}
      {props.footer}
    </div>
  );
}

// ---- Building blocks ------------------------------------------------------------

function AreaHeader({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to your Blueprint"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface transition-colors hover:border-border-strong"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <div>
        <h1 className="font-display text-xl font-semibold tracking-display">{title}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

export function BlueprintImage({
  src,
  alt,
  className,
  edited,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  edited?: boolean;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg bg-muted", className)}>
      {src ? (
        <img src={src} alt={alt} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <ImageOff className="h-5 w-5" />
        </div>
      )}
      {src && edited && (
        <span className="absolute bottom-1.5 left-1.5 rounded-full bg-surface/90 px-2 py-0.5 text-[10px] font-semibold text-primary">
          Edited by your stylist
        </span>
      )}
    </div>
  );
}

function Swatches({ colors, size = "md" }: { colors: string[]; size?: "sm" | "md" }) {
  return (
    <span className="flex">
      {colors.map((c, i) => (
        <span
          key={`${c}-${i}`}
          className={cn(
            "rounded-full border-2 border-surface ring-1 ring-border",
            size === "sm" ? "h-4 w-4" : "h-5 w-5",
            i > 0 && "-ml-1.5",
          )}
          style={{ backgroundColor: c }}
          title={c}
        />
      ))}
    </span>
  );
}

function Quote({ children }: { children: React.ReactNode }) {
  return <p className="border-l-2 border-primary pl-3 text-sm italic">"{children}"</p>;
}

function Chips<T extends string>({
  options,
  active,
  onChange,
}: {
  options: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  if (options.length <= 2) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
            active === o.id
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-surface text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---- My Style -------------------------------------------------------------------

function MyStyle({ snapshot, onBack }: BlueprintViewProps & { onBack: () => void }) {
  const p = snapshot.profile;
  const rows: [string, React.ReactNode][] = [
    ["Face shape", p.faceShape],
    [
      "Skin tone",
      p.skinTone && (
        <span className="flex items-center gap-1.5">
          {p.skinToneHex && (
            <span
              className="h-3.5 w-3.5 rounded-full ring-1 ring-border"
              style={{ backgroundColor: p.skinToneHex }}
            />
          )}
          {p.skinTone}
        </span>
      ),
    ],
    ["Hair type", p.hairType],
    ["Beard type", p.beardType],
    ["Build", p.bodyType],
    ["Height", p.heightCm ? `${p.heightCm} cm` : null],
  ];
  const shown = rows.filter(([, v]) => v);
  return (
    <div className="animate-fade-up space-y-5">
      <AreaHeader title="My Style" subtitle="Your profile and colour direction" onBack={onBack} />
      {shown.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Your profile</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {shown.map(([label, v]) => (
              <div key={label} className="rounded-lg border border-border bg-surface px-3 py-2.5">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-0.5 text-sm font-semibold">{v}</p>
              </div>
            ))}
          </div>
        </section>
      )}
      {(p.existingStyle || p.stylePreferences) && (
        <section className="card space-y-2 p-4 text-sm">
          {p.existingStyle && (
            <p>
              <span className="text-muted-foreground">How you dress today: </span>
              {p.existingStyle}
            </p>
          )}
          {p.stylePreferences && (
            <p>
              <span className="text-muted-foreground">What you like: </span>
              {p.stylePreferences}
            </p>
          )}
        </section>
      )}
      {snapshot.palettes.length > 0 && (
        <section className="card p-4">
          <h2 className="text-sm font-semibold">Your colours</h2>
          <div className="mt-2 divide-y divide-border">
            {snapshot.palettes.map((pal) => (
              <div key={pal.id} className="flex items-center gap-3 py-2.5">
                <Swatches colors={pal.colors} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{pal.label}</p>
                  {pal.notes && <p className="text-xs text-muted-foreground">{pal.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ---- My Looks -------------------------------------------------------------------

function MyLooks({ snapshot, images, onBack }: BlueprintViewProps & { onBack: () => void }) {
  const events = useMemo(
    () => [
      ...new Set(snapshot.looks.map((l) => l.eventLabel).filter((e): e is string => Boolean(e))),
    ],
    [snapshot.looks],
  );
  const [filter, setFilter] = useState<string>("all");
  const looks =
    filter === "all" ? snapshot.looks : snapshot.looks.filter((l) => l.eventLabel === filter);
  const outfits = snapshot.items.filter((i) => i.kind === "outfit");

  return (
    <div className="animate-fade-up space-y-4">
      <AreaHeader title="My Looks" subtitle="Recommended outfits for your events" onBack={onBack} />
      <Chips
        options={[{ id: "all", label: "All" }, ...events.map((e) => ({ id: e, label: e }))]}
        active={filter}
        onChange={setFilter}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {looks.map((look) => (
          <article key={look.id} className="card space-y-3 p-3">
            {look.imageDocId && (
              <BlueprintImage
                src={images[look.imageDocId]}
                alt={look.title}
                className="aspect-[4/5]"
                edited
              />
            )}
            <div className="flex items-start justify-between gap-2 px-1">
              <div>
                <h3 className="font-semibold">{look.title}</h3>
                {look.eventLabel && (
                  <p className="text-xs text-muted-foreground">{look.eventLabel}</p>
                )}
              </div>
              {look.colors.length > 0 && <Swatches colors={look.colors} size="sm" />}
            </div>
            <dl className="space-y-1 px-1 text-sm">
              {(
                [
                  ["Outfit", look.outfit],
                  ["Footwear", look.footwear],
                  ["Accessories", look.accessories],
                ] as const
              )
                .filter(([, v]) => v)
                .map(([label, v]) => (
                  <div key={label} className="grid grid-cols-[88px_1fr] gap-2">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
            </dl>
            {look.description && (
              <p className="px-1 text-sm text-muted-foreground">{look.description}</p>
            )}
            {look.stylistNote && (
              <div className="px-1 pb-1">
                <Quote>{look.stylistNote}</Quote>
              </div>
            )}
          </article>
        ))}
      </div>

      {outfits.length > 0 && (
        <section className="space-y-2 pt-2">
          <h2 className="text-sm font-semibold">More outfit ideas</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {outfits.map((o) => (
              <div key={o.id} className="card flex gap-3 p-3">
                {o.imageDocId && (
                  <BlueprintImage
                    src={images[o.imageDocId]}
                    alt={o.name}
                    className="h-24 w-20 shrink-0"
                  />
                )}
                <div className="min-w-0 space-y-0.5 text-sm">
                  <p className="font-semibold">{o.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[o.category, o.color, o.fit].filter(Boolean).join(" · ")}
                  </p>
                  {o.notes && <p className="text-muted-foreground">{o.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ---- Hair & Grooming ------------------------------------------------------------

function HairGrooming({ snapshot, images, onBack }: BlueprintViewProps & { onBack: () => void }) {
  const [barber, setBarber] = useState(false);
  const h = snapshot.hair;
  const shots = (
    [
      ["Front", h.frontDocId],
      ["Side", h.sideDocId],
      ["Back", h.backDocId],
    ] as const
  ).filter(([, id]) => id);

  return (
    <div className="animate-fade-up space-y-4">
      <AreaHeader
        title="Hair & Grooming"
        subtitle="Your recommended hairstyle and beard"
        onBack={onBack}
      />
      {shots.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {shots.map(([label, id]) => (
            <figure key={label} className="space-y-1 text-center">
              <BlueprintImage src={images[id!]} alt={`${label} view`} className="aspect-[3/4]" />
              <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {h.barberBrief.length > 0 && (
        <section className="card space-y-3 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ClipboardList className="h-4 w-4 text-primary" /> Your barber brief
          </h2>
          <BriefList lines={h.barberBrief} />
          <button
            type="button"
            onClick={() => setBarber(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-button transition-colors hover:bg-primary-hover"
          >
            <Maximize2 className="h-4 w-4" /> Show to barber
          </button>
        </section>
      )}
      {h.notes && <Quote>{h.notes}</Quote>}

      {barber && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Barber brief"
          className="fixed inset-0 z-50 animate-fade-in overflow-y-auto bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+20px)]"
        >
          <div className="mx-auto max-w-lg space-y-5">
            <div className="flex items-center justify-between">
              <p className="font-display text-2xl font-semibold tracking-display">Barber brief</p>
              <button
                type="button"
                onClick={() => setBarber(false)}
                aria-label="Close"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {shots.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {shots.map(([label, id]) => (
                  <BlueprintImage
                    key={label}
                    src={images[id!]}
                    alt={`${label} view`}
                    className="aspect-[3/4]"
                  />
                ))}
              </div>
            )}
            <ul className="space-y-3 text-lg leading-snug">
              {h.barberBrief.map((line, i) => (
                <li key={i} className="flex gap-3">
                  <Check className="mt-1 h-5 w-5 shrink-0 text-primary" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function BriefList({ lines }: { lines: string[] }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {lines.map((line, i) => (
        <li key={i} className="flex gap-2">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          {line}
        </li>
      ))}
    </ul>
  );
}

// ---- Shopping List -----------------------------------------------------------------

const KIND_ICON: Record<StylingItemKind, typeof Shirt> = {
  outfit: Shirt,
  footwear: Footprints,
  eyewear: Glasses,
  product: ShoppingBag,
};

function ShoppingList({
  snapshot,
  images,
  checkedEssentialIds = [],
  onToggleEssential,
  onBack,
}: BlueprintViewProps & { onBack: () => void }) {
  const items = snapshot.items.filter((i) => i.kind !== "outfit");
  const categories = useMemo(() => {
    const out: { id: string; label: string }[] = [{ id: "all", label: "All" }];
    const cats = new Set<string>();
    for (const i of items) {
      if (i.kind === "product") {
        if (i.category) cats.add(i.category);
      }
    }
    cats.forEach((c) => out.push({ id: `cat:${c}`, label: c }));
    if (items.some((i) => i.kind === "footwear")) out.push({ id: "footwear", label: "Footwear" });
    if (items.some((i) => i.kind === "eyewear")) out.push({ id: "eyewear", label: "Eyewear" });
    return out;
  }, [items]);
  const [filter, setFilter] = useState("all");
  const shown = items.filter((i) =>
    filter === "all"
      ? true
      : filter.startsWith("cat:")
        ? i.kind === "product" && i.category === filter.slice(4)
        : i.kind === filter,
  );
  const checked = new Set(checkedEssentialIds);

  return (
    <div className="animate-fade-up space-y-4">
      <AreaHeader
        title="Shopping List"
        subtitle="Picked by your stylist to complete your looks"
        onBack={onBack}
      />
      {items.length > 0 && (
        <>
          <Chips options={categories} active={filter} onChange={setFilter} />
          <section className="card divide-y divide-border px-4 py-1">
            {shown.map((it) => {
              const Icon = KIND_ICON[it.kind];
              return (
                <div key={it.id} className="flex items-start gap-3 py-3">
                  {it.imageDocId ? (
                    <BlueprintImage
                      src={images[it.imageDocId]}
                      alt={it.name}
                      className="h-14 w-14 shrink-0"
                    />
                  ) : (
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Icon className="h-5 w-5" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-semibold">{it.name}</p>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {it.priceRange && <span className="font-num">{it.priceRange}</span>}
                      {it.priority && (
                        <Badge tone={it.priority === "must_have" ? "info" : "neutral"}>
                          {STYLING_ITEM_PRIORITY_LABELS[it.priority]}
                        </Badge>
                      )}
                      {it.recommendation && (
                        <Badge tone={it.recommendation === "Avoid" ? "warning" : "success"}>
                          {it.recommendation}
                        </Badge>
                      )}
                    </div>
                    {it.notes && <p className="text-xs text-muted-foreground">{it.notes}</p>}
                  </div>
                  {it.url && (
                    <a
                      href={it.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold transition-colors hover:border-border-strong"
                    >
                      View <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              );
            })}
          </section>
        </>
      )}

      {snapshot.essentials.length > 0 && (
        <section className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Big Day Essentials</h2>
            <span className="font-num text-xs text-muted-foreground">
              {snapshot.essentials.filter((e) => checked.has(e.id)).length} of{" "}
              {snapshot.essentials.length}
            </span>
          </div>
          <div className="space-y-1">
            {snapshot.essentials.map((e) => {
              const on = checked.has(e.id);
              return (
                <label
                  key={e.id}
                  className={cn(
                    "flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm",
                    onToggleEssential && "cursor-pointer hover:bg-muted/60",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!onToggleEssential}
                    onChange={() => onToggleEssential?.(e.id, !on)}
                    className="mt-0.5 h-4 w-4 rounded border-border accent-[hsl(var(--primary))]"
                  />
                  <span>
                    <span className={cn(on && "text-muted-foreground line-through")}>{e.item}</span>
                    {e.notes && (
                      <span className="block text-xs text-muted-foreground">{e.notes}</span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
