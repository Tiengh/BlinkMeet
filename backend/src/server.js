import "dotenv/config";
import app from "./app.js";
import { connectMongoDB } from "./infrastructure/database/mongodb.js";
import { initStreamClient } from "./lib/stream.js";

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("✅ Server is running on port:", PORT);
  connectMongoDB();
  initStreamClient();
});
