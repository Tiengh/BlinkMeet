import express from "express";
import { protectRoute } from "../middlewares/auth.middleware.js";

import {
  searchRandomCall,
  getRandomCallStatus,
  leaveRandomCall,
} from "../controllers/omegle.controller.js";

const router = express.Router();

router.use(protectRoute);

router.post("/search", searchRandomCall);
router.get("/status", getRandomCallStatus);
router.post("/leave", leaveRandomCall);

export default router;