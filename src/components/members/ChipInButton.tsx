// Renders a link to a pre-built PayPal donation URL. Deliberately dumb: no env
// read, no payment JS — the URL (including the club's merchant id) is built
// server-side by the page (see src/lib/paypal-donate-url.ts) and passed in as
// a plain string prop, so the merchant id never needs a NEXT_PUBLIC_* env var.
export function ChipInButton({ donateUrl }: { donateUrl: string }) {
  return (
    <a
      href={donateUrl}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center rounded-full bg-accent hover:bg-accent-hover text-background px-3 py-1 text-xs font-semibold"
    >
      Chip in via PayPal
    </a>
  )
}
