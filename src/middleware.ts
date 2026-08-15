import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

// Wrap (not replace) the NextAuth middleware: NextAuth v5 supports composing
// `auth(request => ...)` around a plain middleware function, so this adds a
// pathname header without touching the auth config/callbacks in lib/auth.ts.
// The members-area layout reads this header to know when the current route
// IS /members/suspended, so its interim/banned guard can skip redirecting
// there and avoid an infinite redirect loop.
//
// IMPORTANT: the header must be injected via the `request` option (not
// `res.headers.set(...)`, which only sets response headers sent to the
// browser and is never seen by `headers()` in a Server Component). Routing
// it through `request.headers` also means Next.js overwrites this key for
// every downstream request regardless of what the client sent, so a client
// can't spoof `x-pathname` to fake being on the suspended page and dodge
// the guard.
export default auth((request) => {
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', request.nextUrl.pathname)
  return NextResponse.next({ request: { headers: requestHeaders } })
})

// Node.js runtime (not Edge): the auth config pulls in the Prisma adapter +
// googleapis, which use node: builtins the Edge runtime forbids. Database
// sessions also require a DB round-trip that can't run at the edge.
export const config = { matcher: ['/members/:path*'], runtime: 'nodejs' }
