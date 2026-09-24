import React from "react";
import { useNavigate } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import useWebRTC from "../hooks/useWebRTC";
import useRandomCall from "../hooks/useRandomCall";

import Layout from "../components/Layout.jsx";
import PageLoader from "../components/PageLoader";
import WaitingCallLayout from "../components/omegle/WaitingCallLayout";
import RandomCallContent from "../components/omegle/RandomCallContent";

const OmeglePage = () => {
  const { authUser } = useAuthUser();
  const navigate = useNavigate();

  const {
    call,
    phase,
    isLoading,
    handleNext,
    handleFindNext,
    handleLeaveCall,
    handleConnectionFailure,
    isSocketConnected,
    socket,
  } = useRandomCall({
    authUser,
    onLeave: () => navigate("/"),
  });

  const webRTC = useWebRTC({
    call,
    isSocketConnected,
    localUserId: authUser?._id,
    onConnectionFailure: handleConnectionFailure,
    socket,
  });

  const leaveRandomCall = async () => {
    webRTC.closeConnection({ stopLocalMedia: true });
    await handleLeaveCall();
  };

  const findNext = async () => {
    webRTC.closeConnection();
    await handleNext(call?.peerId);
  };

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
      <RandomCallContent
        {...webRTC}
        call={call}
        onNext={findNext}
        onLeaveCall={leaveRandomCall}
      />
    </Layout>
  );
};

export default OmeglePage;
