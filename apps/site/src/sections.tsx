/* Landing page sections for the Glow To Be marketing site. */

export function Hero() {
  return (
    <section className="grain relative flex min-h-svh flex-col justify-center overflow-hidden bg-ink text-cream">
      {/* Glow orbs */}
      <div className="animate-drift absolute -top-1/4 left-1/2 h-[80vmin] w-[80vmin] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(212,168,83,0.32)_0%,rgba(212,168,83,0.08)_45%,transparent_70%)] blur-2xl" />
      <div className="absolute -bottom-1/3 -left-1/4 h-[70vmin] w-[70vmin] rounded-full bg-[radial-gradient(circle,rgba(232,176,155,0.16)_0%,transparent_65%)] blur-3xl" />

      <div className="relative mx-auto w-full max-w-6xl px-6 pt-32 pb-20 text-center">
        <p className="reveal mb-8 inline-flex items-center gap-3 rounded-full border border-champagne/30 px-5 py-2 text-xs font-light tracking-[0.25em] text-champagne uppercase">
          <span className="animate-shimmer inline-block h-1.5 w-1.5 rounded-full bg-champagne" />
          India's first big-day glow-up studio
        </p>

        <h1 className="reveal reveal-delay-1 font-display mx-auto max-w-4xl text-6xl leading-[0.95] tracking-tight text-balance sm:text-7xl lg:text-8xl">
          Be the best <span className="text-champagne italic">you</span>,
          <br />
          for the big day.
        </h1>

        <p className="reveal reveal-delay-2 mx-auto mt-8 max-w-xl text-lg leading-relaxed font-light text-cream/70">
          Personalised skincare, fitness and styling programmes for brides and
          grooms to be. Guided by cosmetologists, dietitians and stylists, all
          online, wherever you are.
        </p>

        <div className="reveal reveal-delay-3 mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href="#programmes"
            className="group rounded-full bg-champagne px-8 py-4 text-sm font-medium tracking-wide text-ink transition-all duration-300 hover:bg-cream hover:shadow-[0_0_40px_rgba(212,168,83,0.45)]"
          >
            Begin your transformation
            <span className="ml-2 inline-block transition-transform duration-300 group-hover:translate-x-1">
              →
            </span>
          </a>
          <a
            href="#glow"
            className="rounded-full border border-cream/20 px-8 py-4 text-sm font-light text-cream/80 transition-colors hover:border-champagne/60 hover:text-champagne"
          >
            See how it works
          </a>
        </div>

        <div className="reveal reveal-delay-3 mx-auto mt-20 grid max-w-3xl grid-cols-1 gap-8 border-t border-cream/10 pt-10 sm:grid-cols-3">
          {[
            ["One team", "Cosmetologists, dietitians and stylists together"],
            ["Online first", "Weekly expert check-ins from anywhere"],
            ["1 to 3 months", "Programmes shaped around your date"],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="font-display text-2xl text-champagne italic">{k}</p>
              <p className="mt-1 text-sm font-light text-cream/60">{v}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const MARQUEE_ITEMS = [
  "Skin",
  "Fitness",
  "Style",
  "Confidence",
  "Wardrobe",
  "Nutrition",
  "Grooming",
  "Radiance",
];

export function Marquee() {
  const row = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];
  return (
    <div className="overflow-hidden border-y border-champagne/25 bg-ink-soft py-5">
      <div className="animate-marquee flex w-max items-center">
        {row.map((item, i) => (
          <span key={i} className="flex items-center">
            <span className="font-display px-6 text-2xl text-cream/85 italic">
              {item}
            </span>
            <span className="text-champagne">✦</span>
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
    body: "Cosmetologist-led consultations and a routine tailored to your skin, your climate and your timeline. Clear, healthy, camera-ready skin without guesswork.",
    tag: "Skincare",
  },
  {
    n: "02",
    title: "A body that feels strong",
    body: "Custom diet and workout plans built around your kitchen and your schedule. Not a crash diet: a fitter, sharper, more energetic you.",
    tag: "Fitness and nutrition",
  },
  {
    n: "03",
    title: "Style that turns heads",
    body: "Outfit guidance, hair, beard and makeup direction, and big-day style recommendations. Walk in looking like the best-dressed person in the room.",
    tag: "Styling",
  },
];

export function Pillars() {
  return (
    <section id="glow" className="bg-cream py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="reveal mb-16 max-w-2xl">
          <p className="mb-4 text-xs font-medium tracking-[0.3em] text-champagne-deep uppercase">
            The Glow Edit
          </p>
          <h2 className="font-display text-5xl leading-tight tracking-tight text-balance sm:text-6xl">
            Three crafts. <span className="text-champagne-deep italic">One</span>{" "}
            unforgettable entrance.
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {PILLARS.map((p, i) => (
            <article
              key={p.n}
              className={`reveal reveal-delay-${i} group relative rounded-3xl border border-ink/8 bg-white/60 p-8 transition-all duration-500 hover:-translate-y-2 hover:border-champagne/50 hover:shadow-[0_24px_60px_-24px_rgba(169,126,44,0.35)]`}
            >
              <p className="font-display text-5xl text-champagne/50 italic transition-colors duration-500 group-hover:text-champagne">
                {p.n}
              </p>
              <p className="mt-6 text-xs font-medium tracking-[0.2em] text-sand uppercase">
                {p.tag}
              </p>
              <h3 className="font-display mt-2 text-3xl tracking-tight">
                {p.title}
              </h3>
              <p className="mt-4 leading-relaxed font-light text-ink/65">
                {p.body}
              </p>
            </article>
          ))}
        </div>
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
    <section id="journey" className="grain relative bg-ink py-28 text-cream">
      <div className="absolute top-0 right-0 h-[60vmin] w-[60vmin] rounded-full bg-[radial-gradient(circle,rgba(212,168,83,0.14)_0%,transparent_65%)] blur-2xl" />
      <div className="relative mx-auto max-w-6xl px-6">
        <div className="reveal mb-20 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <p className="mb-4 text-xs font-medium tracking-[0.3em] text-champagne uppercase">
              The Journey
            </p>
            <h2 className="font-display text-5xl leading-tight tracking-tight text-balance sm:text-6xl">
              From today to{" "}
              <span className="text-champagne italic">the aisle</span>, step by
              step.
            </h2>
          </div>
          <p className="max-w-xs font-light text-cream/60">
            Every programme follows the same four movements, tuned to how much
            runway you have.
          </p>
        </div>

        <ol className="grid gap-px overflow-hidden rounded-3xl border border-cream/10 bg-cream/10 md:grid-cols-4">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className={`reveal reveal-delay-${i % 4 <= 2 ? i % 4 : 3} group bg-ink p-8 transition-colors duration-500 hover:bg-ink-soft`}
            >
              <p className="font-display text-lg text-champagne/70 italic">
                Step {i + 1}
              </p>
              <h3 className="font-display mt-3 text-2xl tracking-tight">
                {s.title}
              </h3>
              <p className="mt-4 text-sm leading-relaxed font-light text-cream/60">
                {s.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const PROGRAMMES = [
  {
    name: "Quick Glow",
    duration: "1 month",
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
    duration: "2 months",
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
    duration: "3 months",
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
    <section id="programmes" className="bg-cream-deep py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="reveal mb-6 text-center">
          <p className="mb-4 text-xs font-medium tracking-[0.3em] text-champagne-deep uppercase">
            Programmes
          </p>
          <h2 className="font-display mx-auto max-w-3xl text-5xl leading-tight tracking-tight text-balance sm:text-6xl">
            Choose your <span className="text-champagne-deep italic">runway</span>.
          </h2>
          <p className="mx-auto mt-5 max-w-xl font-light text-ink/60">
            Every programme is fully personalised. Pick by how many months you
            have before the celebrations begin.
          </p>
        </div>

        <p className="reveal mx-auto mb-14 w-fit rounded-full border border-champagne-deep/40 bg-champagne/15 px-5 py-2 text-sm text-champagne-deep">
          ✦ Launch offer: flat 10% off every programme
        </p>

        <div className="grid items-stretch gap-6 lg:grid-cols-3">
          {PROGRAMMES.map((p, i) => (
            <article
              key={p.name}
              className={`reveal reveal-delay-${i} relative flex flex-col rounded-3xl p-9 transition-all duration-500 hover:-translate-y-2 ${
                p.featured
                  ? "grain overflow-hidden bg-ink text-cream shadow-[0_32px_80px_-32px_rgba(22,17,13,0.7)]"
                  : "border border-ink/8 bg-white/70 hover:border-champagne/50"
              }`}
            >
              {p.featured && (
                <>
                  <div className="absolute -top-1/3 right-0 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(212,168,83,0.3)_0%,transparent_70%)] blur-xl" />
                  <p className="absolute top-6 right-6 rounded-full bg-champagne px-3 py-1 text-[11px] font-semibold tracking-widest text-ink uppercase">
                    Most loved
                  </p>
                </>
              )}
              <div className="relative">
                <p
                  className={`text-xs font-medium tracking-[0.25em] uppercase ${p.featured ? "text-champagne" : "text-sand"}`}
                >
                  {p.duration}
                </p>
                <h3 className="font-display mt-3 text-4xl tracking-tight">
                  {p.name}
                </h3>
                <p
                  className={`mt-3 font-light ${p.featured ? "text-cream/70" : "text-ink/60"}`}
                >
                  {p.blurb}
                </p>
                <ul
                  className={`mt-8 flex-1 space-y-3.5 border-t pt-8 text-sm font-light ${
                    p.featured
                      ? "border-cream/15 text-cream/80"
                      : "border-ink/10 text-ink/70"
                  }`}
                >
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-3">
                      <span
                        className={
                          p.featured ? "text-champagne" : "text-champagne-deep"
                        }
                      >
                        ✦
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href="#contact"
                  className={`mt-9 block rounded-full py-3.5 text-center text-sm font-medium tracking-wide transition-all duration-300 ${
                    p.featured
                      ? "bg-champagne text-ink hover:bg-cream hover:shadow-[0_0_40px_rgba(212,168,83,0.45)]"
                      : "border border-ink/20 text-ink hover:border-champagne-deep hover:bg-champagne/15 hover:text-champagne-deep"
                  }`}
                >
                  Enquire about {p.name}
                </a>
              </div>
            </article>
          ))}
        </div>
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
    <section id="stories" className="bg-cream py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="reveal mb-16 text-center">
          <p className="mb-4 text-xs font-medium tracking-[0.3em] text-champagne-deep uppercase">
            Glow Stories
          </p>
          <h2 className="font-display mx-auto max-w-3xl text-5xl leading-tight tracking-tight text-balance sm:text-6xl">
            They showed up <span className="text-champagne-deep italic">radiant</span>.
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {STORIES.map((s, i) => (
            <figure
              key={s.name}
              className={`reveal reveal-delay-${i} flex flex-col justify-between rounded-3xl border border-ink/8 bg-white/70 p-8 transition-all duration-500 hover:-translate-y-2 hover:border-champagne/50 hover:shadow-[0_24px_60px_-24px_rgba(169,126,44,0.3)]`}
            >
              <div>
                <p className="text-champagne" aria-label="5 star rating">
                  ✦ ✦ ✦ ✦ ✦
                </p>
                <blockquote className="font-display mt-5 text-xl leading-snug tracking-tight text-ink/85">
                  "{s.quote}"
                </blockquote>
              </div>
              <figcaption className="mt-8 border-t border-ink/10 pt-5">
                <p className="font-medium">{s.name}</p>
                <p className="text-sm font-light text-ink/50">{s.where}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section
      id="contact"
      className="grain relative overflow-hidden bg-ink py-32 text-center text-cream"
    >
      <div className="animate-drift absolute top-1/2 left-1/2 h-[90vmin] w-[90vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(212,168,83,0.22)_0%,transparent_65%)] blur-2xl" />
      <div className="relative mx-auto max-w-3xl px-6">
        <p className="reveal font-display mb-6 text-2xl text-champagne italic">
          Your date is set. Your glow should be too.
        </p>
        <h2 className="reveal reveal-delay-1 font-display text-6xl leading-[0.95] tracking-tight text-balance sm:text-7xl">
          Let's make them look twice.
        </h2>
        <p className="reveal reveal-delay-2 mx-auto mt-8 max-w-xl text-lg font-light text-cream/70">
          Tell us your date and we will map the rest. Your first consultation is
          on us.
        </p>
        <div className="reveal reveal-delay-3 mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href="https://wa.me/918891261639"
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-champagne px-9 py-4 text-sm font-medium tracking-wide text-ink transition-all duration-300 hover:bg-cream hover:shadow-[0_0_50px_rgba(212,168,83,0.5)]"
          >
            Chat with us on WhatsApp
          </a>
          <a
            href="mailto:info@groomtobe.in"
            className="rounded-full border border-cream/20 px-9 py-4 text-sm font-light text-cream/80 transition-colors hover:border-champagne/60 hover:text-champagne"
          >
            info@groomtobe.in
          </a>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-cream/10 bg-ink py-14 text-cream">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-8 px-6 md:flex-row">
        <div className="text-center md:text-left">
          <p className="font-display text-2xl tracking-tight">
            Glow<span className="text-champagne italic"> to </span>Be
          </p>
          <p className="mt-2 max-w-xs text-sm font-light text-cream/50">
            India's first dedicated big-day glow-up programme, for brides and
            grooms to be.
          </p>
        </div>
        <div className="flex flex-col items-center gap-2 text-sm font-light text-cream/60 md:items-end">
          <a href="tel:+918891261639" className="hover:text-champagne">
            +91 88912 61639
          </a>
          <a href="mailto:info@groomtobe.in" className="hover:text-champagne">
            info@groomtobe.in
          </a>
          <p className="mt-2 text-xs text-cream/35">
            © {new Date().getFullYear()} Glow To Be. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
