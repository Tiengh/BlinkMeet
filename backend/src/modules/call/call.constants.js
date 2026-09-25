export const RANDOM_CALL_PROVIDER = "webrtc";
export const DIRECT_CALL_PROVIDER = "stream-video";

export const CALL_EVENTS = Object.freeze({
  READY: "call:ready",
  OFFER: "call:offer",
  ANSWER: "call:answer",
  ICE_CANDIDATE: "call:ice-candidate",
});

export const MAX_SDP_LENGTH = 100_000;
export const MAX_ICE_CANDIDATE_LENGTH = 8_192;

export const DEFAULT_STUN_URLS = Object.freeze([
  "stun:stun.l.google.com:19302",
]);
export const DEFAULT_TURN_CREDENTIAL_TTL_SECONDS = 3_600;
export const MIN_TURN_CREDENTIAL_TTL_SECONDS = 60;
export const MAX_TURN_CREDENTIAL_TTL_SECONDS = 86_400;
