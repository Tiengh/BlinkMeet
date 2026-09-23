import mongoose from "mongoose";
import { BadRequestError } from "../../shared/errors/bad-request.error.js";

export const parseUserId = (value, fieldName = "userId") => {
  if (!mongoose.isValidObjectId(value)) {
    throw new BadRequestError(`${fieldName} is invalid`);
  }
  return String(value);
};

export const parseMessageContent = (value) => {
  if (typeof value !== "string") {
    throw new BadRequestError("Message content is required");
  }
  const content = value.trim();
  if (!content || content.length > 2000) {
    throw new BadRequestError("Message content must contain 1 to 2000 characters");
  }
  return content;
};

export const parseClientMessageId = (value) => {
  if (value === undefined || value === null) {return null;}
  if (typeof value !== "string" || !value.trim() || value.length > 100) {
    throw new BadRequestError("clientMessageId is invalid");
  }
  return value.trim();
};

export const parseHistoryLimit = (value) => {
  if (value === undefined) {return 50;}
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new BadRequestError("limit must be an integer between 1 and 100");
  }
  return limit;
};

export const parseMessageCursor = (value) => {
  if (value === undefined) {return null;}
  if (!mongoose.isValidObjectId(value)) {
    throw new BadRequestError("before cursor is invalid");
  }
  return String(value);
};
