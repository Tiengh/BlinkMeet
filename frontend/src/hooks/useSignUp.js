// hooks/useSignup.js
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { signup } from "../lib/api";
import toast from "react-hot-toast";

const useSignup = () => {
  const queryClient = useQueryClient();

  const { mutate, isPending, error } = useMutation({
    mutationFn: signup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["authUser"] });
      toast.success("Tạo tài khoản thành công!");
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || "Đăng ký thất bại");
    },
  });

  return {
    signUpMutation: mutate,
    isPending,
    error,
  };
};

export default useSignup;
