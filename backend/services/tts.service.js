import { ElevenLabsClient } from 'elevenlabs';
import dotenv from 'dotenv';

dotenv.config();

class TTSService {
  // Voice IDs for different genders (ElevenLabs multilingual voices)
  static MALE_VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // Adam - clear male voice
  static FEMALE_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Bella - clear female voice

  constructor() {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY not found in environment variables');
    }

    this.client = new ElevenLabsClient({ apiKey });
  }

  /**
   * Convert text to speech using ElevenLabs with gender-based voice selection
   */
  async textToSpeech(text, voiceId = null, gender = 'male') {
    try {
      // Select voice based on gender if voice_id not provided
      if (!voiceId) {
        voiceId = gender === 'female' ? TTSService.FEMALE_VOICE_ID : TTSService.MALE_VOICE_ID;
        console.log(`🎙️ Using ${gender} voice: ${voiceId}`);
      }

      const audio = await this.client.textToSpeech.convert(voiceId, {
        text,
        model_id: 'eleven_multilingual_v2'
      });

      // Convert async iterator to buffer
      const chunks = [];
      for await (const chunk of audio) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    } catch (error) {
      console.error('ElevenLabs TTS error:', error.message);
      throw new Error(`TTS conversion failed: ${error.message}`);
    }
  }

  /**
   * Convert text to speech and stream it
   */
  async *textToSpeechStream(text, voiceId = null, gender = 'male') {
    try {
      if (!voiceId) {
        voiceId = gender === 'female' ? TTSService.FEMALE_VOICE_ID : TTSService.MALE_VOICE_ID;
      }

      const audio = await this.client.textToSpeech.convert(voiceId, {
        text,
        model_id: 'eleven_multilingual_v2'
      });

      for await (const chunk of audio) {
        yield chunk;
      }
    } catch (error) {
      console.error('ElevenLabs TTS stream error:', error.message);
      throw new Error(`TTS stream failed: ${error.message}`);
    }
  }
}

export default new TTSService();
