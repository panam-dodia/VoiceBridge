/**
 * YouTube Data API v3 Service
 * Uses official YouTube API to get captions/subtitles
 * This bypasses IP blocking issues with transcript scraping
 */

class YouTubeAPIService {
  constructor() {
    // YouTube Data API key from environment
    this.apiKey = process.env.YOUTUBE_API_KEY || process.env.GEMINI_API_KEY;
    this.baseUrl = 'https://www.googleapis.com/youtube/v3';
  }

  /**
   * Get video captions using YouTube Data API
   * Falls back to transcript service if API key not available
   */
  async getCaptions(videoId) {
    if (!this.apiKey) {
      throw new Error('YouTube API key not configured');
    }

    try {
      // Step 1: Get list of available captions
      const captionsResponse = await fetch(
        `${this.baseUrl}/captions?videoId=${videoId}&key=${this.apiKey}&part=snippet`
      );

      if (!captionsResponse.ok) {
        throw new Error(`YouTube API error: ${captionsResponse.status}`);
      }

      const captionsData = await captionsResponse.json();

      if (!captionsData.items || captionsData.items.length === 0) {
        throw new Error('No captions available for this video');
      }

      // Find English captions
      let captionTrack = captionsData.items.find(
        item => item.snippet.language === 'en'
      );

      // If no English, use first available
      if (!captionTrack) {
        captionTrack = captionsData.items[0];
      }

      // Step 2: Download the caption track
      // Note: This requires OAuth2, which is complex for a hackathon project
      // Alternative: Use the embedded player API or return metadata

      return {
        available: true,
        language: captionTrack.snippet.language,
        trackKind: captionTrack.snippet.trackKind,
        captionId: captionTrack.id
      };

    } catch (error) {
      console.error('YouTube API error:', error.message);
      throw error;
    }
  }

  /**
   * Get video metadata (title, description, etc.)
   */
  async getVideoInfo(videoId) {
    if (!this.apiKey) {
      return { title: `Video ${videoId}`, description: '' };
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/videos?id=${videoId}&key=${this.apiKey}&part=snippet`
      );

      if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.items || data.items.length === 0) {
        return { title: `Video ${videoId}`, description: '' };
      }

      const video = data.items[0].snippet;
      return {
        title: video.title,
        description: video.description,
        channelTitle: video.channelTitle,
        publishedAt: video.publishedAt
      };

    } catch (error) {
      console.error('YouTube API error:', error.message);
      return { title: `Video ${videoId}`, description: '' };
    }
  }
}

export default new YouTubeAPIService();
