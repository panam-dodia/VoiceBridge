from youtube_transcript_api import YouTubeTranscriptApi
from typing import List, Dict, Optional
import re

class YouTubeService:
    def __init__(self):
        """Initialize the YouTube Transcript API client"""
        self.api = YouTubeTranscriptApi()

    @staticmethod
    def extract_video_id(url: str) -> str:
        """Extract video ID from various YouTube URL formats"""
        patterns = [
            r'(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)',
            r'youtube\.com\/embed\/([^&\n?#]+)',
            r'youtube\.com\/v\/([^&\n?#]+)'
        ]

        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                return match.group(1)

        return url

    def has_transcript(self, video_id: str) -> bool:
        """Check if video has any available transcript (including auto-generated)"""
        try:
            transcript_list = self.api.list(video_id)
            # Check for both manual and auto-generated transcripts
            for transcript in transcript_list:
                return True  # Found at least one transcript
            return False
        except Exception as e:
            print(f"No transcript available for video {video_id}: {str(e)}")
            return False

    def get_transcript(self, video_id: str, language_code: str = "en") -> List[Dict]:
        """Get transcript if available (prioritizes manual, falls back to auto-generated)"""
        try:
            # First, try to get English transcript directly (fastest)
            # Use the convenient fetch() method which does everything in one call
            fetched_transcript = self.api.fetch(video_id, languages=['en'])
            print(f"✓ Found English transcript for {video_id}")

            # Convert FetchedTranscript to list of dicts and combine into sentences
            raw_transcript = [
                {
                    'text': snippet.text,
                    'start': snippet.start,
                    'duration': snippet.duration
                }
                for snippet in fetched_transcript
            ]

            return self._combine_into_sentences(raw_transcript)
        except:
            pass

        # If that fails, try to find any available transcript
        try:
            transcript_list = self.api.list(video_id)

            # Try to find English transcript (manual or auto-generated)
            for transcript in transcript_list:
                if transcript.language_code.startswith('en'):
                    print(f"✓ Found {transcript.language_code} transcript (auto-generated: {transcript.is_generated})")
                    fetched = transcript.fetch()
                    raw_transcript = [
                        {
                            'text': snippet.text,
                            'start': snippet.start,
                            'duration': snippet.duration
                        }
                        for snippet in fetched
                    ]
                    return self._combine_into_sentences(raw_transcript)

            # If no English, get the first available and translate to English
            for transcript in transcript_list:
                print(f"✓ Found {transcript.language_code} transcript, translating to English...")
                translated = transcript.translate('en')
                fetched = translated.fetch()
                raw_transcript = [
                    {
                        'text': snippet.text,
                        'start': snippet.start,
                        'duration': snippet.duration
                    }
                    for snippet in fetched
                ]
                return self._combine_into_sentences(raw_transcript)

            raise Exception("No transcript available")
        except Exception as e:
            raise Exception(f"No transcript found: {str(e)}")

    def _combine_into_sentences(self, transcript: List[Dict]) -> List[Dict]:
        """Combine short transcript segments into complete sentences"""
        if not transcript:
            return []

        combined = []
        current_sentence = {
            'text': '',
            'start': transcript[0]['start'],
            'duration': 0
        }

        for i, segment in enumerate(transcript):
            # Add the segment text
            if current_sentence['text']:
                current_sentence['text'] += ' ' + segment['text']
            else:
                current_sentence['text'] = segment['text']
                current_sentence['start'] = segment['start']

            # Update duration
            current_sentence['duration'] = (segment['start'] + segment['duration']) - current_sentence['start']

            # Check if this segment ends a sentence
            text = segment['text'].strip()
            ends_sentence = (
                text.endswith('.') or
                text.endswith('?') or
                text.endswith('!') or
                i == len(transcript) - 1  # Last segment
            )

            # Also end if we've accumulated too much text (more than 15 words)
            word_count = len(current_sentence['text'].split())
            if word_count > 15:
                ends_sentence = True

            if ends_sentence:
                combined.append(current_sentence.copy())
                current_sentence = {
                    'text': '',
                    'start': transcript[i + 1]['start'] if i + 1 < len(transcript) else segment['start'] + segment['duration'],
                    'duration': 0
                }

        print(f"✓ Combined {len(transcript)} segments into {len(combined)} sentences")
        return combined