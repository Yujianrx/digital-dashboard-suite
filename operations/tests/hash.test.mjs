import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { sha256Fallback, sha256Text } from "../src/restaurant/hash.mjs";
test("HTTP-intranet resource hashing matches SHA256 for UTF8 and padding boundaries", async () => {
  for (const text of [
    "",
    "abc",
    "a".repeat(55),
    "a".repeat(56),
    "a".repeat(63),
    "a".repeat(64),
    "地图·连锁品牌🐟".repeat(10001),
  ]) {
    const expected = createHash("sha256").update(text).digest("hex");
    assert.equal(sha256Fallback(text), expected);
    assert.equal(await sha256Text(text), expected);
  }
});
