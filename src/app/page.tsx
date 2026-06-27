"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";

// Minimal benefits - icon + one-liner
const benefits = [
  { icon: "calendar", title: "Monthly Meetings", desc: "Third Thursdays, in-person or remote" },
  { icon: "bot", title: "WCB Bot", desc: "300+ yeasts, 140+ hops, 90 grains, recipe creation", link: "/bot" },
  { icon: "graduation", title: "290 Learning Modules", desc: "Five tiers from Foundations to Expert" },
  { icon: "gift", title: "Member Perks", desc: "Group buys, competition support, industry discounts" },
];

// Three pathways
const pathways = [
  { name: "Technical", color: "blue", desc: "Water chemistry to fermentation science" },
  { name: "Creative", color: "purple", desc: "Adjuncts, barrel aging, wild fermentation" },
  { name: "Competition", color: "orange", desc: "BJCP prep, scoresheets, medal chasing" },
];

const taplistLinks = [
  {
    tag: "Docs",
    title: "Community Documents",
    desc: "Bylaws, officer docs, and the club's shared planning files.",
    href: "https://drive.google.com/drive/u/1/folders/0AH3fezsxCD4DUk9PVA",
  },
  {
    tag: "Learn",
    title: "Brewing Knowledge Base",
    desc: "The club's growing reference library on process, ingredients, and technique.",
    href: "https://drive.google.com/drive/folders/1Von8YTFkyQ3fGC8DbC-Augwlwvhe0rRA",
  },
  {
    tag: "Recipes",
    title: "Recipe Library",
    desc: "House recipes, medal winners, and member-shared brews.",
    href: "https://drive.google.com/drive/folders/1NGuf6ImU6UxivQPbPGWl91tETUzzzN77",
  },
];

const taplistSupportingLinks = [
  {
    title: "Workshop Guides",
    desc: "One-pagers for off-flavor classes, water labs, and seasonal projects.",
    href: "https://drive.google.com/drive/folders/1hLeWLw-6kGqwccWdsPTzO32eW_5FKk18",
  },
  {
    title: "Meeting Agendas & Notes",
    desc: "Decisions, takeaways, and follow-ups from each meetup.",
    href: "https://drive.google.com/drive/u/1/folders/1hYiIV6NnhFHCItJuZ4Je2KjDUz0Ktk8h",
  },
  {
    title: "Buy Merch",
    desc: "Grab a club shirt and rep the Brusaders.",
    href: "https://www.paypal.com/ncp/payment/FCVUVRTUH3VH6",
  },
  {
    title: "Master Homebrewer Program",
    desc: "External certification track for serious homebrewers.",
    href: "https://www.masterhomebrewerprogram.com/",
  },
  {
    title: "Southeastern Homebrewers Association",
    desc: "Regional homebrew association (SEHBA) and its resources.",
    href: "https://southeasternhomebrewersassociation.com/sehba/",
  },
];

// Subscribable club calendars (Google + iCal/webcal for Apple & Outlook)
const calendars = [
  {
    name: "WCB Events",
    desc: "Meetings, workshops, and club happenings",
    google: "https://calendar.google.com/calendar/render?cid=Y2x1YkB3Y2JydXNhZGVycy5jb20",
    ical: "webcal://calendar.google.com/calendar/ical/club%40wcbrusaders.com/public/basic.ics",
  },
  {
    name: "Competitions",
    desc: "Homebrewing competitions and deadlines",
    google: "https://calendar.google.com/calendar/render?cid=c_f9713ce58c0973c9d1228c2e66c0e5a276c4f4539765744f0e41bf69636194af%40group.calendar.google.com",
    ical: "webcal://calendar.google.com/calendar/ical/c_f9713ce58c0973c9d1228c2e66c0e5a276c4f4539765744f0e41bf69636194af%40group.calendar.google.com/public/basic.ics",
  },
];

// Footer resources
const resources = [
  { title: "Knowledge Base", href: "https://drive.google.com/drive/folders/1Von8YTFkyQ3fGC8DbC-Augwlwvhe0rRA" },
  { title: "Recipe Library", href: "https://drive.google.com/drive/folders/1NGuf6ImU6UxivQPbPGWl91tETUzzzN77" },
  { title: "Workshop Guides", href: "https://drive.google.com/drive/folders/1hLeWLw-6kGqwccWdsPTzO32eW_5FKk18" },
  { title: "Meeting Notes", href: "https://drive.google.com/drive/u/1/folders/1hYiIV6NnhFHCItJuZ4Je2KjDUz0Ktk8h" },
];

// Simple icon components
function Icon({ name, className = "w-5 h-5" }: { name: string; className?: string }) {
  const icons: Record<string, React.ReactNode> = {
    calendar: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />,
    bot: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5M4.5 15.75H3m18 0h-1.5M12 3v1.5m0 15V21m-6.75-3.75h13.5a2.25 2.25 0 002.25-2.25V9a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9v6a2.25 2.25 0 002.25 2.25zM9 12h.008v.008H9V12zm3 0h.008v.008H12V12zm3 0h.008v.008H15V12z" />,
    graduation: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />,
    gift: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />,
    beer: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M6.75 5.25c0-.621.504-1.125 1.125-1.125h7.25c.621 0 1.125.504 1.125 1.125v13.5a1.125 1.125 0 01-1.125 1.125h-7.25A1.125 1.125 0 016.75 18.75v-4.5m0-9h10.5m-10.5 0v4.5m0 0H9m-2.25 0h-1.5m1.5 0v4.5m0 0H9m-2.25 0h-1.5"
      />
    ),
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

          <nav className="hidden md:flex items-center gap-8">
            <a href="#benefits" className="text-sm text-foreground/60 hover:text-foreground transition-colors">What You Get</a>
            <a href="#pathways" className="text-sm text-foreground/60 hover:text-foreground transition-colors">Pathways</a>
            <a href="#taplist" className="text-sm text-foreground/60 hover:text-foreground transition-colors">Taplist</a>
            <a href="#events" className="text-sm text-foreground/60 hover:text-foreground transition-colors">Events</a>
            <Link href="/bot" className="text-sm text-foreground/60 hover:text-foreground transition-colors">WCB Bot</Link>
          </nav>

          <div className="flex items-center gap-4">
            <a
              href="https://www.paypal.com/ncp/payment/UQ6VG5K69FC92"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex bg-accent hover:bg-accent-hover text-background text-sm font-medium px-5 py-2 rounded-full transition-colors"
            >
              Become a Brusader
            </a>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-foreground/70 hover:text-foreground"
              aria-label="Toggle menu"
            >
              <Icon name={mobileMenuOpen ? "x" : "menu"} className="w-6 h-6" />
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border/50 bg-background">
            <nav className="flex flex-col px-6 py-4 gap-4">
              <a href="#benefits" onClick={() => setMobileMenuOpen(false)} className="text-foreground/70 hover:text-foreground py-2">What You Get</a>
              <a href="#pathways" onClick={() => setMobileMenuOpen(false)} className="text-foreground/70 hover:text-foreground py-2">Pathways</a>
              <a href="#taplist" onClick={() => setMobileMenuOpen(false)} className="text-foreground/70 hover:text-foreground py-2">Taplist</a>
              <a href="#events" onClick={() => setMobileMenuOpen(false)} className="text-foreground/70 hover:text-foreground py-2">Events</a>
              <Link href="/bot" onClick={() => setMobileMenuOpen(false)} className="text-foreground/70 hover:text-foreground py-2">WCB Bot</Link>
              <a
                href="https://www.paypal.com/ncp/payment/UQ6VG5K69FC92"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-accent text-background text-center font-medium px-5 py-3 rounded-full mt-2"
              >
                Become a Brusader
              </a>
            </nav>
          </div>
        )}
      </header>

      {/* ===== HERO ===== */}
      <section className="py-28 md:py-36">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p className="text-accent font-medium tracking-wide uppercase text-sm mb-6">
            Holly Springs, NC — Est. 2023
          </p>

          <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            More than Just Beer
          </h1>

          <p className="text-xl md:text-2xl text-foreground/60 mb-4 leading-relaxed max-w-2xl mx-auto">
            A homebrewing community built on education, connection, and doing things your way.
          </p>

          <p className="text-lg text-foreground/50 mb-10">
            70% of what we offer works even if you never visit Holly Springs.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
            <a
              href="https://www.paypal.com/ncp/payment/UQ6VG5K69FC92"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-background font-medium px-8 py-4 rounded-full transition-all"
            >
              Become a Brusader
              <Icon name="arrow" className="w-4 h-4" />
            </a>
            <a
              href="#taplist"
              className="inline-flex items-center justify-center gap-2 bg-foreground/5 hover:bg-foreground/10 text-foreground font-medium px-8 py-4 rounded-full border border-border transition-all"
            >
              Jump to the Taplist
              <Icon name="beer" className="w-4 h-4" />
            </a>
          </div>

          <p className="text-foreground/40 text-sm">
            No experience required
          </p>
        </div>
      </section>

      {/* ===== CREDIBILITY BAR ===== */}
      <section className="py-8 border-y border-border/30 bg-card-bg/30">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12 text-center">
            <div>
              <p className="text-accent font-semibold">Best Overall Club</p>
              <p className="text-sm text-foreground/50">NCHI 2025 · Chosen from 18 clubs</p>
            </div>
            <div className="hidden md:block w-px h-8 bg-border/50" />
            <div>
              <p className="text-accent font-semibold">Brewer&apos;s Cup Winners</p>
              <p className="text-sm text-foreground/50">NCHI 2024</p>
            </div>
            <div className="hidden md:block w-px h-8 bg-border/50" />
            <div>
              <p className="text-accent font-semibold">Growing 20%</p>
              <p className="text-sm text-foreground/50">Growth phase, fresh energy</p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== MORE THAN BEER ===== */}
      <section className="py-24 md:py-32 border-t border-border/30">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-6">
            Beer is just where it starts
          </h2>
          <p className="text-lg text-foreground/60 leading-relaxed mb-6">
            We don&apos;t just bring brewers and beer lovers together. Mead, cider,
            kombucha, hot sauce, sourdough, pickles, kraut — if it ferments, it has a
            home here. Anything fermentable, including food, is fair game.
          </p>
          <p className="text-lg text-foreground/60 leading-relaxed">
            And honestly? The best thing we make isn&apos;t in a glass. Making real
            friends as an adult is hard. A shared craft, a regular table, and people who
            actually show up — that&apos;s how lifelong friendships get built. We can
            help there too.
          </p>
        </div>
      </section>

      {/* ===== WHAT MEMBERS GET ===== */}
      <section id="benefits" className="py-24 md:py-32">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-6">
            What Members Get
          </h2>
          <p className="text-center text-foreground/50 mb-16 max-w-xl mx-auto">
            Deep roots in the Triangle brewing scene — access to people and places, opportunities only a club can deliver like pro-brewery collabs, and a community that can&apos;t be replicated anywhere else.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
            {benefits.map((benefit) => {
              const content = (
                <>
                  <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0 group-hover:bg-accent/20 transition-colors">
                    <Icon name={benefit.icon} className="w-6 h-6 text-accent" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-1">{benefit.title}</h3>
                    <p className="text-foreground/60">{benefit.desc}</p>
                    {benefit.link && (
                      <p className="text-accent text-sm mt-2 group-hover:underline">Learn more →</p>
                    )}
                  </div>
                </>
              );

              return benefit.link ? (
                <Link key={benefit.title} href={benefit.link} className="flex gap-5 group">
                  {content}
                </Link>
              ) : (
                <div key={benefit.title} className="flex gap-5">
                  {content}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== PATHWAYS ===== */}
      <section id="pathways" className="py-24 md:py-32 border-t border-border/30">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-6">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              290 Modules. 98 Badges. Your Pace.
            </h2>
            <p className="text-foreground/50 max-w-xl mx-auto">
              Three pathways across five tiers — Foundations to Expert.
              Earn badges as you learn, or skip them entirely. No pressure.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12">
            {pathways.map((path) => (
              <div
                key={path.name}
                className={`p-6 rounded-2xl border transition-colors ${
                  path.color === "blue" ? "border-blue-500/30 hover:border-blue-500/50" :
                  path.color === "purple" ? "border-purple-500/30 hover:border-purple-500/50" :
                  "border-accent/30 hover:border-accent/50"
                }`}
              >
                <h3 className={`font-semibold text-lg mb-2 ${
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

          <p className="text-center text-foreground/40 text-sm mt-10">
            Mix and match pathways, or just hang out. There&apos;s no wrong way to be a Brusader.
          </p>
        </div>
      </section>

      {/* ===== TAPLIST ===== */}
      <section id="taplist" className="py-24 md:py-32 border-t border-border/30">
        <div className="max-w-5xl mx-auto px-6">
          <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-gradient-to-br from-card-bg/60 via-card-bg to-black/40 p-8 md:p-12">
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
              <div className="absolute -left-16 bottom-0 h-48 w-48 rounded-full bg-accent/5 blur-3xl" />
            </div>

            <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-10">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-foreground/50 mb-3">Taplist</p>
                <h2 className="text-2xl md:text-3xl font-bold mb-3">Resources On Tap</h2>
                <p className="text-foreground/60 max-w-2xl">
                  The club&apos;s most-used links and shared docs, all in one place — tap in whenever you need them.
                </p>
              </div>
              <div className="flex items-center gap-3 bg-accent/10 text-accent px-4 py-2 rounded-full border border-accent/30">
                <Icon name="arrow" className="w-5 h-5" />
                <span className="text-sm font-medium">Curated by the club</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 relative">
              {taplistLinks.map((item) => (
                <a
                  key={item.title}
                  href={item.href}
                  target={item.href.startsWith("http") ? "_blank" : undefined}
                  rel={item.href.startsWith("http") ? "noopener noreferrer" : undefined}
                  aria-label={`${item.title}${item.href.startsWith("http") ? " (opens in a new tab)" : ""}`}
                  className="group relative p-5 rounded-2xl border border-border/50 hover:border-accent/60 bg-card-bg/50 hover:bg-card-hover transition-colors link-card"
                >
                  <div className="absolute inset-0 rounded-2xl border border-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs bg-foreground/5 text-foreground/70 border border-border/60 mb-3">
                        <span className="inline-block h-2 w-2 rounded-full bg-accent" />
                        {item.tag}
                      </div>
                      <h3 className="text-lg font-semibold mb-1">{item.title}</h3>
                      <p className="text-sm text-foreground/60 leading-relaxed">{item.desc}</p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent border border-accent/30 group-hover:translate-x-1 transition-transform">
                      <Icon name="arrow" className="w-4 h-4" />
                    </div>
                  </div>
                </a>
              ))}
            </div>

            <div className="mt-10 rounded-2xl border border-border/50 bg-card-bg/60 p-5 md:p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-foreground/50">More Resources</p>
                  <h3 className="text-lg font-semibold">Guides, notes, merch, and partner organizations</h3>
                </div>
                <div className="inline-flex items-center gap-2 text-sm text-foreground/60 bg-foreground/5 border border-border/60 px-3 py-1 rounded-full">
                  <span className="inline-block h-2 w-2 rounded-full bg-foreground/50" />
                  Curated by the club
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {taplistSupportingLinks.map((link) => (
                  <a
                    key={link.title}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${link.title} (opens in a new tab)`}
                    className="group flex flex-col gap-1 rounded-xl border border-border/60 hover:border-accent/60 bg-background/60 px-4 py-3 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground/90">{link.title}</p>
                      <Icon name="arrow" className="w-4 h-4 text-foreground/50 group-hover:text-accent transition-colors" />
                    </div>
                    <p className="text-xs text-foreground/60 leading-relaxed">{link.desc}</p>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== EVENTS ===== */}
      <section id="events" className="py-24 md:py-32 border-t border-border/30">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-16">
            Upcoming Events
          </h2>

          <div className="bg-card-bg border border-border rounded-2xl overflow-hidden">
            <iframe
              src="https://calendar.google.com/calendar/embed?src=club%40wcbrusaders.com&src=c_f9713ce58c0973c9d1228c2e66c0e5a276c4f4539765744f0e41bf69636194af%40group.calendar.google.com&ctz=America%2FNew_York&mode=AGENDA&showTitle=0&showNav=1&showPrint=0&showTabs=0&showCalendars=0&bgcolor=%231a1a1a"
              style={{ border: 0 }}
              width="100%"
              height="400"
              frameBorder="0"
              scrolling="no"
              className="w-full"
            />
          </div>

          {/* Subscribe to calendars */}
          <div className="mt-8">
            <p className="text-center text-foreground/60 mb-6">
              Never miss an event — add our calendars to your own:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
              {calendars.map((cal) => (
                <div key={cal.name} className="rounded-2xl border border-border bg-card-bg/50 p-5">
                  <div className="flex items-start gap-2 mb-4">
                    <Icon name="calendar" className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-semibold leading-tight">{cal.name}</h3>
                      <p className="text-sm text-foreground/50">{cal.desc}</p>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <a
                      href={cal.google}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-background text-sm font-medium px-4 py-2 rounded-full transition-colors"
                    >
                      Add to Google
                    </a>
                    <a
                      href={cal.ical}
                      className="inline-flex items-center justify-center gap-2 bg-foreground/5 hover:bg-foreground/10 text-foreground text-sm font-medium px-4 py-2 rounded-full border border-border transition-colors"
                    >
                      Apple / Outlook
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="py-24 md:py-32 border-t border-border/30">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Ready to Join?
          </h2>
          <p className="text-foreground/60 mb-8">
            No experience required. Our Foundations tier starts from zero.
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

          <p className="text-foreground/40 text-sm mt-6">
            Questions? <a href="mailto:club@wcbrusaders.com" className="text-accent hover:underline">club@wcbrusaders.com</a>
          </p>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="py-16 border-t border-border/30 bg-card-bg/30">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-8">
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
                <li>
                  <Link
                    href="/bot"
                    className="text-sm text-foreground/50 hover:text-foreground transition-colors"
                  >
                    WCB Bot
                  </Link>
                </li>
              </ul>
            </div>

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
