import {
  getOutgoingRequests,
  getRequests,
  sendRequest,
  updateRequest,
} from "./friend.service.js";

export async function sendFriendRequest(req, res, next) {
  try {
    const result = await sendRequest(req.user._id, req.params.id);
    res.status(200).json(result.request);
  } catch (error) {
    next(error);
  }
}

export async function acceptFriendRequest(req, res, next) {
  try {
    await updateRequest(req.params.id, req.user._id, "accept");
    res.status(200).json({ message: "Friend request accepted" });
  } catch (error) {
    next(error);
  }
}

export async function declineFriendRequest(req, res, next) {
  try {
    await updateRequest(req.params.id, req.user._id, "decline");
    res.status(200).json({ message: "Friend request declined" });
  } catch (error) {
    next(error);
  }
}

export async function getFriendRequests(req, res, next) {
  try {
    res.status(200).json(await getRequests(req.user._id));
  } catch (error) {
    next(error);
  }
}

export async function getOutgoingFriendRequests(req, res, next) {
  try {
    res.status(200).json(await getOutgoingRequests(req.user._id));
  } catch (error) {
    next(error);
  }
}