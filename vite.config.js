import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Stub out Capacitor-only packages for the web/PWA build.
      // The real plugins are only available inside a Capacitor shell;
      // platform.js guards usage behind isNative(), so these stubs
      // are never actually called at runtime.
      '@capacitor/keep-awake': path.resolve('./src/lib/stubs/keep-awake-stub.js'),
      '@capacitor/camera': path.resolve('./src/lib/stubs/camera-stub.js'),
    },
  },
  server: {
    host: true,
    port: 5173
  }
})
