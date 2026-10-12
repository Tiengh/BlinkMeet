import { BadRequestError } from "../../shared/errors/bad-request.error.js";
import { parseObjectId } from "../../shared/validation.js";
import { parseSessionId } from "../matchmaking/matchmaking.validation.js";
import {
  MAX_ICE_CANDIDATE_LENGTH,
  MAX_SDP_LENGTH,
} from "./call.constants.js";

const requiredString = (value, name, maxLength = 256) => {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > maxLength) {
    throw new BadRequestError(`Invalid ${name}`);
  }
  return normalized;
};

export const parseCallIdentity = (payload = {}) => {
  const callId = requiredString(payload.callId, "callId");
  if (!/^omegle-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(callId)) {
    throw new BadRequestError("Invalid callId");
  }
  return {
    callId,
    peerId: parseObjectId(payload.peerId, "peerId"),
    sessionId: parseSessionId(payload.sessionId),
  };
};

export const parseDescription = (payload, expectedType) => {
  const identity = parseCallIdentity(payload);
  const description = payload?.description;
  if (
    !description ||
    description.type !== expectedType ||
    typeof description.sdp !== "string" ||
    !description.sdp ||
    description.sdp.length > MAX_SDP_LENGTH
  ) {
    throw new BadRequestError(`Invalid WebRTC ${expectedType}`);
  }
  return {
    ...identity,
    description: { type: expectedType, sdp: description.sdp },
  };
};

export const parseIceCandidate = (payload) => {
  const identity = parseCallIdentity(payload);
  const candidate = payload?.candidate;
  if (
    !candidate ||
    typeof candidate.candidate !== "string" ||
    candidate.candidate.length > MAX_ICE_CANDIDATE_LENGTH
  ) {
    throw new BadRequestError("Invalid WebRTC ICE candidate");
  }
  return {
    ...identity,
    candidate: {
      candidate: candidate.candidate,
      sdpMid: candidate.sdpMid ?? null,
      sdpMLineIndex: candidate.sdpMLineIndex ?? null,
      usernameFragment: candidate.usernameFragment ?? null,
    },
  };
};
