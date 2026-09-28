import express from "express";
import { protectRoute } from "../../middleware/auth.middleware.js";
import { friendRequestRateLimit } from "../../middleware/rate-limit.middleware.js";
import {
  acceptFriendRequest,
  declineFriendRequest,
  getFriendRequests,
  getOutgoingFriendRequests,
  sendFriendRequest,
} from "./friend.controller.js";

const router = express.Router();
router.use(protectRoute);
router.post("/friend-request/:id", friendRequestRateLimit, sendFriendRequest);
router.post("/friend-request/:id/accept", friendRequestRateLimit, acceptFriendRequest);
router.post("/friend-request/:id/decline", friendRequestRateLimit, declineFriendRequest);
router.get("/friend-requests", getFriendRequests);
router.get("/outgoing-friend-requests", getOutgoingFriendRequests);
export default router;
