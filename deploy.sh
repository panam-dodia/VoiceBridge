#!/bin/bash

# TalkBridge Deployment Script for Google Cloud Run
# This script deploys both backend and frontend to Google Cloud Run

set -e  # Exit on any error

echo "========================================="
echo "TalkBridge - Google Cloud Run Deployment"
echo "========================================="
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ Error: Google Cloud CLI is not installed."
    echo "Please install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Get project ID
echo "🔍 Checking Google Cloud configuration..."
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)

if [ -z "$PROJECT_ID" ]; then
    echo "❌ Error: No Google Cloud project is set."
    echo "Please run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

echo "✅ Using project: $PROJECT_ID"
echo ""

# Set region
REGION="us-central1"
echo "📍 Deploying to region: $REGION"
echo ""

# Enable required APIs
echo "🔧 Enabling required Google Cloud APIs..."
gcloud services enable run.googleapis.com \
    cloudbuild.googleapis.com \
    artifactregistry.googleapis.com \
    aiplatform.googleapis.com

echo "✅ APIs enabled"
echo ""

# Deploy Backend
echo "========================================="
echo "🚀 Deploying Backend..."
echo "========================================="
cd backend

gcloud run deploy talkbridge-backend \
    --source . \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --memory 1Gi \
    --cpu 1 \
    --timeout 300 \
    --min-instances 0 \
    --max-instances 10 \
    --set-env-vars GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GOOGLE_CLOUD_LOCATION=$REGION,USE_VERTEX_AI=true,NODE_ENV=production \
    --update-secrets ELEVENLABS_API_KEY=ELEVENLABS_API_KEY:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest \
    --quiet

BACKEND_URL=$(gcloud run services describe talkbridge-backend --region $REGION --format 'value(status.url)')
echo "✅ Backend deployed successfully!"
echo "Backend URL: $BACKEND_URL"
echo ""

# Extract hostname for WebSocket URL (without https://)
BACKEND_HOST=$(echo $BACKEND_URL | sed 's|https://||')

cd ..

# Deploy Frontend
echo "========================================="
echo "🚀 Deploying Frontend..."
echo "========================================="
cd frontend

# Create production environment file
echo "NEXT_PUBLIC_API_URL=$BACKEND_URL" > .env.production
echo "NEXT_PUBLIC_WS_URL=$BACKEND_HOST" >> .env.production

gcloud run deploy talkbridge-frontend \
    --source . \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --memory 512Mi \
    --cpu 1 \
    --timeout 300 \
    --min-instances 0 \
    --max-instances 10 \
    --quiet

FRONTEND_URL=$(gcloud run services describe talkbridge-frontend --region $REGION --format 'value(status.url)')
echo "✅ Frontend deployed successfully!"
echo "Frontend URL: $FRONTEND_URL"

cd ..

# Update backend with frontend URL for CORS
echo ""
echo "🔧 Updating backend CORS configuration..."
cd backend

gcloud run services update talkbridge-backend \
    --region $REGION \
    --update-env-vars FRONTEND_URL=$FRONTEND_URL \
    --quiet

cd ..

echo ""
echo "========================================="
echo "✅ Deployment Complete!"
echo "========================================="
echo ""
echo "🌐 Frontend URL: $FRONTEND_URL"
echo "🔧 Backend URL:  $BACKEND_URL"
echo ""
echo "⚠️  NOTE: Make sure secrets are set up first:"
echo "  Run: ./setup-secrets.sh"
echo ""
echo "========================================="
