/**
 * AI Coach (Step 8 of the brief) — shared labels and the starter knowledge set.
 *
 * The coach answers ONLY from GTB's knowledge articles plus the user's own scan
 * context. It ships with no articles; staff can create this starter set from
 * Settings → Coach Knowledge, then replace every [PLACEHOLDER] with GTB's real
 * methodology. Nothing here is medical advice.
 */
export const COACH_CATEGORIES = [
  "skin",
  "hair",
  "beard",
  "style",
  "fitness",
  "wedding",
  "general",
] as const;
export type CoachCategory = (typeof COACH_CATEGORIES)[number];

export const COACH_CATEGORY_LABELS: Record<CoachCategory, string> = {
  skin: "Skin",
  hair: "Hair",
  beard: "Beard & brows",
  style: "Style",
  fitness: "Fitness",
  wedding: "Wedding timeline",
  general: "General",
};

export interface StarterArticle {
  title: string;
  category: CoachCategory;
  tags: string[];
  content: string;
}

const P = "[PLACEHOLDER — replace with GTB's methodology] ";

export const COACH_STARTER_ARTICLES: StarterArticle[] = [
  {
    title: "The daily skincare routine",
    category: "skin",
    tags: ["routine", "cleanser", "moisturizer", "sunscreen", "oily", "dry"],
    content: `${P}Morning: gentle cleanser → lightweight moisturizer → broad-spectrum sunscreen (SPF 30+), every single day including indoors. Night: cleanser → moisturizer. Introduce one new product at a time and give it three weeks. Oily skin: gel textures, never skip moisturizer. Dry skin: cream textures, add a hydrating serum under moisturizer.`,
  },
  {
    title: "Even skin tone before the wedding",
    category: "skin",
    tags: ["tone", "pigmentation", "dark spots", "sunscreen", "vitamin c"],
    content: `${P}Tone evenness is a 6–8 week project: daily sunscreen is the whole game; a vitamin C serum in the morning and gentle exfoliation twice a week support it. No new strong actives in the final three weeks. Avoid aggressive treatments within 14 days of the wedding.`,
  },
  {
    title: "Under-eye freshness",
    category: "skin",
    tags: ["dark circles", "sleep", "under eye", "puffiness"],
    content: `${P}Sleep (7–8 hours), hydration and reduced salt do more than any product. Cold compress mornings for puffiness; a light caffeine eye cream helps temporarily. Two weeks of consistent sleep shows in photos.`,
  },
  {
    title: "Wedding haircut timing",
    category: "hair",
    tags: ["haircut", "timing", "trial", "barber"],
    content: `${P}Trial the exact wedding cut 4–6 weeks out so the barber knows the brief. Final cut 4–6 days before the wedding — sharp enough to look intentional, softened enough to not look fresh. Never try a new style the week of.`,
  },
  {
    title: "Scalp and hair health",
    category: "hair",
    tags: ["scalp", "oil", "wash", "shine", "density"],
    content: `${P}Wash on alternate days with a gentle shampoo; oil or scalp treatment twice a week; conditioner on lengths only. Density changes take months — focus on shine, neatness and the right cut.`,
  },
  {
    title: "Beard shaping and maintenance",
    category: "beard",
    tags: ["beard", "neckline", "cheek line", "oil", "trim"],
    content: `${P}Define the neckline two fingers above the Adam's apple; keep cheek lines natural. Oil daily, comb daily, trim weekly. Decide the wedding beard shape at least 4 weeks out and maintain it — no experiments in the final month. Final shape-up 4–6 days before.`,
  },
  {
    title: "Colour matching to skin tone",
    category: "style",
    tags: ["colour", "color", "skin tone", "navy", "outfit", "shirt"],
    content: `${P}Test colours against your face in daylight. Deep, saturated tones (navy, burgundy, forest, charcoal) suit most Indian skin tones; avoid washed-out pastels near the face unless paired with a strong contrast. Ivory over stark white for warmer undertones.`,
  },
  {
    title: "Fit beats fabric",
    category: "style",
    tags: ["fit", "tailoring", "suit", "sherwani", "shoulders"],
    content: `${P}Shoulders must sit exactly at your shoulder bone; everything else can be tailored. Book the first full fitting 30 days out and the alteration follow-up two weeks later. Break shoes in for two weeks.`,
  },
  {
    title: "Fitness in the final 90 days",
    category: "fitness",
    tags: ["fitness", "workout", "diet", "water", "sleep", "energy"],
    content: `${P}Consistency over intensity: 3–4 sessions a week, protein at every meal, 3 litres of water, 7+ hours of sleep. No crash diets in the final month — they show in the face. Nothing here replaces advice from your doctor for medical conditions.`,
  },
  {
    title: "The final 30 days",
    category: "wedding",
    tags: ["timeline", "checklist", "final month", "facial", "trial"],
    content: `${P}T-30 suit trial; T-21 shoes and accessories; T-14 last deep facial (never closer); T-10 fragrance and grooming kit; T-7 documents; T-5 final haircut and beard; T-3 pack; T-1 rest, hydrate, early night.`,
  },
  {
    title: "How the readiness score works",
    category: "general",
    tags: ["score", "readiness", "rescan", "progress", "fitness score", "confidence"],
    content: `Your Wedding Readiness blends appearance (skin, hair, beard/brows, style from your photos), self-reported fitness and confidence, and how many roadmap tasks you've completed on time. Rescan monthly — same angle, same light — to see your own progress. Scores rate appearance only and are never a medical assessment.`,
  },
  {
    title: "Talking to a GTB coach",
    category: "general",
    tags: ["program", "coach", "consultation", "price", "book", "call"],
    content: `${P}The GTB program pairs you with skincare, fitness and styling consultants who run your plan with you through the wedding. To talk to a human coach, reply to any GTB email or ask here and we'll arrange a call — the assistant can't quote prices or book sessions.`,
  },
];
