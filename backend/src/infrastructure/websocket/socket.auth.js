import { parse as parseCookie } from "cookie";
import jwt from "jsonwebtoken";
import User from "../../modules/user/user.model.js";

const unauthorized = (message) => {
  const error = new Error(message);
  error.data = { code: "UNAUTHORIZED" };
  return error;
};

export const createSocketAuthMiddleware = ({
  findUser = (userId) => User.findById(userId).select("-user_password"),
  jwtSecret = process.env.JWT_SECRET_KEY,
} = {}) => async (socket, next) => {
  try {
    const cookies = parseCookie(socket.handshake.headers.cookie || "");
    const token = cookies.jwt;
    if (!token) {
      next(unauthorized("Unauthorized - No token provided"));
      return;
    }

    const decoded = jwt.verify(token, jwtSecret);
    const user = await findUser(decoded.userId);
    if (!user) {
      next(unauthorized("Unauthorized - User not found"));
      return;
    }

    socket.data.user = user;
    socket.data.userId = String(user._id);
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      next(unauthorized("Unauthorized - Invalid or expired token"));
      return;
    }
    next(error);
  }
};
