export const errorMiddleware = (error, req, res, _next) => {
  console.error("Unhandled app error:", error);

  if (error?.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      details: error.details ?? undefined,
    });
  }

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};
