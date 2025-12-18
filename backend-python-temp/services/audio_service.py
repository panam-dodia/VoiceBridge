import os
import tempfile
import yt_dlp

class AudioService:
    @staticmethod
    def download_youtube_audio(video_url: str) -> str:
        """Download audio from YouTube video"""
        temp_dir = tempfile.gettempdir()
        
        ydl_opts = {
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'outtmpl': os.path.join(temp_dir, '%(id)s.%(ext)s'),
            'quiet': True,
        }
        
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(video_url, download=True)
                video_id = info['id']
                audio_file = os.path.join(temp_dir, f"{video_id}.mp3")
                return audio_file
        except Exception as e:
            raise Exception(f"Error downloading audio: {str(e)}")