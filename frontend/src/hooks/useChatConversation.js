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
  const loadRequestRef = useRef(0);
  const peerTypingTimerRef = useRef(null);
  const targetUserIdRef = useRef(String(targetUserId || ""));
  const typingTimerRef = useRef(null);
  const typingStateRef = useRef(false);
  const wasConnectedRef = useRef(isConnected);

  targetUserIdRef.current = String(targetUserId || "");

  const markSeen = useCallback((conversationId) => {
    if (!socket?.connected || !conversationId) {return;}
    void emitWithAck(socket, "chat:seen", { conversationId }).catch((seenError) => {
      console.error("Could not mark conversation as seen:", seenError);
    });
  }, [socket]);

  const loadConversation = useCallback(async () => {
    const requestedTargetId = String(targetUserId || "");
    if (!requestedTargetId) {
      setIsLoading(false);
      return;
    }

    const requestId = ++loadRequestRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getConversationMessages(requestedTargetId);
      if (
        requestId !== loadRequestRef.current ||
        targetUserIdRef.current !== requestedTargetId
      ) {
        return;
      }

      setConversation(data.conversation);
      conversationRef.current = String(data.conversation._id);
      setTargetUser(data.targetUser);
      setMessages((data.messages || []).map(normalizeMessage));
      setNextCursor(data.nextCursor);
      markSeen(data.conversation._id);
    } catch (loadError) {
      if (
        requestId === loadRequestRef.current &&
        targetUserIdRef.current === requestedTargetId
      ) {
        setError(loadError);
      }
    } finally {
      if (
        requestId === loadRequestRef.current &&
        targetUserIdRef.current === requestedTargetId
      ) {
        setIsLoading(false);
      }
    }
  }, [markSeen, targetUserId]);

  const syncConversation = useCallback(async () => {
    const requestedTargetId = String(targetUserId || "");
    const activeConversationId = conversationRef.current;
    if (!requestedTargetId || !activeConversationId) {return;}

    try {
      const data = await getConversationMessages(requestedTargetId);
      if (
        targetUserIdRef.current !== requestedTargetId ||
        String(data.conversation?._id) !== activeConversationId
      ) {
        return;
      }

      setMessages((current) => mergeMessages(current, data.messages || []));
      markSeen(activeConversationId);
    } catch (syncError) {
      console.error("Could not sync conversation after reconnect:", syncError);
    }
  }, [markSeen, targetUserId]);

  useEffect(() => {
    loadRequestRef.current += 1;
    conversationRef.current = null;
    clearTimeout(peerTypingTimerRef.current);
    clearTimeout(typingTimerRef.current);
    typingStateRef.current = false;
    setConversation(null);
    setTargetUser(null);
    setMessages([]);
    setNextCursor(null);
    setIsLoading(true);
    setIsLoadingOlder(false);
    setIsPeerTyping(false);
    setError(null);
  }, [targetUserId]);

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
        markSeen(message.conversation);
      }
    };
    const handleStatus = ({ messageIds = [], status }) => {
      const changedIds = new Set(messageIds.map(String));
      const statusRank = { sent: 0, delivered: 1, seen: 2 };
      if (statusRank[status] === undefined) {return;}

      setMessages((current) => current.map((message) => {
        if (!changedIds.has(String(message._id))) {return message;}
        return statusRank[status] > (statusRank[message.status] ?? -1)
          ? { ...message, status }
          : message;
      }));
    };
    const handleTyping = ({ userId, isTyping }) => {
      if (String(userId) !== String(targetUserId)) {return;}
      clearTimeout(peerTypingTimerRef.current);
      setIsPeerTyping(isTyping === true);
      if (isTyping === true) {
        peerTypingTimerRef.current = setTimeout(() => {
          setIsPeerTyping(false);
        }, 2500);
      }
    };

    socket.on("chat:message", handleMessage);
    socket.on("chat:status", handleStatus);
    socket.on("chat:typing", handleTyping);
    if (socket.connected) {markSeen(conversationRef.current);}
    return () => {
      socket.off("chat:message", handleMessage);
      socket.off("chat:status", handleStatus);
      socket.off("chat:typing", handleTyping);
      clearTimeout(peerTypingTimerRef.current);
      setIsPeerTyping(false);
    };
  }, [currentUserId, markSeen, socket, targetUserId]);

  useEffect(() => {
    const wasConnected = wasConnectedRef.current;
    wasConnectedRef.current = isConnected;

    if (!isConnected) {
      clearTimeout(peerTypingTimerRef.current);
      setIsPeerTyping(false);
      return;
    }
    if (!wasConnected && conversationRef.current) {
      void syncConversation();
    }
  }, [isConnected, syncConversation]);

  useEffect(() => () => {
    clearTimeout(typingTimerRef.current);
    clearTimeout(peerTypingTimerRef.current);
    if (typingStateRef.current && socket?.connected && targetUserId) {
      socket.emit("chat:typing", {
        recipientId: targetUserId,
        isTyping: false,
      });
    }
    typingStateRef.current = false;
  }, [socket, targetUserId]);

  const send = useCallback(async (content, clientMessageId = null) => {
    if (!socket?.connected) {throw new Error("Realtime connection is offline");}
    const stableClientMessageId = clientMessageId || makeClientMessageId();
    setIsSending(true);
    try {
      const response = await emitWithAck(socket, "chat:send", {
        recipientId: targetUserId,
        content,
        clientMessageId: stableClientMessageId,
      });
      setMessages((current) => mergeMessages(current, [response.message]));
      return response.message;
    } catch (sendError) {
      const normalizedError = sendError instanceof Error
        ? sendError
        : new Error("Could not send message");
      normalizedError.clientMessageId = stableClientMessageId;
      throw normalizedError;
    } finally {
      setIsSending(false);
    }
  }, [socket, targetUserId]);

  const setTyping = useCallback((isTyping) => {
    if (!socket?.connected || !targetUserId) {return;}
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
    const requestedTargetId = String(targetUserId || "");
    const requestedCursor = nextCursor;
    if (!requestedCursor || isLoadingOlder || !requestedTargetId) {return;}

    setIsLoadingOlder(true);
    try {
      const data = await getConversationMessages(requestedTargetId, requestedCursor);
      if (targetUserIdRef.current !== requestedTargetId) {return;}
      setMessages((current) => mergeMessages(data.messages || [], current));
      setNextCursor(data.nextCursor);
    } catch (loadError) {
      if (targetUserIdRef.current === requestedTargetId) {
        toast.error(loadError.response?.data?.message || "Could not load older messages");
      }
    } finally {
      if (targetUserIdRef.current === requestedTargetId) {
        setIsLoadingOlder(false);
      }
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
