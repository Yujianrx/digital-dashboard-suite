import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { validateDataset } from "../src/restaurant/model.mjs";

const root = fileURLToPath(new URL("../public/", import.meta.url));
const template = validateDataset(
  JSON.parse(await readFile(join(root, "data/template.json"), "utf8")),
);
for (const key of [
  "stores",
  "facts",
  "overviewFacts",
  "targets",
  "capacity",
  "activities",
  "members",
  "dishes",
]) {
  assert.deepEqual(
    template[key],
    [],
    `Public business array must be empty: ${key}`,
  );
}
async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name),
      name = relative(root, path).replaceAll("\\", "/");
    if (entry.isDirectory()) await check(path);
    else
      assert.ok(
        name.startsWith("maps/") || name === "data/template.json",
        `Unexpected public file: ${name}`,
      );
  }
}
await check(root);
console.log(
  "Public template is empty; public assets contain only geographic resources.",
);
