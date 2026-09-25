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
      className={`fixed inset-x-0 top-0 z-50 border-b transition-all duration-500 ${
        scrolled
          ? "border-cream/10 bg-ink/90 backdrop-blur-md"
          : "border-transparent bg-transparent"
      }`}
    >
      <div className="flex items-center justify-between px-6 py-5 lg:px-10">
        <a href="#top" className="font-display text-[1.35rem] leading-none text-cream">
          Glow <span className="text-champagne italic">to</span> Be
        </a>
        <nav className="micro hidden items-center gap-9 text-cream/60 md:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="transition-colors duration-300 hover:text-champagne"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <a
          href="#contact"
          className="micro wire-link text-champagne"
        >
          Enquire
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
