import { getFriends, getRecommendedUsers } from "./user.service.js";

export async function getRecommended(req, res) {
  try {
    res.status(200).json(await getRecommendedUsers(req.user));
  } catch (error) {
    console.log("Error in getRecommended controller: ", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getUserFriends(req, res) {
  try {
    const user = await getFriends(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json(user.user_friends);
  } catch (error) {
    console.error("Error in getUserFriends controller:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}