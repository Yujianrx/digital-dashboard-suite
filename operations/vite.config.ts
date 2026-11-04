import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";
export default defineConfig({
  plugins: [vue()],
  base: "./",
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    host: "127.0.0.1",
    port: 8112,
    strictPort: true,
    fs: {
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem,key,p12,pfx,cer,der}",
        ".npmrc",
        ".yarnrc.yml",
        "**/.git/**",
        "**/.local-data/**",
      ],
    },
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
  build: {
    outDir: "dist",
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (/node_modules.*(echarts|zrender)/.test(id)) return "echarts";
        },
      },
    },
  },
});
