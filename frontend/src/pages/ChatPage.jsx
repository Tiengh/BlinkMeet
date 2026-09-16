import React from "react";
import toast from "react-hot-toast";

import {
  useNavigate,
  useParams,
} from "react-router";

import useAuthUser from "../hooks/useAuthUser";

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

import CallButton from "../components/CallButton";
import useStreamChat from "../hooks/useStreamChat";

const ChatPage = () => {
  const {
    id: targetUserId,
  } = useParams();

  const navigate =
    useNavigate();

  const {
    authUser,
  } = useAuthUser();

  const {
    client: chatClient,
    channel,
    error,
    isLoading: loading,
    retry: retryChat,
  } = useStreamChat({ authUser, targetUserId });

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

  const handleRetry = () => {
    retryChat();
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
