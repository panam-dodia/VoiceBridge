'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { getWebSocketURL } from '@/lib/api';
import { getUserId } from '@/lib/userStore';
import { useWebRTC } from '@/hooks/useWebRTC';
import axios from 'axios';
import toast from 'react-hot-toast';

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

const LANGUAGES = [
  { code: 'en-US', name: 'English' },
  { code: 'es-ES', name: 'Spanish' },
  { code: 'fr-FR', name: 'French' },
  { code: 'de-DE', name: 'German' },
  { code: 'it-IT', name: 'Italian' },
  { code: 'pt-PT', name: 'Portuguese' },
  { code: 'ru-RU', name: 'Russian' },
  { code: 'ja-JP', name: 'Japanese' },
  { code: 'ko-KR', name: 'Korean' },
  { code: 'zh-CN', name: 'Chinese' },
  { code: 'hi-IN', name: 'Hindi' },
];

interface Participant {
  userId: string;
  name: string;
  language: string;
}

interface Translation {
  speaker: string;
  originalText: string;
  translatedText: string;
  timestamp: number;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface TextChatMessage {
  id: string;
  userId: string;
  userName: string;
  message: string;
  originalMessage?: string;
  timestamp: string;
}

interface TypingUser {
  userId: string;
  userName: string;
}

interface ErrorWithRecovery {
  message: string;
  suggestions: string[];
  actionLabel?: string;
  action?: () => void;
}

// Utility function to generate consistent color for a user
function getUserColor(userId: string): string {
  const colors = [
    'bg-red-500',
    'bg-blue-500',
    'bg-green-500',
    'bg-yellow-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-teal-500',
    'bg-orange-500',
    'bg-cyan-500',
  ];

  // Generate a consistent hash from userId
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }

  return colors[Math.abs(hash) % colors.length];
}

// Utility function to get initials from name
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 1).toUpperCase();
}

// Avatar component for participants without video
function ParticipantAvatar({ name, userId }: { name: string; userId: string }) {
  const initials = getInitials(name);
  const colorClass = getUserColor(userId);

  return (
    <div className="relative aspect-video bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg overflow-hidden border border-white/10">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className={`w-24 h-24 rounded-full ${colorClass} flex items-center justify-center`}>
          <span className="text-white text-3xl font-bold">{initials}</span>
        </div>
      </div>
      <div className="absolute bottom-2 left-2 px-3 py-1 bg-black/70 rounded-full text-white text-sm">
        {name}
      </div>
    </div>
  );
}

// Remote Video Component
function RemoteVideo({ stream, name }: { stream: MediaStream; name: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-white/10">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
      />
      <div className="absolute bottom-2 left-2 px-3 py-1 bg-black/70 rounded-full text-white text-sm">
        {name}
      </div>
    </div>
  );
}

// Skeleton loader for participants waiting
function ParticipantSkeleton() {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-black/20 rounded-lg border border-white/5 whitespace-nowrap animate-pulse">
      <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
      <div className="h-4 w-20 bg-gray-600 rounded"></div>
      <div className="h-3 w-8 bg-gray-700 rounded"></div>
    </div>
  );
}

export default function MeetingPage() {
  const [mode, setMode] = useState<'setup' | 'room'>('setup');
  const [joinMode, setJoinMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('en-US');
  const [roomCode, setRoomCode] = useState('');
  const [myRoomCode, setMyRoomCode] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [translations, setTranslations] = useState<Translation[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [error, setError] = useState<ErrorWithRecovery | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Helper function to create error objects with recovery suggestions
  const createError = (message: string, suggestions: string[], actionLabel?: string, action?: () => void): ErrorWithRecovery => ({
    message,
    suggestions,
    actionLabel,
    action
  });

  // Check for room code in URL on component mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const roomCodeFromUrl = urlParams.get('room');
      if (roomCodeFromUrl) {
        setRoomCode(roomCodeFromUrl.toUpperCase());
        setJoinMode('join');
        toast.success(`Ready to join room ${roomCodeFromUrl.toUpperCase()}`);
      }
    }
  }, []);

  // Q&A states
  const [question, setQuestion] = useState('');
  const [askingQuestion, setAskingQuestion] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatMode, setChatMode] = useState<'text' | 'voice'>('text');
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeakingAnswer, setIsSpeakingAnswer] = useState(false);

  // Video states
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  // Chat panel states
  const [chatOpen, setChatOpen] = useState(false);
  const [textChatMessages, setTextChatMessages] = useState<TextChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const translationsEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const qaAudioRef = useRef<HTMLAudioElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // WebRTC handlers
  const handleRemoteStream = useCallback((userId: string, stream: MediaStream) => {
    console.log(`📹 Adding remote stream for user: ${userId}`);
    setRemoteStreams(prev => {
      const newMap = new Map(prev);
      newMap.set(userId, stream);
      return newMap;
    });
  }, []);

  const handleRemoteStreamRemoved = useCallback((userId: string) => {
    console.log(`🗑️ Removing remote stream for user: ${userId}`);
    setRemoteStreams(prev => {
      const newMap = new Map(prev);
      newMap.delete(userId);
      return newMap;
    });
  }, []);

  const sendWebRTCSignal = useCallback((signal: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(signal));
    }
  }, []);

  const {
    createOffer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    removePeerConnection
  } = useWebRTC({
    localStream: localVideoStream,
    onRemoteStream: handleRemoteStream,
    onRemoteStreamRemoved: handleRemoteStreamRemoved,
    sendSignal: sendWebRTCSignal
  });

  // Auto-scroll to latest translation
  useEffect(() => {
    translationsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [translations]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [textChatMessages]);

  // Increment unread count when chat is closed
  useEffect(() => {
    if (!chatOpen && textChatMessages.length > 0) {
      const lastMessage = textChatMessages[textChatMessages.length - 1];
      if (lastMessage.userId !== getUserId()) {
        setUnreadCount(prev => prev + 1);
      }
    }
  }, [textChatMessages, chatOpen]);

  const connectWebSocket = () => {
    const ws = new WebSocket(getWebSocketURL());

    ws.onopen = () => {
      console.log('WebSocket connected');

      const persistentUserId = getUserId();
      console.log('Using persistent userId:', persistentUserId);

      if (joinMode === 'create') {
        ws.send(JSON.stringify({
          type: 'create_room',
          name: name,
          language: language,
          userId: persistentUserId
        }));
      } else {
        ws.send(JSON.stringify({
          type: 'join_room',
          roomId: roomCode.toUpperCase(),
          name: name,
          language: language,
          userId: persistentUserId
        }));
      }
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'room_created':
          console.log('✅ Room created, sessionId:', data.sessionId);
          setMyRoomCode(data.roomId);
          setSessionId(data.sessionId);
          setMode('room');
          toast.success(`Room created! Code: ${data.roomId}`);
          break;

        case 'room_joined':
          console.log('✅ Room joined, sessionId:', data.sessionId);
          setMyRoomCode(data.roomId);
          setSessionId(data.sessionId);
          setMode('room');
          toast.success('Successfully joined room!');
          break;

        case 'participants_update':
          setParticipants(data.participants);
          // When new participants join and we have video enabled, offer our stream
          // Only create offer if we joined first (to avoid both sides offering)
          if (videoEnabled && localVideoStream) {
            const myId = getUserId();
            data.participants.forEach((p: Participant) => {
              if (p.userId !== myId && p.userId > myId) {
                // Only offer to users with higher userId to avoid duplicate connections
                console.log(`📤 Sending video offer to new participant: ${p.userId}`);
                setTimeout(() => createOffer(p.userId), 200);
              }
            });
          }
          break;

        // WebRTC signaling messages
        case 'webrtc_offer':
          console.log(`📥 Received WebRTC offer from: ${data.fromUserId}`);
          handleOffer(data.fromUserId, data.offer);
          break;

        case 'webrtc_answer':
          console.log(`📥 Received WebRTC answer from: ${data.fromUserId}`);
          handleAnswer(data.fromUserId, data.answer);
          break;

        case 'webrtc_ice_candidate':
          console.log(`🧊 Received ICE candidate from: ${data.fromUserId}`);
          handleIceCandidate(data.fromUserId, data.candidate);
          break;

        case 'transcript':
          setCurrentTranscript(data.text);
          break;

        case 'translation':
          setTranslations(prev => [...prev, {
            speaker: data.speaker,
            originalText: data.originalText,
            translatedText: data.translatedText,
            timestamp: data.timestamp
          }]);
          break;

        case 'audio':
          // Play audio
          const audioData = Uint8Array.from(atob(data.audio), c => c.charCodeAt(0));
          const audioBlob = new Blob([audioData], { type: 'audio/mpeg' });
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          audio.play().catch(err => console.error('Audio playback error:', err));
          break;

        // Chat messages
        case 'chat_history':
          console.log('📜 Received chat history:', data.messages);
          setTextChatMessages(data.messages);
          break;

        case 'chat_message':
          console.log('💬 Received chat message:', data);
          setTextChatMessages(prev => [...prev, {
            id: data.id,
            userId: data.userId,
            userName: data.userName,
            message: data.message,
            timestamp: data.timestamp
          }]);
          break;

        case 'user_typing':
          console.log('⌨️ User typing:', data.userName, data.isTyping);
          if (data.isTyping) {
            setTypingUsers(prev => {
              if (!prev.find(u => u.userId === data.userId)) {
                return [...prev, { userId: data.userId, userName: data.userName }];
              }
              return prev;
            });
          } else {
            setTypingUsers(prev => prev.filter(u => u.userId !== data.userId));
          }
          break;

        case 'error':
          setError(createError(
            data.message,
            ['Check if the room code is correct', 'Make sure you have a stable internet connection', 'Try creating a new room instead'],
            'Try Again',
            () => setError(null)
          ));
          break;
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError(createError(
        'Connection error occurred',
        ['Check your internet connection', 'Verify the server is running', 'Try refreshing the page'],
        'Retry Connection',
        () => {
          setError(null);
          connectWebSocket();
        }
      ));
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      if (mode === 'room') {
        setError(createError(
          'Disconnected from room',
          ['Your internet connection may be unstable', 'The room may have been closed', 'The server may have restarted'],
          'Rejoin Room',
          () => {
            setError(null);
            connectWebSocket();
          }
        ));
      }
    };

    wsRef.current = ws;
  };

  const startSpeaking = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(event.data);
        }
      };

      // Handle when recording stops - send stop message AFTER all chunks are flushed
      mediaRecorder.onstop = () => {
        console.log('MediaRecorder stopped, sending stop_speaking message');
        // Wait a bit for any final chunks to be sent
        setTimeout(() => {
          wsRef.current?.send(JSON.stringify({
            type: 'stop_speaking'
          }));
        }, 200);
      };

      mediaRecorder.start(100); // Send data every 100ms for more responsive streaming
      mediaRecorderRef.current = mediaRecorder;

      // Tell server we're starting to speak
      wsRef.current?.send(JSON.stringify({
        type: 'start_speaking'
      }));

      setIsSpeaking(true);
      setCurrentTranscript('');
    } catch (err) {
      console.error('Microphone access error:', err);
      setError(createError(
        'Could not access microphone',
        ['Click the microphone icon in your browser\'s address bar', 'Grant microphone permission when prompted', 'Check if another application is using the microphone', 'Try closing other tabs that might be using audio'],
        'Request Permission Again',
        () => {
          setError(null);
          startSpeaking();
        }
      ));
    }
  };

  const stopSpeaking = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      console.log('Stopping MediaRecorder...');
      mediaRecorderRef.current.stop();
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
    }

    setIsSpeaking(false);
    setCurrentTranscript('');
  };

  const handleJoinRoom = () => {
    if (!name.trim()) {
      setError(createError(
        'Name is required',
        ['Enter your name in the field above', 'This helps other participants identify you'],
        'OK',
        () => setError(null)
      ));
      return;
    }

    if (joinMode === 'join' && !roomCode.trim()) {
      setError(createError(
        'Room code is required',
        ['Enter the 6-character room code shared with you', 'Ask the room creator for the invite link', 'Or create a new room instead'],
        'OK',
        () => setError(null)
      ));
      return;
    }

    setError(null);
    connectWebSocket();
  };

  const toggleVideo = async () => {
    if (videoEnabled) {
      // Stop video
      console.log('📹 Stopping video...');
      if (localVideoStream) {
        localVideoStream.getTracks().forEach(track => track.stop());
        setLocalVideoStream(null);
      }
      setVideoEnabled(false);
      toast.success('Camera turned off');
    } else {
      // Start video
      console.log('📹 Starting video...');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          },
          audio: false // Audio is handled separately
        });

        console.log('✅ Got video stream:', stream);
        console.log('📹 Video tracks:', stream.getVideoTracks());

        setLocalVideoStream(stream);
        setVideoEnabled(true);
        toast.success('Camera turned on');

        // Display local video immediately
        setTimeout(() => {
          if (localVideoRef.current) {
            console.log('📹 Setting srcObject on local video element');
            localVideoRef.current.srcObject = stream;
            localVideoRef.current.play().catch(err => {
              console.error('❌ Error playing local video:', err);
            });
          } else {
            console.error('❌ localVideoRef.current is null!');
          }
        }, 100);

        // Send video offers to all existing participants
        participants.forEach(p => {
          if (p.userId !== getUserId()) {
            console.log(`📤 Sending video offer to: ${p.userId}`);
            // Small delay to ensure stream is ready
            setTimeout(() => createOffer(p.userId), 100);
          }
        });
      } catch (err: any) {
        console.error('❌ Camera access error:', err);
        setError(createError(
          'Could not access camera',
          ['Click the camera icon in your browser\'s address bar to grant permission', 'Make sure no other application is using the camera', 'Check if your camera is properly connected', 'Try closing other video conferencing apps'],
          'Request Permission Again',
          () => {
            setError(null);
            toggleVideo();
          }
        ));
        toast.error('Camera access denied. Please check permissions.');
      }
    }
  };

  const toggleAudio = () => {
    const newState = !audioEnabled;
    setAudioEnabled(newState);
    toast.success(newState ? 'Microphone unmuted' : 'Microphone muted');
  };

  const toggleChat = () => {
    setChatOpen(!chatOpen);
    if (!chatOpen) {
      setUnreadCount(0);
    }
  };

  const handleChatInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setChatInput(e.target.value);

    // Send typing indicator
    if (e.target.value.length > 0) {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      wsRef.current?.send(JSON.stringify({
        type: 'typing_start'
      }));

      // Stop typing after 2 seconds of no input
      typingTimeoutRef.current = setTimeout(() => {
        wsRef.current?.send(JSON.stringify({
          type: 'typing_stop'
        }));
      }, 2000);
    } else {
      wsRef.current?.send(JSON.stringify({
        type: 'typing_stop'
      }));
    }
  };

  const sendChatMessage = () => {
    if (!chatInput.trim()) return;

    wsRef.current?.send(JSON.stringify({
      type: 'chat_message',
      message: chatInput.trim()
    }));

    setChatInput('');

    // Clear typing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  };

  const handleChatKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  };

  const leaveRoom = () => {
    stopSpeaking();

    // Stop video if enabled
    if (localVideoStream) {
      localVideoStream.getTracks().forEach(track => track.stop());
      setLocalVideoStream(null);
    }
    setVideoEnabled(false);

    wsRef.current?.close();
    setMode('setup');
    setMyRoomCode('');
    setParticipants([]);
    setTranslations([]);
    setRemoteStreams(new Map());
    setTextChatMessages([]);
    setChatOpen(false);
    setUnreadCount(0);
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(myRoomCode);
    toast.success('Room code copied to clipboard!');
  };

  const copyInviteLink = () => {
    const inviteUrl = `${window.location.origin}/meeting?room=${myRoomCode}`;
    navigator.clipboard.writeText(inviteUrl);
    toast.success('Invite link copied to clipboard!');
  };

  // Q&A Functions
  const getLanguageName = (code: string) => {
    const lang = LANGUAGES.find(l => l.code === code);
    return lang ? lang.name : 'English';
  };

  const startVoiceRecording = () => {
    console.log('🎤 Starting voice recording for Q&A...');

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Voice input is not supported in your browser. Please use Chrome or Edge.');
      return;
    }

    setIsRecording(true);

    const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.lang = language;
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;

    console.log(`🌍 Voice recognition language set to: ${language}`);

    recognitionRef.current.onstart = () => {
      console.log('🎤 Speech recognition started');
    };

    recognitionRef.current.onresult = (event: any) => {
      console.log('🎤 Speech recognized!', event);
      const transcriptText = event.results[0][0].transcript;
      console.log('📝 Recognized text:', transcriptText);
      setQuestion(transcriptText);
      setIsRecording(false);
      sendQuestion(transcriptText);
    };

    recognitionRef.current.onerror = (event: any) => {
      console.error('❌ Speech recognition error:', event.error, event);
      setIsRecording(false);
      alert(`Voice recognition error: ${event.error}`);
    };

    recognitionRef.current.onend = () => {
      console.log('🎤 Speech recognition ended');
      setIsRecording(false);
    };

    try {
      recognitionRef.current.start();
      console.log('✅ Recognition started successfully');
    } catch (err) {
      console.error('❌ Failed to start recognition:', err);
      setIsRecording(false);
      alert(`Failed to start voice recognition: ${err}`);
    }
  };

  const stopVoiceRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);
  };

  const sendQuestion = async (questionText?: string) => {
    const finalQuestion = questionText || question;

    console.log('📊 Q&A Debug - sessionId:', sessionId, 'question:', finalQuestion);

    if (!finalQuestion.trim()) {
      console.warn('⚠️ Question is empty');
      return;
    }

    if (!sessionId) {
      console.error('❌ No sessionId available! Cannot send question.');
      alert('Session not initialized. Please try refreshing the page.');
      return;
    }

    const userMessage: ChatMessage = {
      role: 'user',
      content: finalQuestion,
      timestamp: new Date()
    };
    setChatHistory(prev => [...prev, userMessage]);
    setQuestion('');
    setAskingQuestion(true);

    try {
      console.log('📤 Sending Q&A request with:', {
        userId: 'meeting-user',
        question: finalQuestion,
        sessionId: sessionId,
        targetLanguage: getLanguageName(language)
      });

      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
      const response = await axios.post(`${API_URL}/api/history/qa`, {
        userId: 'meeting-user',
        question: finalQuestion,
        sessionId: sessionId,
        targetLanguage: getLanguageName(language)
      });

      console.log('Received response:', response.data);

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.data.answer,
        timestamp: new Date()
      };
      setChatHistory(prev => [...prev, assistantMessage]);

      if (chatMode === 'voice') {
        console.log('Speaking answer in voice mode');
        await speakAnswer(response.data.answer);
      }
    } catch (err: any) {
      console.error('Error asking question:', err);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `Error: ${err.message || 'Failed to get answer'}`,
        timestamp: new Date()
      };
      setChatHistory(prev => [...prev, errorMessage]);
    } finally {
      setAskingQuestion(false);
    }
  };

  const speakAnswer = async (text: string) => {
    try {
      setIsSpeakingAnswer(true);

      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
      const response = await axios.post(`${API_URL}/api/youtube/text-to-speech`,
        { text, gender: 'male' },
        { responseType: 'arraybuffer' }
      );

      const audioBlob = new Blob([response.data], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);

      if (!qaAudioRef.current) {
        qaAudioRef.current = new Audio();
      }

      qaAudioRef.current.src = audioUrl;
      qaAudioRef.current.onended = () => {
        setIsSpeakingAnswer(false);
        URL.revokeObjectURL(audioUrl);
      };
      await qaAudioRef.current.play();
    } catch (err) {
      console.error('Error speaking answer:', err);
      setIsSpeakingAnswer(false);
    }
  };

  const handleAskQuestion = async () => {
    await sendQuestion();
  };

  // Format timestamp
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSpeaking();
      wsRef.current?.close();
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  if (mode === 'setup') {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        {/* Header */}
        <nav className="border-b border-white/10 backdrop-blur-sm bg-black/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-blue-600"></div>
                <span className="text-xl font-bold text-white">VoiceBridge</span>
              </Link>
              <div className="flex items-center gap-4">
                <Link href="/youtube" className="text-gray-300 hover:text-white transition-colors">
                  YouTube
                </Link>
                <Link href="/history" className="text-gray-300 hover:text-white transition-colors">
                  History
                </Link>
              </div>
            </div>
          </div>
        </nav>

        <div className="max-w-2xl mx-auto px-4 py-16">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-white mb-4">Live Meeting Translation</h1>
            <p className="text-gray-400">Have real-time conversations in any language</p>
          </div>

          {/* Join Mode Tabs */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setJoinMode('create')}
              className={`flex-1 px-6 py-3 rounded-xl font-medium transition-all ${
                joinMode === 'create'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}
            >
              Create Room
            </button>
            <button
              onClick={() => setJoinMode('join')}
              className={`flex-1 px-6 py-3 rounded-xl font-medium transition-all ${
                joinMode === 'join'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}
            >
              Join Room
            </button>
          </div>

          {/* Setup Form */}
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-8">
            <div className="space-y-6">
              {/* Name Input */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Your Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>

              {/* Language Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Your Language
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500 transition-colors"
                >
                  {LANGUAGES.map(lang => (
                    <option key={lang.code} value={lang.code}>{lang.name}</option>
                  ))}
                </select>
              </div>

              {/* Room Code Input (Join mode only) */}
              {joinMode === 'join' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Room Code
                  </label>
                  <input
                    type="text"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    placeholder="Enter 6-character code"
                    maxLength={6}
                    className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder-gray-500 uppercase focus:outline-none focus:border-purple-500 transition-colors"
                  />
                </div>
              )}

              {/* Error Message with Recovery Suggestions */}
              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <div className="flex-1">
                      <p className="text-red-400 font-medium mb-2">{error.message}</p>
                      {error.suggestions.length > 0 && (
                        <div className="space-y-1 mb-3">
                          <p className="text-red-300/70 text-sm font-medium">Try these solutions:</p>
                          <ul className="space-y-1">
                            {error.suggestions.map((suggestion, idx) => (
                              <li key={idx} className="text-red-300/60 text-sm flex items-start gap-2">
                                <span className="text-red-400 mt-0.5">•</span>
                                <span>{suggestion}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {error.actionLabel && error.action && (
                        <button
                          onClick={error.action}
                          className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-sm font-medium transition-colors"
                        >
                          {error.actionLabel}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Join Button */}
              <button
                onClick={handleJoinRoom}
                className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-medium hover:from-purple-700 hover:to-blue-700 transition-all"
              >
                {joinMode === 'create' ? 'Create Room' : 'Join Room'}
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Room Interface
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <nav className="border-b border-white/10 backdrop-blur-sm bg-black/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-blue-600"></div>
              <div>
                <div className="text-white font-bold">Room: {myRoomCode}</div>
                <div className="text-xs text-gray-400">{participants.length} participant(s)</div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={copyRoomCode}
                className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors border border-white/10 rounded-lg hover:bg-white/5"
              >
                📋 Copy Code
              </button>
              <button
                onClick={copyInviteLink}
                className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors border border-white/10 rounded-lg hover:bg-white/5"
              >
                🔗 Copy Invite Link
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-6">
        {/* Main Content */}
        <div className={`flex-1 transition-all ${chatOpen ? 'mr-0' : 'mr-0'}`}>
          <div className="relative pb-24">
            {/* Participants Bar - Horizontal */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-4 mb-6">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-bold text-white whitespace-nowrap">Participants:</h2>
                <div className="flex gap-3 overflow-x-auto flex-1">
                  {participants.length === 0 ? (
                    <>
                      <ParticipantSkeleton />
                      <ParticipantSkeleton />
                    </>
                  ) : (
                    participants.map((p) => (
                      <div key={p.userId} className="flex items-center gap-2 px-4 py-2 bg-black/20 rounded-lg border border-white/5 whitespace-nowrap">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <p className="text-white font-medium">{p.name}</p>
                        <span className="text-xs text-gray-400">({p.language.split('-')[0].toUpperCase()})</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Video Grid */}
            {participants.length > 0 && (
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6 mb-6">
                <h2 className="text-xl font-bold text-white mb-4">Video</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Local Video or Avatar */}
                  {videoEnabled ? (
                    <div className="relative aspect-video bg-black rounded-lg overflow-hidden border-2 border-purple-500">
                      <video
                        ref={localVideoRef}
                        autoPlay
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute bottom-2 left-2 px-3 py-1 bg-black/70 rounded-full text-white text-sm">
                        You
                      </div>
                    </div>
                  ) : (
                    <ParticipantAvatar
                      name={name || 'You'}
                      userId={getUserId()}
                    />
                  )}

                  {/* Remote Participants */}
                  {participants
                    .filter(p => p.userId !== getUserId())
                    .map(p => {
                      const hasVideo = remoteStreams.has(p.userId);
                      return hasVideo ? (
                        <RemoteVideo
                          key={p.userId}
                          stream={remoteStreams.get(p.userId)!}
                          name={p.name}
                        />
                      ) : (
                        <ParticipantAvatar
                          key={p.userId}
                          name={p.name}
                          userId={p.userId}
                        />
                      );
                    })}
                </div>
              </div>
            )}

            {/* Translations */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">Conversation</h2>
                {isSpeaking && (
                  <span className="flex items-center gap-2 text-purple-400">
                    <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></span>
                    Speaking...
                  </span>
                )}
              </div>

              {currentTranscript && (
                <div className="mb-4 p-3 bg-purple-600/10 border border-purple-500/20 rounded-lg">
                  <p className="text-white">{currentTranscript}</p>
                </div>
              )}

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {translations.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">No messages yet. Click the mic button below to start speaking!</p>
                ) : (
                  translations.map((t, idx) => (
                    <div key={idx} className="p-4 bg-black/20 rounded-lg border border-white/5">
                      <p className="text-sm text-purple-400 font-medium mb-1">{t.speaker}</p>
                      <p className="text-white mb-1">{t.translatedText}</p>
                      <p className="text-xs text-gray-500">{t.originalText}</p>
                    </div>
                  ))
                )}
                <div ref={translationsEndRef} />
              </div>
            </div>

            {/* Q&A Section */}
            {sessionId && (
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6 mt-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-white">Q&A</h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setChatMode('text')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        chatMode === 'text'
                          ? 'bg-purple-600 text-white'
                          : 'bg-white/10 text-white/60 hover:bg-white/20'
                      }`}
                    >
                      Text
                    </button>
                    <button
                      onClick={() => setChatMode('voice')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        chatMode === 'voice'
                          ? 'bg-purple-600 text-white'
                          : 'bg-white/10 text-white/60 hover:bg-white/20'
                      }`}
                    >
                      Voice
                    </button>
                  </div>
                </div>

                <div className="h-[300px] overflow-y-auto mb-4 space-y-3 custom-scrollbar">
                  {chatHistory.map((message, index) => (
                    <div
                      key={index}
                      className={`p-4 rounded-lg ${
                        message.role === 'user'
                          ? 'bg-purple-600/30 ml-12'
                          : 'bg-white/10 mr-12'
                      }`}
                    >
                      <div className="text-xs text-white/60 mb-1">
                        {message.role === 'user' ? 'You' : 'AI'} • {message.timestamp.toLocaleTimeString()}
                      </div>
                      <div className="text-white">{message.content}</div>
                    </div>
                  ))}
                  {askingQuestion && (
                    <div className="bg-white/10 mr-12 p-4 rounded-lg">
                      <div className="text-xs text-white/60 mb-2">AI is typing...</div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                    </div>
                  )}
                </div>

                {chatMode === 'text' ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAskQuestion()}
                      placeholder="Ask anything about this conversation..."
                      className="flex-1 px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                      disabled={askingQuestion}
                    />
                    <button
                      onClick={handleAskQuestion}
                      disabled={askingQuestion || !question.trim()}
                      className="px-6 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {askingQuestion ? 'Asking...' : 'Send'}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <button
                      onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                      disabled={askingQuestion || isSpeakingAnswer}
                      className={`w-24 h-24 rounded-full font-semibold transition-all disabled:opacity-50 ${
                        isRecording
                          ? 'bg-red-600 scale-110 animate-pulse'
                          : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700'
                      }`}
                    >
                      {isRecording ? 'Stop' : 'Ask'}
                    </button>
                    {isSpeakingAnswer && (
                      <div className="text-green-400 animate-pulse">Speaking answer...</div>
                    )}
                    {question && !askingQuestion && (
                      <div className="text-white/60 text-sm">Recognized: {question}</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Chat Sidebar */}
        {chatOpen && (
          <div className="w-80 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 flex flex-col h-[calc(100vh-140px)] sticky top-6">
            {/* Chat Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Chat</h3>
              <button
                onClick={toggleChat}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {textChatMessages.length === 0 ? (
                <div className="text-center text-gray-400 py-8">
                  No messages yet
                </div>
              ) : (
                textChatMessages.map((msg) => {
                  const isMe = msg.userId === getUserId();
                  const isTranslated = msg.originalMessage && msg.originalMessage !== msg.message;
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[80%] ${isMe ? 'order-2' : 'order-1'}`}>
                        <div className="text-xs text-gray-400 mb-1 px-2 flex items-center gap-1">
                          <span>{isMe ? 'You' : msg.userName} • {formatTime(msg.timestamp)}</span>
                          {isTranslated && (
                            <span className="text-blue-400 flex items-center gap-1" title="Translated message">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M7 2a1 1 0 011 1v1h3a1 1 0 110 2H9.578a18.87 18.87 0 01-1.724 4.78c.29.354.596.696.914 1.026a1 1 0 11-1.44 1.389c-.188-.196-.373-.396-.554-.6a19.098 19.098 0 01-3.107 3.567 1 1 0 01-1.334-1.49 17.087 17.087 0 003.13-3.733 18.992 18.992 0 01-1.487-2.494 1 1 0 111.79-.89c.234.47.489.928.764 1.372.417-.934.752-1.913.997-2.927H3a1 1 0 110-2h3V3a1 1 0 011-1zm6 6a1 1 0 01.894.553l2.991 5.982a.869.869 0 01.02.037l.99 1.98a1 1 0 11-1.79.895L15.383 16h-4.764l-.724 1.447a1 1 0 11-1.788-.894l.99-1.98.019-.038 2.99-5.982A1 1 0 0113 8zm-1.382 6h2.764L13 11.236 11.618 14z" clipRule="evenodd" />
                              </svg>
                            </span>
                          )}
                        </div>
                        <div
                          className={`p-3 rounded-lg ${
                            isMe
                              ? 'bg-purple-600 text-white'
                              : 'bg-white/10 text-white'
                          }`}
                          title={isTranslated ? `Original: ${msg.originalMessage}` : ''}
                        >
                          {msg.message}
                          {isTranslated && (
                            <div className="text-xs opacity-60 mt-1 pt-1 border-t border-white/20">
                              Original: {msg.originalMessage}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Typing Indicator */}
            {typingUsers.length > 0 && (
              <div className="px-4 py-2 text-sm text-gray-400">
                {typingUsers.map(u => u.userName).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
              </div>
            )}

            {/* Chat Input */}
            <div className="p-4 border-t border-white/10">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={handleChatInputChange}
                  onKeyPress={handleChatKeyPress}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 bg-black/30 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors text-sm"
                />
                <button
                  onClick={sendChatMessage}
                  disabled={!chatInput.trim()}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Fixed Control Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pb-6">
        <div className="flex items-center gap-4 bg-gray-900/95 backdrop-blur-sm px-8 py-4 rounded-full shadow-2xl border border-white/10">
          {/* Microphone Button */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={isSpeaking ? stopSpeaking : startSpeaking}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                isSpeaking
                  ? 'bg-green-600 hover:bg-green-700 text-white animate-pulse'
                  : audioEnabled
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-white'
              }`}
              title={isSpeaking ? 'Stop Speaking' : 'Start Speaking'}
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
              </svg>
            </button>
            <span className="text-xs text-white/80">
              {isSpeaking ? 'Speaking' : 'Mic'}
            </span>
          </div>

          {/* Camera Button */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={toggleVideo}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                videoEnabled
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-white'
              }`}
              title={videoEnabled ? 'Stop Video' : 'Start Video'}
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
              </svg>
            </button>
            <span className="text-xs text-white/80">
              {videoEnabled ? 'Stop Video' : 'Start Video'}
            </span>
          </div>

          {/* Chat Button */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={toggleChat}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all relative ${
                chatOpen
                  ? 'bg-purple-600 hover:bg-purple-700 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-white'
              }`}
              title="Chat"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
              </svg>
              {unreadCount > 0 && !chatOpen && (
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-xs font-bold">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </div>
              )}
            </button>
            <span className="text-xs text-white/80">Chat</span>
          </div>

          {/* Leave Button */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={leaveRoom}
              className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-all"
              title="Leave Meeting"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
              </svg>
            </button>
            <span className="text-xs text-white/80">Leave</span>
          </div>
        </div>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.1);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(139, 92, 246, 0.3);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(139, 92, 246, 0.5);
        }
      `}</style>
    </main>
  );
}
