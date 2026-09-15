import React, {
  useEffect,
  useRef,
} from "react";

import {
  CallControls,
  hasScreenShare,
  ParticipantView,
  StreamTheme,
  useCallStateHooks,
} from "@stream-io/video-react-sdk";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  CheckCircleIcon,
  SkipForwardIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";

import toast from "react-hot-toast";

import {
  getOutgoingFriendReqs,
  getUserFriends,
  sendFriendRequest,
} from "../../lib/api";

const PEER_JOIN_TIMEOUT = 12000;

const RandomCallContent = ({
  onNext,
  onPeerLeft,
  onPeerJoinTimeout,
  onLeaveCall,
}) => {
  const {
    useLocalParticipant,
    useRemoteParticipants,
  } = useCallStateHooks();

  const localParticipant = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();

  const remoteParticipant = remoteParticipants[0];
  const remoteUserId = remoteParticipant?.userId;

  const lastRemoteUserIdRef = useRef(null);
  const hadRemoteParticipantRef = useRef(false);
  const peerLeftHandledRef = useRef(false);
  const peerJoinTimeoutHandledRef = useRef(false);

  const queryClient = useQueryClient();

  const localTrackType =
    localParticipant &&
    hasScreenShare(localParticipant)
      ? "screenShareTrack"
      : "videoTrack";

  const remoteTrackType =
    remoteParticipant &&
    hasScreenShare(remoteParticipant)
      ? "screenShareTrack"
      : "videoTrack";

  useEffect(() => {
    if (!remoteParticipant) {
      return;
    }

    hadRemoteParticipantRef.current = true;
    peerJoinTimeoutHandledRef.current = false;

    lastRemoteUserIdRef.current = String(
      remoteParticipant.userId,
    );

    peerLeftHandledRef.current = false;
  }, [remoteParticipant]);

  useEffect(() => {
    if (remoteParticipant) {
      return;
    }

    if (hadRemoteParticipantRef.current) {
      return;
    }

    if (peerJoinTimeoutHandledRef.current) {
      return;
    }

    const timer = setTimeout(() => {
      if (
        hadRemoteParticipantRef.current ||
        peerJoinTimeoutHandledRef.current
      ) {
        return;
      }

      peerJoinTimeoutHandledRef.current = true;

      onPeerJoinTimeout();
    }, PEER_JOIN_TIMEOUT);

    return () => {
      clearTimeout(timer);
    };
  }, [
    remoteParticipant,
    onPeerJoinTimeout,
  ]);

  useEffect(() => {
    if (
      !hadRemoteParticipantRef.current ||
      remoteParticipants.length > 0 ||
      peerLeftHandledRef.current
    ) {
      return;
    }

    peerLeftHandledRef.current = true;

    onPeerLeft(
      lastRemoteUserIdRef.current,
    );
  }, [
    remoteParticipants.length,
    onPeerLeft,
  ]);

  const {
    data: friends = [],
  } = useQuery({
    queryKey: ["friends"],
    queryFn: getUserFriends,
  });

  const {
    data: outgoingFriendReqs = [],
  } = useQuery({
    queryKey: ["outgoingFriendReqs"],
    queryFn: getOutgoingFriendReqs,
  });

  const {
    mutate: sendRequestMutation,
    isPending,
  } = useMutation({
    mutationFn: sendFriendRequest,

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["outgoingFriendReqs"],
      });

      toast.success(
        "Friend request sent",
      );
    },

    onError: (error) => {
      toast.error(
        error.response?.data?.message ||
        "Could not send friend request",
      );
    },
  });

  const isAlreadyFriend =
    !!remoteUserId &&
    friends.some(
      (friend) =>
        String(friend._id) ===
        String(remoteUserId),
    );

  const hasRequestBeenSent =
    !!remoteUserId &&
    outgoingFriendReqs.some(
      (request) =>
        String(request.recipient?._id) ===
        String(remoteUserId),
    );

  const handleSendRequest = () => {
    if (
      !remoteUserId ||
      isAlreadyFriend ||
      hasRequestBeenSent ||
      isPending
    ) {
      return;
    }

    sendRequestMutation(remoteUserId);
  };

  const handleNextClick = () => {
    onNext(
      remoteUserId ||
      lastRemoteUserIdRef.current,
    );
  };

  return (
    <StreamTheme>
      <div className="h-[calc(100dvh-4rem)] overflow-hidden bg-[#fdf2e9] flex flex-col items-center px-4 py-5 gap-4">
        <h1 className="text-4xl font-bold text-orange-500 shrink-0">
          Random Call
        </h1>

        <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-6 w-full max-w-[1280px] justify-center">
          <div className="w-full md:w-1/2 h-full min-h-0 bg-black rounded-xl overflow-hidden flex items-center justify-center">
            {localParticipant ? (
              <ParticipantView
                participant={localParticipant}
                trackType={localTrackType}
              />
            ) : (
              <div className="text-center text-white">
                <span className="loading loading-spinner mb-3" />

                <p>
                  Loading your media...
                </p>
              </div>
            )}
          </div>

          <div className="w-full md:w-1/2 h-full min-h-0 bg-black rounded-xl overflow-hidden flex items-center justify-center">
            {remoteParticipant ? (
              <ParticipantView
                participant={remoteParticipant}
                trackType={remoteTrackType}
              />
            ) : (
              <div className="text-center text-white space-y-3">
                <span className="loading loading-spinner loading-lg" />

                <p>
                  Connecting to stranger...
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 flex gap-3 flex-wrap justify-center">
          <button
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded font-semibold transition-colors"
            onClick={handleNextClick}
          >
            <SkipForwardIcon className="w-4 h-4" />
            Next
          </button>

          <button
            onClick={handleSendRequest}
            disabled={
              !remoteUserId ||
              isAlreadyFriend ||
              hasRequestBeenSent ||
              isPending
            }
            className={`flex items-center px-6 py-2 rounded font-semibold transition-colors duration-200 ${
              isAlreadyFriend
                ? "bg-green-200 text-green-800 cursor-not-allowed"
                : hasRequestBeenSent
                  ? "bg-gray-300 text-gray-700 cursor-not-allowed"
                  : !remoteUserId
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
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
            ) : isPending ? (
              <>
                <span className="loading loading-spinner loading-xs mr-2" />
                Sending...
              </>
            ) : (
              <>
                <UserPlusIcon className="w-4 h-4 mr-2" />
                Add Friend
              </>
            )}
          </button>
        </div>

        <div className="shrink-0">
          <CallControls
            onLeave={onLeaveCall}
          />
        </div>
      </div>
    </StreamTheme>
  );
};

export default RandomCallContent;
