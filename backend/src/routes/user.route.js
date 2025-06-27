import express from "express";
import { protectRoute } from "../middlewares/auth.middleware.js";
import {
  getRecommendedUsers,
  getUserFriends,
  sendFriendRequest,
  acceptFriendRequest,
  getFriendRequests
} from "../controllers/user.controller.js";

const router = express.Router();

router.use(protectRoute);

router.get("/", getRecommendedUsers);
router.get("/friends", getUserFriends);

router.post("/friend-request/:id", sendFriendRequest);
router.post("/friend-accept/:id", acceptFriendRequest);
router.post("/friend-decline/:id", acceptFriendRequest);

router.get("/friend-requests", getFriendRequests);



export default router;
