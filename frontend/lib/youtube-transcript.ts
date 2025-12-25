/**
 * Client-side YouTube transcript fetching
 * Fetches directly from YouTube's oembed/timedtext endpoints from the browser
 * This bypasses Cloud Run IP blocking since requests come from user's browser
 */

export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

/**
 * Fetch YouTube transcript directly from browser using YouTube's timedtext API
 * No proxies needed - uses publicly accessible YouTube APIs
 */
export async function fetchYouTubeTranscript(videoId: string): Promise<TranscriptSegment[]> {
  try {
    console.log(`📥 Fetching transcript for video: ${videoId} (client-side)`);

    // Step 1: Try to get caption track list directly from YouTube's timedtext API
    // This endpoint is publicly accessible and doesn't require authentication
    const captionListUrl = `https://video.google.com/timedtext?type=list&v=${videoId}`;

    const listResponse = await fetch(captionListUrl);
    if (!listResponse.ok) {
      throw new Error(`Failed to fetch caption list: ${listResponse.status}`);
    }

    const listXml = await listResponse.text();
    console.log('Caption list response:', listXml.substring(0, 500)); // Debug: show what we got

    const parser = new DOMParser();
    const listDoc = parser.parseFromString(listXml, 'text/xml');

    const tracks = listDoc.getElementsByTagName('track');
    console.log(`Found ${tracks.length} caption tracks`); // Debug

    if (tracks.length === 0) {
      throw new Error('No captions available for this video');
    }

    // Find English track or use first available
    let selectedTrack = null;
    for (let i = 0; i < tracks.length; i++) {
      const langCode = tracks[i].getAttribute('lang_code');
      if (langCode === 'en' || langCode?.startsWith('en')) {
        selectedTrack = tracks[i];
        break;
      }
    }

    if (!selectedTrack) {
      selectedTrack = tracks[0];
    }

    const lang = selectedTrack.getAttribute('lang_code') || 'en';
    console.log(`Found caption track: ${lang}`);

    // Step 2: Fetch the actual transcript
    const transcriptUrl = `https://video.google.com/timedtext?lang=${lang}&v=${videoId}`;
    const transcriptResponse = await fetch(transcriptUrl);

    if (!transcriptResponse.ok) {
      throw new Error('Failed to fetch transcript');
    }

    const transcriptXml = await transcriptResponse.text();
    const transcriptDoc = parser.parseFromString(transcriptXml, 'text/xml');
    const textElements = transcriptDoc.getElementsByTagName('text');

    if (textElements.length === 0) {
      throw new Error('No transcript text found');
    }

    // Step 3: Parse transcript segments
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

    console.log(`✅ Successfully fetched ${transcript.length} transcript segments`);
    return transcript;

  } catch (error: any) {
    console.error('❌ Client-side transcript fetch error:', error);
    throw new Error(error.message || 'Failed to fetch transcript');
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
