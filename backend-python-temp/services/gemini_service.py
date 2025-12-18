import os
import google.generativeai as genai
from typing import List, Dict

class GeminiService:
    def __init__(self):
        """Initialize Gemini API"""
        api_key = os.getenv('GEMINI_API_KEY')
        if not api_key:
            raise ValueError("GEMINI_API_KEY not found in environment variables")

        genai.configure(api_key=api_key)
        # Use the latest Gemini Flash model (free tier available)
        self.model = genai.GenerativeModel('gemini-2.5-flash')

    def answer_question(
        self,
        question: str,
        watched_transcript: List[Dict],
        target_language: str
    ) -> str:
        """
        Answer a question based on watched video content
        First tries to find answer in transcript, then uses AI if needed
        """
        # Combine watched transcript into context
        transcript_text = " ".join([segment['text'] for segment in watched_transcript])

        # Create prompt for Gemini
        prompt = f"""You are a helpful AI assistant answering questions about a video.

Video Content (what the user has watched so far):
{transcript_text}

User's Question: {question}

Instructions:
1. If the question can be answered from the video content above, answer it directly based on that content
2. If the question is about something not mentioned in the video but is a general knowledge question related to the video topic, provide a helpful answer
3. If you cannot answer from the video content and it's not related to the video topic, politely say you can only answer questions about the video or related topics
4. Answer in {target_language} language
5. Keep your answer concise and clear (2-4 sentences)

Answer:"""

        try:
            response = self.model.generate_content(prompt)
            return response.text.strip()
        except Exception as e:
            print(f"Gemini API error: {str(e)}")
            raise Exception(f"Failed to generate answer: {str(e)}")

    def search_transcript(self, question: str, transcript: List[Dict]) -> str:
        """
        Search for relevant parts of transcript that might answer the question
        Returns empty string if not found
        """
        question_lower = question.lower()
        keywords = question_lower.split()

        relevant_segments = []
        for segment in transcript:
            text_lower = segment['text'].lower()
            # Check if segment contains any keywords from the question
            if any(keyword in text_lower for keyword in keywords if len(keyword) > 3):
                relevant_segments.append(segment['text'])

        if relevant_segments:
            return " ".join(relevant_segments[:3])  # Return first 3 relevant segments
        return ""

    def detect_voice_gender(self, transcript_sample: str) -> str:
        """
        Detect if the speaker is male or female based on transcript content
        Returns 'male' or 'female'
        """
        prompt = f"""Analyze this video transcript sample and determine if the speaker is most likely male or female.

Transcript sample:
{transcript_sample}

Based on:
1. Language patterns (if any gender-specific references exist)
2. Context clues (topics, self-references, etc.)
3. Any explicit mentions of gender

Respond with ONLY ONE WORD: either "male" or "female"

Answer:"""

        try:
            response = self.model.generate_content(prompt)
            gender = response.text.strip().lower()

            # Validate response
            if 'female' in gender:
                return 'female'
            elif 'male' in gender:
                return 'male'
            else:
                # Default to male if unclear
                return 'male'
        except Exception as e:
            print(f"Voice gender detection error: {str(e)}")
            return 'male'  # Default fallback
