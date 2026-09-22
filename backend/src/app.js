import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import path from "path";
import authRoutes from "./modules/auth/auth.routes.js";
import userRoutes from "./modules/user/user.routes.js";
import friendRoutes from "./modules/friend/friend.routes.js";
import chatRoutes from "./modules/chat/chat.routes.js";
import matchmakingRoutes from "./modules/matchmaking/matchmaking.routes.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { corsOptions } from "./shared/cors.config.js";

const app = express();
const __dirname = path.resolve();

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/user", friendRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/omegle", matchmakingRoutes);

app.get("/api/health", (req, res) => {
  res.status(200).json({ success: true, message: "BlinkMeet backend is running" });
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../frontend/dist")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
  });
}

app.use(errorMiddleware);

export default app;
