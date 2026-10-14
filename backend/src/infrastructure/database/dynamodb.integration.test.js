import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { createUser, findUserByEmail, updateUser } from "../../modules/auth/auth.repository.js";
import { findUserById, areFriends, findUserFriends, findRecommendedUsers } from "../../modules/user/user.repository.js";
import { acceptRequest, createRequest, findRequestById } from "../../modules/friend/friend.repository.js";
import {
  createMessage, findMessageById, findMessages, findOrCreateConversation,
  markMessageDelivered, markMessagesSeen, setLastMessage, findConversationById,
  findPendingDeliveryMessages, findUnseenMessages,
} from "../../modules/chat/chat.repository.js";

test("DynamoDB Local preserves uniqueness, friendships, idempotency and history", {
  skip: !process.env.DYNAMODB_ENDPOINT,
}, async () => {
  const suffix = randomBytes(6).toString("hex");
  const newUser = (name, email) => createUser({
    user_name: name, user_email: email, user_password: "hashed-password",
    user_profilePic: "",
  });

  const race = await Promise.allSettled([
    newUser("One", ` Unique-${suffix}@Example.com `),
    newUser("Two", `unique-${suffix}@example.com`),
  ]);
  assert.equal(race.filter((result) => result.status === "fulfilled").length, 1);
  const first = (await findUserByEmail(`UNIQUE-${suffix}@EXAMPLE.COM`));
  assert.ok(first?._id);
  assert.equal(first.user_email, `unique-${suffix}@example.com`);
  assert.equal((await findUserById(first._id)).user_password, undefined);
  const second = await newUser("Second", `second-${suffix}@example.com`);
  await updateUser(first._id, { user_isOnboarded: true, user_name: "One" });
  await updateUser(second._id, { user_isOnboarded: true, user_name: "Second" });
  assert.ok((await findRecommendedUsers(first._id)).some((user) => user._id === second._id));

  const requests = await Promise.allSettled([
    createRequest(first._id, second._id), createRequest(second._id, first._id),
  ]);
  assert.equal(requests.filter((result) => result.status === "fulfilled").length, 1);
  const request = requests.find((result) => result.status === "fulfilled").value;
  await acceptRequest(request);
  assert.equal((await findRequestById(request._id)).status, "accepted");
  assert.equal(await areFriends(first._id, second._id), true);
  assert.equal(await areFriends(second._id, first._id), true);
  assert.equal((await findUserFriends(first._id)).user_friends[0]._id, second._id);

  const [conversationA, conversationB] = await Promise.all([
    findOrCreateConversation(first._id, second._id),
    findOrCreateConversation(second._id, first._id),
  ]);
  assert.equal(conversationA._id, conversationB._id);
  const baseMessage = {
    conversation: conversationA._id, sender: first._id, recipient: second._id,
    content: "Hello", clientMessageId: `client-${suffix}`,
  };
  const duplicate = await Promise.all([
    createMessage(baseMessage), createMessage(baseMessage),
  ]);
  assert.equal(duplicate[0]._id, duplicate[1]._id);
  const middle = await createMessage({ ...baseMessage, content: "Second", clientMessageId: `other-${suffix}` });
  await new Promise((resolve) => setTimeout(resolve, 2));
  const newest = await createMessage({ ...baseMessage, content: "Third", clientMessageId: `third-${suffix}` });
  await setLastMessage(conversationA._id, newest._id);
  await setLastMessage(conversationA._id, middle._id);
  assert.equal((await findConversationById(conversationA._id)).lastMessage, newest._id);
  const firstPage = await findMessages(conversationA._id, { limit: 2 });
  assert.equal(firstPage.messages.length, 2);
  assert.ok(firstPage.nextCursor);
  await assert.rejects(
    findMessages("000000000000000000000000", { limit: 2, before: firstPage.nextCursor }),
    /before cursor is invalid/,
  );
  const secondPage = await findMessages(conversationA._id, { limit: 2, before: firstPage.nextCursor });
  assert.equal(secondPage.messages.length, 1);
  assert.notEqual(firstPage.messages[0]._id, secondPage.messages[0]._id);
  const pending = await findPendingDeliveryMessages(second._id);
  assert.equal(pending.messages.length, 3);
  const unseenSent = await findUnseenMessages(conversationA._id, second._id);
  assert.equal(unseenSent.messages.length, 3);
  assert.ok(unseenSent.nextCursor);
  assert.equal((await findMessageById(duplicate[0]._id)).status, "sent");
  assert.equal((await markMessageDelivered(duplicate[0]._id, second._id)).status, "delivered");
  const unseenDelivered = await findUnseenMessages(conversationA._id, second._id, unseenSent.nextCursor);
  assert.equal(unseenDelivered.messages.length, 1);
  assert.equal(unseenDelivered.messages[0]._id, duplicate[0]._id);
  assert.equal(await markMessageDelivered(duplicate[0]._id, second._id), null);
  const seen = await markMessagesSeen([await findMessageById(duplicate[0]._id)], second._id);
  assert.equal(seen[0].status, "seen");
  assert.equal(await markMessageDelivered(duplicate[0]._id, second._id), null);
});
