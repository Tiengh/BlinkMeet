import {
  ArrowLeftIcon,
  CheckCheckIcon,
  CheckIcon,
  RefreshCcwIcon,
  SendIcon,
  VideoIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate, useParams } from "react-router";
import ChatLoader from "../components/ChatLoader.jsx";
import useAuthUser from "../hooks/useAuthUser.js";
import useChatConversation from "../hooks/useChatConversation.js";

const MessageStatus = ({ status }) => {
  if (status === "seen") {
    return <CheckCheckIcon className="size-3.5 text-info" aria-label="Seen" />;
  }
  if (status === "delivered") {
    return <CheckCheckIcon className="size-3.5" aria-label="Delivered" />;
  }
  return <CheckIcon className="size-3.5" aria-label="Sent" />;
};

const ChatPage = () => {
  const { id: targetUserId } = useParams();
  const navigate = useNavigate();
  const { authUser } = useAuthUser();
  const [draft, setDraft] = useState("");
  const bottomRef = useRef(null);
  const {
    conversation,
    error,
    isConnected,
    isLoading,
    isLoadingOlder,
    isPeerTyping,
    isSending,
    loadOlder,
    messages,
    nextCursor,
    retry,
    send,
    setTyping,
    targetUser,
  } = useChatConversation({ currentUserId: authUser?._id, targetUserId });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isPeerTyping]);

  const submitMessage = async (event) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || isSending) {return;}
    setDraft("");
    setTyping(false);
    try {
      await send(content);
    } catch (sendError) {
      setDraft(content);
      toast.error(sendError.message || "Could not send message");
    }
  };

  const handleVideoCall = async () => {
    if (!conversation) {return;}
    const callUrl = `${window.location.origin}/call/${conversation._id}`;
    try {
      await send(`I've started a video call. Join here: ${callUrl}`);
      toast.success("Video call link sent successfully!");
    } catch (sendError) {
      toast.error(sendError.message || "Could not send video call link");
    }
  };

  if (isLoading) {return <ChatLoader />;}

  if (error || !conversation || !targetUser) {
    return (
      <div className="h-[calc(100dvh-4rem)] flex items-center justify-center">
        <div className="text-center space-y-5">
          <h2 className="text-xl font-semibold">Could not open this chat</h2>
          <p className="text-sm opacity-70">
            {error?.response?.data?.message || "Please try again."}
          </p>
          <div className="flex gap-3 justify-center">
            <button className="btn btn-ghost" onClick={() => navigate("/")}>
              <ArrowLeftIcon className="size-4" /> Back
            </button>
            <button className="btn btn-primary" onClick={retry}>
              <RefreshCcwIcon className="size-4" /> Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-base-100">
      <header className="h-16 shrink-0 flex items-center gap-3 px-4 border-b border-base-300">
        <button
          className="btn btn-ghost btn-circle"
          onClick={() => navigate("/")}
          aria-label="Back"
        >
          <ArrowLeftIcon className="size-5" />
        </button>
        <div className="avatar">
          <div className="size-10 rounded-full">
            <img src={targetUser.user_profilePic} alt={targetUser.user_name} />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate">{targetUser.user_name}</p>
          <p className={`text-xs ${isConnected ? "text-success" : "text-warning"}`}>
            {isPeerTyping ? "Typing..." : isConnected ? "Connected" : "Reconnecting..."}
          </p>
        </div>
        <button
          className="btn btn-ghost btn-circle text-success"
          onClick={handleVideoCall}
          disabled={!isConnected || isSending}
          aria-label="Start video call"
        >
          <VideoIcon className="size-5" />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-5">
        <div className="max-w-3xl mx-auto space-y-3">
          {nextCursor && (
            <div className="text-center pb-2">
              <button
                className="btn btn-ghost btn-sm"
                onClick={loadOlder}
                disabled={isLoadingOlder}
              >
                {isLoadingOlder ? "Loading..." : "Load older messages"}
              </button>
            </div>
          )}

          {messages.length === 0 && (
            <div className="text-center py-16 opacity-60">
              <p className="font-medium">No messages yet</p>
              <p className="text-sm">Say hello to {targetUser.user_name}.</p>
            </div>
          )}

          {messages.map((message) => {
            const isMine = message.sender === String(authUser?._id);
            return (
              <div
                key={message._id}
                className={`chat ${isMine ? "chat-end" : "chat-start"}`}
              >
                <div className={`chat-bubble break-words ${isMine ? "chat-bubble-primary" : ""}`}>
                  {message.content}
                </div>
                <div className="chat-footer opacity-60 flex items-center gap-1 mt-1">
                  <time>{new Date(message.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}</time>
                  {isMine && <MessageStatus status={message.status} />}
                </div>
              </div>
            );
          })}
          {isPeerTyping && (
            <div className="chat chat-start">
              <div className="chat-bubble flex gap-1 items-center">
                <span className="loading loading-dots loading-sm" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      <form className="shrink-0 border-t border-base-300 p-3" onSubmit={submitMessage}>
        <div className="max-w-3xl mx-auto flex gap-2">
          <input
            className="input input-bordered flex-1"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setTyping(Boolean(event.target.value.trim()));
            }}
            placeholder={isConnected ? "Write a message..." : "Waiting for connection..."}
            maxLength={2000}
            disabled={!isConnected}
            autoFocus
          />
          <button
            className="btn btn-primary btn-square"
            type="submit"
            disabled={!draft.trim() || !isConnected || isSending}
            aria-label="Send message"
          >
            {isSending
              ? <span className="loading loading-spinner loading-sm" />
              : <SendIcon className="size-5" />}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatPage;
