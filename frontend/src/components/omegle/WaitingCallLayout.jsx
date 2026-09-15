import React from "react";

import {
  RefreshCcwIcon,
  SkipForwardIcon,
} from "lucide-react";

const WaitingCallLayout = ({
  authUser,
  phase,
  onFindNext,
}) => {
  const isError = phase === "error";
  const isPeerLeft = phase === "peer-left";
  const isJoining = phase === "joining";

  return (
    <div className="h-[calc(100dvh-4rem)] overflow-hidden bg-[#fdf2e9] flex flex-col items-center px-4 py-5 gap-4">
      <h1 className="text-4xl font-bold text-orange-500 shrink-0">
        Random Call
      </h1>

      <div className="flex-1 min-h-0 w-full max-w-[1280px] flex flex-col md:flex-row gap-6 justify-center">
        <div className="w-full md:w-1/2 h-full min-h-0 bg-black rounded-xl overflow-hidden flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-white">
            <div className="avatar">
              <div className="w-24 rounded-full overflow-hidden">
                <img
                  src={authUser?.user_profilePic}
                  alt={authUser?.user_name || "You"}
                />
              </div>
            </div>

            <p className="font-semibold">
              {authUser?.user_name}
            </p>

            <p className="text-sm text-gray-400">
              You
            </p>
          </div>
        </div>

        <div className="w-full md:w-1/2 h-full min-h-0 bg-black rounded-xl overflow-hidden flex items-center justify-center">
          {isError ? (
            <div className="text-center text-white space-y-4">
              <p className="font-semibold text-lg">
                Could not connect
              </p>

              <button
                className="btn btn-primary"
                onClick={onFindNext}
              >
                <RefreshCcwIcon className="w-4 h-4" />
                Try Again
              </button>
            </div>
          ) : isPeerLeft ? (
            <div className="text-center text-white space-y-4">
              <p className="font-semibold text-lg">
                Stranger disconnected
              </p>

              <button
                className="btn btn-primary"
                onClick={onFindNext}
              >
                <SkipForwardIcon className="w-4 h-4" />
                Find Next
              </button>
            </div>
          ) : (
            <div className="text-center text-white space-y-4">
              <span className="loading loading-spinner loading-lg" />

              <p className="font-semibold">
                {isJoining
                  ? "Connecting..."
                  : "Finding a stranger..."}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 h-12 flex items-center justify-center">
        {!isError && !isPeerLeft && (
          <button
            disabled
            className="flex items-center gap-2 bg-blue-500 text-white px-6 py-2 rounded font-semibold opacity-50 cursor-not-allowed"
          >
            <SkipForwardIcon className="w-4 h-4" />
            Next
          </button>
        )}
      </div>
    </div>
  );
};

export default WaitingCallLayout;
