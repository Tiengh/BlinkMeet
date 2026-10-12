import { parseObjectId } from "../../shared/validation.js";

const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;

export const parseSessionId = (value) => {
  const sessionId = String(value || "").trim();
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    const error = new Error("A valid matchmaking sessionId is required");
    error.statusCode = 400;
    throw error;
  }
  return sessionId;
};

export const parseOptionalCallId = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const callId = String(value).trim();
  if (!callId || callId.length > 256) {
    const error = new Error("Invalid callId");
    error.statusCode = 400;
    throw error;
  }
  return callId;
};

export const parseOptionalUserId = (value, fieldName = "userId") => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return parseObjectId(value, fieldName);
};
