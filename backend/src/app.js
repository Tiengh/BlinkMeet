import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import authRoutes from "./modules/auth/auth.routes.js";
import userRoutes from "./modules/user/user.routes.js";
import friendRoutes from "./modules/friend/friend.routes.js";
import chatRoutes from "./modules/chat/chat.routes.js";
import callRoutes from "./modules/call/call.routes.js";
import matchmakingRoutes from "./modules/matchmaking/matchmaking.routes.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { corsOptions } from "./shared/cors.config.js";
import { securityConfig } from "./shared/security.config.js";
import { getRedisClient } from "./infrastructure/redis/redis.client.js";
import { checkDynamoReady } from "./infrastructure/database/dynamodb.js";
import { isWebSocketAdapterReady } from "./infrastructure/websocket/websocket.server.js";

const app = express();

app.disable("x-powered-by");
app.set("query parser", "simple");
app.set("trust proxy", securityConfig.trustProxy);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      connectSrc: ["'self'", "https:", "wss:"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      mediaSrc: ["'self'", "blob:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      workerSrc: ["'self'", "blob:"],
    },
  },
}));
app.use(cors(corsOptions));
app.use(express.json({ limit: securityConfig.requestBodyLimit }));
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/user", friendRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/call", callRoutes);
app.use("/api/omegle", matchmakingRoutes);

app.get("/api/health", (req, res) => {
  res.status(200).json({ success: true, message: "BlinkMeet backend is running" });
});

let readiness = { checkedAt: 0, healthy: false };
app.get("/api/health/ready", async (req, res) => {
  if (Date.now() - readiness.checkedAt > 5_000) {
    try {
      if (!getRedisClient().isReady || !isWebSocketAdapterReady()) {
        throw new Error("Redis or Socket.IO adapter is unavailable");
      }
      await checkDynamoReady();
      readiness = { checkedAt: Date.now(), healthy: true };
    } catch {
      readiness = { checkedAt: Date.now(), healthy: false };
    }
  }
  res.status(readiness.healthy ? 200 : 503).json({ success: readiness.healthy });
});

// Frontend assets are hosted by S3 + CloudFront, not by the ECS API container.
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

app.use(errorMiddleware);

export default app;
