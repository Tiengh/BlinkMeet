import { ForbiddenError } from "./errors/forbidden.error.js";

const DEFAULT_CLIENT_ORIGIN = "http://localhost:5173";

export const allowedOrigins = (process.env.CLIENT_ORIGIN || DEFAULT_CLIENT_ORIGIN)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new ForbiddenError("Origin is not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 600,
};
