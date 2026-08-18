// Shared form-field primitives (design "System B"). Replace the
// `rounded-xl border border-border bg-background/60 px-4 py-2` pattern that
// every members form re-declares inline. Optional label wraps the control.

const FIELD =
  'w-full rounded-xl border border-border bg-background/60 px-4 py-2 outline-none focus:border-accent/60 transition-colors'

export function Input({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${FIELD} ${className}`} {...props} />
}

export function Select({ className = '', ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${FIELD} ${className}`} {...props} />
}

export function Textarea({ className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${FIELD} ${className}`} {...props} />
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium uppercase tracking-wide text-foreground/50 mb-1.5">{label}</span>
      {children}
    </label>
  )
}
