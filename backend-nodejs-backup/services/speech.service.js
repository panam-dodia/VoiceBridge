import speech from '@google-cloud/speech';
import dotenv from 'dotenv';

dotenv.config();

class SpeechService {
  constructor() {
    this.client = new speech.SpeechClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });

    // Language codes mapping
    this.languageCodes = {
      'English': 'en-US',
      'Spanish': 'es-ES',
      'French': 'fr-FR',
      'German': 'de-DE',
      'Italian': 'it-IT',
      'Portuguese': 'pt-PT',
      'Russian': 'ru-RU',
      'Japanese': 'ja-JP',
      'Korean': 'ko-KR',
      'Chinese': 'zh-CN',
      'Hindi': 'hi-IN'
    };
  }

  /**
   * Get language code for speech recognition
   */
  getLanguageCode(language) {
    return this.languageCodes[language] || 'en-US';
  }

  /**
   * Create streaming recognition config
   */
  getStreamingConfig(language) {
    const languageCode = this.getLanguageCode(language);

    return {
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: 16000,
        languageCode: languageCode,
        enableAutomaticPunctuation: true,
        model: 'latest_long',
        useEnhanced: true
      },
      interimResults: true
    };
  }

  /**
   * Create a new streaming recognition session
   */
  createRecognizeStream(language, onData, onError) {
    const request = this.getStreamingConfig(language);

    const recognizeStream = this.client
      .streamingRecognize(request)
      .on('data', (data) => {
        if (data.results[0] && data.results[0].alternatives[0]) {
          const transcription = data.results[0].alternatives[0].transcript;
          const isFinal = data.results[0].isFinal;

          onData({
            text: transcription,
            isFinal: isFinal,
            confidence: data.results[0].alternatives[0].confidence
          });
        }
      })
      .on('error', (error) => {
        console.error('Speech recognition error:', error);
        onError(error);
      });

    return recognizeStream;
  }

  /**
   * Transcribe audio buffer (for non-streaming use)
   */
  async transcribeAudio(audioBuffer, language) {
    try {
      const languageCode = this.getLanguageCode(language);

      const audio = {
        content: audioBuffer.toString('base64')
      };

      const config = {
        encoding: 'LINEAR16',
        sampleRateHertz: 16000,
        languageCode: languageCode,
        enableAutomaticPunctuation: true
      };

      const request = {
        audio: audio,
        config: config
      };

      const [response] = await this.client.recognize(request);
      const transcription = response.results
        .map(result => result.alternatives[0].transcript)
        .join('\n');

      return transcription;
    } catch (error) {
      console.error('Transcription error:', error);
      throw new Error(`Failed to transcribe audio: ${error.message}`);
    }
  }
}

export default new SpeechService();
