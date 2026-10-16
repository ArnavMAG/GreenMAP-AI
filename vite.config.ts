import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    // On some Windows setups Vite serves the AI worker from a "/@fs/C:/…" path it then refuses (HTTP 403 as HTML),
    // which shows up as "Failed to load module script … MIME type text/html". Local dev only.
    fs: { strict: false },
  },
  // Pre-bundle the AI library when the dev server starts (instead of discovering it on the first click, which
  // made Vite reload the page and could break the worker).
  optimizeDeps: {
    include: ["@huggingface/transformers"],
  },
  worker: { format: "es" },
});