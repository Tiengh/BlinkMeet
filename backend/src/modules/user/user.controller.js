import { NotFoundError } from "../../shared/errors/not-found.error.js";
import { getFriends, getRecommendedUsers } from "./user.service.js";

export async function getRecommended(req, res, next) {
  try {
    res.status(200).json(await getRecommendedUsers(req.user));
  } catch (error) {
    next(error);
  }
}

export async function getUserFriends(req, res, next) {
  try {
    const user = await getFriends(req.user._id);
    if (!user) {
      throw new NotFoundError("User not found");
    }
    res.status(200).json(user.user_friends);
  } catch (error) {
    next(error);
  }
}
