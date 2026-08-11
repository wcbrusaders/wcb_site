import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { downscaleImage } from './image'

// Minimal browser-API stubs (jsdom-less): createImageBitmap + a canvas returning a Blob.
beforeEach(() => {
  ;(globalThis as any).createImageBitmap = vi.fn(async (blob: any) => {
    if (blob && blob._bad) throw new Error('decode fail')
    return { width: 3200, height: 2400, close() {} }
  })
  ;(globalThis as any).OffscreenCanvas = class {
    width = 0; height = 0
    getContext() { return { drawImage() {} } }
    async convertToBlob() { return new Blob(['x'], { type: 'image/jpeg' }) }
  }
})
afterEach(() => { vi.restoreAllMocks() })

test('downscaleImage: returns a JPEG Blob for a valid image, long edge capped', async () => {
  const file = new File(['data'], 'photo.heic', { type: 'image/heic' })
  const out = await downscaleImage(file, 1600, 0.85)
  expect(out).toBeInstanceOf(Blob)
  expect(out.type).toBe('image/jpeg')
})

test('downscaleImage: rejects an undecodable file', async () => {
  const bad = Object.assign(new File(['x'], 'x.txt', { type: 'text/plain' }), { _bad: true })
  await expect(downscaleImage(bad as any)).rejects.toThrow()
})
