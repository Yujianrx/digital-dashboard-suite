import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "../server/env.mjs";
import { buildSnapshot } from "../server/snapshot-source.mjs";
import { dueCycle } from "../server/snapshot-service.mjs";
await loadLocalEnv();
const metadata = await buildSnapshot({
  directory: fileURLToPath(new URL("../.local-data/", import.meta.url)),
  cycle: dueCycle(),
  progress: (message) => console.log(new Date().toISOString(), message),
});
console.log(JSON.stringify(metadata));
