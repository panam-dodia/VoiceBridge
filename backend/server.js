import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import youtubeRoutes from './routes/youtube.routes.js';
import historyRoutes from './routes/history.routes.js';
import speechService from './services/speech.service.js';
import aiService from './services/ai.service.js';
import ttsService from './services/tts.service.js';
import historyService from './services/history.service.js';
import db from './database/db.js';

const app = express();

// Middleware
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  process.env.FRONTEND_URL,
  /https:\/\/.*\.vercel\.app$/,  // Allow all Vercel preview and production URLs
  /https:\/\/.*\.run\.app$/      // Allow all Cloud Run URLs
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    // Check if origin is in allowed list or matches regex pattern
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return allowed === origin;
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      console.log('⚠️ CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'TalkBridge server running' });
});

// API Routes
app.use('/api/youtube', youtubeRoutes);
app.use('/api/history', historyRoutes);

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server for meeting translation
const wss = new WebSocketServer({ server });

// Store rooms and participants
const rooms = new Map(); // roomId -> { participants: Map(...), sessionId, conversationHistory: [], chatHistory: [] }

// Generate random room ID
function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Language name mapping
const languageNames = {
  'en-US': 'English',
  'es-ES': 'Spanish',
  'fr-FR': 'French',
  'de-DE': 'German',
  'it-IT': 'Italian',
  'pt-PT': 'Portuguese',
  'ru-RU': 'Russian',
  'ja-JP': 'Japanese',
  'ko-KR': 'Korean',
  'zh-CN': 'Chinese',
  'hi-IN': 'Hindi'
};

function getLanguageName(code) {
  return languageNames[code] || code.split('-')[0];
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('✓ New client connected');

  let userId = null;
  let currentRoom = null;
  let recognizeStream = null;
  let typingTimeout = null;

  ws.on('message', async (message) => {
    try {
      // Check if it's binary audio data or JSON
      if (message instanceof Buffer) {
        // Try to parse as JSON first
        try {
          const text = message.toString('utf8');
          const data = JSON.parse(text);

          console.log('Received message:', data.type);

          // Handle different message types
          switch (data.type) {
            case 'create_room':
              await handleCreateRoom(ws, data);
              break;

            case 'join_room':
              await handleJoinRoom(ws, data);
              break;

            case 'start_speaking':
              await handleStartSpeaking(ws, data);
              break;

            case 'stop_speaking':
              handleStopSpeaking();
              break;

            case 'agent_query_start':
              await handleAgentQueryStart(ws, data);
              break;

            case 'agent_query_stop':
              handleStopSpeaking();
              break;

            // Chat messages
            case 'chat_message':
              handleChatMessage(data);
              break;

            case 'typing_start':
              handleTypingStart();
              break;

            case 'typing_stop':
              handleTypingStop();
              break;

            // WebRTC signaling
            case 'webrtc_offer':
            case 'webrtc_answer':
            case 'webrtc_ice_candidate':
              handleWebRTCSignaling(data);
              break;

            default:
              console.log('Unknown message type:', data.type);
          }

          return;
        } catch (jsonError) {
          // Not JSON, treat as binary audio data
          if (recognizeStream) {
            console.log(`🎵 Received audio chunk: ${message.length} bytes`);
            recognizeStream.write(message);
          } else {
            console.warn('⚠️ Received audio data but no recognition stream active');
          }
          return;
        }
      }
    } catch (error) {
      console.error('Message handling error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message
      }));
    }
  });

  ws.on('close', () => {
    console.log(`Client disconnected - userId: ${userId}, room: ${currentRoom}`);
    handleDisconnect();
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  // Handler functions
  async function handleCreateRoom(ws, data) {
    const roomId = generateRoomId();
    userId = data.userId || Date.now().toString(); // Use provided userId or generate one

    console.log(`📝 Creating room with userId: ${userId}`);

    // Create session in database
    const sessionId = historyService.createSession(
      userId,
      'meeting',
      { roomId, creatorName: data.name },
      `Meeting: ${roomId}`,
      getLanguageName(data.language)
    );

    rooms.set(roomId, {
      participants: new Map(),
      sessionId: sessionId,
      conversationHistory: [],
      chatHistory: [] // Store chat messages
    });

    rooms.get(roomId).participants.set(userId, {
      ws: ws,
      language: data.language,
      name: data.name,
      recognizeStream: null,
      isTyping: false
    });

    currentRoom = roomId;

    console.log(`✓ Room ${roomId} created by ${data.name}`);

    ws.send(JSON.stringify({
      type: 'room_created',
      roomId: roomId,
      userId: userId,
      sessionId: sessionId
    }));

    broadcastParticipants(roomId);
  }

  async function handleJoinRoom(ws, data) {
    const roomId = data.roomId.toUpperCase();
    userId = data.userId || Date.now().toString(); // Use provided userId or generate one

    console.log(`📝 Joining room with userId: ${userId}`);

    if (!rooms.has(roomId)) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Room not found'
      }));
      return;
    }

    const room = rooms.get(roomId);

    room.participants.set(userId, {
      ws: ws,
      language: data.language,
      name: data.name,
      recognizeStream: null,
      isTyping: false
    });

    currentRoom = roomId;

    console.log(`✓ ${data.name} joined room ${roomId}`);

    ws.send(JSON.stringify({
      type: 'room_joined',
      roomId: roomId,
      userId: userId,
      sessionId: room.sessionId
    }));

    // Send existing chat history to new participant (translated to their language)
    const translatedHistory = await translateChatHistory(room.chatHistory, data.language);
    ws.send(JSON.stringify({
      type: 'chat_history',
      messages: translatedHistory
    }));

    broadcastParticipants(roomId);
  }

  async function handleStartSpeaking(ws, data) {
    if (!currentRoom || !userId) return;

    const participant = rooms.get(currentRoom).participants.get(userId);

    // Close existing stream if any to prevent orphaned streams
    if (recognizeStream) {
      console.log(`⚠️ Closing existing recognition stream before starting new one`);
      try {
        recognizeStream.end();
      } catch (err) {
        console.error('Error closing old stream:', err);
      }
      recognizeStream = null;
    }

    console.log(`🎤 ${participant.name} started speaking in ${getLanguageName(participant.language)}`);

    // Create speech recognition stream
    recognizeStream = speechService.createRecognizeStream(
      getLanguageName(participant.language),
      async (result) => {
        const { text, isFinal } = result;
        console.log(`📝 Recognition result - Text: "${text}", Final: ${isFinal}`);

        // Send transcript to speaker
        ws.send(JSON.stringify({
          type: 'transcript',
          text: text,
          isFinal: isFinal
        }));

        // If final, translate and broadcast to others
        if (isFinal) {
          console.log(`✅ Final transcript: "${text}"`);
          await translateAndBroadcast(currentRoom, userId, text, participant.language, participant.name);
        }
      },
      (error) => {
        console.error('Speech recognition error:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: error.message
        }));
      }
    );

    participant.recognizeStream = recognizeStream;

    ws.send(JSON.stringify({ type: 'ready' }));
  }

  function handleStopSpeaking() {
    if (recognizeStream) {
      recognizeStream.end();
      recognizeStream = null;
    }
    console.log(`🔇 User ${userId} stopped speaking`);
  }

  async function handleAgentQueryStart(ws, data) {
    if (!currentRoom || !userId) return;

    const participant = rooms.get(currentRoom).participants.get(userId);

    // Close existing stream if any
    if (recognizeStream) {
      console.log(`⚠️ Closing existing recognition stream before starting agent query`);
      try {
        recognizeStream.end();
      } catch (err) {
        console.error('Error closing old stream:', err);
      }
      recognizeStream = null;
    }

    console.log(`🤖 ${participant.name} asking agent`);

    recognizeStream = speechService.createRecognizeStream(
      getLanguageName(data.language || participant.language),
      async (result) => {
        if (result.isFinal) {
          const question = result.text;
          console.log(`Agent query: ${question}`);

          await handleAgentQuery(currentRoom, userId, question, participant.language);
        }
      },
      (error) => {
        console.error('Agent query error:', error);
      }
    );

    participant.recognizeStream = recognizeStream;
    ws.send(JSON.stringify({ type: 'ready' }));
  }

  async function handleChatMessage(data) {
    if (!currentRoom || !userId) return;

    const room = rooms.get(currentRoom);
    if (!room) return;

    const participant = room.participants.get(userId);
    if (!participant) return;

    const chatMessage = {
      id: Date.now().toString(),
      userId: userId,
      userName: participant.name,
      message: data.message,
      originalLanguage: participant.language,
      timestamp: new Date().toISOString()
    };

    console.log(`💬 Chat message from ${participant.name}: ${data.message}`);

    // Store in room chat history
    room.chatHistory.push(chatMessage);

    // Translate and broadcast to all participants
    for (const [participantId, p] of room.participants.entries()) {
      try {
        let translatedMessage = data.message;
        const targetLang = getLanguageName(p.language);
        const sourceLang = getLanguageName(participant.language);

        // Only translate if languages are different
        if (sourceLang !== targetLang) {
          translatedMessage = await aiService.translateText(data.message, targetLang);
          console.log(`🌍 Translated chat from ${sourceLang} to ${targetLang}: "${translatedMessage}"`);
        }

        p.ws.send(JSON.stringify({
          type: 'chat_message',
          id: chatMessage.id,
          userId: userId,
          userName: participant.name,
          message: translatedMessage,
          originalMessage: data.message,
          timestamp: chatMessage.timestamp
        }));
      } catch (error) {
        console.error(`Chat translation error for participant ${participantId}:`, error);
        // Send original message if translation fails
        p.ws.send(JSON.stringify({
          type: 'chat_message',
          ...chatMessage
        }));
      }
    }

    // Clear typing indicator for this user
    handleTypingStop();
  }

  function handleTypingStart() {
    if (!currentRoom || !userId) return;

    const room = rooms.get(currentRoom);
    if (!room) return;

    const participant = room.participants.get(userId);
    if (!participant) return;

    participant.isTyping = true;

    // Broadcast typing status to others
    room.participants.forEach((p, pId) => {
      if (pId !== userId) {
        p.ws.send(JSON.stringify({
          type: 'user_typing',
          userId: userId,
          userName: participant.name,
          isTyping: true
        }));
      }
    });

    // Auto-clear typing after 3 seconds of inactivity
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }
    typingTimeout = setTimeout(() => {
      handleTypingStop();
    }, 3000);
  }

  function handleTypingStop() {
    if (!currentRoom || !userId) return;

    const room = rooms.get(currentRoom);
    if (!room) return;

    const participant = room.participants.get(userId);
    if (!participant) return;

    participant.isTyping = false;

    // Clear timeout
    if (typingTimeout) {
      clearTimeout(typingTimeout);
      typingTimeout = null;
    }

    // Broadcast typing stopped to others
    room.participants.forEach((p, pId) => {
      if (pId !== userId) {
        p.ws.send(JSON.stringify({
          type: 'user_typing',
          userId: userId,
          userName: participant.name,
          isTyping: false
        }));
      }
    });
  }

  function handleWebRTCSignaling(data) {
    if (!currentRoom || !userId) return;

    const room = rooms.get(currentRoom);
    if (!room) return;

    console.log(`📡 WebRTC signaling: ${data.type} from ${userId} to ${data.targetUserId || 'all'}`);

    // Forward WebRTC signaling to target participant(s)
    if (data.targetUserId) {
      // Send to specific participant
      const targetParticipant = room.participants.get(data.targetUserId);
      if (targetParticipant) {
        targetParticipant.ws.send(JSON.stringify({
          ...data,
          fromUserId: userId
        }));
      }
    } else {
      // Broadcast to all other participants (for offers)
      room.participants.forEach((participant, participantId) => {
        if (participantId !== userId) {
          participant.ws.send(JSON.stringify({
            ...data,
            fromUserId: userId
          }));
        }
      });
    }
  }

  function handleDisconnect() {
    if (recognizeStream) {
      recognizeStream.end();
    }
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }
    if (currentRoom && userId) {
      const room = rooms.get(currentRoom);
      if (room) {
        room.participants.delete(userId);
        console.log(`✓ Removed user ${userId} from room ${currentRoom}`);

        if (room.participants.size === 0) {
          // End session
          historyService.updateSession(room.sessionId);
          rooms.delete(currentRoom);
          console.log(`✓ Room ${currentRoom} deleted (empty)`);
        } else {
          broadcastParticipants(currentRoom);
        }
      }
    }
  }
});

// Translate chat history for a new participant
async function translateChatHistory(chatHistory, targetLanguage) {
  const translatedMessages = [];

  for (const msg of chatHistory) {
    try {
      let translatedMessage = msg.message;
      const targetLang = getLanguageName(targetLanguage);
      const sourceLang = getLanguageName(msg.originalLanguage || 'en-US');

      // Only translate if languages are different
      if (sourceLang !== targetLang) {
        translatedMessage = await aiService.translateText(msg.message, targetLang);
      }

      translatedMessages.push({
        id: msg.id,
        userId: msg.userId,
        userName: msg.userName,
        message: translatedMessage,
        originalMessage: msg.message,
        timestamp: msg.timestamp
      });
    } catch (error) {
      console.error('Error translating chat history message:', error);
      // If translation fails, send original message
      translatedMessages.push(msg);
    }
  }

  return translatedMessages;
}

// Broadcast participant list to all in room
function broadcastParticipants(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  const participantList = Array.from(room.participants.entries()).map(([id, p]) => ({
    userId: id,
    language: p.language,
    name: p.name
  }));

  room.participants.forEach((participant) => {
    participant.ws.send(JSON.stringify({
      type: 'participants_update',
      participants: participantList
    }));
  });
}

// Translate and broadcast to all other participants
async function translateAndBroadcast(roomId, speakerId, text, sourceLanguage, speakerName) {
  const room = rooms.get(roomId);
  if (!room) return;

  console.log(`📢 Broadcasting from ${speakerName}: "${text}"`);

  const speaker = room.participants.get(speakerId);

  // Save to conversation history
  room.conversationHistory.push({
    speaker: speakerName,
    text: text,
    language: sourceLanguage,
    timestamp: new Date().toISOString()
  });

  // Save to database
  historyService.addTranscript(
    room.sessionId,
    text,
    getLanguageName(sourceLanguage),
    null,
    null,
    speakerId,
    speakerName
  );

  // Translate for each participant
  for (const [participantId, participant] of room.participants.entries()) {
    if (participantId === speakerId) continue; // Skip the speaker

    try {
      const targetLang = getLanguageName(participant.language);
      const sourceLang = getLanguageName(sourceLanguage);

      let translatedText = text;

      // Only translate if languages are different
      if (sourceLang !== targetLang) {
        translatedText = await aiService.translateText(text, targetLang);
      }

      // Save translated version
      historyService.addTranscript(
        room.sessionId,
        text,
        sourceLang,
        translatedText,
        targetLang,
        speakerId,
        speakerName
      );

      // Send translation to participant
      participant.ws.send(JSON.stringify({
        type: 'translation',
        speaker: speakerName,
        originalText: text,
        translatedText: translatedText,
        timestamp: Date.now()
      }));

      // Generate and send audio with language support
      try {
        const audioBuffer = await ttsService.textToSpeech(translatedText, null, 'male', targetLang);

        participant.ws.send(JSON.stringify({
          type: 'audio',
          audio: audioBuffer.toString('base64')
        }));
      } catch (audioError) {
        console.error('Audio generation error:', audioError);
      }
    } catch (error) {
      console.error(`Translation error for participant ${participantId}:`, error);
    }
  }
}

// Handle agent query
async function handleAgentQuery(roomId, userId, question, language) {
  const room = rooms.get(roomId);
  if (!room) return;

  const participant = room.participants.get(userId);

  try {
    // Get conversation history
    const conversationText = room.conversationHistory
      .map(msg => `${msg.speaker}: ${msg.text}`)
      .join('\n');

    // Create prompt for Gemini
    const prompt = `You are a helpful AI assistant with access to the conversation history in this meeting.

Conversation History:
${conversationText}

User's Question: ${question}

Instructions:
1. If the question can be answered from the conversation history, answer it directly
2. If the question is general knowledge, provide a helpful answer
3. Answer in ${getLanguageName(language)} language
4. Keep your answer concise and clear (2-4 sentences)

Answer:`;

    const result = await aiService.model.generateContent(prompt);
    const response = await result.response;
    const answer = response.text().trim();

    // Save Q&A to history
    historyService.saveQA(room.sessionId, userId, question, answer, 'session');

    // Send answer back
    participant.ws.send(JSON.stringify({
      type: 'agent_response',
      question: question,
      answer: answer
    }));

    // Generate and send audio with language support
    try {
      const targetLang = getLanguageName(language);
      const audioBuffer = await ttsService.textToSpeech(answer, null, 'male', targetLang);

      participant.ws.send(JSON.stringify({
        type: 'agent_audio',
        audio: audioBuffer.toString('base64')
      }));
    } catch (audioError) {
      console.error('Agent audio error:', audioError);
    }

    console.log(`✓ Agent answered: ${answer}`);
  } catch (error) {
    console.error('Agent query error:', error);
    participant.ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to process query'
    }));
  }
}

// Start server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log('========================================');
  console.log('🌉 TalkBridge Server Started');
  console.log(`📡 HTTP Server: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket Server: ws://localhost:${PORT}`);
  console.log('========================================');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    db.close();
    console.log('Server closed');
    process.exit(0);
  });
});