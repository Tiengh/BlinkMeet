import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import toast from "react-hot-toast";
import {
  leaveRandomMatch,
  startRandomSearch,
} from "../lib/api";
import { emitWithAck } from "../lib/realtime";
import {
  describeRandomCallError,
  logRandomCall,
} from "../lib/randomCallDebug";
import useRealtime from "./useRealtime";

const createSessionId = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
};

const useRandomCall = ({ authUser, onLeave }) => {
  const { isConnected, socket } = useRealtime();
  const [call, setCall] = useState(null);
  const [phase, setPhase] = useState("preparing");
  const [searchVersion, setSearchVersion] = useState(0);

  const currentCallRef = useRef(null);
  const previousPeerIdRef = useRef(null);
  const activeSessionIdRef = useRef(createSessionId());
  const lifecycleRef = useRef(0);
  const transitioningRef = useRef(false);
  const leavingPageRef = useRef(false);
  const retryTimerRef = useRef(null);
  const serverPeerLeftRef = useRef(null);

  const cancelMatchmaking = useCallback(async (sessionId, callId) => {
    if (socket?.connected) {
      try {
        return await emitWithAck(socket, "matchmaking:cancel", {
          sessionId,
          callId,
        });
      } catch (error) {
        logRandomCall("socket-cancel-fallback", {
          callId,
          sessionId,
          ...describeRandomCallError(error),
        });
      }
    }
    return leaveRandomMatch(sessionId, callId);
  }, [socket]);

  const cleanupCurrentCall = useCallback(async ({
    expectedCall = currentCallRef.current,
    sessionId = activeSessionIdRef.current,
  } = {}) => {
    const callId = expectedCall?.callId ?? null;
    const result = await cancelMatchmaking(sessionId, callId);
    if (!result?.success) {
      throw new Error("Matchmaking cleanup was rejected as stale");
    }
    if (!expectedCall || currentCallRef.current === expectedCall) {
      currentCallRef.current = null;
      setCall(null);
    }
  }, [cancelMatchmaking]);

  const startNewLifecycle = useCallback(() => {
    lifecycleRef.current += 1;
    activeSessionIdRef.current = createSessionId();
  }, []);

  const scheduleSearch = useCallback((delay = 0) => {
    clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      setSearchVersion((version) => version + 1);
    }, delay);
  }, []);

  const restartSearch = useCallback(async ({ peerId = null } = {}) => {
    if (peerId) {previousPeerIdRef.current = String(peerId);}
    await cleanupCurrentCall();
    startNewLifecycle();
    setPhase("searching");
    scheduleSearch();
  }, [cleanupCurrentCall, scheduleSearch, startNewLifecycle]);

  useEffect(() => {
    if (!authUser?._id || !socket) {return;}

    let cancelled = false;
    let searchStarted = false;
    const lifecycleId = lifecycleRef.current;
    const sessionId = activeSessionIdRef.current;
    const isCurrentLifecycle = () =>
      !cancelled &&
      !leavingPageRef.current &&
      lifecycleRef.current === lifecycleId &&
      activeSessionIdRef.current === sessionId;

    const handleInactiveSession = (state) => {
      if (state.status === "session-conflict") {
        setPhase("error");
        toast.error("Random call is already active in another tab.");
        return true;
      }
      if (state.status === "cancelled") {
        if (!transitioningRef.current) {setPhase("error");}
        return true;
      }
      return false;
    };

    const activateMatch = (state) => {
      if (
        !state?.callId ||
        !state?.peerId ||
        currentCallRef.current?.callId === state.callId
      ) {
        return;
      }
      const nextCall = {
        callId: state.callId,
        peerId: String(state.peerId),
        sessionId,
      };
      currentCallRef.current = nextCall;
      setCall(nextCall);
      setPhase("joining");
      logRandomCall("webrtc-match-activated", {
        callId: state.callId,
        sessionId,
      });
    };

    const processState = (state, source) => {
      if (!isCurrentLifecycle() || state?.sessionId !== sessionId) {return;}
      logRandomCall("realtime-state", {
        callId: state.callId ?? null,
        sessionId,
        source,
        status: state.status,
      });
      if (handleInactiveSession(state)) {return;}
      if (state.status === "matched") {
        activateMatch(state);
      } else if (state.status === "waiting" || state.status === "idle") {
        setPhase("searching");
      }
    };

    const beginSearch = async (force = false) => {
      if (!isCurrentLifecycle() || (searchStarted && !force)) {return;}
      searchStarted = true;
      try {
        setPhase("searching");
        const state = await startRandomSearch(
          previousPeerIdRef.current,
          sessionId,
        );
        if (!isCurrentLifecycle()) {return;}
        processState({ ...state, sessionId }, "search");
      } catch (error) {
        if (!isCurrentLifecycle()) {return;}
        logRandomCall("search-error", describeRandomCallError(error));
        setPhase("error");
        toast.error("Could not search for a stranger.");
      }
    };

    const reconcile = async () => {
      try {
        const response = await emitWithAck(socket, "matchmaking:reconcile", {
          sessionId,
        });
        if (!isCurrentLifecycle()) {return;}
        processState(response.state, "reconcile");
        if (
          response.state.status === "idle" ||
          response.state.status === "waiting"
        ) {
          await beginSearch(response.state.status === "idle");
        }
      } catch (error) {
        if (!isCurrentLifecycle()) {return;}
        logRandomCall("socket-reconcile-error", describeRandomCallError(error));
        setPhase("error");
        toast.error("Could not connect to realtime matchmaking.");
      }
    };

    const handleConnect = () => {void reconcile();};
    const handleMatched = (state) => processState(state, "matched-event");
    const handleCancelled = (state) => processState(state, "cancelled-event");
    const handleServerPeerLeft = (event) => {
      if (
        !isCurrentLifecycle() ||
        event?.sessionId !== sessionId ||
        event?.callId !== currentCallRef.current?.callId
      ) {
        return;
      }
      serverPeerLeftRef.current?.(event.peerId, event.callId);
    };

    socket.on("connect", handleConnect);
    socket.on("matchmaking:matched", handleMatched);
    socket.on("matchmaking:cancelled", handleCancelled);
    socket.on("call:peer-left", handleServerPeerLeft);
    if (isConnected) {void reconcile();}

    return () => {
      cancelled = true;
      socket.off("connect", handleConnect);
      socket.off("matchmaking:matched", handleMatched);
      socket.off("matchmaking:cancelled", handleCancelled);
      socket.off("call:peer-left", handleServerPeerLeft);
    };
  }, [authUser?._id, isConnected, searchVersion, socket]);

  const handleNext = useCallback(async (peerId) => {
    if (transitioningRef.current || leavingPageRef.current) {return;}
    transitioningRef.current = true;
    try {
      await restartSearch({
        peerId: peerId || currentCallRef.current?.peerId,
      });
    } catch (error) {
      logRandomCall("next-error", describeRandomCallError(error));
      setPhase("error");
      toast.error("Could not leave the current call. Try again.");
    } finally {
      transitioningRef.current = false;
    }
  }, [restartSearch]);

  const handlePeerLeft = useCallback(async (peerId) => {
    if (transitioningRef.current || leavingPageRef.current) {return;}
    transitioningRef.current = true;
    if (peerId) {previousPeerIdRef.current = String(peerId);}
    try {
      await cleanupCurrentCall();
      setPhase("peer-left");
    } catch (error) {
      logRandomCall("peer-left-cleanup-error", describeRandomCallError(error));
      setPhase("error");
      toast.error("Could not clean up the disconnected call.");
    } finally {
      transitioningRef.current = false;
    }
  }, [cleanupCurrentCall]);

  useEffect(() => {
    serverPeerLeftRef.current = (peerId, callId) => {
      if (currentCallRef.current?.callId === callId) {
        void handlePeerLeft(peerId);
      }
    };
    return () => {serverPeerLeftRef.current = null;};
  }, [handlePeerLeft]);

  const handlePeerJoinTimeout = useCallback(async () => {
    if (transitioningRef.current || leavingPageRef.current) {return;}
    transitioningRef.current = true;
    const peerId = currentCallRef.current?.peerId;
    try {
      toast.error("Stranger could not connect. Finding another user...");
      await restartSearch({ peerId });
    } catch (error) {
      logRandomCall("peer-timeout-cleanup-error", describeRandomCallError(error));
      setPhase("error");
      toast.error("Could not restart matchmaking. Try again.");
    } finally {
      transitioningRef.current = false;
    }
  }, [restartSearch]);

  const handleConnectionFailure = useCallback(({ connected, peerId }) => {
    if (connected) {
      void handlePeerLeft(peerId);
    } else {
      void handlePeerJoinTimeout();
    }
  }, [handlePeerJoinTimeout, handlePeerLeft]);

  const handleFindNext = useCallback(async () => {
    if (transitioningRef.current || leavingPageRef.current) {return;}
    transitioningRef.current = true;
    try {
      await restartSearch({ peerId: previousPeerIdRef.current });
    } catch (error) {
      logRandomCall("find-next-error", describeRandomCallError(error));
      setPhase("error");
      toast.error("Could not restart matchmaking. Try again.");
    } finally {
      transitioningRef.current = false;
    }
  }, [restartSearch]);

  const handleLeaveCall = useCallback(async () => {
    if (leavingPageRef.current) {return;}
    leavingPageRef.current = true;
    lifecycleRef.current += 1;
    clearTimeout(retryTimerRef.current);
    try {
      await cleanupCurrentCall();
      onLeave?.();
    } catch (error) {
      leavingPageRef.current = false;
      logRandomCall("leave-page-error", describeRandomCallError(error));
      setPhase("error");
      toast.error("Could not leave the random call. Try again.");
    }
  }, [cleanupCurrentCall, onLeave]);

  useEffect(() => () => {
    lifecycleRef.current += 1;
    clearTimeout(retryTimerRef.current);
    if (leavingPageRef.current) {return;}
    const activeCall = currentCallRef.current;
    void leaveRandomMatch(
      activeSessionIdRef.current,
      activeCall?.callId ?? null,
    ).catch((error) => {
      logRandomCall("match-leave-unmount-error", describeRandomCallError(error));
    });
  }, []);

  return {
    call,
    handleConnectionFailure,
    handleFindNext,
    handleLeaveCall,
    handleNext,
    isLoading: !authUser,
    isSocketConnected: isConnected,
    phase,
    socket,
  };
};

export default useRandomCall;
