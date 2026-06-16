import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const isReplit = process.env.REPL_ID !== undefined;
const port = Number(process.env.PORT) || 3000;
const basePath = process.env.BASE_PATH || "/";

const replitPlugins: any[] = [];
if (isReplit && process.env.NODE_ENV !== "production") {
  try {
    const errorModal = await import("@replit/vite-plugin-runtime-error-modal");
    replitPlugins.push(errorModal.default());
    const { cartographer } = await import("@replit/vite-plugin-cartographer");
    replitPlugins.push(cartographer({ root: path.resolve(import.meta.dirname, "..") }));
    const { devBanner } = await import("@replit/vite-plugin-dev-banner");
    replitPlugins.push(devBanner());
  } catch {
    // Replit plugins not available — running outside Replit
  }
}

export default defineConfig({
  base: basePath,
  plugins: [react(), tailwindcss(), ...replitPlugins],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
