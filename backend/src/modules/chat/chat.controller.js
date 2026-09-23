import { generateStreamToken } from "../../lib/stream.js";
import { getConversationHistory } from "./chat.service.js";

export function getStreamToken(req, res, next) {
  try {
    res.status(200).json({ token: generateStreamToken(req.user._id) });
  } catch (error) {
    next(error);
  }
}

export async function getMessages(req, res, next) {
  try {
    const result = await getConversationHistory(
      req.user._id,
      req.params.targetUserId,
      req.query,
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
