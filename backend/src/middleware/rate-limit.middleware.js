import { consumeRateLimit } from "../infrastructure/redis/rate-limit.store.js";
import { securityConfig } from "../shared/security.config.js";

const requestIp = (req) => req.ip || req.socket?.remoteAddress || "unknown";
const authenticatedUser = (req) => String(req.user?._id || "anonymous");

export const createRateLimitMiddleware = ({
  scope,
  limit,
  windowMs,
  identity = requestIp,
  consume = consumeRateLimit,
}) => async (req, res, next) => {
  try {
    const result = await consume({
      scope,
      identity: identity(req),
      limit,
      windowMs,
    });
    const retryAfterSeconds = Math.max(1, Math.ceil(result.retryAfterMs / 1_000));

    res.set("RateLimit-Limit", String(result.limit));
    res.set("RateLimit-Remaining", String(result.remaining));
    res.set("RateLimit-Reset", String(retryAfterSeconds));

    if (!result.allowed) {
      res.set("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        success: false,
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again later.",
        retryAfterSeconds,
      });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
};

export const loginRateLimit = createRateLimitMiddleware({
  scope: "http:auth:login",
  ...securityConfig.rateLimits.login,
});

export const signupRateLimit = createRateLimitMiddleware({
  scope: "http:auth:signup",
  ...securityConfig.rateLimits.signup,
});

export const friendRequestRateLimit = createRateLimitMiddleware({
  scope: "http:friend:request",
  identity: authenticatedUser,
  ...securityConfig.rateLimits.friendRequest,
});

export const matchmakingSearchRateLimit = createRateLimitMiddleware({
  scope: "http:matchmaking:search",
  identity: authenticatedUser,
  ...securityConfig.rateLimits.matchmakingSearch,
});

export const iceConfigurationRateLimit = createRateLimitMiddleware({
  scope: "http:call:ice-configuration",
  identity: authenticatedUser,
  ...securityConfig.rateLimits.iceConfiguration,
});
