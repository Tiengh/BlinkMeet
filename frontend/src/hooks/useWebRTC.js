import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { getWebRTCIceConfiguration } from "../lib/api";
import { emitWithAck } from "../lib/realtime";
import {
  describeRandomCallError,
  logRandomCall,
} from "../lib/randomCallDebug";

const PEER_JOIN_TIMEOUT = 12_000;
const PEER_DISCONNECT_GRACE = 4_000;

const getSelectedConnectionRoute = async (peerConnection) => {
  const stats = await peerConnection.getStats();
  const reports = [...stats.values()];
  const transport = reports.find((report) =>
    report.type === "transport" && report.selectedCandidatePairId);
  const candidatePair = transport
    ? stats.get(transport.selectedCandidatePairId)
    : reports.find((report) =>
      report.type === "candidate-pair" &&
      report.nominated &&
      report.state === "succeeded");

  if (!candidatePair) {return null;}
  const localCandidate = stats.get(candidatePair.localCandidateId);
  const remoteCandidate = stats.get(candidatePair.remoteCandidateId);
  const usesRelay = localCandidate?.candidateType === "relay" ||
    remoteCandidate?.candidateType === "relay";

  return {
    route: usesRelay ? "relay" : "direct",
    localCandidateType: localCandidate?.candidateType ?? "unknown",
    remoteCandidateType: remoteCandidate?.candidateType ?? "unknown",
    protocol: localCandidate?.protocol ?? "unknown",
    relayProtocol: localCandidate?.relayProtocol ?? null,
  };
};

const acquireLocalMedia = async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      stream: new MediaStream(),
      warning: new Error("Media devices are not supported by this browser"),
    };
  }

  try {
    return {
      stream: await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      }),
      warning: null,
    };
  } catch (combinedError) {
    const tracks = [];
    const errors = [combinedError];
    const fallbacks = [
      { audio: true, video: false },
      { audio: false, video: true },
    ];

    for (const constraints of fallbacks) {
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia(constraints);
        tracks.push(...fallbackStream.getTracks());
      } catch (error) {
        errors.push(error);
      }
    }

    return {
      stream: new MediaStream(tracks),
      warning: tracks.length ? null : errors.at(-1),
    };
  }
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
  const [iceConfiguration, setIceConfiguration] = useState(null);
  const [iceConfigurationError, setIceConfigurationError] = useState(null);
  const [connectionRoute, setConnectionRoute] = useState(null);

  const localStreamRef = useRef(null);
  const activeConnectionRef = useRef(null);
  const failureCallbackRef = useRef(onConnectionFailure);
  const configurationFailureCallIdRef = useRef(null);

  useEffect(() => {
    failureCallbackRef.current = onConnectionFailure;
  }, [onConnectionFailure]);

  useEffect(() => {
    let cancelled = false;
    if (!call) {
      setIceConfiguration(null);
      setIceConfigurationError(null);
      setConnectionRoute(null);
      return undefined;
    }

    const callId = call.callId;
    setIceConfiguration(null);
    setIceConfigurationError(null);
    setConnectionRoute(null);

    void getWebRTCIceConfiguration()
      .then((configuration) => {
        if (cancelled) {return;}
        if (
          !Array.isArray(configuration?.iceServers) ||
          !["all", "relay"].includes(configuration?.iceTransportPolicy)
        ) {
          throw new Error("Backend returned an invalid ICE configuration");
        }
        setIceConfiguration({ ...configuration, callId });
        logRandomCall("webrtc-ice-config-loaded", {
          callId,
          iceTransportPolicy: configuration.iceTransportPolicy,
          turnEnabled: configuration.iceServers.some((server) => {
            const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
            return urls.some((url) => String(url).startsWith("turn"));
          }),
        });
      })
      .catch((error) => {
        if (cancelled) {return;}
        setIceConfigurationError(error);
        setConnectionState("failed");
        logRandomCall("webrtc-ice-config-error", {
          callId,
          ...describeRandomCallError(error),
        });
        if (configurationFailureCallIdRef.current !== callId) {
          configurationFailureCallIdRef.current = callId;
          failureCallbackRef.current?.({
            callId,
            connected: false,
            peerId: call.peerId,
            reason: "ice-configuration-failed",
          });
        }
      });

    return () => {cancelled = true;};
  }, [call]);

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
    setConnectionRoute(null);
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
      !socket ||
      iceConfiguration?.callId !== call.callId
    ) {
      return;
    }

    const peerConnection = new RTCPeerConnection({
      iceServers: iceConfiguration.iceServers,
      iceTransportPolicy: iceConfiguration.iceTransportPolicy,
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
      peerConnection.onicecandidateerror = null;
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
    setConnectionRoute(null);

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
    peerConnection.onicecandidateerror = (event) => {
      logRandomCall("webrtc-ice-candidate-error", {
        callId: call.callId,
        errorCode: event.errorCode,
        errorText: event.errorText,
        url: event.url,
      });
    };
    peerConnection.ontrack = ({ streams, track }) => {
      const sourceTracks = streams[0]?.getTracks() || [track];
      sourceTracks.forEach((sourceTrack) => {
        if (!incomingStream.getTrackById(sourceTrack.id)) {
          incomingStream.addTrack(sourceTrack);
        }
      });
      setRemoteStream(new MediaStream(incomingStream.getTracks()));
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
        void getSelectedConnectionRoute(peerConnection)
          .then((routeDetails) => {
            if (closed || !routeDetails) {return;}
            setConnectionRoute(routeDetails.route);
            logRandomCall("webrtc-route-selected", {
              callId: call.callId,
              ...routeDetails,
            });
          })
          .catch((error) => {
            logRandomCall(
              "webrtc-route-inspection-error",
              describeRandomCallError(error),
            );
          });
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
    iceConfiguration,
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
    connectionRoute,
    connectionState,
    hasCamera: Boolean(localStream?.getVideoTracks().length),
    hasMicrophone: Boolean(localStream?.getAudioTracks().length),
    isAudioEnabled,
    isVideoEnabled,
    iceConfigurationError,
    localStream,
    mediaReady,
    mediaWarning,
    remoteStream,
    toggleCamera,
    toggleMicrophone,
  };
};

export default useWebRTC;
