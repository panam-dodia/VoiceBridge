from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv
import io

from services.youtube_service import YouTubeService
from services.elevenlabs_service import ElevenLabsService
from services.translation_service import TranslationService
from services.gemini_service import GeminiService

load_dotenv()

app = FastAPI(title="YouTube Voice Translator API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://*.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
youtube_service = YouTubeService()
elevenlabs_service = ElevenLabsService()
translation_service = TranslationService()
gemini_service = GeminiService()

# Request models
class TranscriptRequest(BaseModel):
    video_url: str
    language_code: str = "en"

class TTSRequest(BaseModel):
    text: str
    voice_id: str = None
    gender: str = "male"

class TranslateTextRequest(BaseModel):
    text: str
    target_language: str

class QARequest(BaseModel):
    question: str
    video_id: str
    watched_transcript: list
    target_language: str

@app.get("/")
async def root():
    return {
        "message": "YouTube Voice Translator API",
        "status": "running",
        "version": "1.0.0"
    }

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.post("/api/transcript")
async def get_transcript(request: TranscriptRequest):
    """Get transcript - use existing or transcribe with ElevenLabs"""
    try:
        print(f"📝 Request: {request.video_url}, Language: {request.language_code}")

        video_id = youtube_service.extract_video_id(request.video_url)
        print(f"🎥 Video ID: {video_id}")

        # Strategy 1: Try existing transcript first (faster & free)
        if youtube_service.has_transcript(video_id):
            print("✓ Using existing YouTube transcript")
            transcript = youtube_service.get_transcript(video_id, "en")

            # Detect voice gender from first few sentences
            sample_text = " ".join([t['text'] for t in transcript[:5]])
            detected_gender = gemini_service.detect_voice_gender(sample_text)
            print(f"🎙️ Detected voice gender: {detected_gender}")

            # Don't translate here - do it on-demand for faster initial load
            # Just return the English transcript

            return {
                "success": True,
                "video_id": video_id,
                "language": request.language_code,
                "transcript": transcript,
                "total_entries": len(transcript),
                "method": "youtube_transcript",
                "requires_translation": request.language_code not in ['en', 'en-US'],
                "voice_gender": detected_gender
            }
        
        # Strategy 2: No transcript available - inform user
        else:
            print("✗ No transcript found for this video")
            raise HTTPException(
                status_code=400,
                detail="This video doesn't have captions/subtitles. Please use a video with available captions (auto-generated or manual). Most YouTube videos have auto-generated captions."
            )
            
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/translate-text")
async def translate_text(request: TranslateTextRequest):
    """Translate a single text segment on-demand"""
    try:
        if request.target_language in ['en', 'en-US']:
            return {"success": True, "translated_text": request.text}

        translated = translation_service.translate_text(request.text, request.target_language)

        return {
            "success": True,
            "translated_text": translated
        }

    except Exception as e:
        print(f"❌ Translation Error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/text-to-speech")
async def text_to_speech(request: TTSRequest):
    """Convert text to speech using ElevenLabs with gender-based voice selection"""
    try:
        print(f"🔊 Converting text to speech: {request.text[:50]}... (Gender: {request.gender})")

        # Generate audio using ElevenLabs with gender-based voice selection
        audio_bytes = elevenlabs_service.text_to_speech(
            text=request.text,
            voice_id=request.voice_id,
            gender=request.gender
        )

        print(f"✓ Audio generated: {len(audio_bytes)} bytes")

        # Return audio as streaming response
        return StreamingResponse(
            io.BytesIO(audio_bytes),
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": "inline; filename=speech.mp3"
            }
        )

    except Exception as e:
        print(f"❌ TTS Error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/qa")
async def question_answer(request: QARequest):
    """Answer questions about the video using Gemini AI"""
    try:
        print(f"❓ Q&A Request: {request.question[:50]}... (Language: {request.target_language})")

        # Get answer from Gemini (uses watched transcript as context)
        answer = gemini_service.answer_question(
            question=request.question,
            watched_transcript=request.watched_transcript,
            target_language=request.target_language
        )

        print(f"✓ Answer generated: {answer[:100]}...")

        return {
            "success": True,
            "answer": answer,
            "language": request.target_language
        }

    except Exception as e:
        print(f"❌ Q&A Error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)