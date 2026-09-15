import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useQuery } from "@tanstack/react-query";

import {
  StreamVideoClient,
} from "@stream-io/video-react-sdk";

import toast from "react-hot-toast";

import {
  getRandomMatchStatus,
  getStreamToken,
  leaveRandomMatch,
  startRandomSearch,
} from "../lib/api";

import {
  enableAvailableMedia,
  isSfuConnectionError,
} from "../lib/streamVideo";

const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY;

const POLLING_INTERVAL = 1000;
const SFU_RETRY_DELAY = 1500;

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

  const retryTimerRef = useRef(null);

  const {
    data: tokenData,
    isLoading: isTokenLoading,
  } = useQuery({
    queryKey: ["streamToken"],
    queryFn: getStreamToken,
    enabled: !!authUser,
  });

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

    setVideoClient(client);

    return () => {
      client.disconnectUser().catch(console.error);
    };
  }, [
    authUser?._id,
    authUser?.user_name,
    authUser?.user_profilePic,
    tokenData?.token,
  ]);

  const cleanupCurrentCall = useCallback(async () => {
    const activeCall = currentCallRef.current;

    currentCallRef.current = null;
    currentPeerIdRef.current = null;

    setCall(null);

    if (activeCall) {
      try {
        await activeCall.leave();
      } catch (error) {
        console.error(
          "Failed to leave call:",
          error,
        );
      }
    }

    try {
      await leaveRandomMatch();
    } catch (error) {
      console.error(
        "Failed to leave matchmaking:",
        error,
      );
    }
  }, []);

  const restartSearch = useCallback(
    async ({
      peerId = null,
      delay = 0,
    } = {}) => {
      if (peerId) {
        previousPeerIdRef.current = String(peerId);
      }

      await cleanupCurrentCall();

      setPhase("searching");

      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }

      retryTimerRef.current = setTimeout(() => {
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

    const joinMatchedCall = async (matchData) => {
      if (
        cancelled ||
        joiningRef.current ||
        leavingPageRef.current
      ) {
        return;
      }

      if (
        !matchData?.callId ||
        !matchData?.peerId
      ) {
        return;
      }

      joiningRef.current = true;

      let nextCall = null;

      try {
        setPhase("joining");

        nextCall = videoClient.call(
          "default",
          matchData.callId,
        );

        await Promise.allSettled([
          nextCall.camera.disable(),
          nextCall.microphone.disable(),
        ]);

        await nextCall.join({
          create: true,
          maxJoinRetries: 1,
        });

        if (
          cancelled ||
          leavingPageRef.current
        ) {
          await nextCall.leave().catch(console.error);
          return;
        }

        currentCallRef.current = nextCall;
        currentPeerIdRef.current = String(
          matchData.peerId,
        );

        setCall(nextCall);
        setPhase("in-call");

        await enableAvailableMedia(nextCall);
      } catch (error) {
        if (
          cancelled ||
          leavingPageRef.current
        ) {
          return;
        }

        console.error(
          "Failed to join random call:",
          error,
        );

        if (nextCall) {
          await nextCall.leave().catch(console.error);
        }

        currentCallRef.current = null;
        currentPeerIdRef.current = null;

        setCall(null);

        await leaveRandomMatch().catch(console.error);

        if (isSfuConnectionError(error)) {
          toast.error(
            "Video server connection failed. Retrying...",
          );

          setPhase("searching");

          retryTimerRef.current = setTimeout(() => {
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
        const statusData = await getRandomMatchStatus();

        if (
          cancelled ||
          leavingPageRef.current
        ) {
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

        console.error(
          "Match status polling failed:",
          error,
        );

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

        const searchData = await startRandomSearch(
          previousPeerIdRef.current,
        );

        if (
          cancelled ||
          leavingPageRef.current
        ) {
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

        console.error(
          "Random search failed:",
          error,
        );

        setPhase("error");

        toast.error(
          "Could not search for a stranger.",
        );
      }
    };

    beginSearch();

    return () => {
      cancelled = true;

      if (pollTimer) {
        clearTimeout(pollTimer);
      }
    };
  }, [
    videoClient,
    searchVersion,
  ]);

  const handleNext = useCallback(
    async (peerId) => {
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
    if (leavingPageRef.current) {
      return;
    }

    setPhase("searching");

    setSearchVersion((version) => version + 1);
  }, []);

  const handleLeaveCall = useCallback(
    async (error) => {
      if (leavingPageRef.current) {
        return;
      }

      leavingPageRef.current = true;

      if (error) {
        console.error(
          "Stream leave call error:",
          error,
        );
      }

      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      currentCallRef.current = null;
      currentPeerIdRef.current = null;

      setCall(null);

      try {
        await leaveRandomMatch();
      } catch (leaveError) {
        console.error(
          "Failed to clear matchmaking:",
          leaveError,
        );
      }

      onLeave?.();
    },
    [onLeave],
  );

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }

      if (leavingPageRef.current) {
        return;
      }

      const activeCall = currentCallRef.current;

      if (activeCall) {
        activeCall.leave().catch(console.error);
      }

      leaveRandomMatch().catch(console.error);
    };
  }, []);

  const isLoading =
    !authUser ||
    isTokenLoading ||
    !tokenData?.token ||
    !videoClient;

  return {
    videoClient,
    call,
    phase,
    isLoading,

    handleNext,
    handlePeerLeft,
    handlePeerJoinTimeout,
    handleFindNext,
    handleLeaveCall,
  };
};

export default useRandomCall;
