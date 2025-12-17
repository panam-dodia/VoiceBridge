'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getUserId } from '@/lib/userStore';
import { historyAPI } from '@/lib/api';

export default function Home() {
  const [stats, setStats] = useState({ youtube_count: 0, meeting_count: 0, total_sessions: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const userId = getUserId();
        const response = await historyAPI.getStats(userId);
        setStats(response.stats || { youtube_count: 0, meeting_count: 0, total_sessions: 0 });
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20"></div>
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <nav className="flex items-center justify-between p-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-purple"></div>
            <span className="text-2xl font-bold gradient-text">TalkBridge</span>
          </div>
          <Link
            href="/history"
            className="px-4 py-2 rounded-lg glass hover:bg-white/10 transition-all duration-300"
          >
            History
          </Link>
        </nav>

        {/* Hero Section */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
          <div className="text-center mb-16">
            <h1 className="text-6xl md:text-7xl font-bold mb-6 gradient-text">
              Break Language Barriers
            </h1>
            <p className="text-xl md:text-2xl text-gray-300 max-w-3xl mx-auto">
              Translate YouTube videos in real-time or have multilingual conversations with anyone, anywhere.
            </p>
          </div>

          {/* Feature Cards */}
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto mb-16">
            {/* YouTube Translator Card */}
            <Link href="/youtube">
              <div className="group relative p-8 rounded-2xl glass hover:bg-white/10 transition-all duration-500 cursor-pointer overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 to-blue-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

                <div className="relative z-10">
                  <div className="w-16 h-16 rounded-xl gradient-purple flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                    <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M10 15l5.19-3L10 9v6m11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83-1.48 1.73-1.73.47-.13 1.33-.22 2.65-.28 1.3-.07 2.49-.1 3.59-.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73z"/>
                    </svg>
                  </div>

                  <h2 className="text-3xl font-bold mb-4 text-white">YouTube Translator</h2>
                  <p className="text-gray-300 mb-6">
                    Watch YouTube videos with real-time translation and voice-powered Q&A in any language.
                  </p>

                  <div className="flex items-center text-purple-400 group-hover:text-purple-300 transition-colors">
                    <span className="font-semibold">Start translating</span>
                    <svg className="w-5 h-5 ml-2 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </Link>

            {/* Meeting Translator Card */}
            <Link href="/meeting">
              <div className="group relative p-8 rounded-2xl glass hover:bg-white/10 transition-all duration-500 cursor-pointer overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 to-cyan-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

                <div className="relative z-10">
                  <div className="w-16 h-16 rounded-xl gradient-blue flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </div>

                  <h2 className="text-3xl font-bold mb-4 text-white">Live Meeting Translation</h2>
                  <p className="text-gray-300 mb-6">
                    Have real-time multilingual conversations with multiple participants. Everyone speaks their language.
                  </p>

                  <div className="flex items-center text-blue-400 group-hover:text-blue-300 transition-colors">
                    <span className="font-semibold">Start meeting</span>
                    <svg className="w-5 h-5 ml-2 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </Link>
          </div>

          {/* Stats */}
          {!loading && stats.total_sessions > 0 && (
            <div className="max-w-3xl mx-auto">
              <div className="grid grid-cols-3 gap-4 p-6 rounded-xl glass">
                <div className="text-center">
                  <div className="text-3xl font-bold gradient-text">{stats.youtube_count}</div>
                  <div className="text-sm text-gray-400">Videos Translated</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold gradient-text">{stats.meeting_count}</div>
                  <div className="text-sm text-gray-400">Meetings Held</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold gradient-text">{stats.total_sessions}</div>
                  <div className="text-sm text-gray-400">Total Sessions</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="text-center py-8 text-gray-400">
          <p>Powered by Google Cloud, ElevenLabs, and Gemini AI</p>
        </footer>
      </div>

      <style jsx>{`
        @keyframes blob {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </main>
  );
}
