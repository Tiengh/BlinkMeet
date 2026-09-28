import { BadRequestError } from "../../shared/errors/bad-request.error.js";
import { parseBoundedString } from "../../shared/validation.js";

const EMAIL_PATTERN = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const parseEmail = (value) => {
  const email = parseBoundedString(value, "email", { max: 254 }).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw new BadRequestError("Invalid email format");
  }
  return email;
};

const parsePassword = (value) => {
  const password = parseBoundedString(value, "password", {
    min: 8,
    max: 128,
    trim: false,
  });
  if (Buffer.byteLength(password, "utf8") > 72) {
    throw new BadRequestError("password must not exceed 72 UTF-8 bytes");
  }
  return password;
};

const parseProfilePic = (value) => {
  if (value === undefined || value === null || value === "") {return "";}
  const profilePic = parseBoundedString(value, "profilePic", { max: 2_048 });
  let url;
  try {
    url = new URL(profilePic);
  } catch {
    throw new BadRequestError("profilePic must be a valid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new BadRequestError("profilePic must use HTTP or HTTPS");
  }
  return url.toString();
};

export const parseSignupInput = (data = {}) => ({
  email: parseEmail(data.email),
  password: parsePassword(data.password),
  name: parseBoundedString(data.name, "name", { min: 2, max: 80 }),
});

export const parseLoginInput = (data = {}) => ({
  email: parseEmail(data.email),
  password: parsePassword(data.password),
});

export const parseOnboardingInput = (data = {}) => ({
  name: parseBoundedString(data.name, "name", { min: 2, max: 80 }),
  bio: parseBoundedString(data.bio, "bio", { max: 500 }),
  nativeLanguage: parseBoundedString(
    data.nativeLanguage,
    "nativeLanguage",
    { max: 50 },
  ),
  learningLanguage: parseBoundedString(
    data.learningLanguage,
    "learningLanguage",
    { max: 50 },
  ),
  location: parseBoundedString(data.location, "location", { max: 120 }),
  profilePic: parseProfilePic(data.profilePic),
});
