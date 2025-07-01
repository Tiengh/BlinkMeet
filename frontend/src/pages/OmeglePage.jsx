import React, { useEffect, useState } from "react";
import useAuthUser from "../hooks/useAuthUser";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getStreamToken,
  getRandomCall,
  sendFriendRequest,
  getOutgoingFriendReqs,
  getUserFriends,
} from "../lib/api";

import {
  StreamVideo,
  StreamVideoClient,
  StreamCall,
  StreamTheme,
  CallControls,
  ParticipantView,
  useCallStateHooks,
} from "@stream-io/video-react-sdk";

import "@stream-io/video-react-sdk/dist/css/styles.css";
import Layout from "../components/Layout.jsx";
import PageLoader from "../components/PageLoader";
import { UserPlusIcon, CheckCircleIcon, UsersIcon } from "lucide-react";
import toast from "react-hot-toast";

const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY;

const OmeglePage = () => {
  const { authUser } = useAuthUser();
  const [client, setClient] = useState(null);
  const [call, setCall] = useState(null);

  const { data: tokenData } = useQuery({
    queryKey: ["streamToken"],
    queryFn: getStreamToken,
    enabled: !!authUser,
  });

  const { data: callData } = useQuery({
    queryKey: ["randomCall"],
    queryFn: getRandomCall,
    enabled: !!authUser,
  });

  useEffect(() => {
  const init = async () => {
    if (!tokenData?.token || !callData?.callId || !authUser) return;

    const user = {
      id: String(authUser._id),
      name: authUser.user_name,
      image: authUser.user_profilePic,
    };

    const videoClient = new StreamVideoClient({
      apiKey: STREAM_API_KEY,
      user,
      token: tokenData.token,
    });

    const callInstance = videoClient.call("default", callData.callId);
    await callInstance.join({ create: true }); // luôn tạo phòng

    setClient(videoClient);
    setCall(callInstance);
  };

  init();
}, [tokenData, callData, authUser]);

  // Giai đoạn đang lấy token/callId
  if (!tokenData?.token || !callData?.callId || !authUser) {
    return <PageLoader />;
  }

  // Giai đoạn đang khởi tạo client/call
  if (!client || !call) {
    return (
      <Layout showSidebar={false}>
        <div className="min-h-screen bg-[#fdf2e9] flex items-center justify-center">
          <div className="text-center space-y-4">
            <p className="text-lg font-semibold">Preparing call...</p>
            <span className="loading loading-spinner loading-lg text-primary" />
          </div>
        </div>
      </Layout>
    );
  }

  // Giao diện chính khi đã sẵn sàng
  return (
    <Layout showSidebar={false}>
      <StreamVideo client={client}>
        <StreamCall call={call}>
          <CallContent authUser={authUser} />
        </StreamCall>
      </StreamVideo>
    </Layout>
  );
};

export default OmeglePage;

// Component hiển thị nội dung cuộc gọi
const CallContent = ({ authUser }) => {
  const { useLocalParticipant, useRemoteParticipants } = useCallStateHooks();
  const localParticipant = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const remoteParticipant = remoteParticipants[0];
  const remoteUserId = remoteParticipant?.userId;

  const queryClient = useQueryClient();

  const { data: friends = [] } = useQuery({
    queryKey: ["friends"],
    queryFn: getUserFriends,
  });

  const { data: outgoingFriendReqs = [] } = useQuery({
    queryKey: ["outgoingFriendReqs"],
    queryFn: getOutgoingFriendReqs,
  });

  const { mutate: sendRequestMutation, isPending } = useMutation({
    mutationFn: sendFriendRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outgoingFriendReqs"] });
      toast.success("Friend request sent");
    },
    onError: (error) => {
      toast.error(
        error.response?.data?.message || "Could not send friend request"
      );
    },
  });

  const isAlreadyFriend = remoteUserId && friends.some(
    (f) => String(f._id) === remoteUserId
  );

  const hasRequestBeenSent = remoteUserId && outgoingFriendReqs.some(
    (req) => String(req.recipient?._id) === remoteUserId
  );

  const handleSendRequest = () => {
    if (remoteUserId && !isAlreadyFriend && !hasRequestBeenSent) {
      sendRequestMutation(remoteUserId);
    }
  };

  return (
    <StreamTheme>
      <div className="min-h-screen bg-[#fdf2e9] flex flex-col items-center justify-start py-8 px-4 space-y-6">
        <h1 className="text-4xl font-bold text-orange-500">Random Call</h1>

        <div className="flex flex-col md:flex-row gap-8 w-full max-w-[1280px] justify-center items-center">
          {/* Local video */}
          <div className="w-full md:w-1/2 h-[500px] bg-black rounded-md overflow-hidden flex items-center justify-center">
            {localParticipant ? (
              <ParticipantView participant={localParticipant} />
            ) : (
              <p className="text-white">Loading your video...</p>
            )}
          </div>

          {/* Remote video */}
          <div className="w-full md:w-1/2 h-[500px] bg-white rounded-md border flex items-center justify-center">
            {remoteParticipant ? (
              <ParticipantView participant={remoteParticipant} />
            ) : (
              <p className="text-gray-500">Waiting for stranger to join...</p>
            )}
          </div>
        </div>

        {/* Buttons */}
        <div className="mt-4 flex gap-3 flex-wrap justify-center">
          <button
            className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded font-semibold"
            onClick={() => window.location.reload()}
          >
            Next
          </button>

          <button
            onClick={handleSendRequest}
            disabled={!remoteUserId || isAlreadyFriend || hasRequestBeenSent || isPending}
            className={`flex items-center px-6 py-2 rounded font-semibold transition-colors duration-200 ${
              isAlreadyFriend
                ? "bg-green-200 text-green-800 cursor-not-allowed"
                : hasRequestBeenSent
                ? "bg-gray-300 text-gray-700 cursor-not-allowed"
                : "bg-purple-500 hover:bg-purple-600 text-white"
            }`}
          >
            {isAlreadyFriend ? (
              <>
                <UsersIcon className="w-4 h-4 mr-2" />
                Already Friend
              </>
            ) : hasRequestBeenSent ? (
              <>
                <CheckCircleIcon className="w-4 h-4 mr-2" />
                Request Sent
              </>
            ) : (
              <>
                <UserPlusIcon className="w-4 h-4 mr-2" />
                Add Friend
              </>
            )}
          </button>
        </div>

        <div className="mt-4">
          <CallControls />
        </div>
      </div>
    </StreamTheme>
  );
};
