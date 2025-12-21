'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { getWebSocketURL } from '@/lib/api';
import { getUserId } from '@/lib/userStore';
import axios from 'axios';

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
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Q&A states
  const [question, setQuestion] = useState('');
  const [askingQuestion, setAskingQuestion] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatMode, setChatMode] = useState<'text' | 'voice'>('text');
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeakingAnswer, setIsSpeakingAnswer] = useState(false);

  // Video states
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [myUserId, setMyUserId] = useState<string>('');

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const translationsEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const qaAudioRef = useRef<HTMLAudioElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  // Auto-scroll to latest translation
  useEffect(() => {
    translationsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [translations]);

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
          break;

        case 'room_joined':
          console.log('✅ Room joined, sessionId:', data.sessionId);
          setMyRoomCode(data.roomId);
          setSessionId(data.sessionId);
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
      setError('Could not access microphone. Please check permissions.');
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
    recognitionRef.current.lang = language; // Use meeting language
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

      const response = await axios.post('http://localhost:8080/api/history/qa', {
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

      const response = await axios.post('http://localhost:8080/api/youtube/text-to-speech',
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
                onClick={isSpeaking ? stopSpeaking : startSpeaking}
                className={`w-full px-6 py-8 rounded-xl font-bold text-lg transition-all ${
                  isSpeaking
                    ? 'bg-red-600 text-white scale-105 animate-pulse'
                    : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700'
                }`}
              >
                {isSpeaking ? '⏹️ Stop Speaking' : '🎤 Start Speaking'}
              </button>

              <p className="text-sm text-gray-400 text-center mt-3">
                Click to start speaking, click again to stop. Your speech will be translated for all participants.
              </p>
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

                {/* Chat History */}
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
                    <div className="text-center text-gray-400 animate-pulse">
                      Thinking...
                    </div>
                  )}
                </div>

                {/* Input Section */}
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
