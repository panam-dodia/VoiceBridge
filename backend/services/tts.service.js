import { ElevenLabsClient } from 'elevenlabs';
import dotenv from 'dotenv';

dotenv.config();

class TTSService {
  // Enhanced voice mapping for better multilingual support
  // Using ElevenLabs Turbo v2.5 model for faster, higher quality output
  static VOICES = {
    // Male voices
    'male-english': 'pNInz6obpgDQGcFmaJgB',    // Adam - Deep, resonant male
    'male-general': 'JBFqnCBsd6RMkjVDRZzb',    // George - Warm, friendly male
    'male-narrator': 'onwK4e9ZLuTAKqWW03F9',   // Daniel - Professional narrator

    // Female voices
    'female-english': 'EXAVITQu4vr4xnSDxMaL',  // Bella - Clear, articulate female
    'female-general': 'ThT5KcBeYPX3keUQqHPh',  // Dorothy - Warm, pleasant female
    'female-young': 'jsCqWAovK2LkecY7zXl4',    // Freya - Young, energetic female

    // Default fallbacks
    'male': 'pNInz6obpgDQGcFmaJgB',
    'female': 'EXAVITQu4vr4xnSDxMaL'
  };

  // Best model for each use case
  static MODELS = {
    fast: 'eleven_turbo_v2_5',           // Fastest, great quality
    multilingual: 'eleven_multilingual_v2', // Best for non-English
    highest_quality: 'eleven_monolingual_v1' // Highest quality English
  };

  constructor() {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY not found in environment variables');
    }

    this.client = new ElevenLabsClient({ apiKey });
    console.log('✅ ElevenLabs TTS initialized with enhanced voice support');
  }

  /**
   * Get appropriate voice ID based on gender and language
   */
  getVoiceId(gender = 'male', language = 'English') {
    const genderKey = gender.toLowerCase();

    // For English, use specific English voices
    if (language.toLowerCase().includes('english') || language.toLowerCase() === 'en') {
      return TTSService.VOICES[`${genderKey}-english`] || TTSService.VOICES[genderKey];
    }

    // For other languages, use general multilingual voices
    return TTSService.VOICES[`${genderKey}-general`] || TTSService.VOICES[genderKey];
  }

  /**
   * Get appropriate model based on language
   */
  getModel(language = 'English') {
    // Use turbo model for English (fastest)
    if (language.toLowerCase().includes('english') || language.toLowerCase() === 'en') {
      return TTSService.MODELS.fast;
    }

    // Use multilingual model for other languages
    return TTSService.MODELS.multilingual;
  }

  /**
   * Convert text to speech using ElevenLabs with enhanced voice selection
   * @param {string} text - Text to convert to speech
   * @param {string|null} voiceId - Specific voice ID (optional)
   * @param {string} gender - 'male' or 'female'
   * @param {string} language - Target language for voice selection
   */
  async textToSpeech(text, voiceId = null, gender = 'male', language = 'English') {
    try {
      // Select voice based on gender and language if not provided
      if (!voiceId) {
        voiceId = this.getVoiceId(gender, language);
        console.log(`🎙️ Using ${gender} voice for ${language}: ${voiceId}`);
      }

      // Select appropriate model
      const modelId = this.getModel(language);
      console.log(`🤖 Using model: ${modelId}`);

      const audio = await this.client.textToSpeech.convert(voiceId, {
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,      // Balance between consistency and expressiveness
          similarity_boost: 0.75, // How much to match original voice characteristics
          style: 0.0,          // Style exaggeration (0 = neutral)
          use_speaker_boost: true // Enhanced clarity
        }
      });

      // Convert async iterator to buffer
      const chunks = [];
      for await (const chunk of audio) {
        chunks.push(chunk);
      }

      const buffer = Buffer.concat(chunks);
      console.log(`✅ Generated ${buffer.length} bytes of audio`);
      return buffer;
    } catch (error) {
      console.error('❌ ElevenLabs TTS error:', error.message);
      throw new Error(`TTS conversion failed: ${error.message}`);
    }
  }

  /**
   * Convert text to speech and stream it (for real-time playback)
   * @param {string} text - Text to convert to speech
   * @param {string|null} voiceId - Specific voice ID (optional)
   * @param {string} gender - 'male' or 'female'
   * @param {string} language - Target language for voice selection
   */
  async *textToSpeechStream(text, voiceId = null, gender = 'male', language = 'English') {
    try {
      if (!voiceId) {
        voiceId = this.getVoiceId(gender, language);
        console.log(`🎙️ Streaming ${gender} voice for ${language}: ${voiceId}`);
      }

      const modelId = this.getModel(language);

      const audio = await this.client.textToSpeech.convert(voiceId, {
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true
        }
      });

      for await (const chunk of audio) {
        yield chunk;
      }

      console.log('✅ Audio streaming completed');
    } catch (error) {
      console.error('❌ ElevenLabs TTS stream error:', error.message);
      throw new Error(`TTS stream failed: ${error.message}`);
    }
  }
}

export default new TTSService();
