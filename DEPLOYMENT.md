# TalkBridge Deployment Guide

Complete guide for deploying TalkBridge to Google Cloud Run.

## Prerequisites

1. **Google Cloud Project**
   - Create a project at https://console.cloud.google.com
   - Enable billing for the project
   - Note your project ID

2. **Google Cloud CLI**
   - Install from: https://cloud.google.com/sdk/docs/install
   - Authenticate: `gcloud auth login`
   - Set project: `gcloud config set project YOUR_PROJECT_ID`

3. **API Keys**
   - ElevenLabs API key from https://elevenlabs.io
   - Google Cloud Vertex AI enabled in your project

## Deployment Methods

### Method 1: Automated Deployment (Recommended)

Use the provided deployment script for quick setup:

```bash
# Make script executable (Linux/Mac)
chmod +x deploy.sh

# Run deployment
./deploy.sh
```

The script will:
1. Enable required Google Cloud APIs
2. Deploy backend to Cloud Run
3. Deploy frontend to Cloud Run
4. Configure environment variables
5. Output URLs and setup instructions

### Method 2: Manual Deployment

#### Step 1: Enable Required APIs

```bash
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable aiplatform.googleapis.com
```

#### Step 2: Deploy Backend

```bash
cd backend

gcloud run deploy talkbridge-backend \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --set-env-vars GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID,GOOGLE_CLOUD_LOCATION=us-central1,USE_VERTEX_AI=true,NODE_ENV=production
```

Note the backend URL from the output (e.g., `https://talkbridge-backend-xxxxx.run.app`)

#### Step 3: Deploy Frontend

```bash
cd ../frontend

# Create production environment file
echo "NEXT_PUBLIC_API_URL=https://talkbridge-backend-xxxxx.run.app" > .env.production
echo "NEXT_PUBLIC_WS_URL=talkbridge-backend-xxxxx.run.app" >> .env.production

gcloud run deploy talkbridge-frontend \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300
```

Note the frontend URL from the output.

#### Step 4: Update Backend CORS

```bash
gcloud run services update talkbridge-backend \
  --region us-central1 \
  --update-env-vars FRONTEND_URL=https://talkbridge-frontend-xxxxx.run.app
```

## Setting Up API Keys

### Option 1: Using Google Secret Manager (Recommended for Production)

1. **Create secrets:**

```bash
# Create ELEVENLABS_API_KEY secret
echo -n "your-elevenlabs-api-key" | gcloud secrets create ELEVENLABS_API_KEY --data-file=-

# Create GEMINI_API_KEY secret
echo -n "your-gemini-api-key" | gcloud secrets create GEMINI_API_KEY --data-file=-
```

2. **Get your project number:**

```bash
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format='value(projectNumber)')
echo $PROJECT_NUMBER
```

3. **Grant Cloud Run access to secrets:**

```bash
gcloud secrets add-iam-policy-binding ELEVENLABS_API_KEY \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

4. **Update backend to use secrets:**

```bash
gcloud run services update talkbridge-backend \
  --region us-central1 \
  --update-secrets ELEVENLABS_API_KEY=ELEVENLABS_API_KEY:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest
```

### Option 2: Using Environment Variables (Quick Setup)

```bash
gcloud run services update talkbridge-backend \
  --region us-central1 \
  --update-env-vars ELEVENLABS_API_KEY=your-key,GEMINI_API_KEY=your-key
```

**⚠️ Warning:** This method is less secure as keys are visible in Cloud Run console.

## Service Account Setup for Vertex AI

If you need to use a custom service account:

1. **Create service account:**

```bash
gcloud iam service-accounts create talkbridge-sa \
  --display-name "TalkBridge Service Account"
```

2. **Grant Vertex AI permissions:**

```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:talkbridge-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

3. **Update Cloud Run service:**

```bash
gcloud run services update talkbridge-backend \
  --region us-central1 \
  --service-account talkbridge-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

## Verification

1. **Check backend health:**

```bash
curl https://talkbridge-backend-xxxxx.run.app/health
```

2. **Visit frontend:**

Open `https://talkbridge-frontend-xxxxx.run.app` in your browser.

3. **Test functionality:**
   - Try YouTube translation
   - Join a meeting
   - Check history Q&A

## Monitoring and Logs

View logs in Google Cloud Console:

```bash
# Backend logs
gcloud run services logs read talkbridge-backend --region us-central1

# Frontend logs
gcloud run services logs read talkbridge-frontend --region us-central1
```

Or visit: https://console.cloud.google.com/run

## Cost Optimization

### Cloud Run Pricing Factors
- CPU and memory allocation
- Request count
- Execution time
- Always-allocated instances

### Optimization Tips

1. **Use minimum instances = 0** (default in our config)
   - No cost when idle
   - Cold start time: 2-5 seconds

2. **Optimize memory allocation:**
   - Backend: 1Gi (handles AI requests)
   - Frontend: 512Mi (serves static content)

3. **Set appropriate timeouts:**
   - Backend: 300s (for long AI operations)
   - Frontend: 300s (Next.js rendering)

4. **Enable request-based scaling:**
   ```bash
   gcloud run services update talkbridge-backend \
     --region us-central1 \
     --max-instances 10
   ```

### Estimated Costs (Approximate)

For low to moderate usage:
- Cloud Run: ~$5-20/month
- Vertex AI API: Pay per request (~$0.00025 per request)
- ElevenLabs: Based on characters (check their pricing)
- Cloud Build: First 120 builds/day free

## Troubleshooting

### Backend won't start
- Check logs: `gcloud run services logs read talkbridge-backend --region us-central1`
- Verify API keys are set correctly
- Ensure Vertex AI API is enabled

### Frontend can't connect to backend
- Check `NEXT_PUBLIC_API_URL` in frontend environment
- Verify CORS settings in backend
- Check backend allows unauthenticated requests

### WebSocket connection fails
- Ensure `NEXT_PUBLIC_WS_URL` doesn't include `https://`
- Cloud Run supports WebSocket on HTTP/2
- Check connection in browser console

### "Permission denied" errors
- Verify service account has Vertex AI permissions
- Check Secret Manager IAM bindings
- Ensure APIs are enabled

## Updating the Deployment

### Update backend code:

```bash
cd backend
gcloud run deploy talkbridge-backend \
  --source . \
  --region us-central1
```

### Update frontend code:

```bash
cd frontend
gcloud run deploy talkbridge-frontend \
  --source . \
  --region us-central1
```

### Update environment variables:

```bash
gcloud run services update talkbridge-backend \
  --region us-central1 \
  --update-env-vars NEW_VAR=value
```

## Rollback

View revisions:

```bash
gcloud run revisions list --service talkbridge-backend --region us-central1
```

Rollback to previous revision:

```bash
gcloud run services update-traffic talkbridge-backend \
  --region us-central1 \
  --to-revisions REVISION_NAME=100
```

## Clean Up

To delete all resources:

```bash
# Delete services
gcloud run services delete talkbridge-backend --region us-central1 --quiet
gcloud run services delete talkbridge-frontend --region us-central1 --quiet

# Delete secrets (optional)
gcloud secrets delete ELEVENLABS_API_KEY --quiet
gcloud secrets delete GEMINI_API_KEY --quiet
```

## Support

For issues with:
- **Google Cloud**: https://cloud.google.com/support
- **ElevenLabs**: https://elevenlabs.io/docs
- **TalkBridge**: Check application logs and GitHub issues

## Security Best Practices

1. ✅ Use Secret Manager for API keys
2. ✅ Rotate API keys regularly
3. ✅ Enable Cloud Armor for DDoS protection (if needed)
4. ✅ Set up VPC for internal services (advanced)
5. ✅ Use least-privilege IAM roles
6. ✅ Enable audit logging
7. ✅ Never commit `.env` files to git

## Next Steps

After successful deployment:

1. **Set up custom domain** (optional):
   - Map domain in Cloud Run console
   - Configure DNS records

2. **Set up monitoring**:
   - Cloud Monitoring alerts
   - Uptime checks
   - Error reporting

3. **Enable HTTPS** (automatic with Cloud Run)

4. **Configure CDN** (optional for better performance)

5. **Submit to hackathon** with your live URLs!
