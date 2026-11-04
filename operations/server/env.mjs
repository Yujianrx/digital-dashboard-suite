import { readFile } from "node:fs/promises";
export async function loadLocalEnv() {
  let raw;
  try {
    raw = await readFile(new URL("../.env.local", import.meta.url), "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return;
    throw e;
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (match && !Object.hasOwn(process.env, match[1])) {
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      )
        value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  }
}
