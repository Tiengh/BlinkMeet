import { useEffect, useMemo } from "react";
import useRealtime from "./useRealtime.js";

const usePresenceSubscription = (users) => {
  const { subscribePresence } = useRealtime();
  const userIdsKey = useMemo(
    () => users.map((user) => String(user._id)).sort().join(","),
    [users],
  );

  useEffect(() => {
    const userIds = userIdsKey ? userIdsKey.split(",") : [];
    void subscribePresence(userIds).catch((error) => {
      console.error("Could not refresh friend presence:", error);
    });

    return () => {
      void subscribePresence([]).catch((error) => {
        console.error("Could not clear friend presence subscription:", error);
      });
    };
  }, [subscribePresence, userIdsKey]);
};

export default usePresenceSubscription;
