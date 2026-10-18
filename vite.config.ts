import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';

// Keep local tool output inside the checkout in restricted cloud workspaces.
process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
process.env.WRANGLER_SEND_METRICS ??= 'false';

export default defineConfig({
  plugins: [react(), cloudflare({ viteEnvironment: { name: 'worker' } })],
  // Emscripten otherwise reads self.location.href, absent in Workers. This is
  // only a script-location hint; Wasm is supplied by the static module import.
  environments: { worker: {
    define: { __filename: JSON.stringify('isolated-sqlite.js'), __dirname: JSON.stringify('/') },
    optimizeDeps: { rolldownOptions: { transform: { define: { __filename: JSON.stringify('isolated-sqlite.js'), __dirname: JSON.stringify('/') } } } },
  } },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
