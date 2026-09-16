import { generateStreamToken } from "../../lib/stream.js";

export function getStreamToken(req, res, next) {
  try {
    res.status(200).json({ token: generateStreamToken(req.user._id) });
  } catch (error) {
    next(error);
  }
}
