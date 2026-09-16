import jwt from "jsonwebtoken";
import { upsertStreamUser } from "../../lib/stream.js";
import { BadRequestError } from "../../shared/errors/bad-request.error.js";
import { NotFoundError } from "../../shared/errors/not-found.error.js";
import { UnauthorizedError } from "../../shared/errors/unauthorized.error.js";
import { toPublicUser } from "./auth.mapper.js";
import { createUser, findUserByEmail, updateUser } from "./auth.repository.js";

const createToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET_KEY, { expiresIn: "7d" });

export async function signupUser({ email, password, name }) {
  if (!email || !password || !name) {
    throw new BadRequestError("All fields are required");
  }
  if (password.length < 8) {
    throw new BadRequestError("Password must be at least 8 characters");
  }
  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
    throw new BadRequestError("Invalid email format");
  }
  if (await findUserByEmail(email)) {
    throw new BadRequestError("Already existed, use a different email");
  }

  const avatarSeed = Math.random().toString(36).substring(2, 10);
  const user = await createUser({
    user_email: email,
    user_name: name,
    user_password: password,
    user_profilePic: `https://api.dicebear.com/10.x/adventurer/svg?seed=${avatarSeed}`,
  });

  await syncStreamUser(user);
  return { user: toPublicUser(user), token: createToken(user._id) };
}

export async function loginUser({ email, password }) {
  if (!email || !password) {
    throw new BadRequestError("All fields are required");
  }

  const user = await findUserByEmail(email);
  if (!user) {throw new UnauthorizedError("Invalid email");}
  if (!(await user.matchPassword(password))) {
    throw new UnauthorizedError("Invalid password");
  }

  return { user: toPublicUser(user), token: createToken(user._id) };
}

export async function onboardUser(userId, data) {
  const { name, bio, nativeLanguage, learningLanguage, location } = data;
  const missingFields = [];
  if (!name) {missingFields.push("name");}
  if (!bio) {missingFields.push("bio");}
  if (!nativeLanguage) {missingFields.push("nativeLanguage");}
  if (!learningLanguage) {missingFields.push("learningLanguage");}
  if (!location) {missingFields.push("location");}

  if (missingFields.length) {
    throw new BadRequestError("All fields are required", missingFields);
  }

  const user = await updateUser(userId, {
    user_name: name,
    user_bio: bio,
    user_nativeLanguage: nativeLanguage,
    user_learningLanguage: learningLanguage,
    user_location: location,
    user_isOnboarded: true,
  });
  if (!user) {throw new NotFoundError("User not found");}

  await syncStreamUser(user);
  return { user: toPublicUser(user) };
}

async function syncStreamUser(user) {
  try {
    await upsertStreamUser({
      id: user._id.toString(),
      name: user.user_name,
      image: user.user_profilePic || "",
    });
  } catch (error) {
    console.log("Error synchronizing Stream user: ", error.message);
  }
}
