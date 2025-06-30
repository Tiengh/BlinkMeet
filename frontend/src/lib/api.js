import { axiosInstance } from "./axios";

export const signup = async (signupData) => {
  const response = await axiosInstance.post("/auth/signup", signupData);
  return response.data;
};

export const login = async (loginData) => {
  const response = await axiosInstance.post("/auth/login", loginData);
  return response.data;
};

export const logout = async () => {
  const response = await axiosInstance.post("/auth/logout");
  return response.data;
};

export const getAuthUser = async () => {
  try {
    const res = await axiosInstance.get("/auth/me");
    return res.data;
  } catch (error) {
    console.log("Error in getAuthUser: ", error);
    return null;
  }
};

export const completeOnboarding = async (userData) => {
  const res = await axiosInstance.post("/auth/onboarding", userData);
  return res.data;
};

export const getUserFriends = async () => {
  const response = await axiosInstance.get("/user/friends");
  console.log(response.data);
  return response.data;
};

export const getRecommendedUsers = async () => {
  const response = await axiosInstance.get("/user");
  console.log("Recommend: ", response.data);
  return response.data;
};

export const getOutgoingFriendReqs = async () => {
  const response = await axiosInstance.get("/user/outgoing-friend-requests");
  console.log("OutGoingFR!: ", response.data);
  return response.data;
};

export const sendFriendRequest = async (userId) => {
  const response = await axiosInstance.post(`/user/friend-request/${userId}`);
  console.log("FriendReqSent: ", response.data);
  return response.data;
};

export const getFriendRequests = async () => {
  const response = await axiosInstance.get(`/user/friend-requests`);
  console.log("getFriendRequest: ",response.data)
  return response.data;
};

export const acceptFriendRequest = async (requestId) => {
  const response = await axiosInstance.post(
    `/user/friend-request/${requestId}/accept`
  );
  return response.data;
};
