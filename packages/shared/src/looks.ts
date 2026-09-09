/**
 * Look-preview catalog (Step 4 of the brief): 10 hairstyles + 10 beard styles
 * for grooms, 10 hairstyles for brides. `prompt` is the edit instruction the
 * image model receives; `label`/`blurb` are what users see.
 */
export type LookKind = "hairstyle" | "beard";

export interface LookStyle {
  key: string;
  kind: LookKind;
  label: string;
  blurb: string;
  prompt: string;
}

const g = (
  key: string,
  kind: LookKind,
  label: string,
  blurb: string,
  prompt: string,
): LookStyle => ({
  key,
  kind,
  label,
  blurb,
  prompt,
});

export const GROOM_LOOKS: LookStyle[] = [
  g(
    "classic_side_part",
    "hairstyle",
    "Classic side part",
    "Timeless, photographs cleanly",
    "a neat classic side-parted hairstyle, medium length on top, tapered sides, lightly styled with natural shine",
  ),
  g(
    "textured_crop",
    "hairstyle",
    "Textured crop",
    "Modern, low-maintenance",
    "a modern textured crop with a short fringe, matte texture on top and a clean fade on the sides",
  ),
  g(
    "slick_back",
    "hairstyle",
    "Slick back",
    "Sharp and formal",
    "a slicked-back hairstyle, hair combed straight back with a polished, glossy finish and tapered sides",
  ),
  g(
    "pompadour",
    "hairstyle",
    "Pompadour",
    "Volume up front",
    "a classic pompadour with volume swept up and back at the front, tight tapered sides",
  ),
  g(
    "quiff",
    "hairstyle",
    "Quiff",
    "Relaxed lift at the front",
    "a textured quiff, hair lifted and swept up at the front with softer texture, faded sides",
  ),
  g(
    "undercut",
    "hairstyle",
    "Undercut",
    "High contrast, bold",
    "a disconnected undercut, longer hair on top swept to one side, sides clipped very short",
  ),
  g(
    "buzz_cut",
    "hairstyle",
    "Buzz cut",
    "Minimal, defined",
    "a clean uniform buzz cut, very short all over with a sharp neckline",
  ),
  g(
    "crew_cut",
    "hairstyle",
    "Crew cut",
    "Neat and athletic",
    "a classic crew cut, short on the sides, slightly longer on top, brushed forward-and-up",
  ),
  g(
    "medium_flow",
    "hairstyle",
    "Medium flow",
    "Soft, natural movement",
    "medium-length hair with a natural flowing sweep back and to the side, soft layers, light hold",
  ),
  g(
    "curly_top",
    "hairstyle",
    "Defined curls",
    "Embraces natural texture",
    "well-defined natural curls on top with the sides tapered short and the curls hydrated and separated",
  ),
  g(
    "clean_shaven",
    "beard",
    "Clean shaven",
    "Crisp and classic",
    "a completely clean-shaven face with smooth skin and a defined jawline",
  ),
  g(
    "light_stubble",
    "beard",
    "Light stubble",
    "Effortless definition",
    "even light stubble across the jaw and upper lip, about two days of growth, tidy neckline",
  ),
  g(
    "heavy_stubble",
    "beard",
    "Heavy stubble",
    "Rugged but groomed",
    "even heavy stubble, about a week of growth, sharp cheek and neck lines",
  ),
  g(
    "short_boxed",
    "beard",
    "Short boxed beard",
    "Structured, wedding-safe",
    "a short boxed beard, trimmed close with crisp cheek lines and a defined neckline, connected moustache",
  ),
  g(
    "full_beard",
    "beard",
    "Full beard",
    "Groomed fullness",
    "a full, well-groomed beard of medium length, shaped and combed, neat moustache, clean neckline",
  ),
  g(
    "goatee",
    "beard",
    "Goatee",
    "Focus on the chin",
    "a neat goatee with a connected moustache, cheeks clean-shaven",
  ),
  g(
    "van_dyke",
    "beard",
    "Van Dyke",
    "Sharp and stylised",
    "a Van Dyke: pointed chin beard and separate styled moustache, cheeks clean-shaven",
  ),
  g(
    "anchor",
    "beard",
    "Anchor beard",
    "Sculpted outline",
    "an anchor beard tracing the jawline with a pointed chin and a connected pencil moustache, cheeks clean",
  ),
  g(
    "balbo",
    "beard",
    "Balbo",
    "Shaped, no sideburns",
    "a Balbo beard: shaped chin and jaw beard disconnected from a floating moustache, no sideburn connection",
  ),
  g(
    "corporate_beard",
    "beard",
    "Corporate beard",
    "Polished, professional",
    "a corporate beard, short and uniformly trimmed to about 1 cm, very neat edges",
  ),
];

export const BRIDE_LOOKS: LookStyle[] = [
  g(
    "soft_waves",
    "hairstyle",
    "Soft waves",
    "Romantic and open",
    "long soft loose waves worn down, glossy and voluminous",
  ),
  g(
    "low_bun",
    "hairstyle",
    "Low bun",
    "Elegant and secure",
    "a sleek low bun at the nape, smooth top, centre or side part",
  ),
  g(
    "braided_crown",
    "hairstyle",
    "Braided crown",
    "Bohemian detail",
    "a braided crown wrapping around the head with soft face-framing pieces",
  ),
  g(
    "half_up",
    "hairstyle",
    "Half-up, half-down",
    "Best of both",
    "a half-up half-down style with the top section pinned back and soft curls below",
  ),
  g(
    "sleek_ponytail",
    "hairstyle",
    "Sleek ponytail",
    "Modern and sharp",
    "a high sleek ponytail, hair smoothed back with a polished finish",
  ),
  g(
    "side_swept_curls",
    "hairstyle",
    "Side-swept curls",
    "Old Hollywood",
    "glamorous curls swept to one side over the shoulder",
  ),
  g(
    "classic_chignon",
    "hairstyle",
    "Classic chignon",
    "Timeless formal",
    "a classic twisted chignon at the back of the head, smooth and structured",
  ),
  g(
    "loose_curls",
    "hairstyle",
    "Loose curls",
    "Effortless volume",
    "defined loose curls worn down with lots of natural volume",
  ),
  g(
    "twisted_updo",
    "hairstyle",
    "Twisted updo",
    "Sculpted height",
    "an intricate twisted updo with textured sections pinned high",
  ),
  g(
    "vintage_waves",
    "hairstyle",
    "Vintage waves",
    "Retro glamour",
    "deep S-shaped vintage finger waves with a glossy finish",
  ),
];

export function looksFor(type: "groom" | "bride", kind?: LookKind): LookStyle[] {
  const all = type === "bride" ? BRIDE_LOOKS : GROOM_LOOKS;
  return kind ? all.filter((l) => l.kind === kind) : all;
}

export function findLook(type: "groom" | "bride", key: string): LookStyle | undefined {
  return looksFor(type).find((l) => l.key === key);
}

/** Renders per scan per IST day — image generation costs real money. */
export const LOOK_DAILY_CAP_PER_SCAN = 6;
