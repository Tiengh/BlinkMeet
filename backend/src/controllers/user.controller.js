import User from "../models/user.model.js";
import FriendRequest from "../models/friendRequest.model.js";

export async function getRecommendedUsers(req, res) {
  try {
    const currentUserId = req.user._id;
    const currentUser = req.user;

    const recommendedUsers = await User.aggregate([
      {
        $match: {
          _id: { $ne: currentUserId, $nin: currentUser.user_friends },
          user_isOnboarded: true,
        },
      },
      {
        $sample: { size: 20 },
      },
    ]);

    res.status(200).json(recommendedUsers);
  } catch (error) {
    console.log("Error in getRecommendedUsers controller: ", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getUserFriends(req, res) {
  try {
    const user = await User.findById(req.user._id)
      .select("user_friends")
      .populate(
        "user_friends",
        "user_name user_profilePic user_nativeLanguage user_learningLanguage"
      );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Trả về danh sách bạn bè đã populate sẵn
    res.status(200).json(user.user_friends);
  } catch (error) {
    console.error("Error in getUserFriends controller:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function sendFriendRequest(req, res) {
  try {
    const SendUserId = req.user._id;
    const ReceivedUserId = req.params.id;

    if (SendUserId.equals(ReceivedUserId)) {
      return res
        .status(400)
        .json({ message: "You can't send a friend request to yourself" });
    }

    const recipient = await User.findById(ReceivedUserId);
    if (!recipient) {
      return res.status(400).json({ message: "Recipient not found" });
    }

    if (recipient.user_friends.includes(SendUserId)) {
      return res
        .status(400)
        .json({ message: "You are already friends with this user" });
    }

    const existingRequest = await FriendRequest.findOne({
      sender: SendUserId,
      recipient: ReceivedUserId,
    });

    if (existingRequest) {
      return res
        .status(400)
        .json({ message: "A friend request already exists" });
    }

    const friendRequest = await FriendRequest.create({
      sender: SendUserId,
      recipient: ReceivedUserId,
    });

    return res.status(200).json(friendRequest);
  } catch (error) {
    console.log("Error in sendFriendRequest controller: ", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function acceptFriendRequest(req, res) {
  try {
    const requestId = req.params.id;
    const currentUserId = req.user._id;

    const friendRequest = await FriendRequest.findById(requestId);
    if (!friendRequest) {
      return res.status(404).json({ message: "Friend request not found" });
    }

    if (!friendRequest.recipient.equals(currentUserId)) {
      return res
        .status(403)
        .json({ message: "You are not authorized to accept this request" });
    }

    friendRequest.status = "accepted";
    await friendRequest.save();

    await User.findByIdAndUpdate(friendRequest.sender, {
      $addToSet: { user_friends: friendRequest.recipient },
    });

    await User.findByIdAndUpdate(friendRequest.recipient, {
      $addToSet: { user_friends: friendRequest.sender },
    });

    res.status(200).json({ message: "Friend request accepted" });
  } catch (error) {
    console.log("Error in acceptFriendRequest controller: ", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function declineFriendRequest(req, res) {
  try {
    const requestId = req.params.id;
    const currentUserId = req.user._id;

    const friendRequest = await FriendRequest.findById(requestId);
    if (!friendRequest) {
      return res.status(404).json({ message: "Friend request not found" });
    }

    if (!friendRequest.recipient.equals(currentUserId)) {
      return res
        .status(403)
        .json({ message: "You are not authorized to decline this request" });
    }

    await FriendRequest.findByIdAndDelete(requestId);

    return res.status(200).json({ message: "Friend request declined" });
  } catch (error) {
    console.log("Error in declineFriendRequest controller:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function getFriendRequests(req, res) {
  try {
    const incomingReqs = await FriendRequest.find({
      recipient: req.user._id,
      status: "pending",
    }).populate(
      "sender",
      "user_name user_profilePic user_nativeLanguage user_learningLanguage"
    );

    const acceptedReqs = await FriendRequest.find({
      sender: req.user._id,
      status: "accepted",
    }).populate("recipient", "user_name user_profilePic user_nativeLanguage");

    res.status(200).json({ incomingReqs, acceptedReqs });
  } catch (error) {
    console.log("Error in getPendingFriendRequests controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function getOutgoingFriendRequests(req, res) {
  try {
    const currentUserId = req.user._id;

    const friendRequests = await FriendRequest.find({
      sender: currentUserId,
      status: "pending",
    }).populate(
      "recipient",
      "user_name user_profilePic user_nativeLanguage user_learningLanguage user_location"
    );

    return res.status(200).json(friendRequests);
  } catch (error) {
    console.log(
      "Error in getOutgoingFriendRequests controller:",
      error.message
    );
    return res.status(500).json({ message: "Internal server error" });
  }
}
