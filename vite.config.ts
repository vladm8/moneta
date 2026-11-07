import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: { app: "index.html", privacy: "privacy.html", terms: "terms.html" },
    },
  },
  server: {
    proxy: { "/api/banking": "http://127.0.0.1:3001" },
    fs: {
      deny: [
        ".env",
        ".env.*",
        "**/*.{pem,key,p12,sqlite,sqlite-wal,sqlite-shm}",
        "**/.banking/**",
        "**/.git/**",
      ],
    },
  },
});
