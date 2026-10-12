import express from "express";
import { protectRoute } from "../../middleware/auth.middleware.js";
import { matchmakingSearchRateLimit } from "../../middleware/rate-limit.middleware.js";
import {
  getRandomCallStatus,
  leaveRandomCall,
  searchRandomCall,
} from "./matchmaking.controller.js";

const router = express.Router();
router.use(protectRoute);
router.post("/search", matchmakingSearchRateLimit, searchRandomCall);
router.get("/status", getRandomCallStatus);
router.post("/leave", leaveRandomCall);
export default router;
