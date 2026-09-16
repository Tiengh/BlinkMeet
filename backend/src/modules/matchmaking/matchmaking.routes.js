import express from "express";
import { protectRoute } from "../../middleware/auth.middleware.js";
import {
  getRandomCallStatus,
  leaveRandomCall,
  searchRandomCall,
} from "./matchmaking.controller.js";

const router = express.Router();
router.use(protectRoute);
router.post("/search", searchRandomCall);
router.get("/status", getRandomCallStatus);
router.post("/leave", leaveRandomCall);
export default router;