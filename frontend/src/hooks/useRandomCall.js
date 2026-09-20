import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  StreamVideoClient,
} from "@stream-io/video-react-sdk";

import toast from "react-hot-toast";

import {
  getRandomMatchStatus,
  leaveRandomMatch,
  startRandomSearch,
} from "../lib/api";
import useStreamToken from "./useStreamToken";

import {
  enableAvailableMedia,
  isSfuConnectionError,
} from "../lib/streamVideo";
import {
  describeRandomCallError,
  logRandomCall,
} from "../lib/randomCallDebug";

const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY;

const POLLING_INTERVAL = 1000;
const SFU_RETRY_DELAY = 1500;
const MAX_JOIN_RETRIES = 1;

const useRandomCall = ({
  authUser,
  onLeave,
}) => {
  const [videoClient, setVideoClient] = useState(null);
  const [call, setCall] = useState(null);
  const [phase, setPhase] = useState("preparing");
  const [searchVersion, setSearchVersion] = useState(0);

  const currentCallRef = useRef(null);
  const currentPeerIdRef = useRef(null);
  const previousPeerIdRef = useRef(null);

  const joiningRef = useRef(false);
  const transitioningRef = useRef(false);
  const leavingPageRef = useRef(false);
  const leftCallsRef = useRef(new WeakSet());

  const retryTimerRef = useRef(null);
  const searchAttemptRef = useRef(0);
  const joinAttemptRef = useRef(0);

  const {
    data: tokenData,
    isLoading: isTokenLoading,
    isError: isTokenError,
    refetch: refetchToken,
  } = useStreamToken(authUser?._id);

  const leaveCallSafely = useCallback(async (targetCall) => {
    if (!targetCall || leftCallsRef.current.has(targetCall)) {
      return;
    }

    leftCallsRef.current.add(targetCall);
    const startedAt = performance.now();
    logRandomCall("stream-leave-start", { callId: targetCall.id });

    try {
      await targetCall.leave();
      logRandomCall("stream-leave-success", {
        callId: targetCall.id,
        elapsedMs: Math.round(performance.now() - startedAt),
      });
    } catch (error) {
      logRandomCall("stream-leave-error", {
        callId: targetCall.id,
        ...describeRandomCallError(error),
      });
      if (!String(error?.message).includes("already been left")) {
        console.warn("Failed to leave random call:", describeRandomCallError(error));
      }
    }
  }, []);

  useEffect(() => {
    if (
      !authUser?._id ||
      !tokenData?.token ||
      !STREAM_API_KEY
    ) {
      return;
    }

    const user = {
      id: String(authUser._id),
      name: authUser.user_name,
      image: authUser.user_profilePic,
    };

    const client = new StreamVideoClient({
      apiKey: STREAM_API_KEY,
      user,
      token: tokenData.token,

      options: {
        devicePersistence: {
          enabled: false,
        },
      },
    });

    logRandomCall("video-client-created");
    setVideoClient(client);

    return () => {
      logRandomCall("video-client-disconnect-start");
      client.disconnectUser().then(
        () => logRandomCall("video-client-disconnect-success"),
        (error) => logRandomCall("video-client-disconnect-error", {
          ...describeRandomCallError(error),
        }),
      );
    };
  }, [
    authUser?._id,
    authUser?.user_name,
    authUser?.user_profilePic,
    tokenData?.token,
  ]);

  const cleanupCurrentCall = useCallback(async () => {
    const activeCall = currentCallRef.current;
    logRandomCall("cleanup-start", { callId: activeCall?.id ?? null });

    currentCallRef.current = null;
    currentPeerIdRef.current = null;

    setCall(null);

    await leaveCallSafely(activeCall);

    try {
      await leaveRandomMatch();
      logRandomCall("match-leave-success", { callId: activeCall?.id ?? null });
    } catch (error) {
      logRandomCall("match-leave-error", {
        callId: activeCall?.id ?? null,
        ...describeRandomCallError(error),
      });
      console.error("Failed to leave matchmaking:", describeRandomCallError(error));
    }
  }, [leaveCallSafely]);

  const restartSearch = useCallback(
    async ({
      peerId = null,
      delay = 0,
    } = {}) => {
      logRandomCall("restart-search", {
        callId: currentCallRef.current?.id ?? null,
        delayMs: delay,
        joining: joiningRef.current,
      });
      if (peerId) {
        previousPeerIdRef.current = String(peerId);
      }

      await cleanupCurrentCall();

      setPhase("searching");

      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }

      retryTimerRef.current = setTimeout(() => {
        logRandomCall("restart-search-fired");
        setSearchVersion((version) => version + 1);
      }, delay);
    },
    [cleanupCurrentCall],
  );

  useEffect(() => {
    if (!videoClient) {
      return;
    }

    let cancelled = false;
    let pollTimer = null;
    let pollCount = 0;
    let lastStatus = null;
    let searchAttempt = 0;

    const joinMatchedCall = async (matchData) => {
      if (
        cancelled ||
        joiningRef.current ||
        leavingPageRef.current
      ) {
        logRandomCall("join-skipped", {
          callId: matchData?.callId ?? null,
          cancelled,
          joining: joiningRef.current,
          leavingPage: leavingPageRef.current,
        });
        return;
      }

      if (
        !matchData?.callId ||
        !matchData?.peerId
      ) {
        logRandomCall("join-invalid-match");
        return;
      }

      joiningRef.current = true;
      const joinAttempt = ++joinAttemptRef.current;
      const startedAt = performance.now();
      let stage = "prepare";

      let nextCall = null;

      try {
        setPhase("joining");
        logRandomCall("join-start", {
          callId: matchData.callId,
          joinAttempt,
          searchAttempt,
          maxJoinRetries: MAX_JOIN_RETRIES,
        });

        nextCall = videoClient.call(
          "default",
          matchData.callId,
        );

        await Promise.allSettled([
          nextCall.camera.disable(),
          nextCall.microphone.disable(),
        ]);

        stage = "stream-join";
        await nextCall.join({
          create: true,
          maxJoinRetries: MAX_JOIN_RETRIES,
        });
        logRandomCall("join-success", {
          callId: matchData.callId,
          joinAttempt,
          elapsedMs: Math.round(performance.now() - startedAt),
        });

        if (
          cancelled ||
          leavingPageRef.current
        ) {
          logRandomCall("join-abandoned", {
            callId: matchData.callId,
            joinAttempt,
          });
          await leaveCallSafely(nextCall);
          return;
        }

        currentCallRef.current = nextCall;
        currentPeerIdRef.current = String(
          matchData.peerId,
        );

        setCall(nextCall);
        setPhase("in-call");

        stage = "enable-media";
        logRandomCall("media-enable-start", {
          callId: matchData.callId,
          joinAttempt,
        });
        await enableAvailableMedia(nextCall);
        logRandomCall("media-enable-finished", {
          callId: matchData.callId,
          joinAttempt,
          elapsedMs: Math.round(performance.now() - startedAt),
        });
      } catch (error) {
        logRandomCall("call-setup-error", {
          callId: matchData.callId,
          joinAttempt,
          stage,
          elapsedMs: Math.round(performance.now() - startedAt),
          ...describeRandomCallError(error),
        });
        console.error("Failed to join random call:", describeRandomCallError(error));
        if (
          cancelled ||
          leavingPageRef.current
        ) {
          return;
        }

        if (nextCall) {
          await leaveCallSafely(nextCall);
        }

        currentCallRef.current = null;
        currentPeerIdRef.current = null;

        setCall(null);

        try {
          await leaveRandomMatch();
          logRandomCall("match-leave-success", { callId: matchData.callId });
        } catch (leaveError) {
          logRandomCall("match-leave-error", {
            callId: matchData.callId,
            ...describeRandomCallError(leaveError),
          });
        }

        if (isSfuConnectionError(error)) {
          toast.error(
            "Video server connection failed. Retrying...",
          );

          setPhase("searching");

          logRandomCall("retry-search-scheduled", {
            callId: matchData.callId,
            delayMs: SFU_RETRY_DELAY,
          });
          retryTimerRef.current = setTimeout(() => {
            logRandomCall("retry-search-fired", { callId: matchData.callId });
            setSearchVersion((version) => version + 1);
          }, SFU_RETRY_DELAY);

          return;
        }

        setPhase("error");

        toast.error(
          "Could not join the random call.",
        );
      } finally {
        joiningRef.current = false;
        logRandomCall("join-finished", {
          callId: matchData.callId,
          joinAttempt,
          elapsedMs: Math.round(performance.now() - startedAt),
        });
      }
    };

    const pollMatchStatus = async () => {
      if (
        cancelled ||
        leavingPageRef.current
      ) {
        return;
      }

      try {
        pollCount += 1;
        const startedAt = performance.now();
        const statusData = await getRandomMatchStatus();

        if (
          cancelled ||
          leavingPageRef.current
        ) {
          return;
        }

        if (statusData.status !== lastStatus || pollCount % 5 === 0) {
          logRandomCall("status-result", {
            searchAttempt,
            pollCount,
            status: statusData.status,
            callId: statusData.callId ?? null,
            elapsedMs: Math.round(performance.now() - startedAt),
          });
        }
        lastStatus = statusData.status;

        if (statusData.status === "matched") {
          await joinMatchedCall(statusData);
          return;
        }

        pollTimer = setTimeout(
          pollMatchStatus,
          POLLING_INTERVAL,
        );
      } catch (error) {
        if (
          cancelled ||
          leavingPageRef.current
        ) {
          return;
        }

        logRandomCall("status-error", {
          searchAttempt,
          pollCount,
          ...describeRandomCallError(error),
        });
        console.error("Match status polling failed:", describeRandomCallError(error));

        pollTimer = setTimeout(
          pollMatchStatus,
          POLLING_INTERVAL,
        );
      }
    };

    const beginSearch = async () => {
      try {
        if (leavingPageRef.current) {
          return;
        }

        setCall(null);
        setPhase("searching");
        searchAttempt = ++searchAttemptRef.current;
        logRandomCall("search-start", {
          searchAttempt,
          searchVersion,
          hasPreviousPeer: Boolean(previousPeerIdRef.current),
        });

        const startedAt = performance.now();
        const searchData = await startRandomSearch(
          previousPeerIdRef.current,
        );

        if (
          cancelled ||
          leavingPageRef.current
        ) {
          return;
        }

        logRandomCall("search-result", {
          searchAttempt,
          status: searchData.status,
          callId: searchData.callId ?? null,
          elapsedMs: Math.round(performance.now() - startedAt),
        });
        if (searchData.status === "matched") {
          await joinMatchedCall(searchData);
          return;
        }

        pollTimer = setTimeout(
          pollMatchStatus,
          POLLING_INTERVAL,
        );
      } catch (error) {
        if (
          cancelled ||
          leavingPageRef.current
        ) {
          return;
        }

        logRandomCall("search-error", {
          searchAttempt,
          ...describeRandomCallError(error),
        });
        console.error("Random search failed:", describeRandomCallError(error));

        setPhase("error");

        toast.error(
          "Could not search for a stranger.",
        );
      }
    };

    beginSearch();

    return () => {
      cancelled = true;
      logRandomCall("search-effect-cleanup", {
        searchAttempt,
        searchVersion,
        pollCount,
        joining: joiningRef.current,
      });

      if (pollTimer) {
        clearTimeout(pollTimer);
      }
    };
  }, [
    leaveCallSafely,
    videoClient,
    searchVersion,
  ]);

  const handleNext = useCallback(
    async (peerId) => {
      logRandomCall("next-click", {
        callId: currentCallRef.current?.id ?? null,
        joining: joiningRef.current,
        transitioning: transitioningRef.current,
      });
      if (
        transitioningRef.current ||
        leavingPageRef.current
      ) {
        return;
      }

      transitioningRef.current = true;

      try {
        await restartSearch({
          peerId,
        });
      } finally {
        transitioningRef.current = false;
      }
    },
    [restartSearch],
  );

  const handlePeerLeft = useCallback(
    async (peerId) => {
      logRandomCall("peer-left-callback", {
        callId: currentCallRef.current?.id ?? null,
        joining: joiningRef.current,
      });
      if (
        transitioningRef.current ||
        leavingPageRef.current
      ) {
        return;
      }

      transitioningRef.current = true;

      if (peerId) {
        previousPeerIdRef.current = String(peerId);
      }

      try {
        await cleanupCurrentCall();

        setPhase("peer-left");
      } finally {
        transitioningRef.current = false;
      }
    },
    [cleanupCurrentCall],
  );

  const handlePeerJoinTimeout = useCallback(async () => {
    logRandomCall("peer-timeout-callback", {
      callId: currentCallRef.current?.id ?? null,
      joining: joiningRef.current,
    });
    if (
      transitioningRef.current ||
      leavingPageRef.current
    ) {
      return;
    }

    transitioningRef.current = true;

    const peerId = currentPeerIdRef.current;

    try {
      toast.error(
        "Stranger could not connect. Finding another user...",
      );

      await restartSearch({
        peerId,
      });
    } finally {
      transitioningRef.current = false;
    }
  }, [restartSearch]);

  const handleFindNext = useCallback(() => {
    logRandomCall("find-next-click", {
      hasTokenError: isTokenError,
    });
    if (leavingPageRef.current) {
      return;
    }

    if (isTokenError) {
      void refetchToken();
      return;
    }

    setPhase("searching");

    setSearchVersion((version) => version + 1);
  }, [isTokenError, refetchToken]);

  const handleLeaveCall = useCallback(
    async (error) => {
      logRandomCall("leave-page-click", {
        callId: currentCallRef.current?.id ?? null,
        hasError: Boolean(error),
      });
      if (leavingPageRef.current) {
        return;
      }

      leavingPageRef.current = true;

      if (error) {
        if (!String(error?.message).includes("already been left")) {
          logRandomCall("leave-page-error", {
            ...describeRandomCallError(error),
          });
          console.error("Stream leave call error:", describeRandomCallError(error));
        }
      }

      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      const activeCall = currentCallRef.current;

      currentCallRef.current = null;
      currentPeerIdRef.current = null;

      setCall(null);

      await leaveCallSafely(activeCall);

      try {
        await leaveRandomMatch();
        logRandomCall("match-leave-success", { callId: activeCall?.id ?? null });
      } catch (leaveError) {
        logRandomCall("match-leave-error", {
          callId: activeCall?.id ?? null,
          ...describeRandomCallError(leaveError),
        });
        console.error("Failed to clear matchmaking:", describeRandomCallError(leaveError));
      }

      onLeave?.();
    },
    [leaveCallSafely, onLeave],
  );

  useEffect(() => {
    return () => {
      logRandomCall("page-unmount", {
        callId: currentCallRef.current?.id ?? null,
        joining: joiningRef.current,
        leavingPage: leavingPageRef.current,
      });
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }

      if (leavingPageRef.current) {
        return;
      }

      const activeCall = currentCallRef.current;

      if (activeCall) {
        leaveCallSafely(activeCall);
      }

      leaveRandomMatch().then(
        () => logRandomCall("match-leave-success", { callId: activeCall?.id ?? null }),
        (error) => logRandomCall("match-leave-error", {
          callId: activeCall?.id ?? null,
          ...describeRandomCallError(error),
        }),
      );
    };
  }, [leaveCallSafely]);

  const isLoading =
    !authUser ||
    isTokenLoading ||
    (!tokenData?.token && !isTokenError) ||
    (!videoClient && !isTokenError);

  return {
    videoClient,
    call,
    phase: isTokenError ? "error" : phase,
    isLoading,

    handleNext,
    handlePeerLeft,
    handlePeerJoinTimeout,
    handleFindNext,
    handleLeaveCall,
  };
};

export default useRandomCall;
