import express from "express";
import { protectRoute } from "../../middleware/auth.middleware.js";
import { getMessages, getStreamToken } from "./chat.controller.js";

const router = express.Router();
router.use(protectRoute);
router.get("/token", getStreamToken);
router.get("/conversations/:targetUserId/messages", getMessages);
export default router;
