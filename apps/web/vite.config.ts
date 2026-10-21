import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Everything this app serves lives under /games on the home origin (docs/plan.md →
// The contract): the pages, the hashed bundles under /games/static/, the API under
// /games/api/. The server serves the build with the same prefix, and the home
// gateway proxies the whole prefix unchanged.
const port = (fallback: number): number => {
  const fromEnv = Number(process.env.PORT);
  return Number.isInteger(fromEnv) && fromEnv > 0 ? fromEnv : fallback;
};

export default defineConfig({
  base: "/games/",
  build: {
    assetsDir: "static"
  },
  plugins: [react()],
  server: {
    port: port(5174),
    proxy: {
      "/games/api": {
        target: "http://127.0.0.1:4200",
        changeOrigin: true
      }
    }
  },
  preview: {
    port: port(4174),
    proxy: {
      "/games/api": {
        target: "http://127.0.0.1:4200",
        changeOrigin: true
      }
    }
  }
});
