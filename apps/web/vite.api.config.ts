import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';

// Pre-bundles the Hono API into one ESM file so Vercel does not resolve/type it itself.
// Only Node builtins stay external; every npm dependency is inlined.
export default defineConfig({
  ssr: { noExternal: true },
  build: {
    ssr: fileURLToPath(new URL('./src/server/app.ts', import.meta.url)),
    outDir: 'api-dist',
    publicDir: false,
    emptyOutDir: true,
    minify: false,
    target: 'node22',
    rollupOptions: {
      // Only Node builtins stay external; every npm package is inlined.
      external: (id: string) => id.startsWith('node:') || builtinModules.includes(id),
      output: { entryFileNames: 'app.js', format: 'es', inlineDynamicImports: true },
    },
  },
});
