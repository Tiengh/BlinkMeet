import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { createIceConfiguration } from "./call.service.js";

test("ICE configuration defaults to public STUN without exposing TURN", () => {
  const configuration = createIceConfiguration("user-1", {
    env: {},
    now: 1_700_000_000_000,
  });

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
  const expectedCredential = createHmac("sha1", secret)
    .update(username)
    .digest("base64");

  const configuration = createIceConfiguration("user-42", {
    env: {
      WEBRTC_STUN_URLS: "stun:stun.example.com:3478",
      WEBRTC_TURN_URLS: [
        "turn:turn.example.com:3478?transport=udp",
        "turn:turn.example.com:3478?transport=tcp",
      ].join(","),
      WEBRTC_ICE_TRANSPORT_POLICY: "relay",
      TURN_SHARED_SECRET: secret,
      TURN_CREDENTIAL_TTL_SECONDS: "600",
    },
    now,
  });

  assert.deepEqual(configuration, {
    iceServers: [
      { urls: ["stun:stun.example.com:3478"] },
      {
        urls: [
          "turn:turn.example.com:3478?transport=udp",
          "turn:turn.example.com:3478?transport=tcp",
        ],
        username,
        credential: expectedCredential,
      },
    ],
    iceTransportPolicy: "relay",
    credentialExpiresAt: new Date(expiresAtSeconds * 1_000).toISOString(),
  });
});

test("TURN URLs require a shared secret", () => {
  assert.throws(
    () => createIceConfiguration("user-1", {
      env: { WEBRTC_TURN_URLS: "turn:turn.example.com:3478" },
    }),
    /TURN_SHARED_SECRET/,
  );
});

test("ICE configuration rejects unsupported URL protocols", () => {
  assert.throws(
    () => createIceConfiguration("user-1", {
      env: { WEBRTC_STUN_URLS: "https://example.com" },
    }),
    /Invalid WebRTC ICE server URL/,
  );
});
