# TalkBridge Backend Deployment Guide

## Prerequisites

1. Install Google Cloud CLI: https://cloud.google.com/sdk/docs/install
2. Authenticate with GCP:
   ```bash
   gcloud auth login
   ```
3. Set the project:
   ```bash
   gcloud config set project voicebridge-hackathon
   ```

## Deploy to Google Cloud Run

### 1. Build and Deploy

From the `backend` directory, run:

```bash
gcloud run deploy talkbridge-backend \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "USE_VERTEX_AI=true,GOOGLE_CLOUD_PROJECT=voicebridge-hackathon,GOOGLE_CLOUD_PROJECT_ID=voicebridge-hackathon,GOOGLE_CLOUD_LOCATION=us-central1,NODE_ENV=production" \
  --set-secrets "ELEVENLABS_API_KEY=ELEVENLABS_API_KEY:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest" \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --max-instances 10 \
  --port 8080
```

### 2. Create Secrets (if not already created)

```bash
# Create ElevenLabs API key secret
echo -n "your-elevenlabs-api-key" | gcloud secrets create ELEVENLABS_API_KEY --data-file=-

# Create Gemini API key secret
echo -n "your-gemini-api-key" | gcloud secrets create GEMINI_API_KEY --data-file=-
```

### 3. Alternative: Using Dockerfile

If you prefer to build the image first:

```bash
# Build the image
gcloud builds submit --tag gcr.io/voicebridge-hackathon/talkbridge-backend

# Deploy the image
gcloud run deploy talkbridge-backend \
  --image gcr.io/voicebridge-hackathon/talkbridge-backend \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "USE_VERTEX_AI=true,GOOGLE_CLOUD_PROJECT=voicebridge-hackathon,GOOGLE_CLOUD_PROJECT_ID=voicebridge-hackathon,GOOGLE_CLOUD_LOCATION=us-central1,NODE_ENV=production" \
  --set-secrets "ELEVENLABS_API_KEY=ELEVENLABS_API_KEY:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest" \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --max-instances 10 \
  --port 8080
```

## Notes

- The deployment includes both Node.js backend (port 8080) and Python transcript service (port 5000)
- Service account credentials are automatically available in Cloud Run through Application Default Credentials
- The gcp-credentials.json file is not needed in Cloud Run (uses metadata server)
- WebSocket connections are supported on Cloud Run
- Database will be ephemeral - consider using Cloud SQL for persistent storage in production

## Get Service URL

After deployment:

```bash
gcloud run services describe talkbridge-backend --region us-central1 --format 'value(status.url)'
```

This URL should be added to the frontend's `NEXT_PUBLIC_API_URL` environment variable.