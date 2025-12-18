import { YoutubeTranscript } from 'youtube-transcript';

// Test with a known video that definitely has captions
const testVideos = [
  'bRtERL20DBY', // Your video
  'dQw4w9WgXcQ', // Rick Astley - Never Gonna Give You Up
  '8S0FDjFBj8o', // TED talk
];

async function test() {
  for (const videoId of testVideos) {
    console.log(`\n🎬 Testing video: ${videoId}`);
    console.log(`   URL: https://www.youtube.com/watch?v=${videoId}`);

    try {
      const transcript = await YoutubeTranscript.fetchTranscript(videoId);
      console.log(`   ✅ Success! Got ${transcript.length} segments`);
      if (transcript.length > 0) {
        console.log(`   First segment:`, transcript[0]);
      }
    } catch (error) {
      console.log(`   ❌ Error:`, error.message);
    }
  }
}

test();
