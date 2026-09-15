import React from "react";
import { useNavigate } from "react-router";

import {
  StreamCall,
  StreamVideo,
} from "@stream-io/video-react-sdk";

import "@stream-io/video-react-sdk/dist/css/styles.css";

import useAuthUser from "../hooks/useAuthUser";
import useRandomCall from "../hooks/useRandomCall";

import Layout from "../components/Layout.jsx";
import PageLoader from "../components/PageLoader";
import WaitingCallLayout from "../components/omegle/WaitingCallLayout";
import RandomCallContent from "../components/omegle/RandomCallContent";

const OmeglePage = () => {
  const { authUser } = useAuthUser();
  const navigate = useNavigate();

  const {
    videoClient,
    call,
    phase,
    isLoading,
    handleNext,
    handleFindNext,
    handlePeerLeft,
    handlePeerJoinTimeout,
    handleLeaveCall,
  } = useRandomCall({
    authUser,
    onLeave: () => navigate("/"),
  });

  if (isLoading) {
    return <PageLoader />;
  }

  if (!call) {
    return (
      <Layout showSidebar={false}>
        <WaitingCallLayout
          authUser={authUser}
          phase={phase}
          onFindNext={handleFindNext}
        />
      </Layout>
    );
  }

  return (
    <Layout showSidebar={false}>
      <StreamVideo client={videoClient}>
        <StreamCall call={call}>
          <RandomCallContent
            onNext={handleNext}
            onPeerLeft={handlePeerLeft}
            onPeerJoinTimeout={handlePeerJoinTimeout}
            onLeaveCall={handleLeaveCall}
          />
        </StreamCall>
      </StreamVideo>
    </Layout>
  );
};

export default OmeglePage;
