export { auth as middleware } from '@/lib/auth'

// Node.js runtime (not Edge): the auth config pulls in the Prisma adapter +
// googleapis, which use node: builtins the Edge runtime forbids. Database
// sessions also require a DB round-trip that can't run at the edge.
export const config = { matcher: ['/members/:path*'], runtime: 'nodejs' }
