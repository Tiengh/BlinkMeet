export const enableAvailableMedia = async (call) => {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return;
  }

  try {
    const devices =
      await navigator.mediaDevices.enumerateDevices();

    const hasMicrophone = devices.some(
      (device) => device.kind === "audioinput",
    );

    const hasCamera = devices.some(
      (device) => device.kind === "videoinput",
    );

    if (hasMicrophone) {
      try {
        await call.microphone.enable();
      } catch (error) {
        console.warn(
          "Microphone could not be enabled:",
          error,
        );
      }
    }

    if (hasCamera) {
      try {
        await call.camera.enable();
      } catch (error) {
        console.warn(
          "Camera could not be enabled:",
          error,
        );
      }
    } else {
      console.info(
        "No camera detected. Continuing without camera.",
      );
    }
  } catch (error) {
    console.warn(
      "Could not enumerate media devices:",
      error,
    );
  }
};

export const isSfuConnectionError = (error) => {
  const message = error?.message?.toLowerCase() || "";

  return (
    message.includes("sfu") ||
    message.includes("websocket") ||
    message.includes("timed out") ||
    message.includes("connection")
  );
};
