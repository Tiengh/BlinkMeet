import { createHmac } from "node:crypto";
import { ForbiddenError } from "../../shared/errors/forbidden.error.js";
import { getMatch } from "../matchmaking/matchmaking.repository.js";
import {
  DEFAULT_STUN_URLS,
  DEFAULT_TURN_CREDENTIAL_TTL_SECONDS,
  MAX_TURN_CREDENTIAL_TTL_SECONDS,
  MIN_TURN_CREDENTIAL_TTL_SECONDS,
} from "./call.constants.js";

const parseUrls = (value, allowedProtocols, fallback = []) => {
  const urls = String(value || "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  const result = urls.length ? [...new Set(urls)] : [...fallback];

  for (const url of result) {
    if (!allowedProtocols.some((protocol) => url.startsWith(protocol))) {
      throw new Error(`Invalid WebRTC ICE server URL: ${url}`);
    }
  }
  return result;
};

const parseCredentialTtl = (value) => {
  if (value === undefined || value === "") {
    return DEFAULT_TURN_CREDENTIAL_TTL_SECONDS;
  }
  const ttl = Number(value);
  if (
    !Number.isInteger(ttl) ||
    ttl < MIN_TURN_CREDENTIAL_TTL_SECONDS ||
    ttl > MAX_TURN_CREDENTIAL_TTL_SECONDS
  ) {
    throw new Error(
      `TURN credential TTL must be between ${MIN_TURN_CREDENTIAL_TTL_SECONDS} ` +
      `and ${MAX_TURN_CREDENTIAL_TTL_SECONDS} seconds`,
    );
  }
  return ttl;
};

const parseIceTransportPolicy = (value) => {
  const policy = value || "all";
  if (policy !== "all" && policy !== "relay") {
    throw new Error("WEBRTC_ICE_TRANSPORT_POLICY must be all or relay");
  }
  return policy;
};

export const createIceConfiguration = (
  userId,
  { env = process.env, now = Date.now() } = {},
) => {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    throw new Error("A user ID is required to create TURN credentials");
  }

  const stunUrls = parseUrls(
    env.WEBRTC_STUN_URLS,
    ["stun:", "stuns:"],
    DEFAULT_STUN_URLS,
  );
  const turnUrls = parseUrls(
    env.WEBRTC_TURN_URLS,
    ["turn:", "turns:"],
  );
  const iceServers = stunUrls.length ? [{ urls: stunUrls }] : [];
  let credentialExpiresAt = null;

  if (turnUrls.length) {
    const sharedSecret = env.TURN_SHARED_SECRET;
    if (!sharedSecret) {
      throw new Error(
        "TURN_SHARED_SECRET is required when WEBRTC_TURN_URLS is configured",
      );
    }
    const ttl = parseCredentialTtl(env.TURN_CREDENTIAL_TTL_SECONDS);
    const expiresAtSeconds = Math.floor(now / 1_000) + ttl;
    const username = `${expiresAtSeconds}:${normalizedUserId}`;
    const credential = createHmac("sha1", sharedSecret)
      .update(username)
      .digest("base64");

    iceServers.push({
      urls: turnUrls,
      username,
      credential,
    });
    credentialExpiresAt = new Date(expiresAtSeconds * 1_000).toISOString();
  }

  return {
    iceServers,
    iceTransportPolicy: parseIceTransportPolicy(
      env.WEBRTC_ICE_TRANSPORT_POLICY,
    ),
    credentialExpiresAt,
  };
};

export const authorizeCallSignal = async (userId, {
  callId,
  peerId,
  sessionId,
}) => {
  const match = await getMatch(String(userId));
  if (
    !match ||
    match.callId !== callId ||
    match.peerId !== peerId ||
    match.sessionId !== sessionId
  ) {
    throw new ForbiddenError("Signal does not belong to the active match");
  }
  return match;
};
