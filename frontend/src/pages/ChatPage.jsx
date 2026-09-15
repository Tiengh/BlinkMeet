import React, {
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router";

import useAuthUser from "../hooks/useAuthUser";

import {
  useQuery,
} from "@tanstack/react-query";

import {
  getStreamToken,
} from "../lib/api";

import toast from "react-hot-toast";

import ChatLoader from "../components/ChatLoader";

import {
  ArrowLeftIcon,
  RefreshCcwIcon,
} from "lucide-react";

import {
  Channel,
  ChannelHeader,
  Chat,
  MessageInput,
  MessageList,
  Thread,
  Window,
} from "stream-chat-react";

import {
  StreamChat,
} from "stream-chat";

import CallButton from "../components/CallButton";

const STREAM_API_KEY =
  import.meta.env.VITE_STREAM_API_KEY;

const ChatPage = () => {
  const {
    id: targetUserId,
  } = useParams();

  const navigate =
    useNavigate();

  const {
    authUser,
  } = useAuthUser();

  const [
    chatClient,
    setChatClient,
  ] = useState(null);

  const [
    channel,
    setChannel,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState(null);

  const {
    data: tokenData,
    refetch: refetchToken,
  } = useQuery({
    queryKey: ["streamToken"],
    queryFn: getStreamToken,
    enabled: !!authUser,
  });

  useEffect(() => {
    if (
      !tokenData?.token ||
      !authUser?._id ||
      !targetUserId ||
      !STREAM_API_KEY
    ) {
      return;
    }

    let cancelled = false;

    const client =
      StreamChat.getInstance(
        STREAM_API_KEY,
      );

    const initChat =
      async () => {
        try {
          setLoading(true);
          setError(null);

          if (!client.userID) {
            await client.connectUser(
              {
                id: String(
                  authUser._id,
                ),
                name:
                  authUser.user_name,
                image:
                  authUser.user_profilePic,
              },
              tokenData.token,
            );
          }

          if (cancelled) {
            return;
          }

          const channelId = [
            String(
              authUser._id,
            ),
            String(
              targetUserId,
            ),
          ]
            .sort()
            .join("_");

          const currentChannel =
            client.channel(
              "messaging",
              channelId,
              {
                members: [
                  String(
                    authUser._id,
                  ),
                  String(
                    targetUserId,
                  ),
                ],
              },
            );

          await currentChannel.watch();

          if (cancelled) {
            return;
          }

          setChatClient(client);
          setChannel(
            currentChannel,
          );
        } catch (error) {
          if (cancelled) {
            return;
          }

          console.error(
            "Error initializing chat:",
            error,
          );

          setError(error);

          toast.error(
            "Could not connect to chat.",
          );
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      };

    initChat();

    return () => {
      cancelled = true;
    };
  }, [
    tokenData?.token,
    authUser?._id,
    authUser?.user_name,
    authUser?.user_profilePic,
    targetUserId,
  ]);

  const handleVideoCall =
    async () => {
      if (!channel) {
        return;
      }

      try {
        const callUrl =
          `${window.location.origin}/call/${channel.id}`;

        await channel.sendMessage({
          text:
            `I've started a video call. Join here: ${callUrl}`,
        });

        toast.success(
          "Video call link sent successfully!",
        );
      } catch (error) {
        console.error(
          "Error sending video call link:",
          error,
        );

        toast.error(
          "Could not send video call link.",
        );
      }
    };

  const handleRetry =
    async () => {
      setError(null);
      setLoading(true);

      try {
        await refetchToken();
      } catch (error) {
        console.error(
          "Retry failed:",
          error,
        );

        setLoading(false);
      }
    };

  if (loading) {
    return <ChatLoader />;
  }

  if (
    error ||
    !chatClient ||
    !channel
  ) {
    return (
      <div className="h-[calc(100dvh-4rem)] overflow-hidden flex items-center justify-center">
        <div className="text-center space-y-5">
          <h2 className="text-xl font-semibold">
            Could not connect
            to chat
          </h2>

          <p className="text-sm opacity-70">
            Please try again.
          </p>

          <div className="flex gap-3 justify-center">
            <button
              className="btn btn-ghost"
              onClick={() =>
                navigate("/")
              }
            >
              <ArrowLeftIcon className="w-4 h-4" />

              Back
            </button>

            <button
              className="btn btn-primary"
              onClick={
                handleRetry
              }
            >
              <RefreshCcwIcon className="w-4 h-4" />

              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-4rem)] overflow-hidden flex flex-col">
      <div className="h-14 shrink-0 flex items-center gap-3 px-4 border-b border-base-300 bg-base-100">
        <button
          className="btn btn-ghost btn-circle"
          onClick={() =>
            navigate("/")
          }
          aria-label="Back"
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </button>

        <span className="font-semibold">
          Chat
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <Chat
          client={chatClient}
        >
          <Channel
            channel={channel}
          >
            <div className="w-full h-full relative">
              <CallButton
                handleVideoCall={
                  handleVideoCall
                }
              />

              <Window>
                <ChannelHeader />

                <MessageList />

                <MessageInput
                  focus
                />
              </Window>
            </div>

            <Thread />
          </Channel>
        </Chat>
      </div>
    </div>
  );
};

export default ChatPage;
