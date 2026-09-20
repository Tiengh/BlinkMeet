const tabId = Math.random().toString(36).slice(2, 10);
let sequence = 0;

export const logRandomCall = (event, details = {}) => {
  if (!import.meta.env.DEV) {return;}

  console.info("[BlinkMeet:RandomCall]", {
    tabId,
    sequence: ++sequence,
    at: new Date().toISOString(),
    event,
    ...details,
  });
};

export const describeRandomCallError = (error) => {
  const message = String(error?.message || "").toLowerCase();
  const rawCode = error?.code ?? error?.response?.data?.error?.code;
  const code = String(rawCode || "");

  return {
    name: String(error?.name || "Error").slice(0, 80),
    code: /^[a-z0-9_.-]{1,80}$/i.test(code) ? code : null,
    httpStatus: error?.response?.status ?? error?.statusCode ?? null,
    timedOut: message.includes("timed out") || message.includes("timeout"),
    websocket: message.includes("websocket") || message.includes("ws connection"),
    category: message.includes("sfu")
      ? "sfu"
      : message.includes("websocket")
        ? "websocket"
        : message.includes("timed out")
          ? "timeout"
          : "other",
  };
};
