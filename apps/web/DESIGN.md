# GTB OS Design Language — "Atelier"

The operations desk of a boutique wedding-grooming studio: **crisp like Linear, warm like an
atelier**. Restrained color with two brand moments (groom teal / bride rose), warm paper
neutrals, one serif flourish, and motion that is fast and discreet.

## Principles

1. **Warm, not beige.** Neutrals carry a faint warm cast (stone/paper), never cold blue-gray
   and never yellow. White cards float on warm paper.
2. **Teal is the brand, navy is dead.** `--primary` IS the groom teal. `[data-theme="bride"]`
   flips primary to deep rose. Never hard-code teal/rose hex — always tokens.
3. **Serif is a garnish.** Fraunces (`font-display`) appears ONLY on page titles, auth/hero
   headings, and the portal greeting. Everything else is Inter. Numbers are always Inter with
   `tabular-nums` (`font-num` utility) — money and counts must align.
4. **Depth from layers, not lines.** Cards = white surface + hairline border + layered warm
   shadow (`shadow-card`). Hover on interactive cards elevates to `shadow-md`. Avoid heavy
   borders; use `--border-strong` only for hover/definition.
5. **Motion is feedback, not decoration.** Everything under 300ms, strong ease-out
   (`--ease-out: cubic-bezier(0.23,1,0.32,1)`). Pressables scale to 0.98 on `:active`.
   Page roots fade-up once. Never animate keyboard-driven or high-frequency actions.
   `prefers-reduced-motion` is respected globally (handled in index.css — free).

## Tokens (defined in src/index.css, mapped in tailwind.config.ts)

| Token | Use |
| --- | --- |
| `bg-background` | App canvas (warm paper) |
| `bg-surface` | Cards, headers, inputs (white) |
| `bg-muted` / `text-muted-foreground` | Tinted fills / secondary text |
| `border` (default) / `border-strong` | Hairlines / hover borders |
| `bg-primary`, `hover:bg-primary-hover` | Brand action (teal; rose under bride theme) |
| `text-groom` / `text-bride` | Contextual client-type accents |
| `success / warning / danger / info` | Status only — text-safe lightness, use `/10`–`/15` tints for bg |
| `shadow-card / shadow-md / shadow-lg / shadow-xl` | Elevation ladder (warm-tinted) |
| `shadow-button` | Inset top-highlight on primary buttons |
| `rounded-card` (14px) / `rounded-lg` (10px controls) | Radii — cards vs controls |
| `font-display` | Fraunces serif — titles only |
| `font-num` | Inter + tabular-nums for money/metrics |
| `ease-out-strong / ease-in-out-strong` | Custom curves (also `--ease-out` CSS var) |
| `animate-fade-up / animate-scale-in / animate-fade-in` | Entrances |

## Page recipe (staff pages)

```tsx
<div className="page">            {/* .page = p-6 lg:p-8 + fade-up entrance */}
  <PageHeader title="Clients" subtitle="…" actions={<Button>…</Button>} />
  {/* filters row: mt-6, use <PillFilter> or <Tabs> — no ad-hoc pill buttons */}
  {/* content: mt-6; grids gap-4; sections in <Card> */}
</div>
```

- **Tables:** wrap in `<Card>`; `thead` = `text-xs font-medium uppercase tracking-wider
  text-muted-foreground`, cells `px-5 py-3.5`, rows `divide-y divide-border` with
  `hover:bg-muted/50 transition-colors` on clickable rows. Money cells: `font-num`.
- **Stat grids:** `StatCard` in `grid gap-4`, add `stagger-children` on the grid.
- **Loading:** center `<Spinner>` (never a bare div); **Empty:** `<EmptyState>`;
  **Errors:** `<QueryErrorState>`.
- **Icons:** lucide at `h-4 w-4` inline, `h-[18px] w-[18px]` in nav/chips.

## Component rules

- `Button` — variants unchanged (primary/secondary/outline/ghost/danger). Already carries
  press-scale, shadow, focus ring. Never rebuild buttons inline — use the component.
- `Modal` — animates in (scale 0.96 + fade, centered origin). Backdrop blurs. Don't add
  per-page modal wrappers.
- `Badge` / `StatusBadge` — tinted bg + ring-inset hairline. Use `StatusBadge` for any
  domain status string.
- Inputs — `Field`/`Input`/`Select`/`Textarea` only; they own the focus glow
  (border-primary + 4px primary/10 ring). No naked `<input>` styling.
- Charts (recharts) — series colors from CSS vars: teal `hsl(var(--groom))`, rose
  `hsl(var(--bride))`, gridlines `hsl(var(--border))`, axis text `hsl(var(--muted-foreground))`,
  12px Inter. Tooltips: white card, `rounded-lg`, `shadow-lg`, hairline border.

## Hard rules for contributors (including agents)

- Style-only changes: never touch queries, hooks, handlers, routes, or copy semantics.
- No new dependencies. No inline hex colors — tokens only.
- Don't `@apply` custom-token utilities with variants inside index.css (build-breaker);
  border tokens are FLAT keys in the Tailwind config (`border`, `border-strong`) — never
  nest under `border:`.
- Keep component public APIs (props) unchanged.
