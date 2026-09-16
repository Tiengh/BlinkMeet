import { getStatus, leave, search } from "./matchmaking.service.js";

export async function searchRandomCall(req, res, next) {
  try {
    const result = await search(req.user._id.toString(), req.body?.excludeUserId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getRandomCallStatus(req, res, next) {
  try {
    const result = await getStatus(req.user._id.toString());
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function leaveRandomCall(req, res, next) {
  try {
    const result = await leave(req.user._id.toString());
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
