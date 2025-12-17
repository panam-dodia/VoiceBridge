'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { getUserId } from '@/lib/userStore';
import { youtubeAPI } from '@/lib/api';

interface Transcript {
  text: string;
  start: number;
  duration: number;
}

const LANGUAGES = [
  'English', 'Spanish', 'French', 'German', 'Italian',
  'Portuguese', 'Russian', 'Japanese', 'Korean', 'Chinese', 'Hindi'
];

export default function YouTubePage() {
  const [url, setUrl] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('Spanish');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<Transcript[]>([]);
  const [translations, setTranslations] = useState<{ [key: number]: string }>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [askingQuestion, setAskingQuestion] = useState(false);
  const [error, setError] = useState('');

  const transcriptRef = useRef<HTMLDivElement>(null);
  const userId = getUserId();

  const handleLoadTranscript = async () => {
    if (!url.trim()) {
      setError('Please enter a YouTube URL');
      return;
    }

    setLoading(true);
    setError('');
    setTranscript([]);
    setTranslations({});
    setCurrentIndex(0);

    try {
      const response = await youtubeAPI.getTranscript(url, userId);
      setSessionId(response.sessionId);
      setTranscript(response.transcript);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load transcript');
      console.error('Error loading transcript:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTranslateSegment = async (index: number) => {
    if (translations[index]) return; // Already translated

    try {
      const segment = transcript[index];
      const response = await youtubeAPI.translateText(
        segment.text,
        targetLanguage,
        sessionId || undefined
      );

      setTranslations(prev => ({
        ...prev,
        [index]: response.translatedText
      }));
    } catch (err) {
      console.error('Translation error:', err);
    }
  };

  const handleAskQuestion = async () => {
    if (!question.trim()) return;

    setAskingQuestion(true);
    setAnswer('');

    try {
      const response = await youtubeAPI.askQuestion(
        question,
        userId,
        sessionId || undefined,
        targetLanguage
      );
      setAnswer(response.answer);
      setQuestion('');
    } catch (err: any) {
      setAnswer('Failed to get answer. Please try again.');
      console.error('Q&A error:', err);
    } finally {
      setAskingQuestion(false);
    }
  };

  // Auto-translate visible segments
  useEffect(() => {
    if (transcript.length > 0 && currentIndex < transcript.length) {
      handleTranslateSegment(currentIndex);
      // Preload next segments
      if (currentIndex + 1 < transcript.length) handleTranslateSegment(currentIndex + 1);
      if (currentIndex + 2 < transcript.length) handleTranslateSegment(currentIndex + 2);
    }
  }, [currentIndex, transcript.length]);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current && transcript.length > 0) {
      const element = transcriptRef.current.querySelector(`[data-index="${currentIndex}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentIndex]);

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
              <Link href="/history" className="text-gray-300 hover:text-white transition-colors">
                History
              </Link>
              <Link href="/meeting" className="text-gray-300 hover:text-white transition-colors">
                Meetings
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">YouTube Translator</h1>
          <p className="text-gray-400">Watch videos with real-time translation</p>
        </div>

        {/* Input Section */}
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6 mb-6">
          <div className="space-y-4">
            {/* URL Input */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                YouTube URL
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                disabled={loading}
              />
            </div>

            {/* Language Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Target Language
              </label>
              <select
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500 transition-colors"
                disabled={loading}
              >
                {LANGUAGES.map(lang => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
            </div>

            {/* Load Button */}
            <button
              onClick={handleLoadTranscript}
              disabled={loading || !url.trim()}
              className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-medium hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? 'Loading Transcript...' : 'Start Translation'}
            </button>

            {/* Error Message */}
            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Transcript & Translation Section */}
        {transcript.length > 0 && (
          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            {/* Original Transcript */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
              <h2 className="text-xl font-bold text-white mb-4">Original (English)</h2>
              <div
                ref={transcriptRef}
                className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar"
              >
                {transcript.map((segment, index) => (
                  <div
                    key={index}
                    data-index={index}
                    className={`p-3 rounded-lg transition-all cursor-pointer ${
                      index === currentIndex
                        ? 'bg-purple-600/20 border border-purple-500/30'
                        : 'bg-black/20 border border-white/5 hover:bg-white/5'
                    }`}
                    onClick={() => setCurrentIndex(index)}
                  >
                    <p className="text-white">{segment.text}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {Math.floor(segment.start / 60)}:{String(Math.floor(segment.start % 60)).padStart(2, '0')}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Translated Text */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
              <h2 className="text-xl font-bold text-white mb-4">Translation ({targetLanguage})</h2>
              <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
                {transcript.map((segment, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg transition-all ${
                      index === currentIndex
                        ? 'bg-blue-600/20 border border-blue-500/30'
                        : 'bg-black/20 border border-white/5'
                    }`}
                  >
                    {translations[index] ? (
                      <p className="text-white">{translations[index]}</p>
                    ) : (
                      <p className="text-gray-500 italic">Translating...</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Q&A Section */}
        {sessionId && (
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
            <h2 className="text-xl font-bold text-white mb-4">Ask a Question</h2>

            <div className="space-y-4">
              {/* Question Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAskQuestion()}
                  placeholder="Ask anything about this video..."
                  className="flex-1 px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                  disabled={askingQuestion}
                />
                <button
                  onClick={handleAskQuestion}
                  disabled={askingQuestion || !question.trim()}
                  className="px-6 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {askingQuestion ? 'Asking...' : 'Ask'}
                </button>
              </div>

              {/* Answer Display */}
              {answer && (
                <div className="p-4 bg-purple-600/10 border border-purple-500/20 rounded-xl">
                  <p className="text-sm text-purple-300 font-medium mb-1">Answer:</p>
                  <p className="text-white">{answer}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation Controls */}
        {transcript.length > 0 && (
          <div className="mt-6 flex justify-center gap-4">
            <button
              onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
              className="px-6 py-2 bg-white/5 border border-white/10 text-white rounded-lg hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              ← Previous
            </button>
            <span className="px-4 py-2 text-gray-400">
              {currentIndex + 1} / {transcript.length}
            </span>
            <button
              onClick={() => setCurrentIndex(Math.min(transcript.length - 1, currentIndex + 1))}
              disabled={currentIndex === transcript.length - 1}
              className="px-6 py-2 bg-white/5 border border-white/10 text-white rounded-lg hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 3px;
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
