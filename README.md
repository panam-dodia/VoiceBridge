# TalkBridge

Real-time multilingual communication platform powered by Google Cloud Vertex AI and ElevenLabs.

**Live Demo:** https://talkbridge-frontend-149462569558.us-central1.run.app

## Features

- **YouTube Translation**: Translate and dub YouTube videos in 30+ languages with gender-matched voices
- **Live Meeting Translation**: Multi-user meetings with real-time translation
- **History Q&A**: Ask questions about past meetings with voice responses
- **Gender-Matched Voices**: Automatic gender detection with manual override

## Tech Stack

- **Google Cloud Vertex AI** (Gemini 2.5 Flash) - Translation and Q&A
- **ElevenLabs** - Text-to-Speech with multilingual support
- **Next.js 14** - Frontend framework
- **Node.js + Express** - Backend with WebSocket support
- **Google Cloud Run** - Deployment platform

## Local Development

### Backend Setup
```bash
cd backend
npm install

# Create .env file
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=us-central1
ELEVENLABS_API_KEY=your-key
GEMINI_API_KEY=your-key
USE_VERTEX_AI=true
PORT=8080
FRONTEND_URL=http://localhost:3000

# Add gcp-credentials.json to backend folder
npm start
```

### Frontend Setup
```bash
cd frontend
npm install

# Create .env.local file
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_WS_URL=localhost:8080

npm run dev
```

Visit http://localhost:3000

## Deployment

Deploy to Google Cloud Run:

```bash
./deploy.sh
```

Or deploy manually via Google Cloud Console.

## License

MIT
