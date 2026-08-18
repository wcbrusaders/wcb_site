// THROWAWAY SPIKE — not part of the shipped feature.
//
// Goal: determine whether we can generate a first-page PNG thumbnail from a
// PDF using a PURE-JS / wasm / native-prebuilt-only path that will run on
// Vercel serverless (Node runtime) — i.e. NO system binaries like
// graphicsmagick/imagemagick/poppler, which are not present on Vercel.
//
// Candidate: unpdf's renderPageAsImage() (pdfjs-dist under the hood) fed an
// injectable canvas factory backed by @napi-rs/canvas — a native module
// shipped as prebuilt binaries per-platform (no system libs needed, unlike
// node-canvas which links against system cairo/pango).
//
// Run: node scripts/spike-pdf-thumb.mjs

import { writeFile } from 'node:fs/promises'
import { getResolvedPDFJS, renderPageAsImage } from 'unpdf'

// A minimal, hand-built one-page PDF ("Hello, WCB!" text) — avoids depending
// on a flaky external fetch for a throwaway spike. Valid per the PDF 1.4 spec.
const MINIMAL_PDF = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 55 >>
stream
BT /F1 18 Tf 20 100 Td (Hello, WCB!) Tj ET
endstream
endobj
xref
0 6
0000000000 65535 f
trailer
<< /Size 6 /Root 1 0 R >>
startxref
0
%%EOF`

async function main() {
  const pdfBytes = new TextEncoder().encode(MINIMAL_PDF)
  console.log(`Sample PDF built in-memory: ${pdfBytes.byteLength} bytes`)

  // Confirm unpdf's bundled pdfjs-dist build resolves at all.
  await getResolvedPDFJS()
  console.log('unpdf resolved its bundled pdfjs-dist build OK.')

  console.log('Rendering page 1 to PNG via @napi-rs/canvas...')
  const imageBuffer = await renderPageAsImage(pdfBytes, 1, {
    canvasImport: () => import('@napi-rs/canvas'),
    scale: 1,
  })

  console.log(`SUCCESS: produced image buffer of ${imageBuffer.byteLength} bytes`)

  const outPath = new URL('./spike-pdf-thumb-output.png', import.meta.url)
  await writeFile(outPath, Buffer.from(imageBuffer))
  console.log(`Wrote thumbnail to ${outPath.pathname} for manual inspection (gitignored/throwaway).`)
}

main().catch((err) => {
  console.error('SPIKE FAILED:', err)
  process.exitCode = 1
})
