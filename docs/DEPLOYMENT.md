# Deployment Guide

## MongoDB Atlas (Free Tier)

1. Go to https://www.mongodb.com/atlas and create a free account
2. Create a new cluster (M0 free tier)
3. Create a database user (username/password)
4. Whitelist IP addresses (0.0.0.0/0 for all, or your server IP)
5. Get the connection string: `mongodb+srv://<user>:<pass>@cluster.mongodb.net/shonglap`
6. Set `MONGODB_URI` in your environment

## Server Deployment (Render)

1. Push your code to GitHub
2. Go to https://render.com and create a new Web Service
3. Connect your GitHub repository
4. Configure:
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `node src/server.js`
   - **Environment**: Node
5. Add environment variables:
   - `MONGODB_URI`: your Atlas connection string
   - `JWT_SECRET`: a strong random secret
   - `NODE_ENV`: production
   - `CORS_ORIGIN`: your client URL (e.g., https://shonglap.vercel.app)
   - `MOCK_LLM`: false (if using real Claude API)
   - `ANTHROPIC_API_KEY`: your Anthropic API key
   - `ANTHROPIC_MODEL`: claude-3-5-sonnet-20241022
   - `TRANSCRIBE_PROVIDER`: openai (or sidecar)
   - `OPENAI_API_KEY`: your OpenAI key
   - `MOCK_TRANSCRIPTION`: false
6. Deploy

### Railway Alternative
1. Go to https://railway.app
2. Create new project from GitHub
3. Add MongoDB plugin
4. Configure environment variables same as above
5. Deploy

## Client Deployment (Vercel)

1. Go to https://vercel.com and import your GitHub repository
2. Configure:
   - **Root Directory**: `client`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Add environment variable:
   - `VITE_API_URL`: your server URL (e.g., https://shonglap-api.onrender.com)
4. Deploy

### Netlify Alternative
1. Go to https://netlify.com
2. Import from GitHub
3. Configure:
   - **Base directory**: `client`
   - **Build command**: `npm run build`
   - **Publish directory**: `client/dist`
4. Add environment variable: `VITE_API_URL`
5. Deploy

## Whisper Sidecar (Optional)

Deploy the whisper-sidecar to a GPU-enabled server:
1. Build: `docker build -t shonglap-whisper ./whisper-sidecar`
2. Run: `docker run -p 8000:8000 shonglap-whisper`
3. Set `WHISPER_SIDECAR_URL` to the sidecar URL
4. Set `TRANSCRIBE_PROVIDER=sidecar`

## Post-Deployment
1. Run seed script: `npm run seed` (or `npm run seed:demo` for demo data)
2. Create admin account
3. Test the report flow end-to-end
4. Configure email (SMTP) for notifications

## Known Limitations
- Face/plate blur uses simple Gaussian blur (not ML-based detection)
- Whisper transcription requires ffmpeg for audio conversion
- Marker clustering requires react-leaflet-cluster (installed)
- SLA cron runs every 15 minutes (not real-time)
- No real-time WebSocket updates (polling-based)
- Anonymous reports cannot receive status updates via email
- Map geocoding is approximate (centroid-based for areas)
- Demo data uses random locations within Dhaka bounds
