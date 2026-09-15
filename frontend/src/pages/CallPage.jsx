import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router";

import useAuthUser from "../hooks/useAuthUser";

import {
  useQuery,
} from "@tanstack/react-query";

import {
  getStreamToken,
} from "../lib/api";

import {
  StreamVideo,
  StreamVideoClient,
  StreamCall,
  CallControls,
  SpeakerLayout,
  StreamTheme,
} from "@stream-io/video-react-sdk";

import "@stream-io/video-react-sdk/dist/css/styles.css";

import toast from "react-hot-toast";

import PageLoader from "../components/PageLoader";

const STREAM_API_KEY =
  import.meta.env.VITE_STREAM_API_KEY;

const enableAvailableMedia =
  async (call) => {
    if (
      !navigator.mediaDevices
        ?.enumerateDevices
    ) {
      return;
    }

    try {
      const devices =
        await navigator.mediaDevices
          .enumerateDevices();

      const hasMicrophone =
        devices.some(
          (device) =>
            device.kind ===
            "audioinput",
        );

      const hasCamera =
        devices.some(
          (device) =>
            device.kind ===
            "videoinput",
        );

      if (hasMicrophone) {
        try {
          await call.microphone
            .enable();
        } catch (error) {
          console.warn(
            "Microphone unavailable:",
            error,
          );
        }
      }

      if (hasCamera) {
        try {
          await call.camera
            .enable();
        } catch (error) {
          console.warn(
            "Camera unavailable:",
            error,
          );
        }
      } else {
        console.info(
          "No camera detected",
        );
      }
    } catch (error) {
      console.warn(
        "Could not enumerate devices:",
        error,
      );
    }
  };

const CallPage = () => {
  const { id: callId } =
    useParams();

  const navigate =
    useNavigate();

  const {
    authUser,
    isLoading,
  } = useAuthUser();

  const [client, setClient] =
    useState(null);

  const [call, setCall] =
    useState(null);

  const [isConnecting, setIsConnecting] =
    useState(true);

  const [error, setError] =
    useState(null);

  const callRef =
    useRef(null);

  const clientRef =
    useRef(null);

  const leavingRef =
    useRef(false);

  const {
    data: tokenData,
    isLoading: isTokenLoading,
  } = useQuery({
    queryKey: ["streamToken"],
    queryFn: getStreamToken,
    enabled: !!authUser,
  });

  useEffect(() => {
    if (
      !tokenData?.token ||
      !authUser?._id ||
      !callId ||
      !STREAM_API_KEY
    ) {
      return;
    }

    let cancelled = false;

    const initCall =
      async () => {
        setIsConnecting(true);
        setError(null);

        let videoClient = null;
        let callInstance = null;

        try {
          const user = {
            id: String(
              authUser._id,
            ),
            name:
              authUser.user_name,
            image:
              authUser.user_profilePic,
          };

          videoClient =
            new StreamVideoClient({
              apiKey:
                STREAM_API_KEY,

              user,

              token:
                tokenData.token,

              options: {
                devicePersistence: {
                  enabled: false,
                },
              },
            });

          clientRef.current =
            videoClient;

          callInstance =
            videoClient.call(
              "default",
              callId,
            );

          callRef.current =
            callInstance;

          await Promise.allSettled([
            callInstance.camera.disable(),
            callInstance.microphone.disable(),
          ]);

          await callInstance.join({
            create: true,
            maxJoinRetries: 1,
          });

          if (cancelled) {
            await callInstance
              .leave()
              .catch(
                console.error,
              );

            await videoClient
              .disconnectUser()
              .catch(
                console.error,
              );

            return;
          }

          setClient(
            videoClient,
          );

          setCall(
            callInstance,
          );

          await enableAvailableMedia(
            callInstance,
          );
        } catch (error) {
          if (cancelled) {
            return;
          }

          console.error(
            "Error joining video call:",
            error,
          );

          if (callInstance) {
            await callInstance
              .leave()
              .catch(
                console.error,
              );
          }

          if (videoClient) {
            await videoClient
              .disconnectUser()
              .catch(
                console.error,
              );
          }

          callRef.current =
            null;

          clientRef.current =
            null;

          setCall(null);
          setClient(null);

          setError(error);

          toast.error(
            "Cannot join the call. Try again.",
          );
        } finally {
          if (!cancelled) {
            setIsConnecting(
              false,
            );
          }
        }
      };

    initCall();

    return () => {
      cancelled = true;

      const activeCall =
        callRef.current;

      const activeClient =
        clientRef.current;

      callRef.current = null;
      clientRef.current =
        null;

      if (
        activeCall &&
        !leavingRef.current
      ) {
        activeCall
          .leave()
          .catch(
            console.error,
          );
      }

      if (activeClient) {
        activeClient
          .disconnectUser()
          .catch(
            console.error,
          );
      }
    };
  }, [
    tokenData?.token,
    authUser?._id,
    authUser?.user_name,
    authUser?.user_profilePic,
    callId,
  ]);

  const handleLeave =
    useCallback(
      async (error) => {
        if (
          leavingRef.current
        ) {
          return;
        }

        leavingRef.current =
          true;

        if (error) {
          console.error(
            "Leave call error:",
            error,
          );
        }

        callRef.current =
          null;

        setCall(null);

        const activeClient =
          clientRef.current;

        clientRef.current =
          null;

        if (activeClient) {
          await activeClient
            .disconnectUser()
            .catch(
              console.error,
            );
        }

        navigate("/");
      },
      [navigate],
    );

  if (
    isLoading ||
    isTokenLoading ||
    isConnecting
  ) {
    return <PageLoader />;
  }

  if (
    error ||
    !client ||
    !call
  ) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-lg font-semibold">
            Could not initialize
            video call.
          </p>

          <button
            className="btn btn-primary"
            onClick={() =>
              navigate("/")
            }
          >
            Back Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden">
      <StreamVideo
        client={client}
      >
        <StreamCall
          call={call}
        >
          <CallContent
            onLeave={
              handleLeave
            }
          />
        </StreamCall>
      </StreamVideo>
    </div>
  );
};

const CallContent = ({
  onLeave,
}) => {
  return (
    <StreamTheme>
      <div className="h-screen flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0">
          <SpeakerLayout />
        </div>

        <div className="shrink-0 flex justify-center py-4">
          <CallControls
            onLeave={
              onLeave
            }
          />
        </div>
      </div>
    </StreamTheme>
  );
};

export default CallPage;
