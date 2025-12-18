import ytdl from '@distube/ytdl-core';

class YouTubeService {
  constructor() {
    // Python microservice URL for transcript fetching
    this.transcriptServiceUrl = 'http://localhost:5000';
  }

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
   * Get transcript from YouTube video via Python microservice
   */
  async getTranscript(videoId) {
    try {
      console.log(`🎬 Fetching transcript for: ${videoId}`);

      // Call Python microservice
      const response = await fetch(`${this.transcriptServiceUrl}/transcript?videoId=${videoId}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch transcript');
      }

      const data = await response.json();

      if (!data.transcript || data.transcript.length === 0) {
        throw new Error('No transcript available for this video');
      }

      console.log(`📝 Received ${data.transcript.length} transcript segments`);

      // Combine into sentences using the same logic as before
      const combined = this._combineIntoSentences(data.transcript);

      console.log(`✓ Fetched transcript for ${videoId}: ${combined.length} sentences`);
      return combined;
    } catch (error) {
      console.error(`❌ Error fetching transcript for ${videoId}:`, error.message);

      // Check if Python service is down
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Transcript service is not running. Please start the Python service.');
      }

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
      start: transcript[0].start,
      duration: 0
    };

    for (let i = 0; i < transcript.length; i++) {
      const segment = transcript[i];

      // Add the segment text
      if (currentSentence.text) {
        currentSentence.text += ' ' + segment.text;
      } else {
        currentSentence.text = segment.text;
        currentSentence.start = segment.start;
      }

      // Update duration
      currentSentence.duration = (segment.start + segment.duration) - currentSentence.start;

      // Check if this segment ends a sentence
      const text = segment.text.trim();
      let endsSentence = (
        text.endsWith('.') ||
        text.endsWith('?') ||
        text.endsWith('!') ||
        i === transcript.length - 1 // Last segment
      );

      // Also end if we've accumulated too much text (more than 15 words)
      const wordCount = currentSentence.text.split(/\s+/).length;
      if (wordCount > 15) {
        endsSentence = true;
      }

      if (endsSentence) {
        combined.push({ ...currentSentence });

        // Reset for next sentence
        if (i + 1 < transcript.length) {
          currentSentence = {
            text: '',
            start: transcript[i + 1].start,
            duration: 0
          };
        }
      }
    }

    console.log(`✓ Combined ${transcript.length} segments into ${combined.length} sentences`);
    return combined;
  }

  /**
   * Get video metadata
   */
  async getVideoMetadata(videoId) {
    try {
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const info = await ytdl.getInfo(videoUrl);

      return {
        videoId,
        title: info.videoDetails.title,
        author: info.videoDetails.author.name,
        duration: parseInt(info.videoDetails.lengthSeconds),
        url: videoUrl
      };
    } catch (error) {
      return {
        videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`
      };
    }
  }
}

export default new YouTubeService();
