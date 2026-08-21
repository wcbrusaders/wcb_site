import type { Metadata } from "next";
import Link from "next/link";
import { CodeOfConductBody } from "@/components/CodeOfConductBody";
import { getGovernance } from "@/lib/governance/governance";

export const metadata: Metadata = {
  title: "Code of Conduct | Wake County Brusaders",
  description: "The Wake County Brusaders Code of Conduct — a welcoming, respectful, harassment-free brewing community.",
};

// Now reads from the DB (getGovernance) instead of rendering a static
// component — force-dynamic so Next doesn't try to prerender this at build
// time (no DB is reachable in the build environment) and reflects DB edits
// immediately, matching the equivalent /members/governance/bylaws page.
export const dynamic = 'force-dynamic'

export default async function CodeOfConductPage() {
  const gov = await getGovernance('code-of-conduct')
  return (
    <main className="min-h-screen bg-background text-foreground">
      <article className="max-w-3xl mx-auto px-6 py-20">
        <Link href="/" className="text-sm text-foreground/50 hover:text-foreground">← Home</Link>
        <h1 className="text-4xl font-bold mt-6">Code of Conduct</h1>
        <p className="text-foreground/50 text-sm mt-2 mb-4">Ratified August 15, 2026 by vote of the WCB Board</p>
        {gov ? (
          <div
            className="text-foreground/75 text-[15px] leading-relaxed space-y-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-2 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2 [&_li]:my-0.5 [&_a]:text-accent [&_a]:hover:underline [&_strong]:font-semibold [&_em]:italic"
            dangerouslySetInnerHTML={{ __html: gov.bodyHtml }}
          />
        ) : (
          <CodeOfConductBody />
        )}
      </article>
    </main>
  );
}
