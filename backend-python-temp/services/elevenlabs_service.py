from elevenlabs.client import ElevenLabs
from typing import List, Dict
import os
import re
from dotenv import load_dotenv

load_dotenv()

class ElevenLabsService:
    # Voice IDs for different genders (ElevenLabs multilingual voices)
    MALE_VOICE_ID = "pNInz6obpgDQGcFmaJgB"  # Adam - clear male voice
    FEMALE_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"  # Bella - clear female voice

    def __init__(self):
        self.client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))
    
    def transcribe_audio_file(self, audio_file_path: str, language_code: str = "en") -> List[Dict]:
        """Transcribe audio file using ElevenLabs Speech-to-Text"""
        try:
            with open(audio_file_path, "rb") as audio_file:
                result = self.client.speech_to_text.convert(
                    file=audio_file,
                    model_id="scribe_v2"
                )
                
                # DEBUG: Print what we actually got
                print(f"🔍 Result type: {type(result)}")
                print(f"🔍 Result dir: {dir(result)}")
                print(f"🔍 Result: {result}")
                
                # Try to access the text
                if hasattr(result, 'text'):
                    print(f"🔍 Result.text: {result.text}")
                    transcript = self._split_into_chunks(result.text)
                elif hasattr(result, 'chunks'):
                    print(f"🔍 Result.chunks: {result.chunks}")
                    # Handle chunks
                    transcript = self._handle_chunks(result.chunks)
                else:
                    print(f"🔍 Converting to string: {str(result)}")
                    transcript = self._split_into_chunks(str(result))
                
                return transcript
                
        except Exception as e:
            import traceback
            traceback.print_exc()
            raise Exception(f"ElevenLabs transcription error: {str(e)}")
    
    def _handle_chunks(self, chunks) -> List[Dict]:
        """Handle chunk-based response"""
        transcript = []
        current_time = 0.0
        
        for chunk in chunks:
            if hasattr(chunk, 'text'):
                text = chunk.text
            else:
                text = str(chunk)
            
            word_count = len(text.split())
            duration = word_count / 2.5
            
            transcript.append({
                'text': text.strip(),
                'start': round(current_time, 2),
                'duration': round(duration, 2)
            })
            
            current_time += duration
        
        return transcript
    
    def _split_into_chunks(self, full_text: str, avg_words_per_second: float = 2.5) -> List[Dict]:
        """Split transcript into chunks with estimated timestamps"""
        
        sentences = re.split(r'(?<=[.!?])\s+', full_text.strip())
        
        transcript = []
        current_time = 0.0
        
        for sentence in sentences:
            if not sentence.strip():
                continue
            
            word_count = len(sentence.split())
            duration = word_count / avg_words_per_second
            
            transcript.append({
                'text': sentence.strip(),
                'start': round(current_time, 2),
                'duration': round(duration, 2)
            })
            
            current_time += duration
        
        return transcript
    
    def text_to_speech(self, text: str, voice_id: str = None, gender: str = "male") -> bytes:
        """Convert text to speech using ElevenLabs with gender-based voice selection"""
        try:
            # Select voice based on gender if voice_id not provided
            if voice_id is None:
                voice_id = self.FEMALE_VOICE_ID if gender == "female" else self.MALE_VOICE_ID
                print(f"🎙️ Using {gender} voice: {voice_id}")

            audio_generator = self.client.text_to_speech.convert(
                text=text,
                voice_id=voice_id,
                model_id="eleven_multilingual_v2"
            )

            audio_bytes = b"".join(audio_generator)
            return audio_bytes

        except Exception as e:
            raise Exception(f"ElevenLabs TTS error: {str(e)}")