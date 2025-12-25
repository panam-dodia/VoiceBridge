# Cloudflare WARP Proxy Setup for YouTube Bypass

YouTube blocks requests from Google Cloud Run IP addresses. To bypass this, we use a Cloudflare WARP proxy.

## Option 1: Use a Free WARP Proxy Service (Recommended for Testing)

Use a public WARP proxy endpoint:
- https://free-warp-proxy.example.com (if available)
- Or set up your own using Option 2

Set the environment variable in Cloud Run:
```
PROXY_URL=http://your-proxy-url:port
```

## Option 2: Deploy Your Own WARP Proxy (Recommended for Production)

### Using Docker on Cloud Run

1. Deploy a WARP proxy container as a separate Cloud Run service:

```bash
# Deploy WARP proxy
gcloud run deploy warp-proxy \
  --image=ghcr.io/e7h4n/warp-proxy:latest \
  --platform=managed \
  --region=us-central1 \
  --allow-unauthenticated \
  --port=8080
```

2. Get the WARP proxy URL:
```bash
gcloud run services describe warp-proxy --region=us-central1 --format='value(status.url)'
```

3. Add the proxy URL as an environment variable to your backend:
```bash
gcloud run services update talkbridge-backend \
  --region=us-central1 \
  --set-env-vars PROXY_URL=https://warp-proxy-xxx-uc.a.run.app
```

## Option 3: Use SmartProxy or Similar Service

Use a commercial proxy service that supports SOCKS5/HTTP:
- SmartProxy
- Bright Data
- ProxyMesh

Set environment variable:
```
PROXY_URL=http://username:password@proxy.example.com:port
```

## Testing

After setting up, the backend will automatically use the proxy when:
- `NODE_ENV=production`
- `PROXY_URL` is set

Check logs for: `🔒 Using proxy: http://...`
