// ✅ Load biến môi trường đầu tiên
import "dotenv/config"; // phải đặt ở trên cùng!

// Các import còn lại
import express from "express";
import authRoutes from "./routes/auth.route.js";
import userRoutes from "./routes/user.route.js";
import chatRoutes from "./routes/chat.route.js";
import omegleRoutes from "./routes/omegle.route.js";
import { connectDB } from "./lib/db.js";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";

// ✅ Lấy PORT sau khi .env đã được load
const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Cấu hình __dirname (chỉ cần khi dùng ES Module)
const __dirname = path.resolve();

// ✅ Middleware
app.use(
  cors({
    origin: "http://localhost:5173", // 👉 nếu deploy, nên thay bằng domain thật
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// ✅ API routes
app.use("/api/auth/", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/omegle", omegleRoutes);

// ✅ Production: serve frontend
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../frontend/dist")));

  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
  });
}

// ✅ Start server và kết nối DB
app.listen(PORT, () => {
  console.log("✅ Server is running on port:", PORT);
  connectDB();
});
