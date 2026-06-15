import { defineConfig } from 'vite'
import { resolve } from 'path'

// base must match the GitHub Pages subpath: https://<user>.github.io/codernaught/
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/codernaught/' : '/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        embed: resolve(__dirname, 'embed.html'),
        twod: resolve(__dirname, '2d/index.html'),
      },
    },
  },
  server: {
    allowedHosts: true,
  },
})
