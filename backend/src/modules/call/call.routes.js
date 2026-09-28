import express from "express";
import { protectRoute } from "../../middleware/auth.middleware.js";
import { iceConfigurationRateLimit } from "../../middleware/rate-limit.middleware.js";
import { getIceConfiguration } from "./call.controller.js";

const router = express.Router();

router.use(protectRoute);
router.get("/ice-servers", iceConfigurationRateLimit, getIceConfiguration);

export default router;
