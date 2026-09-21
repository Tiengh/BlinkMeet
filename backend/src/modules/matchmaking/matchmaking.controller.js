import { getStatus, leave, search } from "./matchmaking.service.js";
import { parseOptionalCallId, parseSessionId } from "./matchmaking.validation.js";

export async function searchRandomCall(req, res, next) {
  try {
    const result = await search(
      req.user._id.toString(),
      req.body?.excludeUserId,
      parseSessionId(req.body?.sessionId),
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
      parseSessionId(req.query?.sessionId),
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
      parseSessionId(req.body?.sessionId),
      parseOptionalCallId(req.body?.callId),
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
