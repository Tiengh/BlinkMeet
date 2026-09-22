import "dotenv/config";
import { createServer } from "node:http";
import app from "./app.js";
import { connectMongoDB } from "./infrastructure/database/mongodb.js";
import { connectRedis } from "./infrastructure/redis/redis.client.js";
import { initStreamClient } from "./lib/stream.js";
import { initializeWebSocketServer } from "./infrastructure/websocket/websocket.server.js";

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await connectMongoDB();
    await connectRedis();
    initStreamClient();
    const httpServer = createServer(app);
    await initializeWebSocketServer(httpServer);

    httpServer.listen(PORT, () => {
      console.log("✅ Server is running on port:", PORT);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
