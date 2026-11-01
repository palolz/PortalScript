import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// The renderer only talks to the main process over IPC, so it needs no network or inline-script access.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'"
].join('; ');

// Build-only: Vite's dev server relies on an inline React refresh preamble.
const cspPlugin = {
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml(html) {
    return html.replace(
      '<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />`
    );
  }
};

export default defineConfig({
  plugins: [react(), cspPlugin],
  base: './',
  root: path.resolve(__dirname, 'src/renderer'),
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
