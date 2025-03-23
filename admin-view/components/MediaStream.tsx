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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [streamDimensions, setStreamDimensions] = useState<{width: number, height: number} | null>(null);
  
  // Set up the stream
  useEffect(() => {
    if (!videoRef.current || !stream) return;
    
    // Only change the source if it's different
    if (videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
      
      // Add event listeners to track video playing state
      const handlePlaying = () => {
        setIsPlaying(true);
        // Get video dimensions when it starts playing
        if (videoRef.current) {
          setStreamDimensions({
            width: videoRef.current.videoWidth,
            height: videoRef.current.videoHeight
          });
        }
      };
      
      const handlePause = () => setIsPlaying(false);
      const handleEnded = () => setIsPlaying(false);
      const handleResize = () => {
        if (videoRef.current) {
          setStreamDimensions({
            width: videoRef.current.videoWidth,
            height: videoRef.current.videoHeight
          });
        }
      };
      
      videoRef.current.addEventListener('playing', handlePlaying);
      videoRef.current.addEventListener('pause', handlePause);
      videoRef.current.addEventListener('ended', handleEnded);
      videoRef.current.addEventListener('resize', handleResize);
      
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
          videoRef.current.removeEventListener('resize', handleResize);
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

  // Calculate the crop and scaling parameters based on region config
  const videoTransform = useMemo(() => {
    if (!regionConfig || !streamDimensions) {
      return {
        transform: 'none',
        width: '100%',
        height: '100%',
        objectFit: 'contain' as const
      };
    }

    const { x, y, width, height, totalWidth, totalHeight } = regionConfig;
    
    // Calculate scaling factors
    const scaleX = totalWidth / width;
    const scaleY = totalHeight / height;
    
    // Calculate percentage-based translations
    const translateX = -(x / width) * 100;
    const translateY = -(y / height) * 100;
    
    return {
      width: `${scaleX * 100}%`,
      height: `${scaleY * 100}%`,
      objectFit: 'cover' as const,
      transform: `translate(${translateX}%, ${translateY}%)`,
      transformOrigin: 'top left',
      transition: 'width 0.3s ease, height 0.3s ease, transform 0.3s ease' // Smooth transitions
    };
  }, [regionConfig, streamDimensions]);

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute top-0 left-0 z-0"
        style={videoTransform}
      />
      
      {!isPlaying && stream && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white z-10">
          <div className="loading-indicator">Loading stream...</div>
        </div>
      )}
    </div>
  );
};

export default MediaStream;