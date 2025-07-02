// stream.js
import { StreamChat } from "stream-chat";
import "dotenv/config";

let streamClient;

export const initStreamClient = () => {
  const apiKey = process.env.STREAM_API_KEY;
  const apiSecret = process.env.STREAM_API_SECRET;

  if (!apiKey || !apiSecret) {
    console.error("❌ Stream API key or Secret is missing");
    return null;
  }

  streamClient = StreamChat.getInstance(apiKey, apiSecret);
  return streamClient;
};

export const upsertStreamUser = async (userData) => {
  if (!streamClient) initStreamClient();

  try {
    await streamClient.upsertUser(userData);
    return userData;
  } catch (error) {
    console.log("❌ Error creating Stream user:", error);
  }
};

export const generateStreamToken = (userId) => {
  if (!streamClient) initStreamClient();

  try {
    const userIdStr = userId.toString();
    return streamClient.createToken(userIdStr);
  } catch (error) {
    console.log("❌ Error generating token:", error.message);
    return null;
  }
};
