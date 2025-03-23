import { useRef, useEffect, useState, useMemo } from 'react';

interface RegionConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  totalWidth: number;
  totalHeight: number;
}

interface MediaStreamProps {
  stream: MediaStream | null;
  regionConfig?: RegionConfig | null;
}

const MediaStream = ({ stream, regionConfig = null }: MediaStreamProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [streamDimensions, setStreamDimensions] = useState<{width: number, height: number} | null>(null);
  
  // Set up the stream
  useEffect(() => {
    if (!videoRef.current || !stream) return;
    
    // Only change the source if it's different
    if (videoRef.current.srcObject !== stream) {
      console.log('Setting video srcObject');
      videoRef.current.srcObject = stream;
      
      // Add event listeners to track video playing state
      const handlePlaying = () => {
        console.log('Video is playing');
        setIsPlaying(true);
        
        // Get video dimensions when it starts playing
        if (videoRef.current) {
          setStreamDimensions({
            width: videoRef.current.videoWidth,
            height: videoRef.current.videoHeight
          });
        }
      };
      
      const handlePause = () => {
        console.log('Video paused');
        setIsPlaying(false);
      };
      
      const handleEnded = () => {
        console.log('Video ended');
        setIsPlaying(false);
      };
      
      videoRef.current.addEventListener('playing', handlePlaying);
      videoRef.current.addEventListener('pause', handlePause);
      videoRef.current.addEventListener('ended', handleEnded);
      
      // Try to play immediately
      videoRef.current.play().catch(err => {
        console.warn('Auto-play failed:', err);
      });
      
      // Clean up event listeners
      return () => {
        if (videoRef.current) {
          videoRef.current.removeEventListener('playing', handlePlaying);
          videoRef.current.removeEventListener('pause', handlePause);
          videoRef.current.removeEventListener('ended', handleEnded);
        }
      };
    }
  }, [stream]);

  // Ensure video continues playing when region changes
  useEffect(() => {
    if (videoRef.current && stream && videoRef.current.paused && isPlaying) {
      videoRef.current.play().catch(err => {
        console.warn('Failed to resume playback after region change:', err);
      });
    }
  }, [regionConfig, stream, isPlaying]);

  // Since we're now receiving pre-cropped video, we can use simpler styling
  const videoStyle = useMemo(() => {
    return {
      width: '100%',
      height: '100%',
      objectFit: 'contain' as const
    };
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute top-0 left-0"
          style={videoStyle}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-white">
          No stream available
        </div>
      )}
      
      {!isPlaying && stream && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white z-10">
          <div className="loading-indicator">Loading stream...</div>
        </div>
      )}
    </div>
  );
};

export default MediaStream;