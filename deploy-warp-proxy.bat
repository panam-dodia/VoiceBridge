@echo off
REM Deploy Cloudflare WARP Proxy to Google Cloud Run

echo =========================================
echo Deploying WARP Proxy to Cloud Run
echo =========================================
echo.

REM Set variables
set REGION=us-central1
set SERVICE_NAME=warp-proxy

echo Deploying WARP proxy service...
echo.

gcloud run deploy %SERVICE_NAME% --image=ghcr.io/e7h4n/warp-proxy:latest --platform=managed --region=%REGION% --allow-unauthenticated --port=8080 --memory=512Mi --cpu=1 --min-instances=0 --max-instances=3 --timeout=300 --quiet

if %ERRORLEVEL% NEQ 0 (
    echo Error: Failed to deploy WARP proxy
    exit /b 1
)

echo.
echo Getting WARP proxy URL...
for /f "tokens=*" %%i in ('gcloud run services describe %SERVICE_NAME% --region %REGION% --format "value(status.url)"') do set WARP_PROXY_URL=%%i

echo.
echo =========================================
echo WARP Proxy Deployed Successfully!
echo =========================================
echo.
echo WARP Proxy URL: %WARP_PROXY_URL%
echo.
echo Next step: Add this URL to Secret Manager as WARP_PROXY_URL
echo Run: echo %WARP_PROXY_URL% | gcloud secrets create WARP_PROXY_URL --data-file=-
echo.
echo =========================================
