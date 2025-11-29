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

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev - 1 + slideshowImages.length) % slideshowImages.length);
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % slideshowImages.length);
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto">
      {/* Main image container */}
      <div className="relative aspect-video rounded-xl overflow-hidden bg-card-bg border border-border">
        {slideshowImages.map((src, index) => (
          <div
            key={src}
            className={`absolute inset-0 transition-opacity duration-700 ${
              index === currentIndex ? "opacity-100" : "opacity-0"
            }`}
          >
            <Image
              src={src}
              alt={`Club photo ${index + 1}`}
              fill
              className="object-cover"
              priority={index === 0}
            />
          </div>
        ))}

        {/* Navigation arrows */}
        <button
          onClick={goToPrevious}
          className="absolute left-4 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background text-foreground p-2 rounded-full transition-all hover:scale-110"
          aria-label="Previous image"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={goToNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background text-foreground p-2 rounded-full transition-all hover:scale-110"
          aria-label="Next image"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Dots navigation */}
      <div className="flex justify-center gap-2 mt-4">
        {slideshowImages.map((_, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`w-3 h-3 rounded-full transition-all ${
              index === currentIndex
                ? "bg-accent scale-110"
                : "bg-foreground/30 hover:bg-foreground/50"
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
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/images/WCBBanner.jpg"
              alt="Wake County Brusaders"
              width={48}
              height={48}
              className="w-12 h-12 rounded-full object-cover"
            />
            <h1 className="text-xl md:text-2xl font-bold text-foreground">
              Wake County <span className="text-accent">Brusaders</span>
            </h1>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#tap-list" className="text-foreground/70 hover:text-accent transition-colors">
              Tap List
            </a>
            <a href="#calendar" className="text-foreground/70 hover:text-accent transition-colors">
              Events
            </a>
            <a href="#gallery" className="text-foreground/70 hover:text-accent transition-colors">
              Gallery
            </a>
            <a href="#about" className="text-foreground/70 hover:text-accent transition-colors">
              About
            </a>
          </nav>
          {/* Mobile menu button */}
          <button className="md:hidden p-2 text-foreground/70 hover:text-accent">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-20 md:py-32 overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-accent/10 to-transparent" />

        <div className="max-w-6xl mx-auto px-4 text-center relative z-10">
          {/* Banner/Logo area */}
          <div className="mb-8 animate-fade-in-up">
            <div className="w-32 h-32 md:w-48 md:h-48 mx-auto rounded-full bg-card-bg border-4 border-accent glow flex items-center justify-center overflow-hidden">
              <Image
                src="/images/WCBBanner.jpg"
                alt="Wake County Brusaders Logo"
                width={192}
                height={192}
                className="w-full h-full object-cover"
                priority
              />
            </div>
          </div>

          <h2 className="text-4xl md:text-6xl font-bold mb-4 animate-fade-in-up animation-delay-100">
            Welcome to the <span className="text-accent">Online Tap Room</span>
          </h2>

          <p className="text-xl md:text-2xl text-foreground/70 mb-8 animate-fade-in-up animation-delay-200">
            Go ahead, tap a link!
          </p>

          <a
            href="#tap-list"
            className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-background font-semibold px-8 py-4 rounded-full transition-all hover:scale-105 animate-fade-in-up animation-delay-300"
          >
            Explore Our Resources
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </a>
        </div>
      </section>

      {/* Tap List Section */}
      <section id="tap-list" className="py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4">
          <h3 className="text-3xl md:text-4xl font-bold text-center mb-4">
            <span className="text-accent">Tap</span> List
          </h3>
          <p className="text-foreground/60 text-center mb-12 max-w-2xl mx-auto">
            Everything you need to brew, learn, and connect with our community
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {tapListLinks.map((link, index) => (
              <a
                key={link.title}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`link-card bg-card-bg border border-border rounded-xl p-6 hover:border-accent group animate-fade-in-up`}
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">
                  {link.emoji}
                </div>
                <h4 className="text-lg font-semibold mb-2 group-hover:text-accent transition-colors">
                  {link.title}
                </h4>
                <p className="text-sm text-foreground/60">
                  {link.description}
                </p>
                <div className="mt-4 flex items-center text-accent text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  Open
                  <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Calendar Section */}
      <section id="calendar" className="py-16 md:py-24 bg-card-bg/50">
        <div className="max-w-6xl mx-auto px-4">
          <h3 className="text-3xl md:text-4xl font-bold text-center mb-4">
            Calendar of <span className="text-accent">Events</span>
          </h3>
          <p className="text-foreground/60 text-center mb-12 max-w-2xl mx-auto">
            Stay up to date with meetings, brew days, and community gatherings
          </p>

          <div className="bg-card-bg border border-border rounded-xl overflow-hidden">
            <iframe
              src="https://calendar.google.com/calendar/embed?src=club%40wcbrusaders.com&ctz=America%2FNew_York&mode=AGENDA&showTitle=0&showNav=1&showPrint=0&showTabs=1&showCalendars=0&bgcolor=%230a0a0a"
              style={{ border: 0 }}
              width="100%"
              height="600"
              frameBorder="0"
              scrolling="no"
              className="w-full"
            />
          </div>
        </div>
      </section>

      {/* Photo Gallery Section */}
      <section id="gallery" className="py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4">
          <h3 className="text-3xl md:text-4xl font-bold text-center mb-4">
            Photo <span className="text-accent">Gallery</span>
          </h3>
          <p className="text-foreground/60 text-center mb-12 max-w-2xl mx-auto">
            Moments from our brewing adventures and community events
          </p>

          <PhotoSlideshow />

          <div className="text-center mt-8">
            <a
              href="https://photos.google.com/album/AF1QipM-ZK-nI0tw9r2q4SEpXUGbIxGRrrGeR1ERCb3C"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-accent hover:text-accent-hover font-medium transition-colors"
            >
              View Full Album on Google Photos
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-16 md:py-24 bg-card-bg/50">
        <div className="max-w-6xl mx-auto px-4">
          <h3 className="text-3xl md:text-4xl font-bold text-center mb-4">
            About <span className="text-accent">The Club</span>
          </h3>

          <div className="max-w-3xl mx-auto bg-card-bg border border-border rounded-xl p-8 md:p-12">
            <p className="text-lg text-foreground/80 leading-relaxed text-center">
              The Wake County Brusaders is a community of homebrewing enthusiasts based in Wake County, North Carolina.
              We are passionate about the art and science of brewing, and we love sharing our knowledge with others.
            </p>
            <p className="text-sm text-foreground/50 text-center mt-6 italic">
              [About section content coming soon]
            </p>
          </div>
        </div>
      </section>

      {/* Partner Organizations */}
      <section className="py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4">
          <h3 className="text-3xl md:text-4xl font-bold text-center mb-4">
            Related <span className="text-accent">Organizations</span>
          </h3>
          <p className="text-foreground/60 text-center mb-12 max-w-2xl mx-auto">
            Connect with the larger homebrewing community
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {partnerOrgs.map((org) => (
              <a
                key={org.name}
                href={org.href}
                target="_blank"
                rel="noopener noreferrer"
                className="link-card bg-card-bg border border-border rounded-xl p-8 text-center hover:border-accent group"
              >
                <div className="w-32 h-32 mx-auto mb-4 relative">
                  <Image
                    src={org.image}
                    alt={org.name}
                    fill
                    className="object-contain"
                  />
                </div>
                <h4 className="font-semibold group-hover:text-accent transition-colors">
                  {org.name}
                </h4>
                <div className="mt-2 text-sm text-accent opacity-0 group-hover:opacity-100 transition-opacity">
                  Visit Site →
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Image
              src="/images/WCBBanner.jpg"
              alt="Wake County Brusaders"
              width={40}
              height={40}
              className="w-10 h-10 rounded-full object-cover"
            />
            <span className="text-lg font-semibold">
              Wake County <span className="text-accent">Brusaders</span>
            </span>
          </div>
          <p className="text-foreground/50 text-sm mb-4">
            A community of homebrewing enthusiasts in Wake County, NC
          </p>
          <div className="flex items-center justify-center gap-6 text-sm">
            <a
              href="https://www.facebook.com/groups/wakecountybrusaders"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground/60 hover:text-accent transition-colors"
            >
              Facebook
            </a>
            <a
              href="https://www.paypal.com/ncp/payment/UQ6VG5K69FC92"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground/60 hover:text-accent transition-colors"
            >
              Join Us
            </a>
            <a
              href="mailto:club@wcbrusaders.com"
              className="text-foreground/60 hover:text-accent transition-colors"
            >
              Contact
            </a>
          </div>
          <p className="text-foreground/30 text-xs mt-8">
            © {new Date().getFullYear()} Wake County Brusaders. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
