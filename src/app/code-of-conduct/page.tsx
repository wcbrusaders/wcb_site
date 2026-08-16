import type { Metadata } from "next";
import Link from "next/link";
import { CodeOfConductBody } from "@/components/CodeOfConductBody";

export const metadata: Metadata = {
  title: "Code of Conduct | Wake County Brusaders",
  description: "The Wake County Brusaders Code of Conduct — a welcoming, respectful, harassment-free brewing community.",
};

export default function CodeOfConductPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <article className="max-w-3xl mx-auto px-6 py-20">
        <Link href="/" className="text-sm text-foreground/50 hover:text-foreground">← Home</Link>
        <h1 className="text-4xl font-bold mt-6">Code of Conduct</h1>
        <p className="text-foreground/50 text-sm mt-2 mb-4">Ratified August 15, 2026 by vote of the WCB Board</p>
        <CodeOfConductBody />
      </article>
    </main>
  );
}
