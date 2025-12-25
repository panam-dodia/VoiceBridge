import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// YouTube API
export const youtubeAPI = {
  // Create a YouTube session - can optionally provide client-fetched transcript
  createSession: async (url: string, userId: string, transcript?: any[]) => {
    const response = await api.post('/api/youtube/create-session', { url, userId, transcript });
    return response.data;
  },

  getTranscript: async (url: string, userId: string) => {
    const response = await api.post('/api/youtube/transcript', { url, userId });
    return response.data;
  },

  translateText: async (text: string, targetLanguage: string, sessionId?: string) => {
    const response = await api.post('/api/youtube/translate-text', {
      text,
      targetLanguage,
      sessionId,
    });
    return response.data;
  },

  textToSpeech: async (text: string, gender: string = 'male', language: string = 'English') => {
    const response = await api.post('/api/youtube/text-to-speech',
      { text, gender, language },
      { responseType: 'arraybuffer' }
    );
    return response.data;
  },

  askQuestion: async (question: string, userId: string, sessionId?: string, targetLanguage: string = 'English') => {
    const response = await api.post('/api/youtube/qa', {
      question,
      userId,
      sessionId,
      targetLanguage,
    });
    return response.data;
  },

  detectGender: async (transcriptSample: string) => {
    const response = await api.post('/api/youtube/detect-gender', { transcriptSample });
    return response.data;
  },
};

// History API
export const historyAPI = {
  getSessions: async (userId: string, type?: 'youtube' | 'meeting', limit: number = 50, offset: number = 0) => {
    const response = await api.get('/api/history/sessions', {
      params: { userId, type, limit, offset },
    });
    return response.data;
  },

  getSession: async (sessionId: string) => {
    const response = await api.get(`/api/history/session/${sessionId}`);
    return response.data;
  },

  getTranscripts: async (userId: string) => {
    const response = await api.get('/api/history/transcripts', {
      params: { userId },
    });
    return response.data;
  },

  getQA: async (userId: string, limit: number = 50, offset: number = 0) => {
    const response = await api.get('/api/history/qa', {
      params: { userId, limit, offset },
    });
    return response.data;
  },

  search: async (userId: string, query: string, limit: number = 20) => {
    const response = await api.get('/api/history/search', {
      params: { userId, q: query, limit },
    });
    return response.data;
  },

  getStats: async (userId: string) => {
    const response = await api.get('/api/history/stats', {
      params: { userId },
    });
    return response.data;
  },

  askQuestion: async (userId: string, question: string, targetLanguage: string = 'English') => {
    const response = await api.post('/api/history/qa', {
      userId,
      question,
      targetLanguage,
    });
    return response.data;
  },
};

// WebSocket for meetings
export const getWebSocketURL = () => {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsHost = process.env.NEXT_PUBLIC_WS_URL || 'localhost:8080';
  return `${wsProtocol}//${wsHost}`;
};

export default api;
