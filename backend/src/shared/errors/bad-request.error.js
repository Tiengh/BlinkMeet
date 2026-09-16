import { AppError } from "./app-error.js";

export class BadRequestError extends AppError {
  constructor(message, details = null) {
    super(400, message, details);
    this.name = "BadRequestError";
  }
}
