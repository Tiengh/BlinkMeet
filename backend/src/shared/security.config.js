const INSECURE_EXAMPLE_SECRETS = new Set([
  "replace-with-a-long-random-jwt-secret",
  "replace-with-a-long-random-turn-secret",
  "blinkmeet-local-jwt-secret-change-me",
  "blinkmeet-local-turn-secret",
]);

const integerFromEnv = (name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === "") {return fallback;}

  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
};

const parseTrustProxy = (value) => {
  if (value === undefined || value === "" || value === "false") {return false;}
  if (value === "true") {return true;}
  if (/^\d+$/.test(value)) {return Number(value);}
  return value;
};

export const isKnownInsecureSecret = (value) =>
  INSECURE_EXAMPLE_SECRETS.has(String(value || "").trim());

export const securityConfig = Object.freeze({
  requestBodyLimit: process.env.REQUEST_BODY_LIMIT || "100kb",
  socketMaxPayloadBytes: integerFromEnv(
    "SOCKET_MAX_PAYLOAD_BYTES",
    128 * 1_024,
    { min: 1_024, max: 1_024 * 1_024 },
  ),
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  rateLimits: Object.freeze({
    login: Object.freeze({
      limit: integerFromEnv("LOGIN_RATE_LIMIT", 5),
      windowMs: integerFromEnv("LOGIN_RATE_WINDOW_MS", 60_000),
    }),
    signup: Object.freeze({
      limit: integerFromEnv("SIGNUP_RATE_LIMIT", 5),
      windowMs: integerFromEnv("SIGNUP_RATE_WINDOW_MS", 60_000),
    }),
    friendRequest: Object.freeze({
      limit: integerFromEnv("FRIEND_REQUEST_RATE_LIMIT", 10),
      windowMs: integerFromEnv("FRIEND_REQUEST_RATE_WINDOW_MS", 60_000),
    }),
    matchmakingSearch: Object.freeze({
      limit: integerFromEnv("MATCHMAKING_RATE_LIMIT", 20),
      windowMs: integerFromEnv("MATCHMAKING_RATE_WINDOW_MS", 60_000),
    }),
    iceConfiguration: Object.freeze({
      limit: integerFromEnv("ICE_CONFIG_RATE_LIMIT", 30),
      windowMs: integerFromEnv("ICE_CONFIG_RATE_WINDOW_MS", 60_000),
    }),
    socketIpConnection: Object.freeze({
      limit: integerFromEnv("SOCKET_IP_CONNECTION_RATE_LIMIT", 120),
      windowMs: integerFromEnv("SOCKET_IP_CONNECTION_RATE_WINDOW_MS", 60_000),
    }),
    socketConnection: Object.freeze({
      limit: integerFromEnv("SOCKET_CONNECTION_RATE_LIMIT", 20),
      windowMs: integerFromEnv("SOCKET_CONNECTION_RATE_WINDOW_MS", 60_000),
    }),
  }),
});

export const validateSecurityEnvironment = (env = process.env) => {
  const jwtSecret = String(env.JWT_SECRET_KEY || "").trim();
  if (!jwtSecret) {
    throw new Error("JWT_SECRET_KEY is required");
  }

  if (env.NODE_ENV !== "production") {return;}

  if (jwtSecret.length < 32) {
    throw new Error("JWT_SECRET_KEY must contain at least 32 characters in production");
  }
  if (isKnownInsecureSecret(jwtSecret)) {
    throw new Error("JWT_SECRET_KEY must not use a public example or local development secret");
  }
  if (!String(env.CLIENT_ORIGIN || "").trim()) {
    throw new Error("CLIENT_ORIGIN is required in production");
  }

  const turnUrls = String(env.WEBRTC_TURN_URLS || "").trim();
  if (!turnUrls) {return;}

  const turnSharedSecret = String(env.TURN_SHARED_SECRET || "").trim();
  if (!turnSharedSecret) {
    throw new Error("TURN_SHARED_SECRET is required when WEBRTC_TURN_URLS is configured");
  }
  if (turnSharedSecret.length < 32) {
    throw new Error("TURN_SHARED_SECRET must contain at least 32 characters in production");
  }
  if (isKnownInsecureSecret(turnSharedSecret)) {
    throw new Error("TURN_SHARED_SECRET must not use a public example or local development secret");
  }
};
