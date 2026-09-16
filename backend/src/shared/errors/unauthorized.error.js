import { AppError } from "./app-error.js";

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized", details = null) {
    super(401, message, details);
    this.name = "UnauthorizedError";
  }
}
