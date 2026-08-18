// A small uppercase section label with a trailing divider rule, used to
// group a page's content into rhythmic sections (System B). Optional leading
// icon.
export function SectionLabel({ children, icon }: { children: React.ReactNode; icon?: string }) {
  return (
    <div className="flex items-center gap-2.5 mt-8 mb-3 first:mt-0">
      {icon && <span aria-hidden className="text-base leading-none">{icon}</span>}
      <span className="text-[11px] font-semibold uppercase tracking-widest text-foreground/45 whitespace-nowrap">
        {children}
      </span>
      <span className="flex-1 h-px bg-border/60" />
    </div>
  )
}
