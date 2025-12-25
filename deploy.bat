@echo off
REM TalkBridge Deployment Script for Google Cloud Run (Windows)

echo =========================================
echo TalkBridge - Google Cloud Run Deployment
echo =========================================
echo.

REM Check if gcloud is installed
where gcloud >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: Google Cloud CLI is not installed.
    echo Please install it from: https://cloud.google.com/sdk/docs/install
    exit /b 1
)

REM Get project ID
echo Checking Google Cloud configuration...
for /f "tokens=*" %%i in ('gcloud config get-value project 2^>nul') do set PROJECT_ID=%%i

if "%PROJECT_ID%"=="" (
    echo Error: No Google Cloud project is set.
    echo Please run: gcloud config set project YOUR_PROJECT_ID
    exit /b 1
)

echo Using project: %PROJECT_ID%
echo.

REM Set region
set REGION=us-central1
echo Deploying to region: %REGION%
echo.

REM Enable required APIs
echo Enabling required Google Cloud APIs...
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com aiplatform.googleapis.com

echo APIs enabled
echo.

REM Deploy Backend
echo =========================================
echo Deploying Backend...
echo =========================================
cd backend

gcloud run deploy talkbridge-backend --source . --platform managed --region %REGION% --allow-unauthenticated --memory 1Gi --cpu 1 --timeout 300 --min-instances 1 --max-instances 10 --session-affinity --execution-environment gen2 --set-env-vars GOOGLE_CLOUD_PROJECT=%PROJECT_ID%,GOOGLE_CLOUD_LOCATION=%REGION%,USE_VERTEX_AI=true,NODE_ENV=production --update-secrets ELEVENLABS_API_KEY=ELEVENLABS_API_KEY:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest --quiet

for /f "tokens=*" %%i in ('gcloud run services describe talkbridge-backend --region %REGION% --format "value(status.url)"') do set BACKEND_URL=%%i
echo Backend deployed successfully!
echo Backend URL: %BACKEND_URL%
echo.

REM Extract hostname for WebSocket URL (without https://)
set BACKEND_HOST=%BACKEND_URL:https://=%

cd ..

REM Deploy Frontend
echo =========================================
echo Deploying Frontend...
echo =========================================
cd frontend

REM Create production environment file
echo NEXT_PUBLIC_API_URL=%BACKEND_URL%> .env.production
echo NEXT_PUBLIC_WS_URL=%BACKEND_HOST%>> .env.production

gcloud run deploy talkbridge-frontend --source . --platform managed --region %REGION% --allow-unauthenticated --memory 512Mi --cpu 1 --timeout 300 --min-instances 0 --max-instances 10 --quiet

for /f "tokens=*" %%i in ('gcloud run services describe talkbridge-frontend --region %REGION% --format "value(status.url)"') do set FRONTEND_URL=%%i
echo Frontend deployed successfully!
echo Frontend URL: %FRONTEND_URL%

cd ..

REM Update backend with frontend URL for CORS
echo.
echo Updating backend CORS configuration...
cd backend

gcloud run services update talkbridge-backend --region %REGION% --update-env-vars FRONTEND_URL=%FRONTEND_URL% --quiet

cd ..

echo.
echo =========================================
echo Deployment Complete!
echo =========================================
echo.
echo Frontend URL: %FRONTEND_URL%
echo Backend URL:  %BACKEND_URL%
echo.
echo NOTE: Make sure secrets are set up first:
echo   Run: setup-secrets.bat
echo.
echo =========================================
