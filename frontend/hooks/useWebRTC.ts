import { useRef, useCallback, useEffect } from 'react';

interface PeerConnection {
  pc: RTCPeerConnection;
  stream: MediaStream | null;
}

interface UseWebRTCProps {
  localStream: MediaStream | null;
  onRemoteStream: (userId: string, stream: MediaStream) => void;
  onRemoteStreamRemoved: (userId: string) => void;
  sendSignal: (signal: any) => void;
}

// Free STUN servers for NAT traversal
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]
};

export function useWebRTC({ localStream, onRemoteStream, onRemoteStreamRemoved, sendSignal }: UseWebRTCProps) {
  const peerConnections = useRef<Map<string, PeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(localStream);

  // Keep ref updated
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  // Create peer connection for a user
  const createPeerConnection = useCallback((userId: string) => {
    console.log(`🔗 Creating peer connection for user: ${userId}`);
    console.log(`📹 Current localStreamRef:`, localStreamRef.current);

    const pc = new RTCPeerConnection(ICE_SERVERS);
    const peerConn: PeerConnection = { pc, stream: null };

    // Add local stream tracks to peer connection
    const currentStream = localStreamRef.current;
    if (currentStream) {
      const tracks = currentStream.getTracks();
      console.log(`📹 Available tracks to add:`, tracks.map(t => `${t.kind} - ${t.label}`));
      tracks.forEach(track => {
        pc.addTrack(track, currentStream);
        console.log(`➕ Added ${track.kind} track to peer connection for ${userId}`);
      });
    } else {
      console.warn(`⚠️ No local stream available when creating peer connection for ${userId}`);
    }

    // Handle incoming remote stream
    pc.ontrack = (event) => {
      console.log(`📹 Received remote ${event.track.kind} from ${userId}`);
      console.log(`📹 Event streams:`, event.streams);
      console.log(`📹 Track:`, event.track);
      if (event.streams && event.streams[0]) {
        peerConn.stream = event.streams[0];
        console.log(`✅ Calling onRemoteStream for ${userId} with stream:`, event.streams[0]);
        onRemoteStream(userId, event.streams[0]);
      } else {
        console.error(`❌ No stream in ontrack event for ${userId}`);
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`🧊 Sending ICE candidate to ${userId}`);
        sendSignal({
          type: 'webrtc_ice_candidate',
          targetUserId: userId,
          candidate: event.candidate
        });
      } else {
        console.log(`🧊 ICE gathering complete for ${userId}`);
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`🔄 Connection state with ${userId}: ${pc.connectionState}`);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        removePeerConnection(userId);
      }
    };

    peerConnections.current.set(userId, peerConn);
    return pc;
  }, [onRemoteStream, sendSignal]);

  // Remove peer connection
  const removePeerConnection = useCallback((userId: string) => {
    console.log(`🗑️ Removing peer connection for user: ${userId}`);
    const peerConn = peerConnections.current.get(userId);
    if (peerConn) {
      peerConn.pc.close();
      peerConnections.current.delete(userId);
      onRemoteStreamRemoved(userId);
    }
  }, [onRemoteStreamRemoved]);

  // Create and send offer to a peer
  const createOffer = useCallback(async (userId: string) => {
    console.log(`📤 Creating offer for user: ${userId}`);
    const pc = createPeerConnection(userId);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      sendSignal({
        type: 'webrtc_offer',
        targetUserId: userId,
        offer: offer
      });
      console.log(`✅ Offer sent to ${userId}`);
    } catch (error) {
      console.error(`❌ Error creating offer for ${userId}:`, error);
    }
  }, [createPeerConnection, sendSignal]);

  // Handle incoming offer
  const handleOffer = useCallback(async (fromUserId: string, offer: RTCSessionDescriptionInit) => {
    console.log(`📥 Received offer from user: ${fromUserId}`);
    const pc = createPeerConnection(fromUserId);

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      sendSignal({
        type: 'webrtc_answer',
        targetUserId: fromUserId,
        answer: answer
      });
      console.log(`✅ Answer sent to ${fromUserId}`);
    } catch (error) {
      console.error(`❌ Error handling offer from ${fromUserId}:`, error);
    }
  }, [createPeerConnection, sendSignal]);

  // Handle incoming answer
  const handleAnswer = useCallback(async (fromUserId: string, answer: RTCSessionDescriptionInit) => {
    console.log(`📥 Received answer from user: ${fromUserId}`);
    const peerConn = peerConnections.current.get(fromUserId);

    if (peerConn) {
      try {
        await peerConn.pc.setRemoteDescription(new RTCSessionDescription(answer));
        console.log(`✅ Answer processed from ${fromUserId}`);
      } catch (error) {
        console.error(`❌ Error handling answer from ${fromUserId}:`, error);
      }
    }
  }, []);

  // Handle incoming ICE candidate
  const handleIceCandidate = useCallback(async (fromUserId: string, candidate: RTCIceCandidateInit) => {
    console.log(`🧊 Received ICE candidate from user: ${fromUserId}`);
    const peerConn = peerConnections.current.get(fromUserId);

    if (peerConn) {
      try {
        await peerConn.pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log(`✅ ICE candidate added from ${fromUserId}`);
      } catch (error) {
        console.error(`❌ Error adding ICE candidate from ${fromUserId}:`, error);
      }
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('🧹 Cleaning up all peer connections');
      peerConnections.current.forEach((peerConn) => {
        peerConn.pc.close();
      });
      peerConnections.current.clear();
    };
  }, []);

  return {
    createOffer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    removePeerConnection
  };
}