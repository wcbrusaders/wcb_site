'use client'

import { useState } from "react";
import Link from "next/link";
import { CodeOfConductBody } from "@/components/CodeOfConductBody";

// The one join/dues PayPal link (NOT the merch link). New members reach PayPal
// only through this gate, after reading + agreeing to the Code of Conduct.
const JOIN_PAYPAL_URL = "https://www.paypal.com/ncp/payment/UQ6VG5K69FC92";

export default function JoinPage() {
  const [agreed, setAgreed] = useState(false);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <article className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/" className="text-sm text-foreground/50 hover:text-foreground">← Home</Link>
        <h1 className="text-4xl font-bold mt-6">Join the Brusaders</h1>
        <p className="text-foreground/60 mt-3">
          We&apos;re a welcoming, harassment-free brewing community. Before you join, please read our Code of Conduct —
          every member agrees to it. Then you&apos;ll be sent to PayPal to pay your dues.
        </p>

        <div className="mt-8 rounded-2xl border border-border/50 bg-card-bg/20 p-6 md:p-8 max-h-[60vh] overflow-y-auto">
          <h2 className="text-2xl font-bold">Code of Conduct</h2>
          <p className="text-foreground/50 text-sm mt-1">Ratified August 15, 2026 by vote of the WCB Board</p>
          <CodeOfConductBody />
        </div>

        <label className="mt-6 flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 h-5 w-5 accent-accent shrink-0"
          />
          <span className="text-foreground/85">
            I have read and agree to the Wake County Brusaders Code of Conduct.
          </span>
        </label>

        <div className="mt-6">
          {agreed ? (
            <a
              href={JOIN_PAYPAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex bg-accent hover:bg-accent-hover text-background font-semibold px-6 py-3 rounded-full transition-colors"
            >
              Continue to payment →
            </a>
          ) : (
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="inline-flex bg-accent/40 text-background/70 font-semibold px-6 py-3 rounded-full cursor-not-allowed"
            >
              Continue to payment →
            </button>
          )}
          <p className="text-foreground/40 text-sm mt-3">
            {agreed ? "Thanks — you're all set. Continue to PayPal to pay your dues." : "Check the box above to continue."}
          </p>
        </div>
      </article>
    </main>
  );
}
