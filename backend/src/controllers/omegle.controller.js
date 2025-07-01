let waitingUser = null;
let waitingCallId = null;
let waitingResponse = null;

export const getRandomCall = async (req, res) => {
  try {
    const userId = req.user._id.toString();

    // Nếu đã có người chờ và không phải chính mình
    if (waitingUser && waitingUser !== userId) {
      const callId = waitingCallId;

      // Gửi callId cho người đang chờ
      if (waitingResponse) {
        waitingResponse.status(200).json({ callId, isHost: true });
      }

      // Gửi callId cho người vừa vào
      waitingUser = null;
      waitingCallId = null;
      waitingResponse = null;

      return res.status(200).json({ callId, isHost: false });
    }

    // Nếu chưa ai chờ → lưu thông tin và chờ tiếp
    waitingUser = userId;
    waitingCallId = `omegle-${Date.now()}`;
    waitingResponse = res;

    // Tạm chưa trả về gì – giữ `res` lại để người kia đến sẽ dùng
    // Nhưng cần đặt timeout tránh treo mãi:
    setTimeout(() => {
      if (res === waitingResponse) {
        res.status(408).json({ message: "No match found. Try again." });
        waitingUser = null;
        waitingCallId = null;
        waitingResponse = null;
      }
    }, 15000); // timeout 15s
  } catch (error) {
    console.log("Error in getRandomCall controller:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};