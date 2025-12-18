'use client';

import { useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

function PIPContent() {
  const searchParams = useSearchParams();
  const videoId = searchParams.get('videoId');
  const playerRef = useRef<any>(null);

  useEffect(() => {
    if (!videoId) return;

    // Load YouTube IFrame API
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
      playerRef.current = new window.YT.Player('pip-player', {
        videoId: videoId,
        playerVars: {
          autoplay: 1,
          controls: 1,
          modestbranding: 1,
          rel: 0
        },
      });
    };

    return () => {
      if (playerRef.current && playerRef.current.destroy) {
        playerRef.current.destroy();
      }
    };
  }, [videoId]);

  if (!videoId) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-white">
        No video ID provided
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-black">
      <div id="pip-player" className="w-full h-full"></div>
    </div>
  );
}

export default function PIPPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen bg-black text-white">
        Loading...
      </div>
    }>
      <PIPContent />
    </Suspense>
  );
}
