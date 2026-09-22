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
  const requestedUserIdsRef = useRef(null);

  const applyStatuses = useCallback((statuses) => {
    setPresenceStatuses((current) => ({ ...current, ...statuses }));
  }, []);

  const subscribePresence = useCallback(async (userIds = null) => {
    requestedUserIdsRef.current = userIds?.map(String) || null;
    const socket = socketRef.current;
    if (!socket?.connected) {return;}

    const response = await emitWithAck(socket, "presence:subscribe", {
      userIds: requestedUserIdsRef.current || undefined,
    });
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
    const handlePresenceChanged = ({ userId: changedUserId, status }) => {
      if (!changedUserId || !status) {return;}
      applyStatuses({
        [String(changedUserId)]: { status },
      });
    };

    socket.on("connect", handleConnect);
    socket.on("presence:changed", handlePresenceChanged);
    socket.connect();

    return () => {
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
