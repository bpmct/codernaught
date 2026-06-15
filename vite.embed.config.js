import { defineConfig } from 'vite'
import { resolve } from 'path'
export default defineConfig({
  build: {
    lib: { entry: resolve(__dirname, 'embed-src/codernaught-embed.src.js'), formats: ['es'], fileName: () => 'codernaught-embed.js' },
    outDir: 'embed-dist', emptyOutDir: true,
  },
})
