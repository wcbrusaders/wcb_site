import type { Metadata } from "next";
import Link from "next/link";
import { getBoard, OMBUDSMAN } from "@/lib/board";

export const revalidate = 3600 // re-fetch roster hourly so board changes appear without a redeploy

export const metadata: Metadata = {
  title: "The Board | Wake County Brusaders",
  description: "Meet the Wake County Brusaders board and learn how to raise a concern with our Ombudsman.",
};

export default async function BoardPage() {
  const board = await getBoard();
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="max-w-3xl mx-auto px-6 py-20">
        <Link href="/" className="text-sm text-foreground/50 hover:text-foreground">← Home</Link>
        <h1 className="text-4xl font-bold mt-6 mb-2">The Board</h1>
        <p className="text-foreground/60 mb-10">
          The people who keep Wake County Brusaders running — and accountable.
        </p>

        {board.length === 0 ? (
          <p className="text-foreground/60">Board information is temporarily unavailable. Please check back shortly.</p>
        ) : (
          <ul className="space-y-3 mb-12">
            {board.map((m) => (
              <li key={`${m.role}-${m.name}`} className="rounded-2xl border border-border/50 bg-card-bg/30 p-5">
                <p className="font-semibold">{m.name}</p>
                <p className="text-accent text-sm">{m.role}</p>
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-2xl border border-accent/30 bg-accent/5 p-6">
          <h2 className="font-semibold mb-2">Have a concern?</h2>
          <p className="text-foreground/70 text-sm">
            Start with our Ombudsman, {OMBUDSMAN.name} — DM <span className="text-accent font-medium">{OMBUDSMAN.discord}</span> on
            Discord. Reports are handled in confidence. If your concern is about the Ombudsman, or you&apos;d rather not go to them,
            you can DM any board member instead. Read our{" "}
            <Link href="/code-of-conduct" className="text-accent hover:underline">Code of Conduct</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}
