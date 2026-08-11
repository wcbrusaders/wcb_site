import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: [
      // next-auth's ESM build does `import ... from "next/server"` with no
      // extension. Next 16 ships no `package.json#exports` map, so Node/Vite's
      // ESM resolver can't find it outside of Next's own bundler (which
      // special-cases this resolution). Alias the bare specifier straight to
      // the real file so next-auth is importable under Vitest.
      { find: /^next\/server$/, replacement: 'next/server.js' },
      // Mirror tsconfig's "@/*" -> "./src/*" path mapping so action files
      // (which import via the @ alias) resolve under Vitest.
      { find: /^@\//, replacement: `${new URL('./src/', import.meta.url).pathname}` },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    server: {
      deps: {
        // Force next-auth (and its ESM `import ... from "next/server"`)
        // through Vite's own resolver/transform pipeline instead of being
        // externalized straight to Node's `import()`, so the alias above
        // actually applies.
        inline: [/next-auth/, /@auth\/core/, /@auth\/prisma-adapter/],
      },
    },
  },
})
