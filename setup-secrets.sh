#!/bin/bash

# TalkBridge - Google Secret Manager Setup Script
# This script creates secrets and grants Cloud Run access

set -e

echo "========================================="
echo "TalkBridge - Secret Manager Setup"
echo "========================================="
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ Error: Google Cloud CLI is not installed."
    exit 1
fi

# Get project ID
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
    echo "❌ Error: No Google Cloud project is set."
    exit 1
fi

echo "✅ Using project: $PROJECT_ID"
echo ""

# Get project number
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
echo "✅ Project number: $PROJECT_NUMBER"
echo ""

# Enable Secret Manager API
echo "🔧 Enabling Secret Manager API..."
gcloud services enable secretmanager.googleapis.com

echo ""
echo "========================================="
echo "Creating Secrets"
echo "========================================="
echo ""

# Prompt for ElevenLabs API key
read -sp "Enter your ElevenLabs API key: " ELEVENLABS_KEY
echo ""

# Prompt for Gemini API key (optional)
read -sp "Enter your Gemini API key (optional, press Enter to skip): " GEMINI_KEY
echo ""
echo ""

# Create ELEVENLABS_API_KEY secret
echo "📝 Creating ELEVENLABS_API_KEY secret..."
if gcloud secrets describe ELEVENLABS_API_KEY &>/dev/null; then
    echo "⚠️  Secret already exists. Adding new version..."
    echo -n "$ELEVENLABS_KEY" | gcloud secrets versions add ELEVENLABS_API_KEY --data-file=-
else
    echo -n "$ELEVENLABS_KEY" | gcloud secrets create ELEVENLABS_API_KEY --data-file=-
fi
echo "✅ ELEVENLABS_API_KEY created/updated"

# Create GEMINI_API_KEY secret if provided
if [ -n "$GEMINI_KEY" ]; then
    echo "📝 Creating GEMINI_API_KEY secret..."
    if gcloud secrets describe GEMINI_API_KEY &>/dev/null; then
        echo "⚠️  Secret already exists. Adding new version..."
        echo -n "$GEMINI_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-
    else
        echo -n "$GEMINI_KEY" | gcloud secrets create GEMINI_API_KEY --data-file=-
    fi
    echo "✅ GEMINI_API_KEY created/updated"
fi

echo ""
echo "========================================="
echo "Granting Cloud Run Access"
echo "========================================="
echo ""

SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
echo "📋 Service account: $SERVICE_ACCOUNT"
echo ""

# Grant access to ELEVENLABS_API_KEY
echo "🔐 Granting access to ELEVENLABS_API_KEY..."
gcloud secrets add-iam-policy-binding ELEVENLABS_API_KEY \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet

# Grant access to GEMINI_API_KEY if created
if [ -n "$GEMINI_KEY" ]; then
    echo "🔐 Granting access to GEMINI_API_KEY..."
    gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
        --member="serviceAccount:$SERVICE_ACCOUNT" \
        --role="roles/secretmanager.secretAccessor" \
        --quiet
fi

echo ""
echo "========================================="
echo "✅ Secret Manager Setup Complete!"
echo "========================================="
echo ""
echo "Your secrets are now stored securely in Google Secret Manager."
echo ""
echo "Next steps:"
echo "1. Run ./deploy.sh to deploy your application"
echo "2. The deployment will automatically use these secrets"
echo ""
echo "To update secrets later:"
echo "echo -n 'NEW_KEY' | gcloud secrets versions add ELEVENLABS_API_KEY --data-file=-"
echo ""
