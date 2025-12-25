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
const INNERTUBE_CLIENT_VERSION = '2.20250110.01.00';

/**
 * Fetch YouTube transcript using Innertube API
 */
export async function fetchYouTubeTranscriptInnertube(videoId: string): Promise<TranscriptSegment[]> {
  try {
    console.log(`📥 Fetching transcript via Innertube API for video: ${videoId}`);

    // Step 1: Get initial player data
    const playerResponse = await fetch(
      `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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

    // Step 3: Fetch the actual transcript
    const transcriptResponse = await fetch(captionUrl);

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

    console.log(`✅ Successfully fetched ${transcript.length} transcript segments via Innertube`);
    return transcript;

  } catch (error: any) {
    console.error('❌ Innertube API error:', error);
    throw new Error(error.message || 'Failed to fetch transcript via Innertube');
  }
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
