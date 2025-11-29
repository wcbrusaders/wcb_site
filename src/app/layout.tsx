import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wake County Brusaders | Homebrewing Club",
  description: "Wake County Brusaders - A community of homebrewing enthusiasts in Wake County, NC. Join us for brewing education, recipe sharing, and community events.",
  keywords: ["homebrewing", "beer", "Wake County", "NC", "brewing club", "homebrew"],
  openGraph: {
    title: "Wake County Brusaders | Homebrewing Club",
    description: "A community of homebrewing enthusiasts in Wake County, NC",
    type: "website",
    locale: "en_US",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
