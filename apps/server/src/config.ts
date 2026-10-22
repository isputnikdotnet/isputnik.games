import fs from "node:fs";
import path from "node:path";
import { checkSecret } from "./identity.js";

const rootDir = process.cwd().includes(path.join("apps", "server"))
  ? path.resolve(process.cwd(), "..", "..")
  : process.cwd();
const packageInfo = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8")) as {
  version: string;
  stage?: string;
  description: string;
};

/** Everything this app serves lives under this prefix on the home origin. */
export const BASE_PATH = "/games";

const production = process.env.NODE_ENV === "production";
const gatewaySecret = process.env.GATEWAY_SECRET?.trim() || null;

// The gateway secret is the only thing standing between this server and anyone
// who can reach its port. The image must therefore refuse to run without one,
// with a short one, or with the compose example's placeholder; a source checkout
// without one is development, and gets a fixed developer identity instead
// (see identity.ts → checkSecret).
const secretProblem = checkSecret(gatewaySecret, production);
if (secretProblem) throw new Error(secretProblem);

export const config = {
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 4200),
  /** The built web app to serve under /games; empty means API only (Vite serves the pages). */
  staticPath: process.env.STATIC_PATH ?? "",
  /** The SQLite file with the online matches (the image sets /config/games.sqlite). */
  dbPath: process.env.DB_PATH ?? path.join(rootDir, "data", "games.sqlite"),
  gatewaySecret,
  /** Development only: who the server pretends is signed in when no secret is set,
   *  as "id:name:role[:lang[:theme]]". */
  devUser: process.env.DEV_USER ?? "dev:Developer:admin:en:minimalist",
  production,
  version: packageInfo.version,
  stage: packageInfo.stage ?? null,
  description: packageInfo.description
};
