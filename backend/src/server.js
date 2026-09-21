import "dotenv/config";
import app from "./app.js";
import { connectMongoDB } from "./infrastructure/database/mongodb.js";
import { connectRedis } from "./infrastructure/redis/redis.client.js";
import { initStreamClient } from "./lib/stream.js";

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await connectMongoDB();
    await connectRedis();
    initStreamClient();

    app.listen(PORT, () => {
      console.log("✅ Server is running on port:", PORT);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
