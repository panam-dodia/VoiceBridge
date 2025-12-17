# 🚀 Quick Start Guide

Get TalkBridge running in 5 minutes!

## Prerequisites Check

```bash
node --version  # Should be 18+
npm --version   # Should be 9+
```

## Step 1: Backend Setup (2 minutes)

```bash
cd backend

# Install packages
npm install

# The .env file is already configured with existing API keys
# Just verify the file exists:
cat .env
```

Make sure `gcp-credentials.json` exists in the backend folder (it should already be there).

## Step 2: Frontend Setup (2 minutes)

```bash
cd ../frontend

# Install packages
npm install

# Create environment file
echo "NEXT_PUBLIC_API_URL=http://localhost:8080" > .env.local
echo "NEXT_PUBLIC_WS_URL=localhost:8080" >> .env.local
```

## Step 3: Start Everything (1 minute)

### Option A: Two Terminals (Recommended)

**Terminal 1:**
```bash
cd backend
npm run dev
```

Wait until you see:
```
========================================
🌉 TalkBridge Server Started
📡 HTTP Server: http://localhost:8080
🔌 WebSocket Server: ws://localhost:8080
========================================
```

**Terminal 2:**
```bash
cd frontend
npm run dev
```

Wait until you see:
```
✓ Ready in Xms
○ Local: http://localhost:3000
```

### Option B: Single Terminal (Background)

```bash
# Start backend in background
cd backend
npm run dev &

# Start frontend
cd ../frontend
npm run dev
```

## Step 4: Open the App

Open your browser to: **http://localhost:3000**

You should see the TalkBridge landing page with two options:
1. 🎥 YouTube Translator
2. 🎤 Live Meeting Translation

## Quick Test

### Test YouTube Translation
1. Click "YouTube Translator"
2. Paste this URL: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
3. Select "Spanish" as target language
4. Click "Start Translation"

### Test Meeting Translation
1. Click "Live Meeting Translation"
2. Enter your name
3. Select your language
4. Click "Create Room"
5. Note the room code
6. Share with others to join!

## Troubleshooting

**Port already in use:**
```bash
# Kill process on port 8080
npx kill-port 8080

# Or change port in backend/.env
PORT=8081
```

**Database error:**
```bash
# Reset database
rm backend/database/talkbridge.db
```

**Frontend can't connect:**
- Make sure backend is running (check terminal 1)
- Verify http://localhost:8080/health returns OK

## Next Steps

- Check out the full [README.md](./README.md) for detailed documentation
- Explore the `/history` page to see all your sessions
- Try asking questions using the Q&A feature

## Need Help?

Check the main README.md for:
- Full API documentation
- Deployment guides
- Advanced configuration
- Troubleshooting tips

---

Enjoy using TalkBridge! 🌉
