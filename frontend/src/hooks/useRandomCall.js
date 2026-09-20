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

const createSessionId = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
};

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
  const activeSessionIdRef = useRef(createSessionId());

  const joiningRef = useRef(false);
  const transitioningRef = useRef(false);
  const leavingPageRef = useRef(false);
  const leftCallsRef = useRef(new WeakSet());
  const leavingCallsRef = useRef(new WeakMap());

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

    const existingLeave = leavingCallsRef.current.get(targetCall);
    if (existingLeave) {
      return existingLeave;
    }

    const leavePromise = (async () => {
      const startedAt = performance.now();
      logRandomCall("stream-leave-start", { callId: targetCall.id });

      try {
        await targetCall.leave();
        leftCallsRef.current.add(targetCall);
        logRandomCall("stream-leave-success", {
          callId: targetCall.id,
          elapsedMs: Math.round(performance.now() - startedAt),
        });
      } catch (error) {
        if (String(error?.message).includes("already been left")) {
          leftCallsRef.current.add(targetCall);
          logRandomCall("stream-leave-already-left", {
            callId: targetCall.id,
          });
          return;
        }

        logRandomCall("stream-leave-error", {
          callId: targetCall.id,
          ...describeRandomCallError(error),
        });
        throw error;
      } finally {
        leavingCallsRef.current.delete(targetCall);
      }
    })();

    leavingCallsRef.current.set(targetCall, leavePromise);
    return leavePromise;
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

  const cleanupCurrentCall = useCallback(async ({
    targetCall = currentCallRef.current,
    sessionId = activeSessionIdRef.current,
    expectedCallId = targetCall?.id ?? null,
  } = {}) => {
    logRandomCall("cleanup-start", {
      callId: expectedCallId,
      sessionId,
    });

    await leaveCallSafely(targetCall);

    if (!targetCall || currentCallRef.current === targetCall) {
      setCall(null);
    }

    let leaveResult;
    try {
      leaveResult = await leaveRandomMatch(sessionId, expectedCallId);
    } catch (error) {
      logRandomCall("match-leave-error", {
        callId: expectedCallId,
        sessionId,
        ...describeRandomCallError(error),
      });
      throw error;
    }

    if (!leaveResult?.success) {
      const error = new Error("Matchmaking cleanup was rejected as stale");
      logRandomCall("match-leave-stale", {
        callId: expectedCallId,
        sessionId,
      });
      throw error;
    }

    logRandomCall("match-leave-success", {
      callId: expectedCallId,
      sessionId,
    });

    if (!currentCallRef.current || currentCallRef.current === targetCall) {
      currentCallRef.current = null;
      currentPeerIdRef.current = null;
      setCall(null);
    }
  }, [leaveCallSafely]);

  const restartSearch = useCallback(
    async ({
      peerId = null,
      delay = 0,
    } = {}) => {
      const sessionId = activeSessionIdRef.current;
      const activeCall = currentCallRef.current;
      const expectedCallId = activeCall?.id ?? null;

      logRandomCall("restart-search", {
        callId: expectedCallId,
        sessionId,
        delayMs: delay,
        joining: joiningRef.current,
      });

      if (peerId) {
        previousPeerIdRef.current = String(peerId);
      }

      await cleanupCurrentCall({
        targetCall: activeCall,
        sessionId,
        expectedCallId,
      });

      activeSessionIdRef.current = createSessionId();
      setPhase("searching");

      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }

      retryTimerRef.current = setTimeout(() => {
        logRandomCall("restart-search-fired", {
          sessionId: activeSessionIdRef.current,
        });
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
    const sessionId = activeSessionIdRef.current;

    const handleInactiveSession = (statusData) => {
      if (statusData.status === "session-conflict") {
        logRandomCall("session-conflict", { sessionId });
        setPhase("error");
        toast.error("Random call is already active in another tab.");
        return true;
      }

      if (statusData.status === "cancelled") {
        logRandomCall("session-cancelled", { sessionId });
        if (!transitioningRef.current) {
          setPhase("error");
        }
        return true;
      }

      return false;
    };

    const cleanupFailedJoin = async (targetCall, matchData) => {
      let streamLeaveError = null;

      try {
        await leaveCallSafely(targetCall);
      } catch (error) {
        streamLeaveError = error;
      }

      const leaveResult = await leaveRandomMatch(sessionId, matchData.callId);
      if (!leaveResult?.success) {
        throw new Error("Failed call cleanup was rejected as stale");
      }

      if (currentCallRef.current === targetCall) {
        currentCallRef.current = null;
        currentPeerIdRef.current = null;
      }
      setCall(null);

      if (streamLeaveError) {
        logRandomCall("failed-join-stream-cleanup-error", {
          callId: matchData.callId,
          ...describeRandomCallError(streamLeaveError),
        });
      }
    };

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
          sessionId,
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
          if (nextCall) {
            leaveCallSafely(nextCall).catch(() => {});
          }
          return;
        }

        try {
          await cleanupFailedJoin(nextCall, matchData);
        } catch (cleanupError) {
          logRandomCall("failed-join-cleanup-error", {
            callId: matchData.callId,
            ...describeRandomCallError(cleanupError),
          });
          setPhase("error");
          toast.error("Could not clean up the failed random call.");
          return;
        }

        if (matchData.peerId) {
          previousPeerIdRef.current = String(matchData.peerId);
        }

        if (isSfuConnectionError(error)) {
          toast.error(
            "Video server connection failed. Retrying...",
          );

          activeSessionIdRef.current = createSessionId();
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
        toast.error("Could not join the random call.");
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
        const statusData = await getRandomMatchStatus(sessionId);

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

        if (handleInactiveSession(statusData)) {
          return;
        }

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
        searchAttempt = ++searchAttempRef.current;
        logRandomCall("search-start", {
          searchAttempt,
          searchVersion,
          sessionId,
          hasPreviousPeer: Boolean(previousPeerIdRef.current),
        });

        const startedAt = performance.now();
        const searchData = await startRandomSearch(
          previousPeerIdRef.current,
          sessionId,
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

        if (handleInactiveSession(searchData)) {
          return;
        }

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
        toast.error("Could not search for a stranger.");
      }
    };

    beginSearch();

    return () => {
      cancelled = true;
      logRandomCall("search-effect-cleanup", {
        searchAttempt,
        searchVersion,
        sessionId,
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
      const excludedPeerId = peerId || currentPeerIdRef.current;
      logRandomCall("next-click", {
        callId: currentCallRef.current?.id ?? null,
        joining: joiningRef.current,
        transitioning: transitioningRef.current,
        hasExcludedPeer: Boolean(excludedPeerId),
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
          peerId: excludedPeerId,
        });
      } catch (error) {
        logRandomCall("next-error", {
          ...describeRandomCallError(error),
        });
        setPhase("error");
        toast.error("Could not leave the current call. Try again.");
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
      } catch (error) {
        logRandomCall("peer-left-cleanup-error", {
          ...describeRandomCallError(error),
        });
        setPhase("error");
        toast.error("Could not clean up the disconnected call.");
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
    } catch (error) {
      logRandomCall("peer-timeout-cleanup-error", {
        ...describeRandomCallError(error),
      });
      setPhase("error");
      toast.error("Could not restart matchmaking. Try again.");
    } finally {
      transitioningRef.current = false;
    }
  }, [restartSearch]);

  const handleFindNext = useCallback(async () => {
    logRandomCall("find-next-click", {
      hasTokenError: isTokenError,
    });
    if (
      leavingPageRef.current ||
      transitioningRef.current
    ) {
      return;
    }

    if (isTokenError) {
      void refetchToken();
      return;
    }

    transitioningRef.current = true;
    try {
      await restartSearch({
        peerId: previousPeerIdRef.current,
      });
    } catch (error) {
      logRandomCall("find-next-error", {
        ...describeRandomCallError(error),
      });
      setPhase("error");
      toast.error("Could not restart matchmaking. Try again.");
    } finally {
      transitioningRef.current = false;
    }
  }, [isTokenError, refetchToken, restartSearch]);

  const handleLeaveCall = useCallback(async () => {
    logRandomCall("leave-page-click", {
      callId: currentCallRef.current?.id ?? null,
    });
    if (leavingPageRef.current) {
      return;
    }

    leavingPageRef.current = true;

    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    try {
      await cleanupCurrentCall();
      onLeave?.();
    } catch (error) {
      leavingPageRef.current = false;
      logRandomCall("leave-page-error", {
        ...describeRandomCallError(error),
      });
      console.error("Failed to leave random call:", describeRandomCallError(error));
      setPhase("error");
      toast.error("Could not leave the random call. Try again.");
    }
  }, [cleanupCurrentCall, onLeave]);

  useEffect(() => {
    return () => {
      const activeCall = currentCallRef.current;
      const sessionId = activeSessionIdRef.current;
      const callId = activeCall?.id ?? null;

      logRandomCall("page-unmount", {
        callId,
        sessionId,
        joining: joiningRef.current,
        leavingPage: leavingPageRef.current,
      });

      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }

      if (leavingPageRef.current) {
        return;
      }

      if (activeCall) {
        leaveCallSafely(activeCall).catch((error) => {
          logRandomCall("unmount-stream-leave-error", {
            callId,
            ...describeRandomCallError(error),
          });
        });
      }

      leaveRandomMatch(sessionId, callId).then(
        (result) => logRandomCall("match-leave-unmount-result", {
          callId,
          sessionId,
          success: Boolean(result?.success),
        }),
        (error) => logRandomCall("match-leave-error", {
          callId,
          sessionId,
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
