import express from "express";
import { protectRoute } from "../../middleware/auth.middleware.js";
import {
  acceptFriendRequest,
  declineFriendRequest,
  getFriendRequests,
  getOutgoingFriendRequests,
  sendFriendRequest,
} from "./friend.controller.js";

const router = express.Router();
router.use(protectRoute);
router.post("/friend-request/:id", sendFriendRequest);
router.post("/friend-request/:id/accept", acceptFriendRequest);
router.post("/friend-request/:id/decline", declineFriendRequest);
router.get("/friend-requests", getFriendRequests);
router.get("/outgoing-friend-requests", getOutgoingFriendRequests);
export default router;
