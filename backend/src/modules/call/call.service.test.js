import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { LOCAL_TURN_SHARED_SECRET } from "./call.constants.js";
import { createIceConfiguration } from "./call.service.js";

test("ICE configuration defaults to public STUN without exposing TURN", () => {
  const configuration = createIceConfiguration("user-1", { env: {}, now: 1_700_000_000_000 });
  assert.deepEqual(configuration, {
    iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
    iceTransportPolicy: "all",
    credentialExpiresAt: null,
  });
});

test("ICE configuration creates time-limited coturn REST credentials", () => {
  const now = 1_700_000_000_000;
  const secret = "test-turn-secret";
  const expiresAtSeconds = Math.floor(now / 1_000) + 600;
  const username = `${expiresAtSeconds}:user-42`;
  const expectedCredential = createHmac("sha1", secret).update(username).digest("base64");
  const configuration = createIceConfiguration("user-42", {
    env: {
      WEBRTC_STUN_URLS: "stun:stun.example.com:3478",
      WEBRTC_TURN_URLS: "turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp",
      WEBRTC_ICE_TRANSPORT_POLICY: "relay",
      TURN_EXTERNAL_IP: "203.0.113.10",
      TURN_SHARED_SECRET: secret,
      TURN_CREDENTIAL_TTL_SECONDS: "600",
    },
    now,
  });
  assert.deepEqual(configuration, {
    iceServers: [
      { urls: ["stun:stun.example.com:3478"] },
      { urls: ["turn:turn.example.com:3478?transport=udp", "turn:turn.example.com:3478?transport=tcp"], username, credential: expectedCredential },
    ],
    iceTransportPolicy: "relay",
    credentialExpiresAt: new Date(expiresAtSeconds * 1_000).toISOString(),
  });
});

test("local coturn can use local development defaults", () => {
  const configuration = createIceConfiguration("user-1", {
    env: {
      WEBRTC_STUN_URLS: "stun:localhost:3478",
      WEBRTC_TURN_URLS: "turn:localhost:3478?transport=udp",
      TURN_EXTERNAL_IP: "127.0.0.1",
      TURN_SHARED_SECRET: LOCAL_TURN_SHARED_SECRET,
    },
  });
  assert.equal(configuration.iceServers.length, 2);
});

test("public TURN requires a non-loopback external IP", () => {
  assert.throws(() => createIceConfiguration("user-1", {
    env: { WEBRTC_TURN_URLS: "turn:turn.example.com:3478", TURN_SHARED_SECRET: "different-secret" },
  }), /TURN_EXTERNAL_IP/);
  assert.throws(() => createIceConfiguration("user-1", {
    env: { WEBRTC_TURN_URLS: "turn:turn.example.com:3478", TURN_EXTERNAL_IP: "127.0.0.1", TURN_SHARED_SECRET: "different-secret" },
  }), /TURN_EXTERNAL_IP/);
});

test("public TURN rejects the local development shared secret", () => {
  assert.throws(() => createIceConfiguration("user-1", {
    env: { WEBRTC_TURN_URLS: "turn:turn.example.com:3478", TURN_EXTERNAL_IP: "203.0.113.10", TURN_SHARED_SECRET: LOCAL_TURN_SHARED_SECRET },
  }), /local TURN shared secret/);
});

test("ICE configuration rejects malformed URLs", () => {
  assert.throws(() => createIceConfiguration("user-1", { env: { WEBRTC_STUN_URLS: "https://example.com" } }), /Invalid WebRTC ICE server URL/);
  assert.throws(() => createIceConfiguration("user-1", { env: { WEBRTC_TURN_URLS: "turn:" } }), /Invalid WebRTC ICE server URL/);
  assert.throws(() => createIceConfiguration("user-1", { env: { WEBRTC_TURN_URLS: "turn:localhost:70000" } }), /Invalid WebRTC ICE server port/);
});
