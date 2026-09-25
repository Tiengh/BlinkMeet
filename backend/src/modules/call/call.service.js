import { createHmac } from "node:crypto";
import { ForbiddenError } from "../../shared/errors/forbidden.error.js";
import { getMatch } from "../matchmaking/matchmaking.repository.js";
import {
  DEFAULT_STUN_URLS,
  DEFAULT_TURN_CREDENTIAL_TTL_SECONDS,
  LOCAL_TURN_SHARED_SECRET,
  MAX_TURN_CREDENTIAL_TTL_SECONDS,
  MIN_TURN_CREDENTIAL_TTL_SECONDS,
} from "./call.constants.js";

const LOCAL_TURN_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "host.docker.internal",
  "coturn",
]);
const LOOPBACK_EXTERNAL_IPS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
]);
const ICE_SERVER_URL_PATTERN = /^(stuns?|turns?):(\[[^\]]+\]|[^:?\s]+)(?::(\d{1,5}))?(?:\?([^\s]+))?$/i;

const parseIceServerUrl = (url, allowedProtocols) => {
  const match = ICE_SERVER_URL_PATTERN.exec(url);
  if (!match) {
    throw new Error(`Invalid WebRTC ICE server URL: ${url}`);
  }

  const protocol = `${match[1].toLowerCase()}:`;
  if (!allowedProtocols.includes(protocol)) {
    throw new Error(`Invalid WebRTC ICE server URL: ${url}`);
  }

  const port = match[3] ? Number(match[3]) : null;
  if (port !== null && (port < 1 || port > 65_535)) {
    throw new Error(`Invalid WebRTC ICE server port: ${url}`);
  }

  const query = match[4] || "";
  if (query) {
    const isTurn = protocol === "turn:" || protocol === "turns:";
    if (!isTurn || !/^transport=(udp|tcp)$/i.test(query)) {
      throw new Error(`Invalid WebRTC ICE server query: ${url}`);
    }
  }

  return {
    host: match[2].replace(/^\[|\]$/g, "").toLowerCase(),
    protocol,
  };
};

const parseUrls = (value, allowedProtocols, fallback = []) => {
  const urls = String(value || "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  const result = urls.length ? [...new Set(urls)] : [...fallback];

  for (const url of result) {
    parseIceServerUrl(url, allowedProtocols);
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

const validateTurnDeployment = ({ env, sharedSecret, turnUrls }) => {
  if (!turnUrls.length) {
    return;
  }

  const usesPublicTurnHost = turnUrls.some((url) => {
    const { host } = parseIceServerUrl(url, ["turn:", "turns:"]);
    return !LOCAL_TURN_HOSTS.has(host);
  });
  if (!usesPublicTurnHost) {
    return;
  }

  const externalIp = String(env.TURN_EXTERNAL_IP || "").trim().toLowerCase();
  if (!externalIp || LOOPBACK_EXTERNAL_IPS.has(externalIp)) {
    throw new Error(
      "TURN_EXTERNAL_IP must be configured with the public TURN address " +
      "when WEBRTC_TURN_URLS points to a non-local host",
    );
  }
  if (sharedSecret === LOCAL_TURN_SHARED_SECRET) {
    throw new Error(
      "The local TURN shared secret cannot be used with a public TURN server",
    );
  }
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
    const sharedSecret = String(env.TURN_SHARED_SECRET || "").trim();
    if (!sharedSecret) {
      throw new Error(
        "TURN_SHARED_SECRET is required when WEBRTC_TURN_URLS is configured",
      );
    }
    validateTurnDeployment({ env, sharedSecret, turnUrls });

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
