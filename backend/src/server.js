import "dotenv/config";
import { createServer } from "node:http";
import app from "./app.js";
import { checkDynamoReady, closeDynamo } from "./infrastructure/database/dynamodb.js";
import { connectRedis } from "./infrastructure/redis/redis.client.js";
import { initStreamClient } from "./lib/stream.js";
import { initializeWebSocketServer, closeWebSocketServer } from "./infrastructure/websocket/websocket.server.js";
import { getRedisClient } from "./infrastructure/redis/redis.client.js";
import { validateSecurityEnvironment } from "./shared/security.config.js";

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    validateSecurityEnvironment();
    await checkDynamoReady();
    await connectRedis();
    initStreamClient();
    const httpServer = createServer(app);
    await initializeWebSocketServer(httpServer);

    httpServer.listen(PORT, () => {
      console.log("✅ Server is running on port:", PORT);
    });
    let stopping = false;
    const shutdown = async () => {
      if (stopping) {return;}
      stopping = true;
      const timeout = setTimeout(() => process.exit(1), 25_000);
      timeout.unref?.();
      try {
        await closeWebSocketServer();
        await new Promise((resolve) => httpServer.close(resolve));
        if (getRedisClient().isOpen) {await getRedisClient().quit();}
        closeDynamo();
        clearTimeout(timeout);
        process.exit(0);
      } catch (error) {
        console.error("Shutdown failed:", error);
        process.exit(1);
      }
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
