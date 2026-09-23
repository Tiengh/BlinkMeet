import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import toast from "react-hot-toast";
import { getConversationMessages } from "../lib/api.js";
import { emitWithAck } from "../lib/realtime.js";
import useRealtime from "./useRealtime.js";

const normalizeMessage = (message) => ({
  ...message,
  _id: String(message._id),
  conversation: String(message.conversation),
  sender: String(message.sender),
  recipient: String(message.recipient),
});

const mergeMessages = (current, incoming) => {
  const byId = new Map(current.map((message) => [String(message._id), message]));
  incoming.forEach((message) => {
    const normalized = normalizeMessage(message);
    byId.set(normalized._id, { ...byId.get(normalized._id), ...normalized });
  });
  return [...byId.values()].sort((a, b) =>
    new Date(a.createdAt) - new Date(b.createdAt));
};

const makeClientMessageId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const useChatConversation = ({ currentUserId, targetUserId }) => {
  const { isConnected, socket } = useRealtime();
  const [conversation, setConversation] = useState(null);
  const [targetUser, setTargetUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const [error, setError] = useState(null);
  const conversationRef = useRef(null);
  const typingTimerRef = useRef(null);
  const typingStateRef = useRef(false);

  const markSeen = useCallback((conversationId) => {
    if (!socket?.connected || !conversationId) {return;}
    void emitWithAck(socket, "chat:seen", { conversationId }).catch((seenError) => {
      console.error("Could not mark conversation as seen:", seenError);
    });
  }, [socket]);

  const loadConversation = useCallback(async () => {
    if (!targetUserId) {return;}
    setIsLoading(true);
    setError(null);
    try {
      const data = await getConversationMessages(targetUserId);
      setConversation(data.conversation);
      conversationRef.current = String(data.conversation._id);
      setTargetUser(data.targetUser);
      setMessages((data.messages || []).map(normalizeMessage));
      setNextCursor(data.nextCursor);
      markSeen(data.conversation._id);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setIsLoading(false);
    }
  }, [markSeen, targetUserId]);

  useEffect(() => {
    void loadConversation();
  }, [loadConversation]);

  useEffect(() => {
    if (!socket) {return;}

    const handleMessage = (incoming) => {
      const message = normalizeMessage(incoming);
      const belongsToPeer =
        [message.sender, message.recipient].includes(String(currentUserId)) &&
        [message.sender, message.recipient].includes(String(targetUserId));
      if (!belongsToPeer) {return;}
      setMessages((current) => mergeMessages(current, [message]));

      if (message.recipient === String(currentUserId)) {
        void emitWithAck(socket, "chat:delivered", {
          messageId: message._id,
        }).catch((deliveryError) => {
          console.error("Could not mark message as delivered:", deliveryError);
        });
        markSeen(message.conversation);
      }
    };
    const handleStatus = ({ messageIds = [], status }) => {
      const changedIds = new Set(messageIds.map(String));
      const statusRank = { sent: 0, delivered: 1, seen: 2 };
      setMessages((current) => current.map((message) => {
        if (!changedIds.has(String(message._id))) {return message;}
        return statusRank[status] > statusRank[message.status]
          ? { ...message, status }
          : message;
      }));
    };
    const handleTyping = ({ userId, isTyping }) => {
      if (String(userId) === String(targetUserId)) {setIsPeerTyping(isTyping);}
    };

    socket.on("chat:message", handleMessage);
    socket.on("chat:status", handleStatus);
    socket.on("chat:typing", handleTyping);
    if (socket.connected) {markSeen(conversationRef.current);}
    return () => {
      socket.off("chat:message", handleMessage);
      socket.off("chat:status", handleStatus);
      socket.off("chat:typing", handleTyping);
    };
  }, [currentUserId, isConnected, markSeen, socket, targetUserId]);

  useEffect(() => () => clearTimeout(typingTimerRef.current), []);

  const send = useCallback(async (content) => {
    if (!socket?.connected) {throw new Error("Realtime connection is offline");}
    setIsSending(true);
    try {
      const response = await emitWithAck(socket, "chat:send", {
        recipientId: targetUserId,
        content,
        clientMessageId: makeClientMessageId(),
      });
      setMessages((current) => mergeMessages(current, [response.message]));
      return response.message;
    } finally {
      setIsSending(false);
    }
  }, [socket, targetUserId]);

  const setTyping = useCallback((isTyping) => {
    if (!socket?.connected) {return;}
    clearTimeout(typingTimerRef.current);
    if (typingStateRef.current !== isTyping) {
      typingStateRef.current = isTyping;
      socket.emit("chat:typing", { recipientId: targetUserId, isTyping });
    }
    if (isTyping) {
      typingTimerRef.current = setTimeout(() => {
        typingStateRef.current = false;
        socket.emit("chat:typing", { recipientId: targetUserId, isTyping: false });
      }, 1500);
    }
  }, [socket, targetUserId]);

  const loadOlder = useCallback(async () => {
    if (!nextCursor || isLoadingOlder) {return;}
    setIsLoadingOlder(true);
    try {
      const data = await getConversationMessages(targetUserId, nextCursor);
      setMessages((current) => mergeMessages(data.messages || [], current));
      setNextCursor(data.nextCursor);
    } catch (loadError) {
      toast.error(loadError.response?.data?.message || "Could not load older messages");
    } finally {
      setIsLoadingOlder(false);
    }
  }, [isLoadingOlder, nextCursor, targetUserId]);

  return {
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
    retry: loadConversation,
    send,
    setTyping,
    targetUser,
  };
};

export default useChatConversation;
