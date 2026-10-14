import assert from "node:assert/strict";
import { test } from "node:test";
import { errorMiddleware } from "./error.middleware.js";

const createResponse = () => ({
  statusCode: null,
  body: null,
  status(value) {
    this.statusCode = value;
    return this;
  },
  json(value) {
    this.body = value;
    return this;
  },
});

test("DynamoDB conditional write failures are returned as conflict responses", () => {
  const res = createResponse();

  errorMiddleware({
    name: "ConditionalCheckFailedException",
  }, {}, res, () => {});

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.success, false);
  assert.equal(res.body.message, "Resource state changed; retry the operation");
});
