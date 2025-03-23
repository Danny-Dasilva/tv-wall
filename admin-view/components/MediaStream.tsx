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
    }
  }, [stream]);
  
  // Use useMemo to calculate styles efficiently and prevent unnecessary re-renders
  const containerStyle = useMemo(() => {
    return {
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      position: 'relative' as const,
    };
  }, []);
  
  const videoStyle = useMemo(() => {
    if (!regionConfig) {
      return {
        width: '100%',
        height: '100%',
        objectFit: 'contain' as const,
        position: 'absolute' as const,
        top: 0,
        left: 0,
        zIndex: 1 // Explicitly low z-index to ensure overlays appear above
      };
    }
    
    const { x, y, width, height, totalWidth, totalHeight } = regionConfig;
    const scaleX = totalWidth ? totalWidth / width : 1;
    const scaleY = totalHeight ? totalHeight / height : 1;
    const translateX = -x * 100 / width;
    const translateY = -y * 100 / height;
    
    return {
      width: `${scaleX * 100}%`,
      height: `${scaleY * 100}%`,
      objectFit: 'cover' as const,
      position: 'absolute' as const,
      top: 0,
      left: 0,
      zIndex: 1, // Explicitly low z-index
      transform: `translate(${translateX}%, ${translateY}%)`,
      transformOrigin: 'top left',
      transition: 'transform 0.3s ease-out, width 0.3s ease-out, height 0.3s ease-out'
    };
  }, [regionConfig]);
  
  return (
    <div ref={containerRef} style={containerStyle}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={videoStyle}
      />
      {!isPlaying && stream && (
        <div 
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            color: 'white',
            zIndex: 2
          }}
        >
          <div className="loading-indicator">Loading stream...</div>
        </div>
      )}
    </div>
  );
};

export default MediaStream;