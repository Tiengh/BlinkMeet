import { useQuery } from "@tanstack/react-query";
import { getStreamToken } from "../lib/api";

const useStreamToken = (userId) => {
  return useQuery({
    queryKey: ["streamToken", userId],
    queryFn: getStreamToken,
    enabled: Boolean(userId),
    retry: false,
  });
};

export default useStreamToken;
