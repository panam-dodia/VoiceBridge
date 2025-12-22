'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { getUserId } from '@/lib/userStore';
import { historyAPI } from '@/lib/api';

interface Session {
  id: string;
  type: 'youtube' | 'meeting';
  title: string;
  created_at: string;
  ended_at: string | null;
  language: string;
  metadata: any;
}

interface Transcript {
  id: number;
  session_id: string;
  original_text: string;
  translated_text: string | null;
  timestamp: string;
  speaker_name: string | null;
}

export default function HistoryPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [filter, setFilter] = useState<'all' | 'youtube' | 'meeting'>('all');
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [sessionDetails, setSessionDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Q&A across all history
  const [qaQuestion, setQaQuestion] = useState('');
  const [qaAnswer, setQaAnswer] = useState<string | null>(null);
  const [qaLoading, setQaLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const userId = getUserId();

  useEffect(() => {
    loadSessions();
  }, [filter]);

  useEffect(() => {
    // Initialize speech recognition
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        console.log('📝 Recognized text:', transcript);
        setQaQuestion(transcript);
      };

      recognitionRef.current.onend = () => {
        console.log('🎤 Speech recognition ended');
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const response = await historyAPI.getSessions(
        userId,
        filter === 'all' ? undefined : filter
      );
      setSessions(response.sessions || []);
    } catch (err) {
      console.error('Error loading sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadSessionDetails = async (session: Session) => {
    setSelectedSession(session);
    try {
      const response = await historyAPI.getSession(session.id);
      setSessionDetails(response);
    } catch (err) {
      console.error('Error loading session details:', err);
    }
  };

  // Ask Q&A across all history
  const handleAskQuestion = async () => {
    if (!qaQuestion.trim()) {
      console.log('⚠️ Question is empty, not sending request');
      return;
    }

    console.log('🎯 Starting Q&A request...');
    console.log('📝 Question:', qaQuestion);
    console.log('👤 User ID:', userId);

    setQaLoading(true);
    setQaAnswer(null);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
      console.log('🌐 API URL:', API_URL);
      console.log('📤 Sending POST request to:', `${API_URL}/api/history/qa`);

      const requestBody = {
        userId,
        question: qaQuestion,
        targetLanguage: 'English'
      };
      console.log('📦 Request body:', JSON.stringify(requestBody, null, 2));

      const response = await fetch(`${API_URL}/api/history/qa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      console.log('📡 Response status:', response.status);
      console.log('📡 Response ok:', response.ok);

      const data = await response.json();
      console.log('📥 Received data:', data);

      if (data.success) {
        console.log('✅ Success! Answer:', data.answer);
        setQaAnswer(data.answer);

        // Play audio response
        if (data.audioUrl) {
          const audio = new Audio(`${API_URL}${data.audioUrl}`);
          audioRef.current = audio;
          audio.play();
        }
      } else {
        console.error('❌ API returned error:', data.error);
        throw new Error(data.error || 'Failed to get answer');
      }
    } catch (err: any) {
      console.error('❌ Q&A error:', err);
      console.error('❌ Error name:', err.name);
      console.error('❌ Error message:', err.message);
      console.error('❌ Error stack:', err.stack);
      setQaAnswer('Sorry, I couldn\'t answer your question. Please try again. Error: ' + err.message);
    } finally {
      console.log('🏁 Request complete, setting loading to false');
      setQaLoading(false);
    }
  };

  const startVoiceRecording = () => {
    if (!recognitionRef.current) {
      alert('Speech recognition not supported in this browser');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      setQaQuestion('');
      setQaAnswer(null);
      recognitionRef.current.start();
      setIsListening(true);
      console.log('🎤 Voice recording started');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const groupSessionsByDate = (sessions: Session[]) => {
    const groups: { [key: string]: Session[] } = {};

    sessions.forEach(session => {
      const date = new Date(session.created_at).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });

      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(session);
    });

    return groups;
  };

  const sessionGroups = groupSessionsByDate(sessions);

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
              <Link href="/meeting" className="text-gray-300 hover:text-white transition-colors">
                Meetings
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">History</h1>
          <p className="text-gray-400">View all your translation sessions and ask questions</p>
        </div>

        {/* AI Q&A Section */}
        <div className="mb-8 bg-gradient-to-br from-purple-600/10 to-blue-600/10 backdrop-blur-sm rounded-2xl border border-purple-500/20 p-6">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-xl font-bold text-white">Ask About Your History</h2>
          </div>
          <p className="text-gray-300 mb-4 text-sm">
            Ask questions about your past YouTube videos and meetings. For example: "What did I discuss in the last meeting?" or "Summarize the YouTube video about AI"
          </p>

          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={qaQuestion}
                onChange={(e) => setQaQuestion(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !qaLoading && handleAskQuestion()}
                placeholder="Type your question or use voice..."
                className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                disabled={qaLoading || isListening}
              />
              <button
                onClick={startVoiceRecording}
                disabled={qaLoading}
                className={`px-6 py-3 rounded-xl font-medium transition-all ${
                  isListening
                    ? 'bg-red-600 text-white hover:bg-red-700 animate-pulse'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                {isListening ? '🔴 Listening...' : '🎤'}
              </button>
              <button
                onClick={handleAskQuestion}
                disabled={qaLoading || !qaQuestion.trim()}
                className="px-6 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 disabled:opacity-50 transition-all"
              >
                {qaLoading ? 'Thinking...' : 'Ask'}
              </button>
            </div>

            {qaLoading && (
              <div className="mt-4 p-4 bg-white/5 rounded-xl border border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin flex-shrink-0"></div>
                  <div className="flex-1">
                    <p className="text-gray-300">Searching through your history and generating answer...</p>
                    <div className="mt-2 w-full bg-white/5 rounded-full h-2 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-purple-600 to-blue-600 animate-pulse" style={{width: '100%'}}></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!qaLoading && qaAnswer && (
              <div className="mt-4 p-4 bg-white/5 rounded-xl border border-white/10">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-green-400 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-white">{qaAnswer}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              filter === 'all'
                ? 'bg-purple-600 text-white'
                : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}
          >
            All Sessions
          </button>
          <button
            onClick={() => setFilter('youtube')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              filter === 'youtube'
                ? 'bg-purple-600 text-white'
                : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}
          >
            YouTube
          </button>
          <button
            onClick={() => setFilter('meeting')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              filter === 'meeting'
                ? 'bg-purple-600 text-white'
                : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}
          >
            Meetings
          </button>
        </div>

        {/* Sessions Timeline */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-400 mt-4">Loading sessions...</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12 bg-white/5 rounded-2xl border border-white/10">
            <p className="text-gray-400 text-lg mb-4">No sessions found</p>
            <div className="flex gap-4 justify-center">
              <Link
                href="/youtube"
                className="px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-all"
              >
                Start YouTube Translation
              </Link>
              <Link
                href="/meeting"
                className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all"
              >
                Start Meeting
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(sessionGroups).map(([date, dateSessions]) => (
              <div key={date}>
                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                  {date}
                </h2>
                <div className="space-y-3">
                  {dateSessions.map((session) => (
                    <div
                      key={session.id}
                      onClick={() => loadSessionDetails(session)}
                      className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-4 hover:bg-white/10 transition-all cursor-pointer"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                              session.type === 'youtube'
                                ? 'bg-purple-600/20 text-purple-300'
                                : 'bg-blue-600/20 text-blue-300'
                            }`}>
                              {session.type === 'youtube' ? '🎥 YouTube' : '🎤 Meeting'}
                            </span>
                            <span className="text-sm text-gray-400">{session.language}</span>
                          </div>
                          <h3 className="text-white font-medium mb-1">{session.title}</h3>
                          <p className="text-sm text-gray-400">
                            {formatDate(session.created_at)}
                          </p>
                        </div>
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Session Detail Modal */}
      {selectedSession && sessionDetails && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedSession(null)}
        >
          <div
            className="bg-slate-900 rounded-2xl border border-white/10 max-w-4xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              {/* Modal Header */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">{selectedSession.title}</h2>
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                      selectedSession.type === 'youtube'
                        ? 'bg-purple-600/20 text-purple-300'
                        : 'bg-blue-600/20 text-blue-300'
                    }`}>
                      {selectedSession.type}
                    </span>
                    <span className="text-sm text-gray-400">{formatDate(selectedSession.created_at)}</span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedSession(null)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Transcripts */}
              {sessionDetails.transcripts && sessionDetails.transcripts.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-white mb-3">Transcripts</h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {sessionDetails.transcripts.map((t: Transcript) => (
                      <div key={t.id} className="p-3 bg-white/5 rounded-lg border border-white/5">
                        {t.speaker_name && (
                          <p className="text-sm text-purple-400 font-medium mb-1">{t.speaker_name}</p>
                        )}
                        <p className="text-white">{t.original_text}</p>
                        {t.translated_text && (
                          <p className="text-gray-400 text-sm mt-1">→ {t.translated_text}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Q&A History */}
              {sessionDetails.qa && sessionDetails.qa.length > 0 && (
                <div>
                  <h3 className="text-lg font-bold text-white mb-3">Questions & Answers</h3>
                  <div className="space-y-3">
                    {sessionDetails.qa.map((qa: any) => (
                      <div key={qa.id} className="p-4 bg-white/5 rounded-lg border border-white/5">
                        <p className="text-white font-medium mb-2">Q: {qa.question}</p>
                        <p className="text-gray-300">A: {qa.answer}</p>
                        <p className="text-xs text-gray-500 mt-2">{formatDate(qa.timestamp)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}