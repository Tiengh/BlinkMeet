import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { upsertStreamUser } from "../lib/stream.js";

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

    try {
      await upsertStreamUser({
        id: newUser._id.toString(), // ép kiểu string để tránh lỗi với Stream
        name: newUser.user_name,
        image: newUser.user_profilePic || "",
      });
      console.log(`✅ Stream user created for ${newUser.user_name}`);
    } catch (error) {
      console.log("❌ Error creating stream user: ", error);
    }

    const token = jwt.sign(
      { userId: newUser._id },
      process.env.JWT_SECRET_KEY,
      { expiresIn: "7d" }
    );

    res.cookie("jwt", token, {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: "Lax", // ← đổi từ "None" sang "Lax"
      secure: false, // ← an toàn trong môi trường development
    });

    res.status(201).json({ success: true, user: newUser });
  } catch (error) {
    console.log("Error in signup controller: ", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const user = await User.findOne({ user_email: email });
    if (!user) {
      return res.status(401).json({ message: "Invalid email" });
    }

    const isPasswordCorrect = await user.matchPassword(password);
    if (!isPasswordCorrect) {
      return res.status(401).json({ message: "Invalid password" });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET_KEY, {
      expiresIn: "7d",
    });

    res.cookie("jwt", token, {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: "Lax", // ← đổi từ "None" sang "Lax"
      secure: false, // ← an toàn trong môi trường development
    });


    res.status(200).json({ success: true, user });
  } catch (error) {
    console.log("Error in login controller: ", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function logout(req, res) {
  res.clearCookie("jwt");
  res.status(200).json({ success: true, message: "Logout successful" });
}

export async function onboard(req, res) {
  try {
    const userId = req.user?._id;
    const { name, bio, nativeLanguage, learningLanguage, location } = req.body;

    const missingFields = [];
    if (!name) missingFields.push("name");
    if (!bio) missingFields.push("bio");
    if (!nativeLanguage) missingFields.push("nativeLanguage");
    if (!learningLanguage) missingFields.push("learningLanguage");
    if (!location) missingFields.push("location");

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: "All fields are required",
        missingFields,
      });
    }

    const updateUser = await User.findByIdAndUpdate(
      userId,
      {
        user_name: name,
        user_bio: bio,
        user_nativeLanguage: nativeLanguage,
        user_learningLanguage: learningLanguage,
        user_location: location,
        user_isOnboarded: true,
      },
      { new: true }
    );

    if (!updateUser) return res.status(404).json({ message: "User not found" });

    try {
      await upsertStreamUser({
        id: updateUser._id.toString(),
        name: updateUser.user_name,
        image: updateUser.user_profilePic,
      });
      console.log(
        `Stream user updated after onboarding for ${updateUser.user_name}`
      );
    } catch (streamError) {
      console.log(
        "Error updating Stream user during onboarding: ",
        streamError.message
      );
    }

    return res.status(200).json({ success: true, user: updateUser });
  } catch (error) {
    console.error("Onboarding error: ", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}
