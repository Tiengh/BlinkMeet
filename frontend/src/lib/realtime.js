import { io } from "socket.io-client";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5001/api";
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || API_URL.replace(/\/api\/?$/, "");

export const createRealtimeSocket = () => io(SOCKET_URL, {
  autoConnect: false,
  withCredentials: true,
  transports: ["websocket"],
  reconnection: true,
});

export const emitWithAck = (socket, event, payload, timeout = 5_000) =>
  new Promise((resolve, reject) => {
    socket.timeout(timeout).emit(event, payload, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || `${event} was rejected`));
        return;
      }
      resolve(response);
    });
  });
