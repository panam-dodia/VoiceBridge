# TalkBridge Frontend Deployment Guide

## Deploy to Vercel

### Option 1: Using Vercel CLI

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Deploy from the `frontend` directory:
   ```bash
   vercel
   ```

4. For production deployment:
   ```bash
   vercel --prod
   ```

### Option 2: Using Vercel Dashboard

1. Go to https://vercel.com
2. Click "Add New Project"
3. Import your GitHub repository (or upload the frontend folder)
4. Configure build settings:
   - Framework Preset: Next.js
   - Build Command: `npm run build`
   - Output Directory: `.next`
   - Install Command: `npm install`

### Environment Variables

Add the following environment variable in Vercel:

```
NEXT_PUBLIC_API_URL=<YOUR_CLOUD_RUN_BACKEND_URL>
```

Example:
```
NEXT_PUBLIC_API_URL=https://talkbridge-backend-xxxxx-uc.a.run.app
```

### Setting Environment Variables in Vercel

#### Via CLI:
```bash
vercel env add NEXT_PUBLIC_API_URL production
# Then paste the backend URL when prompted
```

#### Via Dashboard:
1. Go to your project settings
2. Navigate to "Environment Variables"
3. Add `NEXT_PUBLIC_API_URL` with the Cloud Run backend URL
4. Save and redeploy

### Redeploy After Environment Variable Changes

```bash
vercel --prod
```

## Notes

- The frontend is a static Next.js app that can be deployed to Vercel's edge network
- Make sure the backend URL is set correctly before deployment
- The backend must allow CORS from the Vercel domain
- WebSocket connections will work with the Cloud Run backend

## Get Deployment URL

After deployment, Vercel will provide a URL like:
```
https://talkbridge-frontend-xxxxx.vercel.app
```

Update the backend's CORS configuration to include this URL if needed.