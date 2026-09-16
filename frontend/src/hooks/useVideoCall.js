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

  const {
    data: tokenData,
    isLoading: isTokenLoading,
    isError: isTokenError,
  } = useStreamToken(authUser?._id);

  const leave = useCallback(async () => {
    const activeCall = callRef.current;
    const activeClient = clientRef.current;

    callRef.current = null;
    clientRef.current = null;
    setCall(null);
    setClient(null);

    await activeCall?.leave().catch(console.error);
    await activeClient?.disconnectUser().catch(console.error);
  }, []);

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
          await callInstance.leave().catch(console.error);
          await videoClient.disconnectUser().catch(console.error);
          return;
        }

        clientRef.current = videoClient;
        callRef.current = callInstance;
        setClient(videoClient);
        setCall(callInstance);
        await enableAvailableMedia(callInstance);
      } catch (connectError) {
        if (!cancelled) {
          await callInstance?.leave().catch(console.error);
          await videoClient?.disconnectUser().catch(console.error);
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
      void callInstance?.leave().catch(console.error);
      void videoClient?.disconnectUser().catch(console.error);
    };
  }, [
    authUser?._id,
    authUser?.user_name,
    authUser?.user_profilePic,
    callId,
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
