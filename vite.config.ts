import { defineConfig } from 'vite';

// The cloud preview proxies the VM through a signed hostname. Allow exactly that
// host when it is supplied for this process; never a blanket wildcard.
const previewHost = process.env.VITE_PREVIEW_HOST?.trim();

export default defineConfig({
  // Relative assets keep the same build working at a domain root (Sites) and
  // under a project subpath (GitHub Pages /Lost/).
  base: './',
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: previewHost ? [previewHost] : undefined
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000
  }
});
