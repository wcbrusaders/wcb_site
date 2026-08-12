import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const session = await auth()
        if (!session?.user?.memberId) throw new Error('unauthorized')
        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
          maximumSizeInBytes: 5 * 1024 * 1024,
          addRandomSuffix: true,
        }
      },
      // NO onUploadCompleted: we link the blob in setItemPhotoAction AFTER
      // upload() resolves. Defining onUploadCompleted makes handleUpload set a
      // server-to-server completion callbackUrl (derived from the request host),
      // and the client upload() promise blocks until that callback round-trips.
      // If the callback host isn't cleanly reachable, upload() hangs forever
      // ("never-ending upload"). Omitting it => no callback => upload() resolves
      // on byte completion.
    })
    return NextResponse.json(json)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 })
  }
}
