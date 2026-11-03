import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// O "ws:" da política de segurança só existe para o recarregamento do Vite em
// desenvolvimento. Na versão gerada ele sai: a tela não abre conexão com nenhum servidor.
const cspWithoutDevSocket: Plugin = {
  name: "csp-sem-websocket-de-dev",
  apply: "build",
  transformIndexHtml(html) {
    const result = html.replace("connect-src 'self' ws:;", "connect-src 'self';");
    if (result === html) throw new Error("Política de segurança do index.html não encontrada");
    return result;
  },
};

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
  plugins: [react(), cspWithoutDevSocket],
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
