import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import RealtimeContext from "../contexts/RealtimeContext.js";
import { createRealtimeSocket, emitWithAck } from "../lib/realtime.js";

const RealtimeProvider = ({ userId, children }) => {
  const [presenceStatuses, setPresenceStatuses] = useState({});
  const socketRef = useRef(null);
  const requestedUserIdsRef = useRef([]);
  const subscriptionRequestRef = useRef(0);

  const applyStatuses = useCallback((statuses) => {
    setPresenceStatuses((current) => {
      let changed = false;
      const next = { ...current };

      Object.entries(statuses || {}).forEach(([statusUserId, incoming]) => {
        if (!incoming?.status) {return;}
        const normalizedUserId = String(statusUserId);
        const incomingVersion = Number(incoming.version ?? 0);
        const currentVersion = Number(current[normalizedUserId]?.version ?? -1);
        if (incomingVersion < currentVersion) {return;}

        const normalized = {
          status: incoming.status,
          version: incomingVersion,
        };
        if (
          current[normalizedUserId]?.status !== normalized.status ||
          currentVersion !== normalized.version
        ) {
          next[normalizedUserId] = normalized;
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, []);

  const subscribePresence = useCallback(async (userIds = null) => {
    const normalizedUserIds = userIds === null
      ? null
      : [...new Set(userIds.map(String))];
    requestedUserIdsRef.current = normalizedUserIds;
    const requestId = ++subscriptionRequestRef.current;
    const socket = socketRef.current;
    if (!socket?.connected) {return;}

    const response = await emitWithAck(socket, "presence:subscribe", {
      userIds: normalizedUserIds ?? undefined,
    });
    if (requestId !== subscriptionRequestRef.current) {return;}
    applyStatuses(response.statuses || {});
  }, [applyStatuses]);

  useEffect(() => {
    if (!userId) {return;}

    const socket = createRealtimeSocket();
    socketRef.current = socket;

    const handleConnect = () => {
      void subscribePresence(requestedUserIdsRef.current).catch((error) => {
        console.error("Could not subscribe to friend presence:", error);
      });
    };
    const handlePresenceChanged = ({
      userId: changedUserId,
      status,
      version,
    }) => {
      if (!changedUserId || !status) {return;}
      applyStatuses({
        [String(changedUserId)]: { status, version },
      });
    };

    socket.on("connect", handleConnect);
    socket.on("presence:changed", handlePresenceChanged);
    socket.connect();

    return () => {
      subscriptionRequestRef.current += 1;
      socket.off("connect", handleConnect);
      socket.off("presence:changed", handlePresenceChanged);
      socket.disconnect();
      if (socketRef.current === socket) {socketRef.current = null;}
    };
  }, [applyStatuses, subscribePresence, userId]);

  const value = useMemo(() => ({
    presenceStatuses,
    subscribePresence,
  }), [presenceStatuses, subscribePresence]);

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
};

export default RealtimeProvider;
