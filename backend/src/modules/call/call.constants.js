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
