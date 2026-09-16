import { generateStreamToken } from "../../lib/stream.js";

export function getStreamToken(req, res) {
  try {
    res.status(200).json({ token: generateStreamToken(req.user._id) });
  } catch (error) {
    console.log("Error in getStreamToken controller: ", error.message);
    res.status(500).json({ message: "Internal sever error" });
  }
}