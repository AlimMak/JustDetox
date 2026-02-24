import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import webExtension from "vite-plugin-web-extension";

export default defineConfig({
  plugins: [
    react(),
    webExtension({
      manifest: "public/manifest.json",
      additionalInputs: [
        "src/content/overlay.ts",
        "src/ui/onboarding/onboarding.html",
      ],
    }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
  },
});
