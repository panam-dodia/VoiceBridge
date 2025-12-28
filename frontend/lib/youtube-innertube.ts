/**
 * YouTube Innertube API - YouTube's internal API
 * This is what YouTube itself uses internally, so it won't be blocked
 * Based on: https://medium.com/@aqib-2/extract-youtube-transcripts-using-innertube-api-2025-javascript-guide-dc417b762f49
 */

export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

const INNERTUBE_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'; // Public web client API key
const ANDROID_CLIENT_VERSION = '19.51.37';
// Try multiple CORS proxies in case one is down
const CORS_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
  'https://api.codetabs.com/v1/proxy?quest=',
];

/**
 * Fetch YouTube transcript using Innertube API
 */
export async function fetchYouTubeTranscriptInnertube(videoId: string): Promise<TranscriptSegment[]> {
  let lastError: Error | null = null;

  // Try each CORS proxy until one works
  for (let i = 0; i < CORS_PROXIES.length; i++) {
    const corsProxy = CORS_PROXIES[i];
    try {
      console.log(`📥 Fetching transcript via Innertube API for video: ${videoId} (proxy ${i + 1}/${CORS_PROXIES.length})`);

      // Step 1: Get initial player data (use CORS proxy for browser)
      const targetUrl = `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}`;
      const playerResponse = await fetch(
        `${corsProxy}${encodeURIComponent(targetUrl)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            context: {
              client: {
                clientName: 'ANDROID',
                clientVersion: ANDROID_CLIENT_VERSION,
                hl: 'en',
                gl: 'US',
                androidSdkVersion: 34,
              },
            },
            videoId: videoId,
          }),
        }
      );

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
      let selectedTrack = captions.find((track: any) =>
        track.languageCode === 'en' || track.languageCode?.startsWith('en')
      );

      if (!selectedTrack) {
        selectedTrack = captions[0];
      }

      const captionUrl = selectedTrack.baseUrl;
      console.log(`Selected caption track: ${selectedTrack.languageCode}`);

      // Step 3: Fetch the actual transcript (use same CORS proxy)
      const transcriptResponse = await fetch(`${corsProxy}${encodeURIComponent(captionUrl)}`);

      if (!transcriptResponse.ok) {
        throw new Error('Failed to fetch transcript');
      }

      const transcriptXml = await transcriptResponse.text();

      // Step 4: Parse XML
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(transcriptXml, 'text/xml');
      const textElements = xmlDoc.getElementsByTagName('text');

      if (textElements.length === 0) {
        throw new Error('No transcript text found');
      }

      // Step 5: Convert to transcript segments
      const transcript: TranscriptSegment[] = [];
      for (let i = 0; i < textElements.length; i++) {
        const element = textElements[i];
        const text = element.textContent || '';
        const start = parseFloat(element.getAttribute('start') || '0');
        const duration = parseFloat(element.getAttribute('dur') || '0');

        // Decode HTML entities
        const decodedText = text
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&#x27;/g, "'")
          .replace(/&apos;/g, "'");

        transcript.push({ text: decodedText, start, duration });
      }

      console.log(`✅ Successfully fetched ${transcript.length} transcript segments via Innertube (proxy ${i + 1})`);

      // Step 6: Merge segments into complete sentences
      const mergedTranscript = mergeIntoSentences(transcript);
      console.log(`📝 Merged into ${mergedTranscript.length} sentences`);

      return mergedTranscript;

    } catch (error: any) {
      console.error(`❌ Proxy ${i + 1} failed:`, error.message);
      lastError = error;
      // Continue to next proxy
    }
  }

  // All proxies failed
  throw new Error(lastError?.message || 'Failed to fetch transcript via Innertube - all CORS proxies failed');
}

/**
 * Merge transcript segments into complete sentences
 * This improves translation quality by providing full context
 */
function mergeIntoSentences(segments: TranscriptSegment[]): TranscriptSegment[] {
  if (!segments || segments.length === 0) return [];

  const sentences: TranscriptSegment[] = [];
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

/**
 * Extract video ID from various YouTube URL formats
 */
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}
