import { createContext } from "react";

const RealtimeContext = createContext({
  presenceStatuses: {},
  subscribePresence: async () => {},
});

export default RealtimeContext;
