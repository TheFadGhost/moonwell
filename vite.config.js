import { defineConfig } from 'vite'

export default defineConfig({
  base: '/moonwell/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three']
        }
      }
    }
  },
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node'
  }
})
