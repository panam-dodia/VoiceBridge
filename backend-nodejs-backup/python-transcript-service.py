"""
Simple Python HTTP server that provides YouTube transcript API
This works reliably because youtube-transcript-api is well-maintained
"""

from flask import Flask, jsonify, request
from youtube_transcript_api import YouTubeTranscriptApi
import re

app = Flask(__name__)
api = YouTubeTranscriptApi()

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})

@app.route('/transcript', methods=['GET'])
def get_transcript():
    video_id = request.args.get('videoId')

    if not video_id:
        return jsonify({'error': 'videoId parameter required'}), 400

    try:
        # First, try to get English transcript directly (fastest)
        try:
            fetched_transcript = api.fetch(video_id, languages=['en'])
            print(f"Found English transcript for {video_id}")

            # Convert to list of dicts
            transcript = [
                {
                    'text': snippet.text,
                    'start': snippet.start,
                    'duration': snippet.duration
                }
                for snippet in fetched_transcript
            ]
        except:
            # If that fails, try to find any available transcript
            transcript_list = api.list(video_id)
            transcript = None

            # Try to find English transcript
            for t in transcript_list:
                if t.language_code.startswith('en'):
                    print(f"Found {t.language_code} transcript")
                    fetched = t.fetch()
                    transcript = [
                        {
                            'text': snippet.text,
                            'start': snippet.start,
                            'duration': snippet.duration
                        }
                        for snippet in fetched
                    ]
                    break

            # If no English, translate first available
            if not transcript:
                for t in transcript_list:
                    print(f"Found {t.language_code} transcript, translating to English...")
                    translated = t.translate('en')
                    fetched = translated.fetch()
                    transcript = [
                        {
                            'text': snippet.text,
                            'start': snippet.start,
                            'duration': snippet.duration
                        }
                        for snippet in fetched
                    ]
                    break

        if not transcript:
            return jsonify({'error': 'No transcript available'}), 404

        return jsonify({'transcript': transcript})

    except Exception as e:
        print(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print('Python Transcript Service Starting...')
    print('Running on http://localhost:5000')
    app.run(port=5000, debug=False)
