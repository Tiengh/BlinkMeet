import express from "express";
import { protectRoute } from "../../middleware/auth.middleware.js";
import {
  loginRateLimit,
  signupRateLimit,
} from "../../middleware/rate-limit.middleware.js";
import { login, logout, onboard, signup } from "./auth.controller.js";

const router = express.Router();

router.post("/signup", signupRateLimit, signup);
router.post("/login", loginRateLimit, login);
router.post("/logout", logout);
router.post("/onboarding", protectRoute, onboard);
router.get("/me", protectRoute, (req, res) => {
  res.status(200).json({ success: true, user: req.user });
});

export default router;
