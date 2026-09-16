import { setAuthCookie } from "./auth.cookie.js";
import { loginUser, onboardUser, signupUser } from "./auth.service.js";

export async function signup(req, res, next) {
  try {
    const result = await signupUser(req.body);
    setAuthCookie(res, result.token);
    res.status(201).json({ success: true, user: result.user });
  } catch (error) {
    next(error);
  }
}

export async function login(req, res, next) {
  try {
    const result = await loginUser(req.body);
    setAuthCookie(res, result.token);
    res.status(200).json({ success: true, user: result.user });
  } catch (error) {
    next(error);
  }
}

export function logout(req, res) {
  res.clearCookie("jwt");
  res.status(200).json({ success: true, message: "Logout successful" });
}

export async function onboard(req, res, next) {
  try {
    const result = await onboardUser(req.user._id, req.body);
    res.status(200).json({ success: true, user: result.user });
  } catch (error) {
    next(error);
  }
}
