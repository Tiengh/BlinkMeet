import React, { useEffect, useState } from "react";
import { useParams } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import { useQuery } from "@tanstack/react-query";
import { getStreamToken } from "../lib/api";
import toast from "react-hot-toast";
import ChatLoader from "../components/ChatLoader";
import { VideoIcon } from "lucide-react";

import {
  Channel,
  ChannelHeader,
  Chat,
  MessageInput,
  MessageList,
  Thread,
  Window,
} from "stream-chat-react";
import { StreamChat } from "stream-chat";
import CallButton from "../components/CallButton";

const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY;

const ChatPage = () => {
  const { id: targetUserId } = useParams();
  const [chatClient, setChatClient] = useState(null);
  const [channel, setChannel] = useState(null);
  const [loading, setLoading] = useState(true);

  const { authUser } = useAuthUser();

  const { data: tokenData } = useQuery({
    queryKey: ["streamToken"],
    queryFn: getStreamToken,
    enabled: !!authUser,
  });

  useEffect(() => {
    if (!tokenData?.token || !authUser?._id || !targetUserId) return;
    
    let cancelled = false;

    const client = StreamChat.getInstance(STREAM_API_KEY);

    const initChat = async () => {
      try {
        setLoading(true);
        if (!client.userID) {
          await client.connectUser(
            {
              id: authUser._id,
              name: authUser.user_name,
              image: authUser.user_profilePic,
            },
            tokenData.token
          );
        }

        const channelId = [authUser._id, targetUserId].sort().join("_");
        const currentChannel = client.channel("messaging", channelId, {
            members: [authUser._id, targetUserId],
        });

        await currentChannel.watch();

        if (cancelled) return;

        setChatClient(client);
        setChannel(currentChannel);
      } catch (error) {
        if (cancelled) return;

        console.error("Error initializing chat:", error);
        toast.error("Could not connect to Chat. Try again.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    initChat();

    // Cleanup on unmount
    return () => {
      cancelled = true;
    };
  }, [tokenData?.token, authUser?._id, targetUserId]);

  const handleVideoCall = async () => {
    if (!channel) return;
    try {
      const callUrl = `${window.location.origin}/call/${channel.id}`;
      channel.sendMessage({ text: `I've started a video call. Join here: ${callUrl}` });
      toast.success("Video call link sent successfully!");
    } catch (error) {
      console.error("Error sending video call link:", error);
      toast.error("Could not send video call link.");
    }
  };

  if (loading || !chatClient || !channel) return <ChatLoader />;

  return (
    <div className="h-[93vh]">
      <Chat client={chatClient}>
        <Channel channel={channel}>
          <div className="w-full relative">
            <CallButton handleVideoCall={handleVideoCall} />
            <Window>
              <ChannelHeader />
              <MessageList />
              <MessageInput focus />
            </Window>
          </div>
          <Thread />
        </Channel>
      </Chat>
    </div>
  );
};

export default ChatPage;
