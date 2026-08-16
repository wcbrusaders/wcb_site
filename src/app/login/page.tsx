"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { normalizeLoginEmail } from "@/lib/email-normalize";

type Step = "email" | "code";

// Human-readable messages for the error codes Auth.js can hand back.
// "AccessDenied" is what our roster-gate `signIn` callback produces when the
// email isn't a current WCB member (see src/lib/auth.ts makeSignInCallback).
function emailStepErrorMessage(error?: string): string {
  if (error === "AccessDenied") {
    return "That email isn't on the WCB roster. Ask an officer if you think this is a mistake.";
  }
  return "Something went wrong sending your code. Please try again.";
}

// "Verification" is what Auth.js's email provider throws for a missing,
// wrong, or expired token (see @auth/core callback handler for provider.type
// === "email"). Anything else we treat as a generic failure.
function codeStepErrorMessage(error?: string): string {
  if (error === "Verification") {
    return "That code is wrong or has expired. Request a new one and try again.";
  }
  if (error === "AccessDenied") {
    return "That email isn't on the WCB roster. Ask an officer if you think this is a mistake.";
  }
  return "Couldn't verify that code. Please try again.";
}

export default function LoginPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      // This beta's email provider has no separate "request code" endpoint —
      // `signIn` with `redirect: false` POSTs to /api/auth/signin/email-code,
      // which runs the roster-gate `signIn` callback and, if allowed, sends
      // the 6-digit code via sendVerificationRequest. It never throws; errors
      // come back on the returned object.
      // Normalize to match @auth/core's stored identifier EXACTLY (it stores the
      // token under normalize("NFKC")→lowercase→trim). We must send the same
      // normalized value here AND on the verify callback below, or the identifier
      // comparison fails and a correct code reads as "wrong or expired". Mobile
      // auto-capitalization made this bite every fresh phone login.
      const res = await signIn("email-code", { email: normalizeLoginEmail(email), redirect: false });
      if (res?.error) {
        setError(emailStepErrorMessage(res.error));
        setPending(false);
        return;
      }
      setStep("code");
    } catch {
      setError("Something went wrong sending your code. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleCodeSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      // No "submit code" POST endpoint exists in this beta. The email
      // provider verifies via a GET to the callback route with the code as
      // `token` and the email as `email` (see @auth/core callback handler,
      // provider.type === "email": it reads query.token / query.email for
      // both GET and POST). We fetch it directly (rather than a full page
      // navigation) so we can inspect the outcome before deciding where to
      // send the user; the browser still applies the Set-Cookie session
      // cookie from the response like it would on a normal navigation.
      const url = `/api/auth/callback/email-code?${new URLSearchParams({
        token: code,
        email: normalizeLoginEmail(email),
      })}`;
      const res = await fetch(url, { redirect: "follow" });
      const landedUrl = new URL(res.url);
      const err = landedUrl.searchParams.get("error");
      if (err) {
        setError(codeStepErrorMessage(err));
        setPending(false);
        return;
      }
      window.location.href = "/members";
    } catch {
      setError("Couldn't verify that code. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="py-6">
        <div className="max-w-md mx-auto px-6 flex items-center justify-center">
          <Link href="/" className="flex items-center">
            <Image
              src="/images/WCB - 500 dpi white on black BANNER.png"
              alt="Wake County Brusaders"
              width={140}
              height={40}
              className="h-8 w-auto"
            />
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-border/50 bg-card-bg/30 p-8">
            {step === "email" ? (
              <>
                <h1 className="text-2xl font-bold mb-2">Member Login</h1>
                <p className="text-foreground/60 mb-8">
                  Enter your email and we&apos;ll send you a one-time code.
                </p>

                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="email" className="block text-sm text-foreground/60 mb-2">
                      Email address
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      autoComplete="email"
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-accent transition-colors"
                    />
                  </div>

                  {error && (
                    <p className="text-sm text-red-400" role="alert">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={pending || !email}
                    className="w-full inline-flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-background font-medium px-6 py-3 rounded-full transition-colors"
                  >
                    {pending ? "Sending…" : "Send Code"}
                  </button>
                </form>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold mb-2">Check Your Email</h1>
                <p className="text-foreground/60 mb-8">
                  We sent a 6-digit code to <span className="text-foreground">{email}</span>.
                  Enter it below to sign in.
                </p>

                <form onSubmit={handleCodeSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="code" className="block text-sm text-foreground/60 mb-2">
                      6-digit code
                    </label>
                    <input
                      id="code"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      required
                      autoFocus
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="123456"
                      className="w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-accent transition-colors tracking-widest text-center text-lg"
                    />
                  </div>

                  {error && (
                    <p className="text-sm text-red-400" role="alert">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={pending || code.length !== 6}
                    className="w-full inline-flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-background font-medium px-6 py-3 rounded-full transition-colors"
                  >
                    {pending ? "Verifying…" : "Verify & Sign In"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setStep("email");
                      setCode("");
                      setError(null);
                    }}
                    className="w-full text-sm text-foreground/50 hover:text-foreground transition-colors py-2"
                  >
                    Use a different email
                  </button>
                </form>
              </>
            )}
          </div>

          <p className="text-center text-foreground/40 text-sm mt-6">
            Not a member yet?{" "}
            <a
              href="/join"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              Join the club
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
