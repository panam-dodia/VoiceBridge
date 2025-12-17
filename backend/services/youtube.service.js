import { YoutubeTranscript } from 'youtube-transcript';

class YouTubeService {
  /**
   * Extract video ID from various YouTube URL formats
   */
  extractVideoId(url) {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
      /youtube\.com\/embed\/([^&\n?#]+)/,
      /youtube\.com\/v\/([^&\n?#]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return url; // Assume it's already a video ID
  }

  /**
   * Get transcript from YouTube video
   */
  async getTranscript(videoId) {
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(videoId);

      // Combine short segments into complete sentences
      const combined = this._combineIntoSentences(transcript);

      console.log(`✓ Fetched transcript for ${videoId}: ${combined.length} sentences`);
      return combined;
    } catch (error) {
      console.error(`Error fetching transcript for ${videoId}:`, error.message);
      throw new Error(`No transcript found: ${error.message}`);
    }
  }

  /**
   * Combine short transcript segments into complete sentences
   */
  _combineIntoSentences(transcript) {
    if (!transcript || transcript.length === 0) {
      return [];
    }

    const combined = [];
    let currentSentence = {
      text: '',
      start: transcript[0].offset / 1000, // Convert to seconds
      duration: 0
    };

    for (let i = 0; i < transcript.length; i++) {
      const segment = transcript[i];
      const segmentStart = segment.offset / 1000;
      const segmentDuration = segment.duration / 1000;

      // Add the segment text
      if (currentSentence.text) {
        currentSentence.text += ' ' + segment.text;
      } else {
        currentSentence.text = segment.text;
        currentSentence.start = segmentStart;
      }

      // Update duration
      currentSentence.duration = (segmentStart + segmentDuration) - currentSentence.start;

      // Check if this segment ends a sentence
      const text = segment.text.trim();
      const endsSentence =
        text.endsWith('.') ||
        text.endsWith('?') ||
        text.endsWith('!') ||
        i === transcript.length - 1; // Last segment

      // Also end if we've accumulated too much text (more than 15 words)
      const wordCount = currentSentence.text.split(/\s+/).length;

      if (endsSentence || wordCount > 15) {
        combined.push({ ...currentSentence });

        // Reset for next sentence
        if (i + 1 < transcript.length) {
          currentSentence = {
            text: '',
            start: transcript[i + 1].offset / 1000,
            duration: 0
          };
        }
      }
    }

    console.log(`✓ Combined ${transcript.length} segments into ${combined.length} sentences`);
    return combined;
  }

  /**
   * Get video metadata (title, duration, etc.)
   */
  async getVideoMetadata(videoId) {
    // For now, return basic info. Can be enhanced with YouTube Data API
    return {
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`
    };
  }
}

export default new YouTubeService();
