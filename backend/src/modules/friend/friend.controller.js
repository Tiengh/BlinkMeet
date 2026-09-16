import {
  getOutgoingRequests,
  getRequests,
  sendRequest,
  updateRequest,
} from "./friend.service.js";

export async function sendFriendRequest(req, res) {
  try {
    const result = await sendRequest(req.user._id, req.params.id);
    if (result.error) return res.status(result.error.status).json(result.error);
    res.status(200).json(result.request);
  } catch (error) {
    console.log("Error in sendFriendRequest controller: ", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function acceptFriendRequest(req, res) {
  try {
    const result = await updateRequest(req.params.id, req.user._id, "accept");
    if (result.error) return res.status(result.error.status).json(result.error);
    res.status(200).json({ message: "Friend request accepted" });
  } catch (error) {
    console.log("Error in acceptFriendRequest controller: ", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function declineFriendRequest(req, res) {
  try {
    const result = await updateRequest(req.params.id, req.user._id, "decline");
    if (result.error) return res.status(result.error.status).json(result.error);
    res.status(200).json({ message: "Friend request declined" });
  } catch (error) {
    console.log("Error in declineFriendRequest controller:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getFriendRequests(req, res) {
  try {
    res.status(200).json(await getRequests(req.user._id));
  } catch (error) {
    console.log("Error in getFriendRequests controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function getOutgoingFriendRequests(req, res) {
  try {
    res.status(200).json(await getOutgoingRequests(req.user._id));
  } catch (error) {
    console.log("Error in getOutgoingFriendRequests controller:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}