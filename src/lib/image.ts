export async function downscaleImage(file: File, maxEdge = 1600, quality = 0.85): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('Could not read that image')
  }
  const { width, height } = bitmap
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  const w = Math.round(width * scale)
  const h = Math.round(height * scale)
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')
  if (!ctx) { bitmap.close?.(); throw new Error('Canvas unavailable') }
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()
  return canvas.convertToBlob({ type: 'image/jpeg', quality })
}
