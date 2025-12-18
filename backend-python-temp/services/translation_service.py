from google.cloud import translate_v2 as translate
from typing import List, Dict

class TranslationService:
    def __init__(self):
        self.client = translate.Client()
    
    def translate_text(self, text: str, target_language: str) -> str:
        """Translate text using Google Cloud Translation"""
        if target_language in ['en', 'en-US']:
            return text
            
        result = self.client.translate(
            text,
            target_language=target_language
        )
        return result['translatedText']
    
    def translate_transcript(self, transcript: List[Dict], target_language: str) -> List[Dict]:
        """Translate entire transcript"""
        if target_language in ['en', 'en-US']:
            return transcript
        
        for item in transcript:
            item['text'] = self.translate_text(item['text'], target_language)
        
        return transcript