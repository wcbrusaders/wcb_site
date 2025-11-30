import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "WCB Bot — AI Brewing Assistant | Wake County Brusaders",
  description: "24/7 AI brewing assistant with 300+ yeasts, 140+ hops, 90 grains, BJCP guidelines, recipe creation, and natural language Q&A. A member benefit of Wake County Brusaders.",
  keywords: ["brewing assistant", "homebrew bot", "BJCP", "yeast strains", "hop varieties", "brewing calculator"],
};

// Knowledge base stats
const knowledgeBase = [
  { category: "Yeast Strains", count: "300+", detail: "Genetic markers (POF+/-, STA1+/-), flavor profiles, fermentation ranges" },
  { category: "Hop Varieties", count: "140+", detail: "Alpha acids, oil profiles, aroma descriptors, substitutions" },
  { category: "Grain Types", count: "90", detail: "SRM ratings, flavor contributions, mash recommendations" },
  { category: "Science Modules", count: "155+", detail: "Water chemistry, fermentation kinetics, yeast biology, mash chemistry" },
  { category: "BJCP Guidelines", count: "Full 2021", detail: "Beer and cider styles with parameters, appearance, aroma, flavor" },
  { category: "Calculators", count: "Built-in", detail: "ABV, IBU, SRM, gravity correction, dilution, priming sugar" },
];

// Capabilities
const capabilities = [
  "Answer natural language questions about any brewing topic",
  "Analyze beer photos against BJCP appearance standards",
  "Create full recipes with XML export for your brewing software",
  "Explain the science behind any technique",
  "Guide adjunct, fruit, and specialty ingredient usage",
  "Compare yeast strains, hops, or grains side-by-side",
  "Help troubleshoot off-flavors and fermentation issues",
  "Suggest recipe adjustments based on your goals",
];

// Example queries
const exampleQueries = [
  "Will US-05 introduce biotransformative properties if I pitch hops during high krausen?",
  "What's the difference between US-05 and Nottingham?",
  "I want more tropical fruit in my IPA — which hops should I use?",
  "Why did my beer finish at 1.020?",
  "Show me Belgian yeast strains that are POF+",
  "How much fruit should I add to a 5-gallon sour?",
  "Create a recipe for a hazy IPA with Citra and Galaxy",
];

export default function BotPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-lg border-b border-border/50">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Image
              src="/images/WCB - 500 dpi white on black BANNER.png"
              alt="Wake County Brusaders"
              width={140}
              height={40}
              className="h-8 w-auto"
            />
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            <Link href="/#benefits" className="text-sm text-foreground/60 hover:text-foreground transition-colors">What You Get</Link>
            <Link href="/#pathways" className="text-sm text-foreground/60 hover:text-foreground transition-colors">Pathways</Link>
            <Link href="/#events" className="text-sm text-foreground/60 hover:text-foreground transition-colors">Events</Link>
          </nav>

          <a
            href="https://www.paypal.com/ncp/payment/UQ6VG5K69FC92"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex bg-accent hover:bg-accent-hover text-background text-sm font-medium px-5 py-2 rounded-full transition-colors"
          >
            Join — $40/yr
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="py-24 md:py-32">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p className="text-accent font-medium tracking-wide uppercase text-sm mb-6">
            Member Benefit
          </p>

          <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
            WCB Bot
          </h1>

          <p className="text-xl md:text-2xl text-foreground/60 mb-4">
            Your 24/7 AI Brewing Assistant
          </p>

          <p className="text-lg text-foreground/50 max-w-xl mx-auto">
            Ask questions in plain English. Get answers backed by science.
            Create recipes. Export to your brewing software.
          </p>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="py-6 border-y border-border/30 bg-card-bg/30">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div>
              <p className="text-2xl font-bold text-accent">300+</p>
              <p className="text-sm text-foreground/50">Yeast Strains</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-accent">140+</p>
              <p className="text-sm text-foreground/50">Hop Varieties</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-accent">155+</p>
              <p className="text-sm text-foreground/50">Science Modules</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-accent">65K+</p>
              <p className="text-sm text-foreground/50">Lines of Content</p>
            </div>
          </div>
        </div>
      </section>

      {/* What It Knows */}
      <section className="py-20 md:py-28">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">
            What It Knows
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {knowledgeBase.map((item) => (
              <div
                key={item.category}
                className="p-6 rounded-2xl border border-border/50 bg-card-bg/30"
              >
                <div className="flex items-baseline gap-3 mb-2">
                  <span className="text-xl font-bold text-accent">{item.count}</span>
                  <span className="font-semibold text-foreground">{item.category}</span>
                </div>
                <p className="text-sm text-foreground/50">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What It Can Do */}
      <section className="py-20 md:py-28 border-t border-border/30">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">
            What It Can Do
          </h2>

          <div className="max-w-2xl mx-auto">
            <ul className="space-y-4">
              {capabilities.map((capability, index) => (
                <li key={index} className="flex items-start gap-3">
                  <span className="text-accent mt-1">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <span className="text-foreground/80">{capability}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Recipe Export Callout */}
      <section className="py-12 border-y border-border/30 bg-accent/5">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h3 className="text-xl font-bold mb-3">Recipe Creation & Export</h3>
          <p className="text-foreground/60">
            WCB Bot can generate full recipes based on your goals and export them as XML
            for import into BeerSmith, Brewfather, or your preferred brewing software.
          </p>
        </div>
      </section>

      {/* Example Queries */}
      <section className="py-20 md:py-28">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-4">
            Example Questions
          </h2>
          <p className="text-center text-foreground/50 mb-12">
            Real queries members ask every day
          </p>

          <div className="max-w-2xl mx-auto space-y-3">
            {exampleQueries.map((query, index) => (
              <div
                key={index}
                className="p-4 rounded-xl bg-card-bg border border-border/50 text-foreground/70 text-sm"
              >
                <span className="text-accent font-mono mr-2">&gt;</span>
                {query}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Access CTA */}
      <section className="py-20 md:py-28 border-t border-border/30">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Get Access
          </h2>
          <p className="text-foreground/60 mb-8">
            WCB Bot is a member benefit, available 24/7 in our Discord server.
            Join the club to unlock the assistant and 290 learning modules.
          </p>

          <a
            href="https://www.paypal.com/ncp/payment/UQ6VG5K69FC92"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-background font-medium px-10 py-4 rounded-full transition-all text-lg"
          >
            Become a Member — $40/yr
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </a>

          <p className="text-foreground/40 text-sm mt-6">
            Questions? <a href="mailto:club@wcbrusaders.com" className="text-accent hover:underline">club@wcbrusaders.com</a>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border/30 bg-card-bg/30">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <Link href="/" className="flex items-center">
              <Image
                src="/images/WCB - 500 dpi white on black BANNER.png"
                alt="Wake County Brusaders"
                width={100}
                height={30}
                className="h-6 w-auto"
              />
            </Link>

            <div className="flex items-center gap-6 text-sm text-foreground/50">
              <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
              <Link href="/#benefits" className="hover:text-foreground transition-colors">Benefits</Link>
              <Link href="/#events" className="hover:text-foreground transition-colors">Events</Link>
              <a href="mailto:club@wcbrusaders.com" className="hover:text-foreground transition-colors">Contact</a>
            </div>

            <p className="text-xs text-foreground/30">
              © {new Date().getFullYear()} Wake County Brusaders
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
