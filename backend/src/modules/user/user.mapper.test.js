import assert from "node:assert/strict";
import { test } from "node:test";
import { toAuthenticatedUser, toUserPreview } from "./user.mapper.js";

const user = {
  _id: "a".repeat(24), user_email: "private@example.com",
  user_name: "Test", user_profilePic: "https://example.com/avatar.png",
  user_bio: "Learning", user_nativeLanguage: "English",
  user_learningLanguage: "Vietnamese", user_location: "Hanoi",
  user_isOnboarded: true, user_password: "private-hash",
  recommendationBucket: "1", internalField: "secret",
};

test("self profile includes email but excludes internal attributes", () => {
  const self = toAuthenticatedUser(user);
  assert.equal(self.user_email, user.user_email);
  assert.equal(self.user_password, undefined);
  assert.equal(self.internalField, undefined);
  assert.equal(self.recommendationBucket, undefined);
});

test("public user preview only includes explicitly allowed fields", () => {
  const preview = toUserPreview(user);
  assert.equal(preview._id, user._id);
  assert.equal(preview.user_nativeLanguage, "English");
  assert.equal(preview.user_email, undefined);
  assert.equal(preview.user_password, undefined);
  assert.equal(preview.internalField, undefined);
  assert.equal(toUserPreview(null), null);
});
