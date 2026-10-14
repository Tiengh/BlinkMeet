import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { io } from "socket.io-client";

const origin = process.env.BLINKMEET_SMOKE_URL || "http://127.0.0.1:5001";
const suffix = randomBytes(5).toString("hex");

const request = async (path, { method = "GET", cookie, body } = {}) => {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) {throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(data)}`);}
  return { data, cookie: response.headers.get("set-cookie")?.split(";")[0] };
};

const connect = (cookie) => new Promise((resolve, reject) => {
  const socket = io(origin, {
    transports: ["websocket"], extraHeaders: { Cookie: cookie },
    reconnection: false, timeout: 5_000,
  });
  socket.once("connect", () => resolve(socket));
  socket.once("connect_error", reject);
});

const ack = (socket, event, payload) => new Promise((resolve, reject) => {
  socket.timeout(5_000).emit(event, payload, (error, result) => {
    if (error || !result?.ok) {reject(error || new Error(JSON.stringify(result)));}
    else {resolve(result);}
  });
});

const main = async () => {
  const health = await request("/api/health/ready");
  assert.equal(health.data.success, true);
  const a = await request("/api/auth/signup", {
    method: "POST", body: { name: "Phase Ten A", email: `phase10-a-${suffix}@example.com`, password: "StrongPass123!" },
  });
  const b = await request("/api/auth/signup", {
    method: "POST", body: { name: "Phase Ten B", email: `phase10-b-${suffix}@example.com`, password: "StrongPass123!" },
  });
  assert.ok(a.cookie?.startsWith("jwt="));
  assert.ok(b.cookie?.startsWith("jwt="));
  const profile = { name: "Phase Ten", bio: "Smoke test", nativeLanguage: "English",
    learningLanguage: "Vietnamese", location: "Local", profilePic: "" };
  await request("/api/auth/onboarding", { method: "POST", cookie: a.cookie, body: profile });
  await request("/api/auth/onboarding", { method: "POST", cookie: b.cookie, body: profile });
  const outgoing = await request(`/api/user/friend-request/${b.data.user._id}`, {
    method: "POST", cookie: a.cookie,
  });
  await request(`/api/user/friend-request/${outgoing.data._id}/accept`, {
    method: "POST", cookie: b.cookie,
  });
  const friends = await request("/api/user/friends", { cookie: a.cookie });
  assert.ok(friends.data.some((user) => user._id === b.data.user._id));
  const socketA = await connect(a.cookie);
  const socketB = await connect(b.cookie);
  try {
    const sent = await ack(socketA, "chat:send", {
      recipientId: b.data.user._id, content: "DynamoDB smoke",
      clientMessageId: `smoke-${suffix}`,
    });
    const repeated = await ack(socketA, "chat:send", {
      recipientId: b.data.user._id, content: "DynamoDB smoke",
      clientMessageId: `smoke-${suffix}`,
    });
    assert.equal(sent.message._id, repeated.message._id);
    const history = await request(`/api/chat/conversations/${b.data.user._id}/messages`, { cookie: a.cookie });
    assert.equal(history.data.messages.filter((message) => message._id === sent.message._id).length, 1);
    let deliveryCursor = null;
    do {
      const result = await ack(socketB, "chat:sync-delivered", { cursor: deliveryCursor });
      deliveryCursor = result.nextCursor;
    } while (deliveryCursor);
    let seenCursor = null;
    do {
      const result = await ack(socketB, "chat:seen", {
        conversationId: history.data.conversation._id, cursor: seenCursor,
      });
      seenCursor = result.nextCursor;
    } while (seenCursor);
    console.log("Phase 10 local smoke passed: readiness, auth, friends, Socket.IO chat and history");
  } finally {
    socketA.disconnect();
    socketB.disconnect();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
