import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

export async function signup(req, res) {
  const { email, password, name } = req.body;

  try {
    if (!email || !password || !name) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password.length < 8) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters" });
    }

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const existedEmail = await User.findOne({ user_email: email });
    if (existedEmail) {
      return res
        .status(400)
        .json({ message: "Already existed, use a different email" });
    }

    const idx = Math.floor(Math.random() * 100) + 1;
    const randomAvatar = `https://avatar.iran.liara.run/public/${idx}.png`;

    const newUser = await User.create({
      user_email: email,
      user_name: name,
      user_password: password,
      user_profilePic: randomAvatar,
    });

    const token = jwt.sign(
      { userId: newUser._id },
      process.env.JWT_SECRET_KEY,
      { expiresIn: "7d" }
    );

    res.cookie("jwt", token, {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 ngày
      httpOnly: true,
      sameSite: "Strict",
      secure: process.env.NODE_ENV === "production",
    });
//g

    res.status(201).json({ success: true, user: newUser });
  } catch (error) {
    console.log("Error in signup controller: ", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function login(req, res) {
  res.send("Login Route");
}

export async function logout(req, res) {
  res.send("Logout Route");
}
