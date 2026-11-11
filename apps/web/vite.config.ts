import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Everything this app serves lives under /games on the home origin (docs/plan.md →
// The contract): the pages, the hashed bundles under /games/static/, the API under
// /games/api/. The server serves the build with the same prefix, and the home
// gateway proxies the whole prefix unchanged.
const port = (fallback: number): number => {
  const fromEnv = Number(process.env.PORT);
  return Number.isInteger(fromEnv) && fromEnv > 0 ? fromEnv : fallback;
};

// The offline worker (sw/worker.js) is told what this build is made of: every
// built file and everything in public/, so a device stores the whole app the
// first time it opens it. The version is a hash of that list — the built names
// carry their content's hash — so any release makes a new worker.
function offlineWorker(): Plugin {
  const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));
  return {
    name: "isputnik-games-offline-worker",
    apply: "build",
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((file) => file !== "index.html" && !file.endsWith(".map"));
      const files = [...new Set([...built, ...readdirSync(at("./public"))])].sort();
      const template = readFileSync(at("./sw/worker.js"), "utf8");
      const version = createHash("sha256").update(JSON.stringify(files)).update(template).digest("hex").slice(0, 12);
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: `const FILES = ${JSON.stringify(files)};\nconst VERSION = ${JSON.stringify(version)};\n${template}`
      });
    }
  };
}

export default defineConfig({
  base: "/games/",
  build: {
    assetsDir: "static"
  },
  plugins: [react(), offlineWorker()],
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
