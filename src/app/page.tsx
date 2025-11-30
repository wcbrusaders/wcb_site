"use client";

import Image from "next/image";
import { useState, useEffect } from "react";

// Minimal benefits - icon + one-liner
const benefits = [
  { icon: "calendar", title: "Monthly Meetings", desc: "Third Thursdays, in-person or remote" },
  { icon: "bot", title: "24/7 Discord Bot", desc: "Yeasts, hops, grains, calculators, and brewing science" },
  { icon: "graduation", title: "~12 Workshops/Year", desc: "From water chemistry to recipe design" },
  { icon: "gift", title: "Member Perks", desc: "Group buys, competition support, discounts" },
];

// Four pathways - minimal
const pathways = [
  { name: "Social", color: "emerald", desc: "Just here for the hangouts" },
  { name: "Technical", color: "blue", desc: "Deep-dive into brewing science" },
  { name: "Creative", color: "purple", desc: "Adjuncts, barrel aging, wild fermentation" },
  { name: "Competitive", color: "orange", desc: "BJCP certification & medals" },
];

// Footer resources
const resources = [
  { title: "Knowledge Base", href: "https://drive.google.com/drive/folders/1Von8YTFkyQ3fGC8DbC-Augwlwvhe0rRA" },
  { title: "Recipe Library", href: "https://drive.google.com/drive/folders/1NGuf6ImU6UxivQPbPGWl91tETUzzzN77" },
  { title: "Workshop Guides", href: "https://drive.google.com/drive/folders/1hLeWLw-6kGqwccWdsPTzO32eW_5FKk18" },
  { title: "Meeting Notes", href: "https://drive.google.com/drive/u/1/folders/1hYiIV6NnhFHCItJuZ4Je2KjDUz0Ktk8h" },
  { title: "Community Docs", href: "https://drive.google.com/drive/u/1/folders/0AH3fezsxCD4DUk9PVA" },
];

// Simple icon components
function Icon({ name, className = "w-5 h-5" }: { name: string; className?: string }) {
  const icons: Record<string, React.ReactNode> = {
    calendar: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />,
    bot: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5M4.5 15.75H3m18 0h-1.5M12 3v1.5m0 15V21m-6.75-3.75h13.5a2.25 2.25 0 002.25-2.25V9a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9v6a2.25 2.25 0 002.25 2.25zM9 12h.008v.008H9V12zm3 0h.008v.008H12V12zm3 0h.008v.008H15V12z" />,
    graduation: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />,
    gift: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />,
    menu: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />,
    x: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />,
    arrow: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />,
  };

  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {icons[name]}
    </svg>
  );
}

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu on resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setMobileMenuOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-lg border-b border-border/50">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="#" className="flex items-center">
            <Image
              src="/images/WCB - 500 dpi white on black BANNER.png"
              alt="Wake County Brusaders"
              width={140}
              height={40}
              className="h-8 w-auto"
            />
          </a>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            <a href="#benefits" className="text-sm text-foreground/60 hover:text-foreground transition-colors">What You Get</a>
            <a href="#pathways" className="text-sm text-foreground/60 hover:text-foreground transition-colors">Pathways</a>
            <a href="#events" className="text-sm text-foreground/60 hover:text-foreground transition-colors">Events</a>
          </nav>

          <div className="flex items-center gap-4">
            <a
              href="https://www.paypal.com/ncp/payment/UQ6VG5K69FC92"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex bg-accent hover:bg-accent-hover text-background text-sm font-medium px-5 py-2 rounded-full transition-colors"
            >
              Join
            </a>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-foreground/70 hover:text-foreground"
              aria-label="Toggle menu"
            >
              <Icon name={mobileMenuOpen ? "x" : "menu"} className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border/50 bg-background">
            <nav className="flex flex-col px-6 py-4 gap-4">
              <a href="#benefits" onClick={() => setMobileMenuOpen(false)} className="text-foreground/70 hover:text-foreground py-2">What You Get</a>
              <a href="#pathways" onClick={() => setMobileMenuOpen(false)} className="text-foreground/70 hover:text-foreground py-2">Pathways</a>
              <a href="#events" onClick={() => setMobileMenuOpen(false)} className="text-foreground/70 hover:text-foreground py-2">Events</a>
              <a
                href="https://www.paypal.com/ncp/payment/UQ6VG5K69FC92"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-accent text-background text-center font-medium px-5 py-3 rounded-full mt-2"
              >
                Join the Club
              </a>
            </nav>
          </div>
        )}
      </header>

      {/* ===== MOMENT 1: WHO WE ARE ===== */}
      <section className="py-32 md:py-40">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p className="text-accent font-medium tracking-wide uppercase text-sm mb-6">
            Holly Springs, NC — Est. 2023
          </p>

          <h1 className="text-4xl md:text-6xl font-bold mb-8 leading-tight">
            More than Just Beer
          </h1>

          <p className="text-xl md:text-2xl text-foreground/60 mb-12 leading-relaxed max-w-2xl mx-auto">
            A homebrewing community built on education, connection, and doing things your way.
            70% of what we offer works even if you never set foot in Holly Springs.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://www.paypal.com/ncp/payment/UQ6VG5K69FC92"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-background font-medium px-8 py-4 rounded-full transition-all"
            >
              Become a Brusader
              <Icon name="arrow" className="w-4 h-4" />
            </a>
          </div>

          <p className="text-foreground/40 text-sm mt-16">
            Award-winning club — Best Overall Club & Brewer&apos;s Cup, NCHI 2024–2025
          </p>
        </div>
      </section>

      {/* ===== MOMENT 2: WHAT MEMBERS GET ===== */}
      <section id="benefits" className="py-24 md:py-32 border-t border-border/30">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-16">
            What Members Get
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
            {benefits.map((benefit) => (
              <div key={benefit.title} className="flex gap-5">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <Icon name={benefit.icon} className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-1">{benefit.title}</h3>
                  <p className="text-foreground/60">{benefit.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pathways */}
      <section id="pathways" className="py-24 md:py-32 border-t border-border/30">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              Choose Your Path
            </h2>
            <p className="text-foreground/50">
              Do one, all four, or none. We don&apos;t care — it&apos;s your journey.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {pathways.map((path) => (
              <div
                key={path.name}
                className={`p-6 rounded-2xl border transition-colors ${
                  path.color === "emerald" ? "border-emerald-500/30 hover:border-emerald-500/50" :
                  path.color === "blue" ? "border-blue-500/30 hover:border-blue-500/50" :
                  path.color === "purple" ? "border-purple-500/30 hover:border-purple-500/50" :
                  "border-accent/30 hover:border-accent/50"
                }`}
              >
                <h3 className={`font-semibold mb-2 ${
                  path.color === "emerald" ? "text-emerald-400" :
                  path.color === "blue" ? "text-blue-400" :
                  path.color === "purple" ? "text-purple-400" :
                  "text-accent"
                }`}>
                  {path.name}
                </h3>
                <p className="text-sm text-foreground/50">{path.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== MOMENT 3: JOIN / EVENTS ===== */}
      <section id="events" className="py-24 md:py-32 border-t border-border/30">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-16">
            Upcoming Events
          </h2>

          <div className="bg-card-bg border border-border rounded-2xl overflow-hidden">
            <iframe
              src="https://calendar.google.com/calendar/embed?src=club%40wcbrusaders.com&ctz=America%2FNew_York&mode=AGENDA&showTitle=0&showNav=1&showPrint=0&showTabs=0&showCalendars=0&bgcolor=%231a1a1a"
              style={{ border: 0 }}
              width="100%"
              height="400"
              frameBorder="0"
              scrolling="no"
              className="w-full"
            />
          </div>
        </div>
      </section>

      {/* Contact CTA */}
      <section className="py-24 md:py-32 border-t border-border/30">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Ready to Join?
          </h2>
          <p className="text-foreground/60 mb-10">
            Questions? Reach out at{" "}
            <a href="mailto:club@wcbrusaders.com" className="text-accent hover:underline">
              club@wcbrusaders.com
            </a>
          </p>

          <a
            href="https://www.paypal.com/ncp/payment/UQ6VG5K69FC92"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-background font-medium px-10 py-4 rounded-full transition-all text-lg"
          >
            Become a Brusader
            <Icon name="arrow" className="w-5 h-5" />
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 border-t border-border/30 bg-card-bg/30">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-8">
            {/* Brand */}
            <div className="md:col-span-1">
              <Image
                src="/images/WCB - 500 dpi white on black BANNER.png"
                alt="Wake County Brusaders"
                width={120}
                height={35}
                className="h-7 w-auto mb-4"
              />
              <p className="text-sm text-foreground/40">
                Holly Springs, NC
              </p>
            </div>

            {/* Resources */}
            <div>
              <h4 className="font-medium text-sm text-foreground/70 mb-4">Resources</h4>
              <ul className="space-y-2">
                {resources.map((link) => (
                  <li key={link.title}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-foreground/50 hover:text-foreground transition-colors"
                    >
                      {link.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Connect */}
            <div>
              <h4 className="font-medium text-sm text-foreground/70 mb-4">Connect</h4>
              <ul className="space-y-2">
                <li>
                  <a
                    href="https://www.facebook.com/groups/wakecountybrusaders"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-foreground/50 hover:text-foreground transition-colors"
                  >
                    Facebook Group
                  </a>
                </li>
                <li>
                  <a
                    href="mailto:club@wcbrusaders.com"
                    className="text-sm text-foreground/50 hover:text-foreground transition-colors"
                  >
                    club@wcbrusaders.com
                  </a>
                </li>
                <li>
                  <a
                    href="https://photos.google.com/album/AF1QipM-ZK-nI0tw9r2q4SEpXUGbIxGRrrGeR1ERCb3C"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-foreground/50 hover:text-foreground transition-colors"
                  >
                    Photo Gallery
                  </a>
                </li>
              </ul>
            </div>

            {/* Partners */}
            <div>
              <h4 className="font-medium text-sm text-foreground/70 mb-4">Partners</h4>
              <div className="flex flex-col gap-4">
                <a
                  href="https://www.masterhomebrewerprogram.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="opacity-50 hover:opacity-100 transition-opacity"
                >
                  <Image src="/images/MHP.jpg" alt="Master Homebrewer Program" width={80} height={40} className="h-8 w-auto grayscale hover:grayscale-0 transition-all" />
                </a>
                <a
                  href="https://southeasternhomebrewersassociation.com/sehba/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="opacity-50 hover:opacity-100 transition-opacity"
                >
                  <Image src="/images/southeastern homebrewers association-wider.png" alt="SHA" width={80} height={40} className="h-8 w-auto grayscale hover:grayscale-0 transition-all" />
                </a>
              </div>
            </div>
          </div>

          {/* Bottom */}
          <div className="mt-12 pt-8 border-t border-border/30 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
            <p className="text-xs text-foreground/30">
              © {new Date().getFullYear()} Wake County Brusaders
            </p>
            <p className="text-xs text-foreground/40">
              Proud SHA member · Est. 2023
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
