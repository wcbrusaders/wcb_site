import { Resend } from 'resend'

export async function sendLoginCode(email: string, code: string): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY)
  const from = process.env.RESEND_FROM ?? 'WCB <noreply@wcbrusaders.com>'
  const { error } = await resend.emails.send({
    from,
    to: email,
    subject: 'Your WCB login code',
    text: `Your Wake County Brusaders login code is: ${code}\n\nIt expires in 10 minutes. If you didn't request this, ignore this email.`,
  })
  if (error) throw new Error(`Resend failed: ${error.message}`)
}
