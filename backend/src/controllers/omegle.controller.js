let waitingQueue = [];

export const getRandomCall = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const callId = `omegle-${Date.now()}`;

    // Nếu có người đang chờ → ghép luôn
    if (waitingQueue.length > 0) {
      const peer = waitingQueue.shift(); // { userId, callId }

      return res.status(200).json({
        callId: peer.callId, // join phòng của người kia
        isHost: false,
      });
    }

    // Không có ai → thêm vào hàng chờ
    waitingQueue.push({ userId, callId });

    return res.status(200).json({
      callId, // tạo phòng trước
      isHost: true,
    });
  } catch (error) {
    console.error("getRandomCall error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
