import mongoose from "mongoose";
import { BadRequestError } from "./errors/bad-request.error.js";

export const parseObjectId = (value, fieldName = "id") => {
  if (typeof value !== "string" || !mongoose.isObjectIdOrHexString(value)) {
    throw new BadRequestError(`${fieldName} is invalid`);
  }
  return value;
};

export const parseBoundedString = (
  value,
  fieldName,
  { min = 1, max, trim = true } = {},
) => {
  if (typeof value !== "string") {
    throw new BadRequestError(`${fieldName} is required`);
  }
  const normalized = trim ? value.trim() : value;
  if (normalized.length < min || (max !== undefined && normalized.length > max)) {
    const range = max === undefined ? `at least ${min}` : `${min} to ${max}`;
    throw new BadRequestError(`${fieldName} must contain ${range} characters`);
  }
  return normalized;
};
