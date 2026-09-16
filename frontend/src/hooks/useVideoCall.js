import { useCallback, useEffect, useRef, useState } from "react";
import { StreamVideoClient } from "@stream-io/video-react-sdk";
import { enableAvailableMedia } from "../lib/streamVideo";
import useStreamToken from "./useStreamToken";

const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY;

const useVideoCall = ({ authUser, callId }) => {
  const [client, setClient] = useState(null);
  const [call, setCall] = useState(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const callRef = useRef(null);
  const clientRef = useRef(null);
  const leftCallsRef = useRef(new WeakSet());
  const disconnectedClientsRef = useRef(new WeakSet());

  const {
    data: tokenData,
    isLoading: isTokenLoading,
    isError: isTokenError,
  } = useStreamToken(authUser?._id);

  const leaveCallSafely = useCallback(async (targetCall) => {
    if (!targetCall || leftCallsRef.current.has(targetCall)) {
      return;
    }

    leftCallsRef.current.add(targetCall);

    try {
      await targetCall.leave();
    } catch (error) {
      if (!String(error?.message).includes("already been left")) {
        console.error("Failed to leave video call:", error);
      }
    }
  }, []);

  const disconnectClientSafely = useCallback(async (targetClient) => {
    if (!targetClient || disconnectedClientsRef.current.has(targetClient)) {
      return;
    }

    disconnectedClientsRef.current.add(targetClient);

    try {
      await targetClient.disconnectUser();
    } catch (error) {
      if (!String(error?.message).includes("already")) {
        console.error("Failed to disconnect video client:", error);
      }
    }
  }, []);

  const leave = useCallback(async () => {
    const activeCall = callRef.current;
    const activeClient = clientRef.current;

    callRef.current = null;
    clientRef.current = null;
    setCall(null);
    setClient(null);

    await leaveCallSafely(activeCall);
    await disconnectClientSafely(activeClient);
  }, [disconnectClientSafely, leaveCallSafely]);

  useEffect(() => {
    if (!authUser?._id || !callId || !tokenData?.token || !STREAM_API_KEY) {
      setIsConnecting(false);
      return undefined;
    }

    let cancelled = false;
    let videoClient = null;
    let callInstance = null;

    const connect = async () => {
      setIsConnecting(true);
      setError(null);

      try {
        videoClient = new StreamVideoClient({
          apiKey: STREAM_API_KEY,
          user: {
            id: String(authUser._id),
            name: authUser.user_name,
            image: authUser.user_profilePic,
          },
          token: tokenData.token,
          options: {
            devicePersistence: {
              enabled: false,
            },
          },
        });

        callInstance = videoClient.call("default", callId);
        await Promise.allSettled([
          callInstance.camera.disable(),
          callInstance.microphone.disable(),
        ]);
        await callInstance.join({ create: true, maxJoinRetries: 1 });

        if (cancelled) {
          await leaveCallSafely(callInstance);
          await disconnectClientSafely(videoClient);
          return;
        }

        clientRef.current = videoClient;
        callRef.current = callInstance;
        setClient(videoClient);
        setCall(callInstance);
        await enableAvailableMedia(callInstance);
      } catch (connectError) {
        if (!cancelled) {
          await leaveCallSafely(callInstance);
          await disconnectClientSafely(videoClient);
          setError(connectError);
          setClient(null);
          setCall(null);
        }
      } finally {
        if (!cancelled) {
          setIsConnecting(false);
        }
      }
    };

    connect();

    return () => {
      cancelled = true;
      void leaveCallSafely(callInstance);
      void disconnectClientSafely(videoClient);
    };
  }, [
    disconnectClientSafely,
    authUser?._id,
    authUser?.user_name,
    authUser?.user_profilePic,
    callId,
    leaveCallSafely,
    retryVersion,
    tokenData?.token,
  ]);

  const retry = useCallback(() => {
    setRetryVersion((version) => version + 1);
  }, []);

  return {
    client,
    call,
    error: error || (isTokenError ? new Error("Stream token unavailable") : null),
    isLoading: isTokenLoading || isConnecting,
    leave,
    retry,
  };
};

export default useVideoCall;
