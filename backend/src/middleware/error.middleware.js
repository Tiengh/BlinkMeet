export const errorMiddleware = (error, req, res, _next) => {
  if (error?.statusCode) {
    if (error.statusCode >= 500) {
      console.error("Unhandled app error:", error);
    }
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      details: error.details ?? undefined,
    });
  }

  if (error?.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      message: "Request body is too large",
    });
  }

  if (error instanceof SyntaxError && error?.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Request body contains invalid JSON",
    });
  }

  console.error("Unhandled app error:", error);
  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};
