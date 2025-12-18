# VoiceBridge Setup Guide

## Prerequisites

- Node.js 18+ and npm
- Python 3.8+ and pip
- Google Cloud credentials (for Speech-to-Text, Gemini AI)
- ElevenLabs API key (for TTS)

## Backend Setup

The backend consists of two services that need to run simultaneously:

### 1. Python Transcript Service (Port 5000)

This service handles YouTube transcript fetching using the reliable `youtube-transcript-api` library.

```bash
cd backend

# Activate virtual environment (if using venv)
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt

# Run the Python service
python python-transcript-service.py
```

You should see:
```
🐍 Python Transcript Service Starting...
📡 Running on http://localhost:5000
```

### 2. Node.js Main Backend (Port 8080)

This is the main backend that handles all API routes, WebSocket connections, and coordinates services.

```bash
cd backend

# Install Node dependencies (if not done already)
npm install

# Create .env file with your credentials
# See .env.example for required variables

# Run the Node.js backend
npm run dev
```

You should see:
```
🚀 Server running on http://localhost:8080
```

## Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Run the development server
npm run dev
```

You should see:
```
▲ Next.js 15.x.x
- Local: http://localhost:3000
```

## Running the Application

1. **Start Python service first** (Terminal 1):
   ```bash
   cd backend
   python python-transcript-service.py
   ```

2. **Start Node.js backend** (Terminal 2):
   ```bash
   cd backend
   npm run dev
   ```

3. **Start frontend** (Terminal 3):
   ```bash
   cd frontend
   npm run dev
   ```

4. Open http://localhost:3000 in your browser

## Environment Variables

Create `backend/.env` file with:

```env
PORT=8080
GOOGLE_APPLICATION_CREDENTIALS=./gcp-credentials.json
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
```

## Troubleshooting

### "Transcript service is not running"

Make sure the Python service is running on port 5000 before starting the Node.js backend.

### Port Already in Use

If you get EADDRINUSE errors:
- Python service: Change port in `python-transcript-service.py`
- Node.js backend: Change PORT in `.env`
- Frontend: Change port in `package.json` dev script

### YouTube Transcript Not Working

The Node.js libraries for YouTube transcripts are unreliable. That's why we use a Python microservice. Make sure:
1. Python service is running
2. The video has captions/subtitles enabled
3. The video is not age-restricted or private
