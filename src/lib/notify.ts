export async function notifyOfficersCheckout(
  input: { memberName: string; title: string; category: string; dueAt: Date },
  deps: { fetch?: typeof fetch; webhookUrl?: string } = {},
): Promise<void> {
  const url = deps.webhookUrl ?? process.env.DISCORD_OFFICER_WEBHOOK_URL ?? ''
  if (!url) return
  const doFetch = deps.fetch ?? fetch
  const due = input.dueAt.toISOString().slice(0, 10)
  const content = `📦 ${input.memberName} checked out **${input.title}** (${input.category}) · due ${due} · arrange handoff.`
  try {
    await doFetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content }) })
  } catch (e) {
    console.error('officer notification failed (checkout still succeeded):', e)
  }
}
