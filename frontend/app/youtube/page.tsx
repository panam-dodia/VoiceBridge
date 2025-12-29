'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { youtubeAPI } from '@/lib/api';
import { getUserId } from '@/lib/userStore';
import { fetchYouTubeTranscriptInnertube } from '@/lib/youtube-innertube';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
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

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function YouTubePage() {
  const [url, setUrl] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState<string>('');
  const [targetLanguage, setTargetLanguage] = useState('');
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
  const [askingQuestion, setAskingQuestion] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatMode, setChatMode] = useState<'text' | 'voice'>('text');
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeakingAnswer, setIsSpeakingAnswer] = useState(false);

  const userId = getUserId();
  const playerRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const qaAudioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
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

    if (!targetLanguage) {
      setError('Please select a target language');
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
      console.log('🎯 Fetching transcript from browser (client-side)...');

      // Fetch transcript from browser using user's own IP (bypasses Cloud Run IP blocking)
      const clientTranscript = await fetchYouTubeTranscriptInnertube(extractedId);
      console.log(`✅ Fetched ${clientTranscript.length} segments from browser`);

      // Send transcript to backend for processing
      const response = await youtubeAPI.createSession(url, userId, clientTranscript);

      console.log('Backend response:', response);

      // Set video title from metadata
      if (response.metadata && response.metadata.title) {
        setVideoTitle(response.metadata.title);
      }

      if (!response.transcript || response.transcript.length === 0) {
        throw new Error('This video doesn\'t have captions. Please try a different video with CC enabled.');
      }

      setVideoId(extractedId);
      setSessionId(response.sessionId);
      setTranscript(response.transcript);

      // Detect gender FIRST and wait for it to complete
      let detectedGender: 'male' | 'female' = 'male';
      if (response.transcript.length > 0) {
        detectedGender = await detectGender(response.transcript);
      }

      // Load YouTube Player
      loadYouTubeAPI(extractedId);

      // Start preloading translations and audio with the detected gender
      await initialPreload(response.transcript, targetLanguage, detectedGender);

    } catch (err: any) {
      setError(err.message || 'Failed to load transcript');
      console.error('Error loading transcript:', err);
    } finally {
      setLoading(false);
    }
  };

  const detectGender = async (transcriptData: Transcript[]): Promise<'male' | 'female'> => {
    try {
      const sample = transcriptData.slice(0, 5).map(s => s.text).join(' ');
      const response = await youtubeAPI.detectGender(sample);
      setVoiceGender(response.gender);
      console.log(`Detected voice gender: ${response.gender}`);
      return response.gender;
    } catch (err) {
      console.error('Gender detection error:', err);
      return 'male'; // Default fallback
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
      // Playing
      setIsVideoPlaying(true);
      setHasUserStarted(true);
      // Resume audio queue processing if needed
      if (autoPlayAudio && audioQueue.current.length > 0 && !isProcessingQueue.current) {
        processAudioQueue();
      }
    } else if (event.data === 2) {
      // Paused
      setIsVideoPlaying(false);
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setIsPlayingAudio(false);
      }
    } else if (event.data === 0) {
      // Ended
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

  const initialPreload = async (transcriptData: Transcript[], language: string, gender: 'male' | 'female') => {
    setIsPreloading(true);
    setPreloadProgress(0);
    setPreloadMessage('Preparing your experience...');

    const segmentsToPreload = Math.min(10, transcriptData.length);

    for (let i = 0; i < segmentsToPreload; i++) {
      try {
        const originalText = transcriptData[i].text;
        const translatedText = await translateText(originalText, i, language);

        // Generate audio with the detected gender and target language
        const audioData = await youtubeAPI.textToSpeech(translatedText, gender, language);
        const audioBlob = new Blob([audioData], { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(audioBlob);
        audioCache.current.set(i, audioUrl);

        const progress = Math.round(((i + 1) / segmentsToPreload) * 100);
        setPreloadProgress(progress);
        console.log(`✓ Pre-loaded segment ${i + 1}/${segmentsToPreload} with ${gender} voice`);
      } catch (err) {
        console.error(`Failed to preload segment ${i}:`, err);
      }
    }

    setIsPreloading(false);
    console.log(`✓ Pre-loading complete with ${gender} voice!`);
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

      const audioData = await youtubeAPI.textToSpeech(translatedText, voiceGender, targetLanguage);
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

  const openFloatingWindow = () => {
    if (!videoId) return;

    const width = 600;
    const height = 400;
    const left = window.screen.width - width - 20;
    const top = window.screen.height - height - 100;

    window.open(
      `/youtube/pip?videoId=${videoId}&lang=${targetLanguage}`,
      'YouTube Player',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no`
    );
  };

  const startVoiceRecording = () => {
    console.log('🎤 Starting voice recording...');

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Voice input is not supported in your browser. Please use Chrome or Edge.');
      return;
    }

    if (playerRef.current?.pauseVideo) {
      playerRef.current.pauseVideo();
    }

    setIsRecording(true);

    // Map target language to speech recognition language code
    const languageMap: { [key: string]: string } = {
      'English': 'en-US',
      'Spanish': 'es-ES',
      'French': 'fr-FR',
      'German': 'de-DE',
      'Italian': 'it-IT',
      'Portuguese': 'pt-PT',
      'Russian': 'ru-RU',
      'Japanese': 'ja-JP',
      'Korean': 'ko-KR',
      'Chinese': 'zh-CN',
      'Hindi': 'hi-IN'
    };

    const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.lang = languageMap[targetLanguage] || 'en-US';
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;

    console.log(`🌍 Voice recognition language set to: ${recognitionRef.current.lang} (${targetLanguage})`);

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
    if (!finalQuestion.trim()) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: finalQuestion,
      timestamp: new Date()
    };
    setChatHistory(prev => [...prev, userMessage]);
    setQuestion('');
    setAskingQuestion(true);

    try {
      console.log('Sending question:', finalQuestion, 'Language:', targetLanguage);
      const response = await youtubeAPI.askQuestion(finalQuestion, userId, sessionId || undefined, targetLanguage);
      console.log('Received response:', response);

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.answer,
        timestamp: new Date()
      };
      setChatHistory(prev => [...prev, assistantMessage]);

      if (chatMode === 'voice') {
        console.log('Speaking answer in voice mode');
        await speakAnswer(response.answer);
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
      const audioData = await youtubeAPI.textToSpeech(text, voiceGender, targetLanguage);
      const audioBlob = new Blob([audioData], { type: 'audio/mpeg' });
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
                {url && (
                  <div className="mt-2 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                    <p className="text-sm text-blue-300">
                      📺 Tip: Use videos with captions (CC) for translation!<br />
                      <span className="text-xs text-blue-400">(Speech-to-text APIs are expensive, and I'm a broke student 😅)</span>
                    </p>
                  </div>
                )}
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
                  <option value="">Select your language</option>
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
                <div>
                  <h2 className="text-xl font-bold text-white">Video</h2>
                  {videoTitle && (
                    <p className="text-sm text-gray-400 mt-1">{videoTitle}</p>
                  )}
                </div>
                <button
                  onClick={openFloatingWindow}
                  className="px-3 py-1 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition-all"
                >
                  Open Floating
                </button>
              </div>
              <div
                id="youtube-player"
                className="aspect-video w-full"
              ></div>

              {/* Auto-play toggle and Voice Gender */}
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
                <button
                  onClick={() => {
                    const newGender = voiceGender === 'male' ? 'female' : 'male';
                    console.log(`🔄 User manually switched voice from ${voiceGender} to ${newGender}`);
                    setVoiceGender(newGender);
                    // Clear audio cache to force regeneration with new voice
                    audioCache.current.forEach((url) => URL.revokeObjectURL(url));
                    audioCache.current.clear();
                    console.log('🗑️ Audio cache cleared - will regenerate with new voice');
                  }}
                  className="px-3 py-1.5 bg-black/30 hover:bg-black/50 border border-white/10 rounded-lg text-sm text-white transition-all flex items-center gap-2"
                  title="Click to switch voice gender"
                >
                  <span className="text-gray-400">Voice:</span>
                  <span className="font-medium capitalize">{voiceGender}</span>
                  <span className="text-gray-500">↻</span>
                </button>
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

        {/* Q&A Section */}
        {sessionId && (
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
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

            {/* Input Section */}
            {chatMode === 'text' ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAskQuestion()}
                  placeholder="Ask anything about this video..."
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
                  {isRecording ? 'Stop' : 'Start Recording'}
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
