/**
 * YouTube Transcript Service
 * Uses youtube-transcript library to bypass bot detection
 */

import { YoutubeTranscript } from 'youtube-transcript';

class YouTubeInnertubeService {
  /**
   * Fetch transcript using youtube-transcript library
   */
  async getTranscript(videoId) {
    try {
      console.log(`📥 Fetching transcript via youtube-transcript library for video: ${videoId}`);

      // Fetch transcript using youtube-transcript library
      // This library handles bot detection bypass automatically
      const transcriptData = await YoutubeTranscript.fetchTranscript(videoId);

      console.log(`✅ Successfully fetched ${transcriptData.length} transcript segments`);

      // Convert to our format
      const transcript = transcriptData.map(item => ({
        text: item.text,
        start: item.offset / 1000, // Convert milliseconds to seconds
        duration: item.duration / 1000 // Convert milliseconds to seconds
      }));

      // Merge segments into complete sentences
      const mergedTranscript = this.mergeIntoSentences(transcript);
      console.log(`📝 Merged into ${mergedTranscript.length} sentences`);

      return mergedTranscript;

    } catch (error) {
      console.error('❌ YouTube transcript error:', error.message);
      throw new Error('Failed to fetch transcript. Video may not have captions or may be restricted.');
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
