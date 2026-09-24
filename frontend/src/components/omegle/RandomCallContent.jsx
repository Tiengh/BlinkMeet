import {
  useEffect,
  useRef,
} from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  CheckCircleIcon,
  MicIcon,
  MicOffIcon,
  PhoneOffIcon,
  SkipForwardIcon,
  UserPlusIcon,
  UsersIcon,
  VideoIcon,
  VideoOffIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  getOutgoingFriendReqs,
  getUserFriends,
  sendFriendRequest,
} from "../../lib/api";

const VideoSurface = ({ muted = false, stream, label }) => {
  const videoRef = useRef(null);
  const hasVideo = Boolean(stream?.getVideoTracks().length);

  useEffect(() => {
    if (!videoRef.current) {return;}
    videoRef.current.srcObject = stream || null;
  }, [stream]);

  return (
    <div className="relative w-full md:w-1/2 h-full min-h-0 bg-black rounded-xl overflow-hidden flex items-center justify-center">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={`w-full h-full object-cover ${hasVideo ? "block" : "hidden"}`}
      />
      {!hasVideo && (
        <div className="text-center text-white space-y-3 px-4">
          <div className="avatar placeholder">
            <div className="bg-neutral text-neutral-content rounded-full w-20">
              <span className="text-2xl">{label.slice(0, 1)}</span>
            </div>
          </div>
          <p>{label}</p>
        </div>
      )}
    </div>
  );
};

const RandomCallContent = ({
  call,
  connectionState,
  hasCamera,
  hasMicrophone,
  isAudioEnabled,
  isVideoEnabled,
  localStream,
  mediaReady,
  mediaWarning,
  onLeaveCall,
  onNext,
  remoteStream,
  toggleCamera,
  toggleMicrophone,
}) => {
  const queryClient = useQueryClient();
  const remoteUserId = call.peerId;
  const { data: friends = [] } = useQuery({
    queryKey: ["friends"],
    queryFn: getUserFriends,
  });
  const { data: outgoingFriendReqs = [] } = useQuery({
    queryKey: ["outgoingFriendReqs"],
    queryFn: getOutgoingFriendReqs,
  });
  const {
    mutate: sendRequest,
    isPending,
  } = useMutation({
    mutationFn: sendFriendRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outgoingFriendReqs"] });
      toast.success("Friend request sent");
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || "Could not send friend request");
    },
  });

  const isAlreadyFriend = friends.some((friend) =>
    String(friend._id) === String(remoteUserId));
  const hasRequestBeenSent = outgoingFriendReqs.some((request) =>
    String(request.recipient?._id) === String(remoteUserId));
  const isConnected = connectionState === "connected";

  return (
    <div className="h-[calc(100dvh-4rem)] overflow-hidden bg-[#fdf2e9] flex flex-col items-center px-4 py-5 gap-4">
      <div className="shrink-0 text-center">
        <h1 className="text-4xl font-bold text-orange-500">Random Call</h1>
        <p className="text-sm text-gray-500 mt-1">
          {isConnected ? "Connected peer-to-peer" : "Establishing secure connection..."}
        </p>
      </div>

      {mediaWarning && mediaReady && !hasCamera && !hasMicrophone && (
        <div className="alert alert-warning py-2 max-w-[1280px]">
          Camera and microphone are unavailable. You can still stay in the call.
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-6 w-full max-w-[1280px] justify-center">
        <VideoSurface
          muted
          stream={localStream}
          label={mediaReady ? "You — camera off" : "Loading your media..."}
        />
        <VideoSurface
          stream={remoteStream}
          label={isConnected ? "Stranger — camera off" : "Connecting to stranger..."}
        />
      </div>

      <div className="shrink-0 flex gap-3 flex-wrap justify-center">
        <button
          type="button"
          className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded font-semibold transition-colors"
          onClick={onNext}
        >
          <SkipForwardIcon className="w-4 h-4" />
          Next
        </button>
        <button
          type="button"
          onClick={() => sendRequest(remoteUserId)}
          disabled={isAlreadyFriend || hasRequestBeenSent || isPending}
          className={`flex items-center px-6 py-2 rounded font-semibold transition-colors ${
            isAlreadyFriend
              ? "bg-green-200 text-green-800 cursor-not-allowed"
              : hasRequestBeenSent
                ? "bg-gray-300 text-gray-700 cursor-not-allowed"
                : "bg-purple-500 hover:bg-purple-600 text-white"
          }`}
        >
          {isAlreadyFriend ? (
            <><UsersIcon className="w-4 h-4 mr-2" />Already Friend</>
          ) : hasRequestBeenSent ? (
            <><CheckCircleIcon className="w-4 h-4 mr-2" />Request Sent</>
          ) : isPending ? (
            <><span className="loading loading-spinner loading-xs mr-2" />Sending...</>
          ) : (
            <><UserPlusIcon className="w-4 h-4 mr-2" />Add Friend</>
          )}
        </button>
      </div>

      <div className="shrink-0 flex gap-3 justify-center">
        <button
          type="button"
          className={`btn btn-circle ${isAudioEnabled ? "btn-neutral" : "btn-error"}`}
          onClick={toggleMicrophone}
          disabled={!hasMicrophone}
          aria-label={isAudioEnabled ? "Mute microphone" : "Unmute microphone"}
        >
          {isAudioEnabled ? <MicIcon /> : <MicOffIcon />}
        </button>
        <button
          type="button"
          className={`btn btn-circle ${isVideoEnabled ? "btn-neutral" : "btn-error"}`}
          onClick={toggleCamera}
          disabled={!hasCamera}
          aria-label={isVideoEnabled ? "Turn camera off" : "Turn camera on"}
        >
          {isVideoEnabled ? <VideoIcon /> : <VideoOffIcon />}
        </button>
        <button
          type="button"
          className="btn btn-circle btn-error"
          aria-label="Leave call"
          onClick={onLeaveCall}
        >
          <PhoneOffIcon />
        </button>
      </div>
    </div>
  );
};

export default RandomCallContent;
