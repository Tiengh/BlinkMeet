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

test("Mongo duplicate key errors are returned as conflict responses", () => {
  const res = createResponse();

  errorMiddleware({
    code: 11000,
    keyPattern: { user_email: 1 },
  }, {}, res, () => {});

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.success, false);
  assert.equal(res.body.message, "Resource already exists");
  assert.deepEqual(res.body.details, { fields: ["user_email"] });
});
