'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { youtubeAPI } from '@/lib/api';
import { getUserId } from '@/lib/userStore';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

const LANGUAGES = [
  'English', 'Spanish', 'French', 'German', 'Italian',
  'Portuguese', 'Russian', 'Japanese', 'Korean', 'Chinese', 'Hindi'
];

interface Transcript {
  text: string;
  start: number;
  duration: number;
}

export default function YouTubePage() {
  const [url, setUrl] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [targetLanguage, setTargetLanguage] = useState('Hindi');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<Transcript[]>([]);
  const [translations, setTranslations] = useState<Map<number, string>>(new Map());
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState('');
  const [voiceGender, setVoiceGender] = useState<'male' | 'female'>('male');

  // Auto-play states
  const [autoPlayAudio, setAutoPlayAudio] = useState(true);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [currentAudioIndex, setCurrentAudioIndex] = useState<number | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [hasUserStarted, setHasUserStarted] = useState(false);
  const [maxReachedIndex, setMaxReachedIndex] = useState<number>(-1);

  // Preloading states
  const [isPreloading, setIsPreloading] = useState(false);
  const [preloadProgress, setPreloadProgress] = useState(0);
  const [preloadMessage, setPreloadMessage] = useState('Loading...');

  // Q&A states
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [askingQuestion, setAskingQuestion] = useState(false);

  // Floating window state
  const [showFloatingWindow, setShowFloatingWindow] = useState(false);

  const userId = getUserId();
  const playerRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeUpdateInterval = useRef<any>(null);
  const audioCache = useRef<Map<number, string>>(new Map());
  const translationCache = useRef<Map<number, string>>(new Map());
  const audioQueue = useRef<number[]>([]);
  const isProcessingQueue = useRef<boolean>(false);
  const lastPlayedIndex = useRef<number>(-1);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeUpdateInterval.current) {
        clearInterval(timeUpdateInterval.current);
      }
      audioCache.current.forEach((url) => URL.revokeObjectURL(url));
      audioCache.current.clear();
      translationCache.current.clear();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  // Auto-play audio when video plays
  useEffect(() => {
    if (transcript.length > 0 && hasUserStarted) {
      const currentIndex = getCurrentTranscriptIndex(currentTime);

      if (currentIndex !== null && currentIndex > maxReachedIndex) {
        setMaxReachedIndex(currentIndex);
      }

      if (autoPlayAudio && playerRef.current && isVideoPlaying) {
        if (currentIndex !== null && currentIndex !== lastPlayedIndex.current) {
          lastPlayedIndex.current = currentIndex;

          if (!audioQueue.current.includes(currentIndex)) {
            audioQueue.current.push(currentIndex);
            console.log(`➕ Added segment ${currentIndex} to queue`);
          }

          if (!isProcessingQueue.current) {
            processAudioQueue();
          }
        }
      }
    }
  }, [currentTime, autoPlayAudio, transcript, isPlayingAudio, isVideoPlaying, hasUserStarted, maxReachedIndex]);

  // Mute/unmute YouTube based on auto-play setting
  useEffect(() => {
    if (playerRef.current && playerRef.current.mute && playerRef.current.unMute) {
      if (autoPlayAudio) {
        playerRef.current.mute();
      } else {
        playerRef.current.unMute();
      }
    }
  }, [autoPlayAudio]);

  // Auto-scroll to current segment
  useEffect(() => {
    if (transcriptRef.current && maxReachedIndex >= 0) {
      const element = transcriptRef.current.querySelector(`[data-index="${maxReachedIndex}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [maxReachedIndex]);

  const extractVideoId = (urlString: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
      /youtube\.com\/embed\/([^&\n?#]+)/,
      /youtube\.com\/v\/([^&\n?#]+)/
    ];

    for (const pattern of patterns) {
      const match = urlString.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const handleLoadTranscript = async () => {
    if (!url.trim()) {
      setError('Please enter a YouTube URL');
      return;
    }

    const extractedId = extractVideoId(url);
    if (!extractedId) {
      setError('Invalid YouTube URL');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await youtubeAPI.getTranscript(url, userId);
      setVideoId(extractedId);
      setSessionId(response.sessionId);
      setTranscript(response.transcript);

      // Detect gender
      if (response.transcript.length > 0) {
        detectGender(response.transcript);
      }

      // Load YouTube Player
      loadYouTubeAPI(extractedId);

      // Start preloading translations and audio
      await initialPreload(response.transcript, targetLanguage);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load transcript');
      console.error('Error loading transcript:', err);
    } finally {
      setLoading(false);
    }
  };

  const detectGender = async (transcriptData: Transcript[]) => {
    try {
      const sample = transcriptData.slice(0, 5).map(s => s.text).join(' ');
      const response = await youtubeAPI.detectGender(sample);
      setVoiceGender(response.gender);
      console.log(`Detected voice gender: ${response.gender}`);
    } catch (err) {
      console.error('Gender detection error:', err);
    }
  };

  const loadYouTubeAPI = (vidId: string) => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = () => initializePlayer(vidId);
    } else {
      initializePlayer(vidId);
    }
  };

  const initializePlayer = (vidId: string) => {
    if (playerRef.current) return;

    playerRef.current = new window.YT.Player('youtube-player', {
      videoId: vidId,
      playerVars: {
        autoplay: 0,
        controls: 1,
      },
      events: {
        onReady: onPlayerReady,
        onStateChange: onPlayerStateChange,
      },
    });
  };

  const onPlayerReady = () => {
    timeUpdateInterval.current = setInterval(() => {
      if (playerRef.current && playerRef.current.getCurrentTime) {
        const time = playerRef.current.getCurrentTime();
        setCurrentTime(time);
      }
    }, 100);

    if (autoPlayAudio && playerRef.current && playerRef.current.mute) {
      playerRef.current.mute();
    }
  };

  const onPlayerStateChange = (event: any) => {
    if (event.data === 1) {
      setIsVideoPlaying(true);
      setHasUserStarted(true);
    } else if (event.data === 2 || event.data === 0) {
      setIsVideoPlaying(false);
      if (audioRef.current) {
        audioRef.current.pause();
        setIsPlayingAudio(false);
        setCurrentAudioIndex(null);
      }
    }
  };

  const getCurrentTranscriptIndex = (time: number): number | null => {
    for (let i = 0; i < transcript.length; i++) {
      const current = transcript[i];
      const next = transcript[i + 1];

      if (time >= current.start && (!next || time < next.start)) {
        return i;
      }
    }
    return null;
  };

  const initialPreload = async (transcriptData: Transcript[], language: string) => {
    setIsPreloading(true);
    setPreloadProgress(0);
    setPreloadMessage('Preloading translations and audio...');

    const segmentsToPreload = Math.min(10, transcriptData.length);

    for (let i = 0; i < segmentsToPreload; i++) {
      try {
        const originalText = transcriptData[i].text;
        const translatedText = await translateText(originalText, i, language);

        // Generate audio
        const audioData = await youtubeAPI.textToSpeech(translatedText, voiceGender);
        const audioBlob = new Blob([audioData], { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(audioBlob);
        audioCache.current.set(i, audioUrl);

        const progress = Math.round(((i + 1) / segmentsToPreload) * 100);
        setPreloadProgress(progress);
        console.log(`✓ Pre-loaded segment ${i + 1}/${segmentsToPreload}`);
      } catch (err) {
        console.error(`Failed to preload segment ${i}:`, err);
      }
    }

    setIsPreloading(false);
    console.log(`✓ Pre-loading complete!`);
  };

  const translateText = async (text: string, index: number, language: string): Promise<string> => {
    if (translationCache.current.has(index)) {
      return translationCache.current.get(index)!;
    }

    if (language === 'English') {
      translationCache.current.set(index, text);
      setTranslations(prev => new Map(prev).set(index, text));
      return text;
    }

    try {
      const response = await youtubeAPI.translateText(text, language, sessionId || undefined);
      const translated = response.translatedText;
      translationCache.current.set(index, translated);
      setTranslations(prev => new Map(prev).set(index, translated));
      return translated;
    } catch (err) {
      console.error(`Translation error for segment ${index}:`, err);
      return text;
    }
  };

  const processAudioQueue = async () => {
    if (isProcessingQueue.current || audioQueue.current.length === 0) return;

    isProcessingQueue.current = true;

    while (audioQueue.current.length > 0) {
      const index = audioQueue.current.shift()!;

      try {
        await playTranslationAudio(index);
      } catch (err) {
        console.error(`Error playing segment ${index}:`, err);
      }
    }

    isProcessingQueue.current = false;
  };

  const playTranslationAudio = async (index: number) => {
    if (index < 0 || index >= transcript.length) return;

    setIsPlayingAudio(true);
    setCurrentAudioIndex(index);

    let audioUrl = audioCache.current.get(index);

    if (!audioUrl) {
      setPreloadMessage('Preparing segment...');
      setIsPreloading(true);
      setPreloadProgress(50);

      const originalText = transcript[index].text;
      const translatedText = await translateText(originalText, index, targetLanguage);

      const audioData = await youtubeAPI.textToSpeech(translatedText, voiceGender);
      const audioBlob = new Blob([audioData], { type: 'audio/mpeg' });
      audioUrl = URL.createObjectURL(audioBlob);
      audioCache.current.set(index, audioUrl);

      setIsPreloading(false);
    }

    if (!audioRef.current) {
      audioRef.current = new Audio();
    }

    audioRef.current.src = audioUrl;

    return new Promise<void>((resolve) => {
      audioRef.current!.onended = () => {
        setIsPlayingAudio(false);
        setCurrentAudioIndex(null);
        resolve();
      };

      audioRef.current!.play().catch(err => {
        console.error('Audio playback error:', err);
        setIsPlayingAudio(false);
        setCurrentAudioIndex(null);
        resolve();
      });
    });
  };

  const handleAskQuestion = async () => {
    if (!question.trim()) return;

    setAskingQuestion(true);
    setAnswer('');

    try {
      const response = await youtubeAPI.askQuestion(question, userId, sessionId || undefined, targetLanguage);
      setAnswer(response.answer);
      setQuestion('');
    } catch (err: any) {
      setAnswer('Failed to get answer. Please try again.');
      console.error('Q&A error:', err);
    } finally {
      setAskingQuestion(false);
    }
  };

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
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">YouTube Translator</h1>
          <p className="text-gray-400">Watch videos with real-time translation and audio</p>
        </div>

        {/* Input Section */}
        {!videoId && (
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6 mb-6">
            <div className="space-y-4">
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

              <button
                onClick={handleLoadTranscript}
                disabled={loading || !url.trim()}
                className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-medium hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? 'Loading Transcript...' : 'Start Translation'}
              </button>

              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
                  {error}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Preloading Progress */}
        {isPreloading && (
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6 mb-6">
            <div className="text-center">
              <p className="text-white font-medium mb-3">{preloadMessage}</p>
              <div className="w-full bg-black/30 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-purple-600 to-blue-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${preloadProgress}%` }}
                ></div>
              </div>
              <p className="text-gray-400 text-sm mt-2">{preloadProgress}%</p>
            </div>
          </div>
        )}

        {/* Video and Transcripts */}
        {videoId && transcript.length > 0 && (
          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            {/* YouTube Player */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">Video</h2>
                <button
                  onClick={() => setShowFloatingWindow(!showFloatingWindow)}
                  className="px-3 py-1 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition-all"
                >
                  {showFloatingWindow ? 'Dock' : 'Float'}
                </button>
              </div>
              <div
                id="youtube-player"
                className={showFloatingWindow ? 'hidden' : 'aspect-video w-full'}
              ></div>

              {/* Auto-play toggle */}
              <div className="mt-4 flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoPlayAudio}
                    onChange={(e) => setAutoPlayAudio(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-white text-sm">Auto-play translations</span>
                </label>
                <span className="text-sm text-gray-400">Voice: {voiceGender}</span>
              </div>
            </div>

            {/* Translations */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
              <h2 className="text-xl font-bold text-white mb-4">Translation ({targetLanguage})</h2>
              <div
                ref={transcriptRef}
                className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar"
              >
                {transcript.map((segment, index) => {
                  if (index > maxReachedIndex) return null;

                  return (
                    <div
                      key={index}
                      data-index={index}
                      className={`p-3 rounded-lg transition-all ${
                        currentAudioIndex === index
                          ? 'bg-purple-600/30 border border-purple-500'
                          : 'bg-black/20 border border-white/5'
                      }`}
                    >
                      {translations.get(index) ? (
                        <p className="text-white">{translations.get(index)}</p>
                      ) : (
                        <p className="text-gray-500 italic">Translating...</p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">{segment.text}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Floating Video Window */}
        {showFloatingWindow && videoId && (
          <div className="fixed bottom-6 right-6 w-96 bg-black rounded-2xl shadow-2xl border border-white/10 z-50">
            <div className="p-3 border-b border-white/10 flex items-center justify-between">
              <span className="text-white text-sm font-medium">YouTube Player</span>
              <button
                onClick={() => setShowFloatingWindow(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div id="youtube-player-floating" className="aspect-video w-full"></div>
          </div>
        )}

        {/* Q&A Section */}
        {sessionId && (
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
            <h2 className="text-xl font-bold text-white mb-4">Ask a Question</h2>
            <div className="space-y-4">
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

              {answer && (
                <div className="p-4 bg-purple-600/10 border border-purple-500/20 rounded-xl">
                  <p className="text-sm text-purple-300 font-medium mb-1">Answer:</p>
                  <p className="text-white">{answer}</p>
                </div>
              )}
            </div>
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
