import { useEffect, useState } from "react";
import { useReveal } from "./useReveal";
import {
  Hero,
  Marquee,
  Pillars,
  Journey,
  Programmes,
  Stories,
  FinalCta,
  Footer,
} from "./sections";

const NAV_LINKS = [
  { label: "The Glow", href: "#glow" },
  { label: "Journey", href: "#journey" },
  { label: "Programmes", href: "#programmes" },
  { label: "Stories", href: "#stories" },
];

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-ink/80 py-3 shadow-[0_1px_0_rgba(212,168,83,0.18)] backdrop-blur-xl"
          : "bg-transparent py-6"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6">
        <a href="#top" className="flex items-baseline gap-1.5">
          <span className="font-display text-2xl tracking-tight text-cream">
            Glow<span className="text-champagne italic"> to </span>Be
          </span>
        </a>
        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-light tracking-wide text-cream/70 transition-colors hover:text-champagne"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <a
          href="#programmes"
          className="rounded-full border border-champagne/60 px-5 py-2 text-sm text-champagne transition-all duration-300 hover:bg-champagne hover:text-ink"
        >
          Start your glow
        </a>
      </div>
    </header>
  );
}

export default function App() {
  useReveal();
  return (
    <div id="top" className="overflow-x-clip">
      <Nav />
      <main>
        <Hero />
        <Marquee />
        <Pillars />
        <Journey />
        <Programmes />
        <Stories />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
