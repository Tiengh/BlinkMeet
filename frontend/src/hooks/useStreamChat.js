import { useCallback, useEffect, useState } from "react";
import { StreamChat } from "stream-chat";
import toast from "react-hot-toast";
import useStreamToken from "./useStreamToken";

const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY;

const useStreamChat = ({ authUser, targetUserId }) => {
  const [client, setClient] = useState(null);
  const [channel, setChannel] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState(null);
  const [retryVersion, setRetryVersion] = useState(0);

  const {
    data: tokenData,
    isLoading: isTokenLoading,
    isError: isTokenError,
  } = useStreamToken(authUser?._id);

  useEffect(() => {
    if (!authUser?._id || !targetUserId || !tokenData?.token || !STREAM_API_KEY) {
      setIsInitializing(false);
      return undefined;
    }

    let cancelled = false;
    const chatClient = StreamChat.getInstance(STREAM_API_KEY);
    let currentChannel = null;

    const initialize = async () => {
      setIsInitializing(true);
      setError(null);

      try {
        const userId = String(authUser._id);

        if (chatClient.userID && chatClient.userID !== userId) {
          await chatClient.disconnectUser();
        }

        if (!chatClient.userID) {
          await chatClient.connectUser(
            {
              id: userId,
              name: authUser.user_name,
              image: authUser.user_profilePic,
            },
            tokenData.token,
          );
        }

        const channelId = [userId, String(targetUserId)].sort().join("_");
        currentChannel = chatClient.channel("messaging", channelId, {
          members: [userId, String(targetUserId)],
        });

        await currentChannel.watch();

        if (cancelled) {
          await currentChannel.stopWatching().catch(console.error);
          return;
        }

        setClient(chatClient);
        setChannel(currentChannel);
      } catch (initializeError) {
        if (!cancelled) {
          setError(initializeError);
          toast.error("Could not connect to chat.");
        }
      } finally {
        if (!cancelled) {
          setIsInitializing(false);
        }
      }
    };

    initialize();

    return () => {
      cancelled = true;
      setClient(null);
      setChannel(null);
      void currentChannel?.stopWatching().catch(console.error);
    };
  }, [
    authUser?._id,
    authUser?.user_name,
    authUser?.user_profilePic,
    retryVersion,
    targetUserId,
    tokenData?.token,
  ]);

  const retry = useCallback(() => {
    setRetryVersion((version) => version + 1);
  }, []);

  return {
    client,
    channel,
    error: error || (isTokenError ? new Error("Stream token unavailable") : null),
    isLoading: isTokenLoading || isInitializing,
    retry,
  };
};

export default useStreamChat;
