import { getStatus, leave, search } from "./matchmaking.service.js";

const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;

const getSessionId = (value) => {
  const sessionId = String(value || "").trim();
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    const error = new Error("A valid matchmaking sessionId is required");
    error.statusCode = 400;
    throw error;
  }
  return sessionId;
};

export async function searchRandomCall(req, res, next) {
  try {
    const result = await search(
      req.user._id.toString(),
      req.body?.excludeUserId,
      getSessionId(req.body?.sessionId),
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getRandomCallStatus(req, res, next) {
  try {
    const result = await getStatus(
      req.user._id.toString(),
      getSessionId(req.query?.sessionId),
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function leaveRandomCall(req, res, next) {
  try {
    const result = await leave(
      req.user._id.toString(),
      getSessionId(req.body?.sessionId),
      req.body?.callId ? String(req.body.callId) : null,
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
