/**
 * Client-side YouTube transcript fetching
 * This runs in the browser to avoid IP blocking issues with cloud providers
 */

import { YoutubeTranscript } from 'youtube-transcript';

export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

/**
 * Fetch YouTube transcript directly from the browser
 * This bypasses backend IP blocking issues
 */
export async function fetchYouTubeTranscript(videoId: string): Promise<TranscriptSegment[]> {
  try {
    console.log(`📥 Fetching transcript for video: ${videoId} (client-side)`);

    const transcript = await YoutubeTranscript.fetchTranscript(videoId);

    console.log(`✅ Successfully fetched ${transcript.length} transcript segments`);

    return transcript.map((segment: any) => ({
      text: segment.text,
      start: segment.offset / 1000, // Convert ms to seconds
      duration: segment.duration / 1000, // Convert ms to seconds
    }));
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
