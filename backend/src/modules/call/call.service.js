import { ForbiddenError } from "../../shared/errors/forbidden.error.js";
import { getMatch } from "../matchmaking/matchmaking.repository.js";

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
