'use server'

import { signOut } from '@/lib/auth'

// Shared so both the desktop header form and the mobile drawer can sign out
// without the client component needing an inline 'use server' closure.
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/' })
}
