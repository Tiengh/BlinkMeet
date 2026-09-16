import express from "express";
import { protectRoute } from "../../middleware/auth.middleware.js";
import { getRecommended, getUserFriends } from "./user.controller.js";

const router = express.Router();
router.use(protectRoute);
router.get("/", getRecommended);
router.get("/friends", getUserFriends);
export default router;