import { axiosIntance } from "./axios";

export const signup = async (signupData) => {
  const response = await axiosIntance.post("/auth/signup", signupData);
  return response.data;
};
