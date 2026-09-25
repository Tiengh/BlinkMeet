import express from "express";
import { protectRoute } from "../../middleware/auth.middleware.js";
import { getIceConfiguration } from "./call.controller.js";

const router = express.Router();

router.use(protectRoute);
router.get("/ice-servers", getIceConfiguration);

export default router;
