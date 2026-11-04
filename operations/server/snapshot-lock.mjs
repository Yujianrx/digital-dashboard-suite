import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
// Native locks are released when the owning process or worker terminates.
export async function acquireSnapshotLock(directory) {
  const db = new DatabaseSync(join(directory, "sync-guard.sqlite"), {
    timeout: 0,
  });
  try {
    db.exec("BEGIN EXCLUSIVE");
  } catch {
    db.close();
    throw Error("已有同步任务正在运行");
  }
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    try {
      db.exec("ROLLBACK");
    } finally {
      db.close();
    }
  };
}
