import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        id: "/",
        name: "IIEST Shibpur Student Hub",
        short_name: "IIEST",
        description:
          "Attendance, timetable, syllabus, notices and fees for IIEST Shibpur.",
        start_url: ".",
        scope: ".",
        scope_extensions: [{ origin: "https://maps.iiest.wiki" }],
        display: "standalone",
        orientation: "portrait",
        background_color: "#0a0a0a",
        theme_color: "#0a0a0a",
        categories: ["education", "productivity"],
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        globIgnores: ["**/data/**"],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 8765,
  },
});
