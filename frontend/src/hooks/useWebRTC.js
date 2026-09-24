import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { emitWithAck } from "../lib/realtime";
import {
  describeRandomCallError,
  logRandomCall,
} from "../lib/randomCallDebug";

const PEER_JOIN_TIMEOUT = 12_000;
const PEER_DISCONNECT_GRACE = 4_000;

const parseIceServers = () => {
  const configured = import.meta.env.VITE_WEBRTC_ICE_SERVERS;
  if (!configured) {return [];}
  try {
    const iceServers = JSON.parse(configured);
    return Array.isArray(iceServers) ? iceServers : [];
  } catch (error) {
    console.error("Invalid VITE_WEBRTC_ICE_SERVERS:", error);
    return [];
  }
};

const acquireLocalMedia = async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      stream: new MediaStream(),
      warning: new Error("Media devices are not supported by this browser"),
    };
  }

  const attempts = [
    { audio: true, video: true },
    { audio: true, video: false },
    { audio: false, video: true },
  ];
  let lastError = null;
  for (const constraints of attempts) {
    try {
      return {
        stream: await navigator.mediaDevices.getUserMedia(constraints),
        warning: lastError,
      };
    } catch (error) {
      lastError = error;
      if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
        break;
      }
    }
  }

  return { stream: new MediaStream(), warning: lastError };
};

const useWebRTC = ({
  call,
  isSocketConnected,
  localUserId,
  onConnectionFailure,
  socket,
}) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [connectionState, setConnectionState] = useState("idle");
  const [mediaWarning, setMediaWarning] = useState(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);

  const localStreamRef = useRef(null);
  const activeConnectionRef = useRef(null);
  const failureCallbackRef = useRef(onConnectionFailure);

  useEffect(() => {
    failureCallbackRef.current = onConnectionFailure;
  }, [onConnectionFailure]);

  useEffect(() => {
    let cancelled = false;
    void acquireLocalMedia().then(({ stream, warning }) => {
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      localStreamRef.current = stream;
      setLocalStream(stream);
      setMediaWarning(warning);
      setIsAudioEnabled(stream.getAudioTracks().some((track) => track.enabled));
      setIsVideoEnabled(stream.getVideoTracks().some((track) => track.enabled));
      setMediaReady(true);
    });

    return () => {
      cancelled = true;
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    };
  }, []);

  const closeConnection = useCallback(({ stopLocalMedia = false } = {}) => {
    activeConnectionRef.current?.close();
    activeConnectionRef.current = null;
    setRemoteStream(null);
    setConnectionState("closed");
    if (stopLocalMedia) {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
      setIsAudioEnabled(false);
      setIsVideoEnabled(false);
    }
  }, []);

  useEffect(() => {
    if (
      !call ||
      !isSocketConnected ||
      !localUserId ||
      !mediaReady ||
      !localStream ||
      !socket
    ) {
      return;
    }

    const peerConnection = new RTCPeerConnection({
      iceServers: parseIceServers(),
    });
    const incomingStream = new MediaStream();
    const pendingCandidates = [];
    let operation = Promise.resolve();
    let closed = false;
    let connected = false;
    let offerStarted = false;
    let readyEchoed = false;
    let failureHandled = false;
    let joinTimer = null;
    let disconnectTimer = null;

    const identity = {
      callId: call.callId,
      peerId: call.peerId,
      sessionId: call.sessionId,
    };
    const isInitiator = String(localUserId).localeCompare(String(call.peerId)) < 0;
    const isCurrentEvent = (event) =>
      !closed &&
      event?.callId === call.callId &&
      String(event?.fromUserId) === String(call.peerId);

    const signal = (event, payload = {}) =>
      emitWithAck(socket, event, { ...identity, ...payload });

    const reportFailure = (reason) => {
      if (closed || failureHandled) {return;}
      failureHandled = true;
      logRandomCall("webrtc-failure", { callId: call.callId, reason });
      failureCallbackRef.current?.({
        callId: call.callId,
        connected,
        peerId: call.peerId,
        reason,
      });
    };

    const close = () => {
      if (closed) {return;}
      closed = true;
      clearTimeout(joinTimer);
      clearTimeout(disconnectTimer);
      peerConnection.onicecandidate = null;
      peerConnection.ontrack = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.close();
      incomingStream.getTracks().forEach((track) => track.stop());
    };
    activeConnectionRef.current = { callId: call.callId, close };

    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });
    if (!localStream.getAudioTracks().length) {
      peerConnection.addTransceiver("audio", { direction: "recvonly" });
    }
    if (!localStream.getVideoTracks().length) {
      peerConnection.addTransceiver("video", { direction: "recvonly" });
    }
    setRemoteStream(incomingStream);
    setConnectionState("connecting");

    const flushCandidates = async () => {
      while (pendingCandidates.length) {
        await peerConnection.addIceCandidate(pendingCandidates.shift());
      }
    };

    const createAndSendOffer = async () => {
      if (closed || offerStarted || !isInitiator) {return;}
      offerStarted = true;
      const description = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(description);
      await signal("call:offer", {
        description: peerConnection.localDescription.toJSON(),
      });
      logRandomCall("webrtc-offer-sent", { callId: call.callId });
    };

    const handleReady = (event) => {
      if (!isCurrentEvent(event)) {return;}
      if (!readyEchoed) {
        readyEchoed = true;
        void signal("call:ready").catch((error) => {
          logRandomCall("webrtc-ready-error", describeRandomCallError(error));
        });
      }
      operation = operation.then(createAndSendOffer).catch(reportFailure);
    };

    const handleOffer = (event) => {
      if (!isCurrentEvent(event)) {return;}
      operation = operation.then(async () => {
        await peerConnection.setRemoteDescription(event.description);
        await flushCandidates();
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        await signal("call:answer", {
          description: peerConnection.localDescription.toJSON(),
        });
        logRandomCall("webrtc-answer-sent", { callId: call.callId });
      }).catch(reportFailure);
    };

    const handleAnswer = (event) => {
      if (!isCurrentEvent(event)) {return;}
      operation = operation.then(async () => {
        await peerConnection.setRemoteDescription(event.description);
        await flushCandidates();
      }).catch(reportFailure);
    };

    const handleIceCandidate = (event) => {
      if (!isCurrentEvent(event)) {return;}
      operation = operation.then(async () => {
        const candidate = new RTCIceCandidate(event.candidate);
        if (!peerConnection.remoteDescription) {
          pendingCandidates.push(candidate);
          return;
        }
        await peerConnection.addIceCandidate(candidate);
      }).catch(reportFailure);
    };

    peerConnection.onicecandidate = ({ candidate }) => {
      if (!candidate || closed) {return;}
      void signal("call:ice-candidate", {
        candidate: candidate.toJSON(),
      }).catch((error) => {
        logRandomCall("webrtc-ice-error", describeRandomCallError(error));
      });
    };
    peerConnection.ontrack = ({ streams, track }) => {
      const sourceTracks = streams[0]?.getTracks() || [track];
      sourceTracks.forEach((sourceTrack) => {
        if (!incomingStream.getTrackById(sourceTrack.id)) {
          incomingStream.addTrack(sourceTrack);
        }
      });
      setRemoteStream(incomingStream);
    };
    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      if (closed) {return;}
      setConnectionState(state);
      if (state === "connected") {
        connected = true;
        clearTimeout(joinTimer);
        clearTimeout(disconnectTimer);
        logRandomCall("webrtc-connected", { callId: call.callId });
      } else if (state === "disconnected") {
        clearTimeout(disconnectTimer);
        disconnectTimer = setTimeout(() => {
          if (peerConnection.connectionState === "disconnected") {
            reportFailure("peer-disconnected");
          }
        }, PEER_DISCONNECT_GRACE);
      } else if (state === "failed") {
        reportFailure("connection-failed");
      }
    };

    socket.on("call:ready", handleReady);
    socket.on("call:offer", handleOffer);
    socket.on("call:answer", handleAnswer);
    socket.on("call:ice-candidate", handleIceCandidate);

    joinTimer = setTimeout(() => reportFailure("join-timeout"), PEER_JOIN_TIMEOUT);
    void signal("call:ready").catch(reportFailure);
    logRandomCall("webrtc-ready", {
      callId: call.callId,
      initiator: isInitiator,
    });

    return () => {
      socket.off("call:ready", handleReady);
      socket.off("call:offer", handleOffer);
      socket.off("call:answer", handleAnswer);
      socket.off("call:ice-candidate", handleIceCandidate);
      close();
      if (activeConnectionRef.current?.callId === call.callId) {
        activeConnectionRef.current = null;
      }
    };
  }, [
    call,
    isSocketConnected,
    localStream,
    localUserId,
    mediaReady,
    socket,
  ]);

  const toggleMicrophone = useCallback(() => {
    const tracks = localStreamRef.current?.getAudioTracks() || [];
    if (!tracks.length) {return;}
    const enabled = !tracks.some((track) => track.enabled);
    tracks.forEach((track) => {track.enabled = enabled;});
    setIsAudioEnabled(enabled);
  }, []);

  const toggleCamera = useCallback(() => {
    const tracks = localStreamRef.current?.getVideoTracks() || [];
    if (!tracks.length) {return;}
    const enabled = !tracks.some((track) => track.enabled);
    tracks.forEach((track) => {track.enabled = enabled;});
    setIsVideoEnabled(enabled);
  }, []);

  return {
    closeConnection,
    connectionState,
    hasCamera: Boolean(localStream?.getVideoTracks().length),
    hasMicrophone: Boolean(localStream?.getAudioTracks().length),
    isAudioEnabled,
    isVideoEnabled,
    localStream,
    mediaReady,
    mediaWarning,
    remoteStream,
    toggleCamera,
    toggleMicrophone,
  };
};

export default useWebRTC;
