import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../lib/auth/password.js";

test("hashPassword/verifyPassword: round trip succeeds", () => {
  const hash = hashPassword("correct horse battery staple");
  assert.equal(verifyPassword("correct horse battery staple", hash), true);
});

test("verifyPassword: fails on wrong password", () => {
  const hash = hashPassword("correct horse battery staple");
  assert.equal(verifyPassword("wrong password entirely", hash), false);
});

test("hashPassword: salts each hash differently for the same password", () => {
  const a = hashPassword("same password");
  const b = hashPassword("same password");
  assert.notEqual(a, b);
  assert.equal(verifyPassword("same password", a), true);
  assert.equal(verifyPassword("same password", b), true);
});

test("verifyPassword: fails closed on malformed or missing stored hash", () => {
  assert.equal(verifyPassword("anything", null), false);
  assert.equal(verifyPassword("anything", ""), false);
  assert.equal(verifyPassword("anything", "not-a-real-hash"), false);
  assert.equal(verifyPassword("anything", "scrypt$onlyonepart"), false);
});
