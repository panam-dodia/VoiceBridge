'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { getWebSocketURL } from '@/lib/api';

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
  const [error, setError] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const translationsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest translation
  useEffect(() => {
    translationsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [translations]);

  const connectWebSocket = () => {
    const ws = new WebSocket(getWebSocketURL());

    ws.onopen = () => {
      console.log('WebSocket connected');

      if (joinMode === 'create') {
        ws.send(JSON.stringify({
          type: 'create_room',
          name: name,
          language: language
        }));
      } else {
        ws.send(JSON.stringify({
          type: 'join_room',
          roomId: roomCode.toUpperCase(),
          name: name,
          language: language
        }));
      }
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'room_created':
          setMyRoomCode(data.roomId);
          setMode('room');
          break;

        case 'room_joined':
          setMyRoomCode(data.roomId);
          setMode('room');
          break;

        case 'participants_update':
          setParticipants(data.participants);
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

        case 'error':
          setError(data.message);
          break;
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError('Connection error. Please try again.');
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      if (mode === 'room') {
        setError('Disconnected from room');
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

      mediaRecorder.start(250); // Send data every 250ms
      mediaRecorderRef.current = mediaRecorder;

      // Tell server we're starting to speak
      wsRef.current?.send(JSON.stringify({
        type: 'start_speaking'
      }));

      setIsSpeaking(true);
      setCurrentTranscript('');
    } catch (err) {
      console.error('Microphone access error:', err);
      setError('Could not access microphone. Please check permissions.');
    }
  };

  const stopSpeaking = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
    }

    wsRef.current?.send(JSON.stringify({
      type: 'stop_speaking'
    }));

    setIsSpeaking(false);
    setCurrentTranscript('');
  };

  const handleJoinRoom = () => {
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }

    if (joinMode === 'join' && !roomCode.trim()) {
      setError('Please enter room code');
      return;
    }

    setError('');
    connectWebSocket();
  };

  const leaveRoom = () => {
    stopSpeaking();
    wsRef.current?.close();
    setMode('setup');
    setMyRoomCode('');
    setParticipants([]);
    setTranslations([]);
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(myRoomCode);
    alert('Room code copied to clipboard!');
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSpeaking();
      wsRef.current?.close();
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

              {/* Error Message */}
              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
                  {error}
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
                className="text-sm text-gray-300 hover:text-white transition-colors"
              >
                📋 Copy Code
              </button>
              <button
                onClick={leaveRoom}
                className="px-4 py-2 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition-all"
              >
                Leave Room
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Participants Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
              <h2 className="text-xl font-bold text-white mb-4">Participants</h2>
              <div className="space-y-3">
                {participants.map((p) => (
                  <div key={p.userId} className="p-3 bg-black/20 rounded-lg border border-white/5">
                    <p className="text-white font-medium">{p.name}</p>
                    <p className="text-sm text-gray-400">{p.language.split('-')[0].toUpperCase()}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Translation Feed */}
          <div className="lg:col-span-2">
            {/* Translations */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6 mb-6">
              <h2 className="text-xl font-bold text-white mb-4">Conversation</h2>
              <div className="space-y-3 max-h-96 overflow-y-auto mb-4">
                {translations.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">No messages yet. Start speaking!</p>
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

            {/* Speaking Controls */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Your Microphone</h3>
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

              <button
                onMouseDown={startSpeaking}
                onMouseUp={stopSpeaking}
                onTouchStart={startSpeaking}
                onTouchEnd={stopSpeaking}
                className={`w-full px-6 py-8 rounded-xl font-bold text-lg transition-all ${
                  isSpeaking
                    ? 'bg-purple-600 text-white scale-105'
                    : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700'
                }`}
              >
                {isSpeaking ? '🎤 Release to Stop' : '🎤 Hold to Speak'}
              </button>

              <p className="text-sm text-gray-400 text-center mt-3">
                Press and hold to speak. Your speech will be translated for all participants.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
