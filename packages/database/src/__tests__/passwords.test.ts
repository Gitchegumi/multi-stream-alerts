import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../passwords.ts";

test("hashPassword produces a verifiable hash", async () => {
  const hash = await hashPassword("correct horse battery staple");
  assert.match(hash, /^\$2[aby]\$/);
  assert.equal(await verifyPassword("correct horse battery staple", hash), true);
});

test("verifyPassword rejects wrong password", async () => {
  const hash = await hashPassword("swordfish");
  assert.equal(await verifyPassword("salmon", hash), false);
});

test("verifyPassword returns false for null hash", async () => {
  assert.equal(await verifyPassword("anything", null), false);
  assert.equal(await verifyPassword("anything", undefined), false);
  assert.equal(await verifyPassword("", "$2a$12$abcdefghijklmnopqrstuv"), false);
});
test("hashPassword throws on empty input", async () => {
  await assert.rejects(() => hashPassword(""));
});
