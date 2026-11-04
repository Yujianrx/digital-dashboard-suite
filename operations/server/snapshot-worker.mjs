import { parentPort, workerData } from "node:worker_threads";
import { buildSnapshot } from "./snapshot-source.mjs";
try {
  const metadata = await buildSnapshot({
    ...workerData,
    progress: (message) =>
      parentPort.postMessage({ type: "progress", message }),
  });
  parentPort.postMessage({ type: "complete", metadata });
} catch (error) {
  parentPort.postMessage({ type: "failed", message: error.message });
  process.exitCode = 1;
}
