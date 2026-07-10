import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls to the Express server in dev (one origin, no CORS hassle).
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});
