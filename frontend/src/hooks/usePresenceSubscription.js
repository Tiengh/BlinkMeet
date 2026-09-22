import { useEffect, useMemo } from "react";
import useRealtime from "./useRealtime.js";

const usePresenceSubscription = (users) => {
  const { subscribePresence } = useRealtime();
  const userIdsKey = useMemo(
    () => users.map((user) => String(user._id)).sort().join(","),
    [users],
  );

  useEffect(() => {
    if (!userIdsKey) {return;}
    void subscribePresence(userIdsKey.split(",")).catch((error) => {
      console.error("Could not refresh friend presence:", error);
    });
  }, [subscribePresence, userIdsKey]);
};

export default usePresenceSubscription;
