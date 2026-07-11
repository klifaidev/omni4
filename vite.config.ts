import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: "./",
  define: {
    "process": JSON.stringify({ env: { NODE_ENV: mode === "production" ? "production" : "development" } }),
    "process.env": JSON.stringify({ NODE_ENV: mode === "production" ? "production" : "development" }),
    "process.env.NODE_ENV": JSON.stringify(mode === "production" ? "production" : "development"),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        "process": JSON.stringify({ env: { NODE_ENV: mode === "production" ? "production" : "development" } }),
        "process.env": JSON.stringify({ NODE_ENV: mode === "production" ? "production" : "development" }),
        "process.env.NODE_ENV": JSON.stringify(mode === "production" ? "production" : "development"),
      },
    },
  },
}));
