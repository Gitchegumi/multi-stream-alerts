import test from "node:test";
import assert from "node:assert/strict";
import { generateUniqueChannelSlugSync } from "../channel-slug.ts";

test("generateUniqueChannelSlugSync lower-cases and sanitizes the local part", () => {
  // Dots and underscores are non-alphanumeric so they collapse into a
  // single dash and the local part is lower-cased.
  const slug = generateUniqueChannelSlugSync("Some.User@Example.COM");
  assert.match(slug, /^some-user-[0-9a-f]{8}$/);
});

test("generateUniqueChannelSlugSync replaces non-alphanumeric characters with a single dash", () => {
  // Runs of non-alphanumeric characters collapse to a single dash.
  const slug = generateUniqueChannelSlugSync("user++tag@example.com");
  assert.match(slug, /^user-tag-[0-9a-f]{8}$/);
});

test("generateUniqueChannelSlugSync strips leading and trailing dashes", () => {
  const slug = generateUniqueChannelSlugSync("___weird___user___@example.com");
  // Underscores are normalized to dashes (collapsing runs to a single
  // dash), then leading and trailing dashes are trimmed.
  assert.match(slug, /^weird-user-[0-9a-f]{8}$/);
});

test("generateUniqueChannelSlugSync falls back to 'user' when the local part is empty", () => {
  const slug = generateUniqueChannelSlugSync("@@@example.com");
  assert.match(slug, /^user-[0-9a-f]{8}$/);
});

test("generateUniqueChannelSlugSync caps the local part at 24 characters", () => {
  const local = "a".repeat(40);
  const slug = generateUniqueChannelSlugSync(`${local}@example.com`);
  // 24 a's + '-' + 8 hex chars = 33 chars total.
  assert.equal(slug.length, 24 + 1 + 8);
  assert.match(slug, /^a{24}-[0-9a-f]{8}$/);
});

test("generateUniqueChannelSlugSync produces a unique suffix per call", () => {
  // Two calls in quick succession should almost certainly get different
  // 8-hex-char suffixes. The probability of collision is 1 in 4 billion
  // per pair, so a flake would imply a broken random source.
  const a = generateUniqueChannelSlugSync("user@example.com");
  const b = generateUniqueChannelSlugSync("user@example.com");
  assert.notEqual(a, b);
});
