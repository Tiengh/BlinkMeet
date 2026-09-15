import React from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { logout } from "../lib/api";

export const useLogout = () => {
  const queryClient = useQueryClient();

  const {
    mutate: logoutMutation,
    isPending,
    error,
  } = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(["authUser"], null);
      queryClient.removeQueries({
        predicate: ({ queryKey }) => queryKey[0] !== "authUser",
      });
    },
  });

  return { logoutMutation, isPending, error };
};
