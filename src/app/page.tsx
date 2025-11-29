"use client";

import Image from "next/image";
import { useState, useEffect } from "react";

// Link data for the Tap List
const tapListLinks = [
  {
    title: "Facebook Group",
    description: "Connect with fellow brewers",
    href: "https://www.facebook.com/groups/wakecountybrusaders",
    emoji: "👥",
  },
  {
    title: "Become a Member",
    description: "Join our brewing community",
    href: "https://www.paypal.com/ncp/payment/UQ6VG5K69FC92",
    emoji: "🍺",
  },
  {
    title: "Community Documents",
    description: "Club resources and materials",
    href: "https://drive.google.com/drive/u/1/folders/0AH3fezsxCD4DUk9PVA",
    emoji: "📄",
  },
  {
    title: "Meeting Agendas & Notes",
    description: "Past and upcoming meeting info",
    href: "https://drive.google.com/drive/u/1/folders/1hYiIV6NnhFHCItJuZ4Je2KjDUz0Ktk8h",
    emoji: "📅",
  },
  {
    title: "Brewing Knowledge Base",
    description: "Learn brewing techniques",
    href: "https://drive.google.com/drive/folders/1Von8YTFkyQ3fGC8DbC-Augwlwvhe0rRA",
    emoji: "🤓",
  },
  {
    title: "Workshop Guides",
    description: "Hands-on brewing tutorials",
    href: "https://drive.google.com/drive/folders/1hLeWLw-6kGqwccWdsPTzO32eW_5FKk18",
    emoji: "📑",
  },
  {
    title: "Recipe Library",
    description: "Member-shared recipes",
    href: "https://drive.google.com/drive/folders/1NGuf6ImU6UxivQPbPGWl91tETUzzzN77",
    emoji: "📚",
  },
  {
    title: "Buy Merch & Shirts",
    description: "Show your WCB pride",
    href: "https://www.paypal.com/ncp/payment/FCVUVRTUH3VH6",
    emoji: "🛍️",
  },
];

// Partner organizations
const partnerOrgs = [
  {
    name: "Master Home Brewer Program",
    href: "https://www.masterhomebrewerprogram.com/",
    image: "/images/MHP.jpg",
  },
  {
    name: "Southeastern Homebrewers Association",
    href: "https://southeasternhomebrewersassociation.com/sehba/",
    image: "/images/southeastern homebrewers association-wider.png",
  },
];

// Slideshow images
const slideshowImages = [
  "/images/slideshow/20230817_195050.jpg",
  "/images/slideshow/20240507_183243.jpg",
  "/images/slideshow/20241019_120253.jpg",
  "/images/slideshow/20241121_183601.jpg",
  "/images/slideshow/club meet1.png",
];

// Slideshow component
function PhotoSlideshow() {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % slideshowImages.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const goToSlide = (index: number) => setCurrentIndex(index);
  const goToPrevious = () => setCurrentIndex((prev) => (prev - 1 + slideshowImages.length) % slideshowImages.length);
  const goToNext = () => setCurrentIndex((prev) => (prev + 1) % slideshowImages.length);

  return (
    <div className="relative w-full max-w-4xl mx-auto">
      <div className="relative aspect-video rounded-2xl overflow-hidden bg-card-bg border border-border shadow-2xl">
        {slideshowImages.map((src, index) => (
          <div
            key={src}
            className={`absolute inset-0 transition-opacity duration-700 ${
              index === currentIndex ? "opacity-100" : "opacity-0"
            }`}
          >
            <Image src={src} alt={`Club photo ${index + 1}`} fill className="object-cover" priority={index === 0} />
          </div>
        ))}
        <button
          onClick={goToPrevious}
          className="absolute left-4 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-accent text-foreground hover:text-background p-3 rounded-full transition-all"
          aria-label="Previous image"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={goToNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-accent text-foreground hover:text-background p-3 rounded-full transition-all"
          aria-label="Next image"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      <div className="flex justify-center gap-2 mt-6">
        {slideshowImages.map((_, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`w-2.5 h-2.5 rounded-full transition-all ${
              index === currentIndex ? "bg-accent w-8" : "bg-foreground/30 hover:bg-foreground/50"
            }`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-lg border-b border-border/50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <a href="#" className="flex items-center gap-3 group">
            <Image
              src="/images/WCBBanner.jpg"
              alt="Wake County Brusaders"
              width={44}
              height={44}
              className="w-11 h-11 rounded-full object-cover ring-2 ring-accent/50 group-hover:ring-accent transition-all"
            />
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold text-foreground leading-tight">
                Wake County <span className="text-accent">Brusaders</span>
              </h1>
              <p className="text-xs text-foreground/50">More than Just Beer</p>
            </div>
          </a>
          <nav className="hidden md:flex items-center gap-8">
            <a href="#about" className="text-sm text-foreground/70 hover:text-accent transition-colors">About</a>
            <a href="#tap-list" className="text-sm text-foreground/70 hover:text-accent transition-colors">Resources</a>
            <a href="#calendar" className="text-sm text-foreground/70 hover:text-accent transition-colors">Events</a>
            <a href="#gallery" className="text-sm text-foreground/70 hover:text-accent transition-colors">Gallery</a>
            <a href="#contact" className="text-sm text-foreground/70 hover:text-accent transition-colors">Contact</a>
          </nav>
          <a
            href="https://www.paypal.com/ncp/payment/UQ6VG5K69FC92"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-accent hover:bg-accent-hover text-background text-sm font-semibold px-5 py-2.5 rounded-full transition-all hover:scale-105"
          >
            Join
          </a>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative min-h-[80vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/20 via-background to-background" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_40%,rgba(255,149,0,0.1),transparent_50%)]" />

        <div className="max-w-6xl mx-auto px-4 py-20 text-center relative z-10">
          <div className="mb-10 animate-fade-in-up">
            <div className="w-36 h-36 md:w-44 md:h-44 mx-auto rounded-full bg-card-bg border-4 border-accent shadow-[0_0_60px_rgba(255,149,0,0.3)] flex items-center justify-center overflow-hidden">
              <Image
                src="/images/WCBBanner.jpg"
                alt="Wake County Brusaders Logo"
                width={176}
                height={176}
                className="w-full h-full object-cover"
                priority
              />
            </div>
          </div>

          <p className="text-accent font-medium tracking-widest uppercase text-sm mb-4 animate-fade-in-up animation-delay-100">
            Holly Springs, NC — Est. 2023
          </p>

          <h2 className="text-5xl md:text-7xl font-bold mb-6 animate-fade-in-up animation-delay-200">
            More than Just <span className="text-accent">Beer</span>
          </h2>

          <p className="text-xl md:text-2xl text-foreground/60 mb-10 max-w-2xl mx-auto animate-fade-in-up animation-delay-300">
            A homebrewing community built on education, connection, and doing things your way.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in-up animation-delay-400">
            <a
              href="https://www.paypal.com/ncp/payment/UQ6VG5K69FC92"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-background font-semibold px-8 py-4 rounded-full transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(255,149,0,0.4)]"
            >
              Become a Member
            </a>
            <a
              href="#about"
              className="inline-flex items-center justify-center gap-2 border border-foreground/20 hover:border-accent text-foreground font-semibold px-8 py-4 rounded-full transition-all hover:bg-accent/10"
            >
              Learn More
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* Philosophy Section - Right after hero */}
      <section className="py-16 md:py-20 border-y border-border/50 bg-gradient-to-b from-card-bg/50 to-background">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h3 className="text-2xl md:text-3xl font-bold mb-6">
            <span className="text-accent">The Philosophy</span>
          </h3>
          <p className="text-xl md:text-2xl text-foreground/80 leading-relaxed">
            Everything is <span className="text-accent font-semibold">100% optional</span>. Between remote meetings and the Discord bot,
            70% of what we offer works even if you never set foot in Holly Springs.
          </p>
          <p className="text-lg text-foreground/60 mt-4">
            Your pace. Your path.
          </p>
        </div>
      </section>

      {/* About Section - What We Offer */}
      <section id="about" className="py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h3 className="text-3xl md:text-4xl font-bold mb-4">
              What We <span className="text-accent">Offer</span>
            </h3>
            <p className="text-foreground/60 max-w-2xl mx-auto">
              Whether you&apos;re just getting started or chasing your next competition medal, we&apos;ve got you covered.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-card-bg to-card-bg/50 border border-border rounded-2xl p-8 hover:border-accent/50 transition-all group">
              <div className="w-12 h-12 bg-accent/20 rounded-xl flex items-center justify-center mb-5 group-hover:bg-accent/30 transition-colors">
                <span className="text-2xl">📅</span>
              </div>
              <h4 className="text-xl font-semibold mb-3">Monthly Meetings</h4>
              <p className="text-foreground/60">
                Third Thursdays with full remote participation via Google Meet. We post recordings of the important bits.
              </p>
            </div>

            <div className="bg-gradient-to-br from-card-bg to-card-bg/50 border border-border rounded-2xl p-8 hover:border-accent/50 transition-all group">
              <div className="w-12 h-12 bg-accent/20 rounded-xl flex items-center justify-center mb-5 group-hover:bg-accent/30 transition-colors">
                <span className="text-2xl">🤖</span>
              </div>
              <h4 className="text-xl font-semibold mb-3">24/7 Discord Bot</h4>
              <p className="text-foreground/60">
                AI brewing assistant: 155+ science modules, 300+ yeasts, 150+ hops, 90 grains, calculators, and 65+ knowledge articles.
              </p>
            </div>

            <div className="bg-gradient-to-br from-card-bg to-card-bg/50 border border-border rounded-2xl p-8 hover:border-accent/50 transition-all group">
              <div className="w-12 h-12 bg-accent/20 rounded-xl flex items-center justify-center mb-5 group-hover:bg-accent/30 transition-colors">
                <span className="text-2xl">🎓</span>
              </div>
              <h4 className="text-xl font-semibold mb-3">~12 Workshops/Year</h4>
              <p className="text-foreground/60">
                Water chemistry, yeast management, recipe design, fermentation, specialty techniques, and style deep-dives.
              </p>
            </div>

            <div className="bg-gradient-to-br from-card-bg to-card-bg/50 border border-border rounded-2xl p-8 hover:border-accent/50 transition-all group">
              <div className="w-12 h-12 bg-accent/20 rounded-xl flex items-center justify-center mb-5 group-hover:bg-accent/30 transition-colors">
                <span className="text-2xl">🏆</span>
              </div>
              <h4 className="text-xl font-semibold mb-3">Strong Club Cohesion</h4>
              <p className="text-foreground/60">
                Quarterly brew days, internal competitions, optional badge system across four learning pathways.
              </p>
            </div>

            <div className="bg-gradient-to-br from-card-bg to-card-bg/50 border border-border rounded-2xl p-8 hover:border-accent/50 transition-all group md:col-span-2 lg:col-span-2">
              <div className="w-12 h-12 bg-accent/20 rounded-xl flex items-center justify-center mb-5 group-hover:bg-accent/30 transition-colors">
                <span className="text-2xl">🎁</span>
              </div>
              <h4 className="text-xl font-semibold mb-3">Practical Perks</h4>
              <p className="text-foreground/60">
                Group grain & hop buys, BJCP judging practice, club-funded competition shipping, free Master Homebrewer Program membership,
                and discounts at Brew Hardware, Whalepod Shippers, and more.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Discord Callout */}
      <section className="py-12 bg-card-bg/50 border-y border-border/50">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 bg-accent/20 text-accent px-4 py-2 rounded-full text-sm font-medium mb-4">
            <span>💬</span> Member Benefit
          </div>
          <h4 className="text-xl md:text-2xl font-bold mb-3">Looking for the Discord?</h4>
          <p className="text-foreground/60 max-w-xl mx-auto">
            Our Discord server is a member benefit. Check your welcome email for the invite link,
            or contact us at <a href="mailto:club@wcbrusaders.com" className="text-accent hover:underline">club@wcbrusaders.com</a>
          </p>
        </div>
      </section>

      {/* Tap List Section */}
      <section id="tap-list" className="py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h3 className="text-3xl md:text-4xl font-bold mb-4">
              <span className="text-accent">Tap</span> List
            </h3>
            <p className="text-foreground/60 max-w-2xl mx-auto">
              Quick access to all our resources. Go ahead, tap a link!
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {tapListLinks.map((link, index) => (
              <a
                key={link.title}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="link-card bg-card-bg border border-border rounded-2xl p-5 md:p-6 hover:border-accent group text-center"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <div className="text-3xl md:text-4xl mb-3 group-hover:scale-110 transition-transform">
                  {link.emoji}
                </div>
                <h4 className="text-sm md:text-base font-semibold mb-1 group-hover:text-accent transition-colors">
                  {link.title}
                </h4>
                <p className="text-xs text-foreground/50 hidden md:block">
                  {link.description}
                </p>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Calendar Section */}
      <section id="calendar" className="py-20 md:py-28 bg-card-bg/30">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h3 className="text-3xl md:text-4xl font-bold mb-4">
              Upcoming <span className="text-accent">Events</span>
            </h3>
            <p className="text-foreground/60">
              Meetings, brew days, and community gatherings
            </p>
          </div>

          <div className="bg-card-bg border border-border rounded-2xl overflow-hidden shadow-xl">
            <iframe
              src="https://calendar.google.com/calendar/embed?src=club%40wcbrusaders.com&ctz=America%2FNew_York&mode=AGENDA&showTitle=0&showNav=1&showPrint=0&showTabs=1&showCalendars=0&bgcolor=%230a0a0a"
              style={{ border: 0 }}
              width="100%"
              height="500"
              frameBorder="0"
              scrolling="no"
              className="w-full"
            />
          </div>
        </div>
      </section>

      {/* Photo Gallery Section */}
      <section id="gallery" className="py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h3 className="text-3xl md:text-4xl font-bold mb-4">
              Photo <span className="text-accent">Gallery</span>
            </h3>
            <p className="text-foreground/60">
              Moments from our brewing adventures
            </p>
          </div>

          <PhotoSlideshow />

          <div className="text-center mt-8">
            <a
              href="https://photos.google.com/album/AF1QipM-ZK-nI0tw9r2q4SEpXUGbIxGRrrGeR1ERCb3C"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-accent hover:text-accent-hover font-medium transition-colors"
            >
              View Full Album
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* Leadership Section */}
      <section className="py-16 md:py-20 bg-card-bg/30 border-y border-border/50">
        <div className="max-w-6xl mx-auto px-4">
          <h4 className="text-xl font-semibold text-center mb-8">Board Leadership</h4>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center p-4">
              <p className="font-semibold text-foreground">Jordan LaFontaine</p>
              <p className="text-sm text-foreground/50">Founder, President & Tech Officer</p>
            </div>
            <div className="text-center p-4">
              <p className="font-semibold text-foreground">Nathan Caulder</p>
              <p className="text-sm text-foreground/50">Vice President</p>
            </div>
            <div className="text-center p-4">
              <p className="font-semibold text-foreground">Marcella LaFontaine</p>
              <p className="text-sm text-foreground/50">Secretary & Aesthetics Officer</p>
            </div>
            <div className="text-center p-4">
              <p className="font-semibold text-foreground">James &quot;Roof Rat&quot; Stevens</p>
              <p className="text-sm text-foreground/50">Event Coordinator</p>
            </div>
          </div>
        </div>
      </section>

      {/* Partner Organizations */}
      <section className="py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h3 className="text-3xl md:text-4xl font-bold mb-4">
              Our <span className="text-accent">Partners</span>
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            {partnerOrgs.map((org) => (
              <a
                key={org.name}
                href={org.href}
                target="_blank"
                rel="noopener noreferrer"
                className="link-card bg-card-bg border border-border rounded-2xl p-6 flex items-center gap-4 hover:border-accent group"
              >
                <div className="w-20 h-20 relative flex-shrink-0">
                  <Image src={org.image} alt={org.name} fill className="object-contain" />
                </div>
                <div>
                  <h4 className="font-semibold group-hover:text-accent transition-colors">{org.name}</h4>
                  <p className="text-sm text-accent opacity-0 group-hover:opacity-100 transition-opacity">Visit Site →</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-20 md:py-28 bg-gradient-to-b from-card-bg/50 to-background">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h3 className="text-3xl md:text-4xl font-bold mb-4">
            Get in <span className="text-accent">Touch</span>
          </h3>
          <p className="text-foreground/60 mb-10 max-w-xl mx-auto">
            Questions about membership, events, or just want to say hello? We&apos;d love to hear from you.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="mailto:club@wcbrusaders.com"
              className="inline-flex items-center justify-center gap-3 bg-card-bg border border-border hover:border-accent rounded-2xl px-8 py-5 transition-all group"
            >
              <span className="text-2xl">✉️</span>
              <div className="text-left">
                <p className="font-semibold group-hover:text-accent transition-colors">Email Us</p>
                <p className="text-sm text-foreground/50">club@wcbrusaders.com</p>
              </div>
            </a>
            <a
              href="https://www.facebook.com/groups/wakecountybrusaders"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-3 bg-card-bg border border-border hover:border-accent rounded-2xl px-8 py-5 transition-all group"
            >
              <span className="text-2xl">👥</span>
              <div className="text-left">
                <p className="font-semibold group-hover:text-accent transition-colors">Facebook Group</p>
                <p className="text-sm text-foreground/50">Join the conversation</p>
              </div>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border/50">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <Image
                src="/images/WCBBanner.jpg"
                alt="Wake County Brusaders"
                width={36}
                height={36}
                className="w-9 h-9 rounded-full object-cover"
              />
              <div>
                <span className="font-semibold">Wake County <span className="text-accent">Brusaders</span></span>
                <p className="text-xs text-foreground/50">More than Just Beer</p>
              </div>
            </div>

            <div className="flex items-center gap-6 text-sm text-foreground/50">
              <a href="#about" className="hover:text-accent transition-colors">About</a>
              <a href="#tap-list" className="hover:text-accent transition-colors">Resources</a>
              <a href="#calendar" className="hover:text-accent transition-colors">Events</a>
              <a href="#contact" className="hover:text-accent transition-colors">Contact</a>
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
