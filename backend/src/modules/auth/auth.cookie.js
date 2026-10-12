const normalizeSameSite = (value) => {
  const sameSite = String(value || "lax").toLowerCase();
  if (!["lax", "strict", "none"].includes(sameSite)) {
    throw new Error("COOKIE_SAME_SITE must be lax, strict, or none");
  }
  return sameSite;
};

export const getAuthCookieOptions = (env = process.env) => {
  const sameSite = normalizeSameSite(env.COOKIE_SAME_SITE);
  const secure = env.COOKIE_SECURE === "true" || env.NODE_ENV === "production";
  if (sameSite === "none" && !secure) {
    throw new Error("COOKIE_SECURE must be enabled when COOKIE_SAME_SITE is none");
  }
  return {
    httpOnly: true,
    sameSite,
    secure,
    path: "/",
  };
};

export const setAuthCookie = (res, token) => {
  res.cookie("jwt", token, {
    ...getAuthCookieOptions(),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

export const clearAuthCookie = (res) =>
  res.clearCookie("jwt", getAuthCookieOptions());
