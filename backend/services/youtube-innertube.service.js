/**
 * YouTube Innertube API Service
 * Uses YouTube's internal API to fetch transcripts
 * Routes requests through WARP proxy to bypass IP blocking
 */

import { SocksProxyAgent } from 'socks-proxy-agent';

const INNERTUBE_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'; // Public web client API key
const INNERTUBE_CLIENT_VERSION = '2.20250110.01.00';
const WARP_PROXY_URL = process.env.WARP_PROXY_URL || 'socks5://34.46.173.108:1080';

class YouTubeInnertubeService {
  /**
   * Fetch transcript using Innertube API
   */
  async getTranscript(videoId) {
    try {
      console.log(`📥 Fetching transcript via Innertube API for video: ${videoId}`);

      // Step 1: Get initial player data
      // For production (Cloud Run), we'll need to use client-side fetching instead
      // because YouTube blocks all cloud provider IPs regardless of proxy
      const targetUrl = `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}`;

      // Create SOCKS proxy agent
      const agent = new SocksProxyAgent(WARP_PROXY_URL);

      const fetchOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Origin': 'https://www.youtube.com',
          'Referer': 'https://www.youtube.com/',
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'WEB',
              clientVersion: INNERTUBE_CLIENT_VERSION,
              hl: 'en',
              gl: 'US',
            },
          },
          videoId: videoId,
        }),
        agent: agent, // Use WARP proxy
      };

      console.log(`🌐 Using WARP proxy: ${WARP_PROXY_URL}`);
      const playerResponse = await fetch(targetUrl, fetchOptions);

      if (!playerResponse.ok) {
        throw new Error(`Failed to fetch player data: ${playerResponse.status}`);
      }

      const playerData = await playerResponse.json();

      // Step 2: Extract caption tracks
      const captions = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

      if (!captions || captions.length === 0) {
        throw new Error('No captions available for this video');
      }

      console.log(`Found ${captions.length} caption tracks`);

      // Find English track or use first available
      let selectedTrack = captions.find(
        (track) => track.languageCode === 'en' || track.languageCode?.startsWith('en')
      );

      if (!selectedTrack) {
        selectedTrack = captions[0];
      }

      const captionUrl = selectedTrack.baseUrl;
      console.log(`Selected caption track: ${selectedTrack.languageCode}`);

      // Step 3: Fetch the actual transcript (through WARP proxy)
      const transcriptResponse = await fetch(captionUrl, { agent: agent });

      if (!transcriptResponse.ok) {
        throw new Error('Failed to fetch transcript');
      }

      const transcriptXml = await transcriptResponse.text();

      // Step 4: Parse XML (simple regex parsing for Node.js)
      const textMatches = transcriptXml.matchAll(/<text start="([^"]+)" dur="([^"]+)"[^>]*>([^<]+)<\/text>/g);

      const transcript = [];
      for (const match of textMatches) {
        const start = parseFloat(match[1]);
        const duration = parseFloat(match[2]);
        let text = match[3];

        // Decode HTML entities
        text = text
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&#x27;/g, "'")
          .replace(/&apos;/g, "'");

        transcript.push({ text, start, duration });
      }

      console.log(`✅ Successfully fetched ${transcript.length} transcript segments via Innertube`);

      // Step 5: Merge segments into complete sentences
      const mergedTranscript = this.mergeIntoSentences(transcript);
      console.log(`📝 Merged into ${mergedTranscript.length} sentences`);

      return mergedTranscript;

    } catch (error) {
      console.error('❌ Innertube API error:', error.message);
      throw error;
    }
  }

  /**
   * Merge transcript segments into complete sentences
   * This improves translation quality by providing full context
   */
  mergeIntoSentences(segments) {
    if (!segments || segments.length === 0) return [];

    const sentences = [];
    let currentSentence = {
      text: '',
      start: segments[0].start,
      duration: 0
    };

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];

      // Add segment text to current sentence
      if (currentSentence.text) {
        currentSentence.text += ' ' + segment.text;
      } else {
        currentSentence.text = segment.text;
        currentSentence.start = segment.start;
      }

      // Check if this segment ends a sentence
      const endsWithPunctuation = /[.!?]$/.test(segment.text.trim());
      const isLastSegment = i === segments.length - 1;

      // Also check if next segment starts with capital letter (new sentence)
      const nextStartsCapital = i < segments.length - 1 &&
        /^[A-Z]/.test(segments[i + 1].text.trim());

      if (endsWithPunctuation || isLastSegment || nextStartsCapital) {
        // Calculate total duration from start to end of current segment
        currentSentence.duration = (segment.start + segment.duration) - currentSentence.start;

        sentences.push({
          text: currentSentence.text.trim(),
          start: currentSentence.start,
          duration: currentSentence.duration
        });

        // Reset for next sentence
        currentSentence = {
          text: '',
          start: i < segments.length - 1 ? segments[i + 1].start : segment.start,
          duration: 0
        };
      }
    }

    return sentences;
  }
}

export default new YouTubeInnertubeService();
