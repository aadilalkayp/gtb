/* Landing page sections for the Glow To Be marketing site.
   Editorial layout system: full-bleed gutters (px-6 lg:px-10), hairline rules,
   .micro labels, flush-left display type. */

function Arches({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 520 640"
      fill="none"
      aria-hidden
      className={className}
      preserveAspectRatio="xMidYMax meet"
    >
      <path
        d="M20 640 V260 A240 240 0 0 1 500 260 V640"
        stroke="currentColor"
        strokeOpacity="0.5"
      />
      <path
        d="M70 640 V285 A190 190 0 0 1 450 285 V640"
        stroke="currentColor"
        strokeOpacity="0.3"
      />
      <path
        d="M120 640 V310 A140 140 0 0 1 400 310 V640"
        stroke="currentColor"
        strokeOpacity="0.18"
      />
    </svg>
  );
}

export function Hero() {
  return (
    <section className="grain relative flex min-h-svh flex-col bg-ink text-cream">
      {/* Single, restrained glow behind the arches */}
      <div className="animate-drift absolute right-[-10%] bottom-[-20%] h-[70vmin] w-[70vmin] rounded-full bg-[radial-gradient(circle,rgba(212,168,83,0.2)_0%,transparent_65%)] blur-2xl" />

      {/* Meta strip under the nav */}
      <div className="micro mx-6 mt-24 flex items-center justify-between border-b border-cream/10 pb-4 text-cream/50 lg:mx-10">
        <span className="reveal">India's first big-day glow-up studio</span>
        <span className="reveal hidden sm:block">
          For brides and grooms to be
        </span>
        <span className="reveal hidden md:block">Online, worldwide</span>
      </div>

      {/* Headline */}
      <div className="relative flex flex-1 flex-col justify-center px-6 py-16 lg:px-10">
        <Arches className="pointer-events-none absolute right-0 bottom-0 hidden h-[82%] text-champagne md:block" />
        <h1 className="font-display relative text-[clamp(3.4rem,10.5vw,10.5rem)] leading-[0.94] tracking-[-0.01em]">
          <span className="reveal block">
            Be the best <span className="text-champagne italic">you,</span>
          </span>
          <span className="reveal reveal-delay-1 block pl-[6vw]">
            for the big day.
          </span>
        </h1>
      </div>

      {/* Bottom row */}
      <div className="mx-6 grid grid-cols-1 items-end gap-8 border-t border-cream/10 py-8 lg:mx-10 lg:grid-cols-12">
        <p className="reveal reveal-delay-1 max-w-md leading-relaxed font-light text-cream/60 lg:col-span-5">
          Personalised skincare, fitness and styling, guided by cosmetologists,
          dietitians and stylists. Wherever you are, from today until the day
          itself.
        </p>
        <div className="micro reveal reveal-delay-2 hidden gap-10 text-cream/40 lg:col-span-4 lg:flex">
          <span>Skin</span>
          <span>Body</span>
          <span>Style</span>
        </div>
        <div className="reveal reveal-delay-2 lg:col-span-3 lg:justify-self-end">
          <a
            href="#programmes"
            className="micro inline-block border border-champagne/50 px-8 py-4 text-champagne transition-colors duration-500 hover:bg-champagne hover:text-ink"
          >
            Begin your consultation
          </a>
        </div>
      </div>
    </section>
  );
}

const MARQUEE_ITEMS = [
  "Skincare",
  "Nutrition",
  "Fitness",
  "Wardrobe",
  "Grooming",
  "Styling",
];

export function Marquee() {
  const row = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];
  return (
    <div
      aria-hidden
      className="overflow-hidden border-b border-cream/10 bg-ink py-6"
    >
      <div className="animate-marquee flex w-max items-baseline">
        {row.map((item, i) => (
          <span key={i} className="flex items-baseline">
            <span className="font-display px-8 text-3xl text-cream/70 italic">
              {item}
            </span>
            <span className="h-px w-10 self-center bg-champagne/40" />
          </span>
        ))}
      </div>
    </div>
  );
}

const PILLARS = [
  {
    n: "01",
    title: "Skin that glows",
    tag: "Skincare",
    body: "Cosmetologist-led consultations and a routine tailored to your skin, your climate and your timeline. Clear, healthy, camera-ready skin without guesswork.",
  },
  {
    n: "02",
    title: "A body that feels strong",
    tag: "Fitness and nutrition",
    body: "Custom diet and workout plans built around your kitchen and your schedule. Not a crash diet: a fitter, sharper, more energetic you.",
  },
  {
    n: "03",
    title: "Style that turns heads",
    tag: "Styling",
    body: "Outfit guidance, hair, beard and makeup direction, and big-day style recommendations. Walk in looking like the best-dressed person in the room.",
  },
];

export function Pillars() {
  return (
    <section id="glow" className="bg-cream px-6 py-28 lg:px-10">
      <div className="reveal mb-20 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <p className="micro pt-3 text-champagne-deep lg:col-span-3">
          ( The Glow Edit )
        </p>
        <h2 className="font-display text-5xl leading-[1.02] tracking-tight text-balance sm:text-6xl lg:col-span-9 lg:text-7xl">
          Three crafts.
          <br />
          One unforgettable <span className="text-champagne-deep italic">entrance.</span>
        </h2>
      </div>

      <div>
        {PILLARS.map((p) => (
          <article
            key={p.n}
            className="reveal group grid grid-cols-1 gap-4 border-t border-ink/10 py-10 transition-colors duration-500 last:border-b lg:grid-cols-12 lg:gap-6 lg:py-12"
          >
            <p className="micro pt-2 text-sand lg:col-span-1">{p.n}</p>
            <h3 className="font-display text-4xl tracking-tight transition-colors duration-500 group-hover:text-champagne-deep sm:text-5xl lg:col-span-5">
              {p.title}
            </h3>
            <p className="micro pt-2 text-sand lg:col-span-2">{p.tag}</p>
            <p className="max-w-md leading-relaxed font-light text-ink/60 lg:col-span-4">
              {p.body}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

const STEPS = [
  {
    title: "The Glow Audit",
    body: "A one-on-one consultation to understand your skin, fitness, style and, most importantly, your date.",
  },
  {
    title: "Your Blueprint",
    body: "Our experts design a week-by-week plan across skincare, nutrition, workouts and wardrobe. Yours, and only yours.",
  },
  {
    title: "Guided Progress",
    body: "Regular check-ins, plan tweaks and honest coaching keep you on track while life gets busy with the celebrations.",
  },
  {
    title: "The Reveal",
    body: "Final styling, last-mile grooming and big-day assistance. You arrive calm, confident and glowing.",
  },
];

export function Journey() {
  return (
    <section
      id="journey"
      className="grain relative bg-ink px-6 py-28 text-cream lg:px-10"
    >
      <div className="reveal mb-20 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <p className="micro pt-3 text-champagne lg:col-span-3">
          ( The Journey )
        </p>
        <div className="lg:col-span-9">
          <h2 className="font-display text-5xl leading-[1.02] tracking-tight text-balance sm:text-6xl lg:text-7xl">
            From today to <span className="text-champagne italic">the aisle,</span>
            <br />
            step by step.
          </h2>
          <p className="mt-6 max-w-sm font-light text-cream/50">
            Every programme follows the same four movements, tuned to how much
            runway you have.
          </p>
        </div>
      </div>

      <ol className="grid grid-cols-1 border-t border-cream/10 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li
            key={s.title}
            className={`reveal reveal-delay-${Math.min(i, 3)} border-b border-cream/10 py-10 sm:pr-8 lg:border-b-0 lg:pt-12 ${
              i > 0 ? "lg:border-l lg:border-cream/10 lg:pl-8" : ""
            }`}
          >
            <p className="micro text-champagne/70">( 0{i + 1} )</p>
            <h3 className="font-display mt-5 text-3xl tracking-tight">
              {s.title}
            </h3>
            <p className="mt-4 text-sm leading-relaxed font-light text-cream/50">
              {s.body}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

const PROGRAMMES = [
  {
    name: "Quick Glow",
    duration: "One month",
    blurb: "For a big day that is closer than you thought.",
    features: [
      "Full skincare consultation and personalised routine",
      "Rapid diet and fitness guidance",
      "Online styling assessment",
      "Big-day assistance",
    ],
    featured: false,
  },
  {
    name: "Signature Glow",
    duration: "Two months",
    blurb: "Our most loved programme. The complete transformation.",
    features: [
      "Dermatologist, cosmetologist and dietitian support",
      "Complete styling and wardrobe upgrade plan",
      "Weekly coaching check-ins",
      "Six months of extended expert access",
      "Invites to exclusive Glow To Be events",
    ],
    featured: true,
  },
  {
    name: "Royal Glow",
    duration: "Three months",
    blurb: "The unhurried, all-in glow-up with time on your side.",
    features: [
      "Cosmetologist and dietitian support throughout",
      "Progressive fitness programming",
      "Seasonal wardrobe planning",
      "Priority scheduling for consultations",
    ],
    featured: false,
  },
];

export function Programmes() {
  return (
    <section id="programmes" className="bg-cream-deep px-6 py-28 lg:px-10">
      <div className="reveal mb-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <p className="micro pt-3 text-champagne-deep lg:col-span-3">
          ( Programmes )
        </p>
        <div className="lg:col-span-9">
          <h2 className="font-display text-5xl leading-[1.02] tracking-tight text-balance sm:text-6xl lg:text-7xl">
            Choose your <span className="text-champagne-deep italic">runway.</span>
          </h2>
          <p className="mt-6 max-w-md font-light text-ink/60">
            Every programme is fully personalised. Pick by how many months you
            have before the celebrations begin. Launch offer: flat 10% off
            every programme.
          </p>
        </div>
      </div>

      <div className="mt-14 grid grid-cols-1 border-t border-ink/15 lg:grid-cols-3">
        {PROGRAMMES.map((p, i) => (
          <article
            key={p.name}
            className={`reveal reveal-delay-${i} flex flex-col py-12 ${
              p.featured
                ? "grain relative bg-ink px-8 text-cream lg:-mt-px"
                : "border-b border-ink/15 lg:border-b-0 lg:pr-10 lg:pl-2"
            } ${!p.featured && i === 2 ? "lg:pl-10" : ""}`}
          >
            <p
              className={`micro ${p.featured ? "text-champagne" : "text-sand"}`}
            >
              {p.duration}
              {p.featured && <span className="ml-4 text-cream/40">Most loved</span>}
            </p>
            <h3 className="font-display mt-4 text-4xl tracking-tight sm:text-5xl">
              {p.name}
            </h3>
            <p
              className={`mt-3 font-light ${p.featured ? "text-cream/60" : "text-ink/55"}`}
            >
              {p.blurb}
            </p>
            <ul
              className={`mt-10 flex-1 text-sm font-light ${
                p.featured ? "text-cream/75" : "text-ink/70"
              }`}
            >
              {p.features.map((f) => (
                <li
                  key={f}
                  className={`border-t py-3.5 ${
                    p.featured ? "border-cream/12" : "border-ink/10"
                  }`}
                >
                  {f}
                </li>
              ))}
            </ul>
            <a
              href="#contact"
              className={`micro wire-link mt-10 self-start ${
                p.featured ? "text-champagne" : "text-champagne-deep"
              }`}
            >
              Enquire
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}

const STORIES = [
  {
    quote:
      "I walked into my wedding feeling like the sharpest version of myself. The skincare routine alone changed how I look at the mirror.",
    name: "Adnan",
    where: "Groom, Dubai",
  },
  {
    quote:
      "Three months of small, consistent changes. On the day, everyone kept asking what I had done. The answer: a team that actually cared.",
    name: "Niveditha",
    where: "Bride, Kochi",
  },
  {
    quote:
      "I had six weeks and zero clue where to start. They gave me a plan for every single week and stayed with me till the reception.",
    name: "Rahil",
    where: "Groom, Calicut",
  },
];

export function Stories() {
  return (
    <section id="stories" className="bg-cream px-6 py-28 lg:px-10">
      <div className="reveal mb-16 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <p className="micro pt-3 text-champagne-deep lg:col-span-3">
          ( Glow Stories )
        </p>
        <h2 className="font-display text-5xl leading-[1.02] tracking-tight text-balance sm:text-6xl lg:col-span-9 lg:text-7xl">
          They showed up <span className="text-champagne-deep italic">radiant.</span>
        </h2>
      </div>

      <div className="grid grid-cols-1 border-t border-ink/10 lg:grid-cols-3">
        {STORIES.map((s, i) => (
          <figure
            key={s.name}
            className={`reveal reveal-delay-${i} flex flex-col justify-between border-b border-ink/10 py-10 lg:border-b-0 lg:pt-12 ${
              i > 0 ? "lg:border-l lg:border-ink/10 lg:pl-10" : ""
            } ${i < 2 ? "lg:pr-10" : ""}`}
          >
            <blockquote className="font-display text-2xl leading-snug tracking-tight text-ink/85">
              "{s.quote}"
            </blockquote>
            <figcaption className="micro mt-10 text-sand">
              {s.name}, <span className="text-ink/40">{s.where}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section
      id="contact"
      className="grain relative overflow-hidden bg-ink px-6 py-32 text-cream lg:px-10"
    >
      <Arches className="pointer-events-none absolute right-0 bottom-0 hidden h-[75%] text-champagne/70 md:block" />
      <div className="animate-drift absolute bottom-[-30%] left-[-10%] h-[60vmin] w-[60vmin] rounded-full bg-[radial-gradient(circle,rgba(212,168,83,0.16)_0%,transparent_65%)] blur-2xl" />

      <p className="micro reveal relative text-champagne">
        Your date is set. Your glow should be too.
      </p>
      <h2 className="font-display reveal reveal-delay-1 relative mt-8 max-w-4xl text-[clamp(3rem,8vw,7.5rem)] leading-[0.96] tracking-tight">
        Let's make them <span className="text-champagne italic">look twice.</span>
      </h2>
      <p className="reveal reveal-delay-2 relative mt-8 max-w-md text-lg font-light text-cream/60">
        Tell us your date and we will map the rest. Your first consultation is
        on us.
      </p>
      <div className="reveal reveal-delay-2 relative mt-14 flex flex-col gap-8 sm:flex-row sm:items-center">
        <a
          href="https://wa.me/918891261639"
          target="_blank"
          rel="noreferrer"
          className="micro inline-block self-start border border-champagne/50 px-8 py-4 text-champagne transition-colors duration-500 hover:bg-champagne hover:text-ink"
        >
          Chat on WhatsApp
        </a>
        <a
          href="mailto:info@groomtobe.in"
          className="micro wire-link self-start text-cream/60 sm:self-center"
        >
          info@groomtobe.in
        </a>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-cream/10 bg-ink px-6 py-12 text-cream lg:px-10">
      <div className="flex flex-col justify-between gap-10 md:flex-row md:items-end">
        <div>
          <p className="font-display text-2xl tracking-tight">
            Glow <span className="text-champagne italic">to</span> Be
          </p>
          <p className="mt-3 max-w-xs text-sm font-light text-cream/40">
            India's first dedicated big-day glow-up programme, for brides and
            grooms to be.
          </p>
        </div>
        <div className="micro flex flex-col gap-3 text-cream/50 md:items-end">
          <a href="tel:+918891261639" className="hover:text-champagne">
            +91 88912 61639
          </a>
          <a href="mailto:info@groomtobe.in" className="hover:text-champagne">
            info@groomtobe.in
          </a>
          <p className="mt-2 text-cream/30 normal-case tracking-normal">
            © {new Date().getFullYear()} Glow To Be. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
