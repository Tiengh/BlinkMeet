const profileFields = ["_id", "user_email", "user_name", "user_profilePic", "user_bio",
  "user_nativeLanguage", "user_learningLanguage", "user_location", "user_isOnboarded",
  "createdAt", "updatedAt"];
const previewFields = ["_id", "user_name", "user_profilePic", "user_bio",
  "user_nativeLanguage", "user_learningLanguage", "user_location"];
const pick = (user, fields) => user ? Object.fromEntries(fields
  .filter((name) => user[name] !== undefined)
  .map((name) => [name, user[name]])) : null;

// Email belongs only in the authenticated user's own profile.
export const toAuthenticatedUser = (user) => pick(user, profileFields);
export const toUserPreview = (user) => pick(user, previewFields);
