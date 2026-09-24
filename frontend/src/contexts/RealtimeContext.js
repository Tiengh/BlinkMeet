import { createContext } from "react";

const RealtimeContext = createContext({
  isConnected: false,
  presenceStatuses: {},
  socket: null,
  subscribePresence: async () => {},
});

export default RealtimeContext;
