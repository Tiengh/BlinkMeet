import jwt from "jsonwebtoken";
import { upsertStreamUser } from "../../lib/stream.js";
import { BadRequestError } from "../../shared/errors/bad-request.error.js";
import { NotFoundError } from "../../shared/errors/not-found.error.js";
import { UnauthorizedError } from "../../shared/errors/unauthorized.error.js";
import { toPublicUser } from "./auth.mapper.js";
import { createUser, findUserByEmail, updateUser } from "./auth.repository.js";
import {
  parseLoginInput,
  parseOnboardingInput,
  parseSignupInput,
} from "./auth.validation.js";

const createToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET_KEY, {
    algorithm: "HS256",
    expiresIn: "7d",
  });

export async function signupUser(input = {}) {
  let { email, password, name } = input;
  ({ email, password, name } = parseSignupInput({ email, password, name }));
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

export async function loginUser(input = {}) {
  let { email, password } = input;
  ({ email, password } = parseLoginInput({ email, password }));

  const user = await findUserByEmail(email);
  if (!user) {throw new UnauthorizedError("Invalid email or password");}
  if (!(await user.matchPassword(password))) {
    throw new UnauthorizedError("Invalid email or password");
  }

  return { user: toPublicUser(user), token: createToken(user._id) };
}

export async function onboardUser(userId, data) {
  const {
    name,
    bio,
    nativeLanguage,
    learningLanguage,
    location,
    profilePic,
  } = parseOnboardingInput(data);

  const user = await updateUser(userId, {
    user_name: name,
    user_bio: bio,
    user_nativeLanguage: nativeLanguage,
    user_learningLanguage: learningLanguage,
    user_location: location,
    user_profilePic: profilePic,
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
