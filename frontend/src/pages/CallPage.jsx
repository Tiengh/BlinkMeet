import React, {
  useCallback,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router";

import useAuthUser from "../hooks/useAuthUser";

import {
  StreamVideo,
  StreamCall,
  CallControls,
  SpeakerLayout,
  StreamTheme,
} from "@stream-io/video-react-sdk";

import "@stream-io/video-react-sdk/dist/css/styles.css";

import PageLoader from "../components/PageLoader";
import useVideoCall from "../hooks/useVideoCall";

const CallPage = () => {
  const { id: callId } =
    useParams();

  const navigate =
    useNavigate();

  const {
    authUser,
    isLoading,
  } = useAuthUser();

  const {
    client,
    call,
    error,
    isLoading: isCallLoading,
    leave,
    retry,
  } = useVideoCall({ authUser, callId });

  const handleLeave = useCallback(async (leaveError) => {
    if (leaveError) {
      console.error("Leave call error:", leaveError);
    }

    await leave();
    navigate("/");
  }, [leave, navigate]);

  if (
    isLoading ||
    isCallLoading
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
            onClick={error ? retry : () => navigate("/")}
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
