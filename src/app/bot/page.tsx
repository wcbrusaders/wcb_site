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

// Example queries by category
const queryCategories = [
  {
    name: "Recipe Development",
    color: "accent",
    queries: [
      "Create a recipe for a hazy IPA with Citra and Galaxy",
      "Design a German pilsner with traditional ingredients",
      "I want to clone Pliny the Elder — what do I need to know?",
    ],
  },
  {
    name: "Photo Analysis",
    color: "pink",
    queries: [
      "[Upload photo] Does this look right for an American wheat?",
      "[Upload photo] Rate my lager's clarity and color",
      "[Upload photo] What style does this beer look like?",
      "[Upload photo] Is this haze from yeast or chill haze?",
    ],
  },
  {
    name: "Yeast & Fermentation",
    color: "blue",
    queries: [
      "What's the difference between US-05 and Nottingham?",
      "Show me Belgian yeast strains that are POF+",
      "Will US-05 introduce biotransformative properties if I pitch hops during high krausen?",
      "Why did my beer finish at 1.020 when I expected 1.010?",
    ],
  },
  {
    name: "Hops",
    color: "emerald",
    queries: [
      "I want more tropical fruit in my IPA — which hops should I use?",
      "What hops are similar to Citra but cheaper?",
      "Explain the science of biotransformation in dry hopping",
      "What's the difference between whirlpool and dry hop additions?",
    ],
  },
  {
    name: "Water Chemistry",
    color: "cyan",
    queries: [
      "What water profile should I use for a Czech pilsner?",
      "My tap water is 200 ppm chloride — how do I adjust for an IPA?",
      "Explain sulfate to chloride ratio and how it affects flavor",
    ],
  },
  {
    name: "Adjuncts & Specialty",
    color: "purple",
    queries: [
      "How much fruit should I add to a 5-gallon sour?",
      "When should I add vanilla beans and how many?",
      "I want to add coconut to a stout — fresh, toasted, or extract?",
      "How do I add lactose for a milkshake IPA?",
    ],
  },
  {
    name: "Troubleshooting",
    color: "red",
    queries: [
      "My beer tastes like butter — what went wrong?",
      "Why does my IPA have a harsh, lingering bitterness?",
      "I have a stuck fermentation at 1.030 — how do I fix it?",
      "My lager has a sulfur smell — is it ruined?",
    ],
  },
  {
    name: "BJCP & Competition",
    color: "amber",
    queries: [
      "What are the style parameters for American IPA?",
      "How do I improve my scoresheet feedback for aroma?",
      "What's the difference between a Helles and a Munich Dunkel?",
    ],
  },
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

      {/* Feature Callouts */}
      <section className="py-12 border-y border-border/30">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl bg-accent/5 border border-accent/20">
              <h3 className="text-lg font-bold mb-2 text-accent">Recipe Creation & Export</h3>
              <p className="text-foreground/60 text-sm">
                Generate full recipes based on your goals and export as XML
                for BeerSmith, Brewfather, or your preferred brewing software.
              </p>
            </div>
            <div className="p-6 rounded-2xl bg-pink-500/5 border border-pink-500/20">
              <h3 className="text-lg font-bold mb-2 text-pink-400">Beer Photo Analysis</h3>
              <p className="text-foreground/60 text-sm">
                Upload a photo of your beer and get BJCP appearance feedback —
                color, clarity, head retention, and style accuracy.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Example Queries */}
      <section className="py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-4">
            What Can You Ask?
          </h2>
          <p className="text-center text-foreground/50 mb-12">
            Real questions members ask every day
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {queryCategories.map((category) => (
              <div
                key={category.name}
                className={`p-5 rounded-2xl border bg-card-bg/20 ${
                  category.color === "accent" ? "border-accent/30" :
                  category.color === "pink" ? "border-pink-500/30" :
                  category.color === "blue" ? "border-blue-500/30" :
                  category.color === "emerald" ? "border-emerald-500/30" :
                  category.color === "cyan" ? "border-cyan-500/30" :
                  category.color === "purple" ? "border-purple-500/30" :
                  category.color === "red" ? "border-red-500/30" :
                  category.color === "amber" ? "border-amber-500/30" :
                  "border-border/50"
                }`}
              >
                <h3 className={`font-semibold mb-4 ${
                  category.color === "accent" ? "text-accent" :
                  category.color === "pink" ? "text-pink-400" :
                  category.color === "blue" ? "text-blue-400" :
                  category.color === "emerald" ? "text-emerald-400" :
                  category.color === "cyan" ? "text-cyan-400" :
                  category.color === "purple" ? "text-purple-400" :
                  category.color === "red" ? "text-red-400" :
                  category.color === "amber" ? "text-amber-400" :
                  "text-foreground"
                }`}>
                  {category.name}
                </h3>
                <ul className="space-y-3">
                  {category.queries.map((query, idx) => (
                    <li key={idx} className="text-sm text-foreground/60 leading-relaxed">
                      <span className="text-foreground/30 mr-1">"</span>
                      {query}
                      <span className="text-foreground/30 ml-1">"</span>
                    </li>
                  ))}
                </ul>
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
