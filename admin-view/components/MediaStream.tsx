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
  
  // Set up the stream only when it changes, not when regionConfig changes
  useEffect(() => {
    if (videoRef.current && stream) {
      // Keep the current stream if it's already set and playing
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
        
        // Add event listeners to track video playing state
        const handlePlaying = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);
        const handleEnded = () => setIsPlaying(false);
        
        videoRef.current.addEventListener('playing', handlePlaying);
        videoRef.current.addEventListener('pause', handlePause);
        videoRef.current.addEventListener('ended', handleEnded);
        
        // Clean up event listeners
        return () => {
          if (videoRef.current) {
            videoRef.current.removeEventListener('playing', handlePlaying);
            videoRef.current.removeEventListener('pause', handlePause);
            videoRef.current.removeEventListener('ended', handleEnded);
          }
        };
      }
    }
  }, [stream]);
  
  // Use useMemo to calculate styles efficiently and prevent unnecessary re-renders
  const videoStyle = useMemo(() => {
    if (!regionConfig) {
      return {
        width: '100%',
        height: '100%',
        objectFit: 'contain' as const
      };
    }
    
    const { x, y, width, height, totalWidth, totalHeight } = regionConfig;
    const scaleX = totalWidth ? totalWidth / width : 1;
    const scaleY = totalHeight ? totalHeight / height : 1;
    const translateX = -x * scaleX;
    const translateY = -y * scaleY;
    
    return {
      width: '100%',
      height: '100%',
      objectFit: 'fill' as const,
      transform: `scale(${scaleX}, ${scaleY}) translate(${translateX}px, ${translateY}px)`,
      transformOrigin: 'top left',
      transition: 'transform 0.3s ease-out' // Smooth transition for region changes
    };
  }, [regionConfig]);
  
  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={videoStyle}
      />
      {!isPlaying && stream && (
        <div className="stream-status">
          <div className="loading-indicator">Loading stream...</div>
        </div>
      )}
    </div>
  );
};

export default MediaStream;
