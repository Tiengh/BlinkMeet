import { getStatus, leave, search } from "./matchmaking.service.js";

export function searchRandomCall(req, res) {
  try {
    res.status(200).json(search(req.user._id.toString(), req.body?.excludeUserId));
  } catch (error) {
    console.error("searchRandomCall error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export function getRandomCallStatus(req, res) {
  try {
    res.status(200).json(getStatus(req.user._id.toString()));
  } catch (error) {
    console.error("getRandomCallStatus error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export function leaveRandomCall(req, res) {
  try {
    res.status(200).json(leave(req.user._id.toString()));
  } catch (error) {
    console.error("leaveRandomCall error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}