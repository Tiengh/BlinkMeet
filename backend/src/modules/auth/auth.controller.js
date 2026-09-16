import { loginUser, onboardUser, setAuthCookie, signupUser } from "./auth.service.js";

export async function signup(req, res) {
  try {
    const result = await signupUser(req.body);
    if (result.error) return res.status(result.error.status).json(result.error);
    setAuthCookie(res, result.token);
    res.status(201).json({ success: true, user: result.user });
  } catch (error) {
    console.log("Error in signup controller: ", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function login(req, res) {
  try {
    const result = await loginUser(req.body);
    if (result.error) return res.status(result.error.status).json(result.error);
    setAuthCookie(res, result.token);
    res.status(200).json({ success: true, user: result.user });
  } catch (error) {
    console.log("Error in login controller: ", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export function logout(req, res) {
  res.clearCookie("jwt");
  res.status(200).json({ success: true, message: "Logout successful" });
}

export async function onboard(req, res) {
  try {
    const result = await onboardUser(req.user._id, req.body);
    if (result.error) return res.status(result.error.status).json(result.error);
    res.status(200).json({ success: true, user: result.user });
  } catch (error) {
    console.error("Onboarding error: ", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}