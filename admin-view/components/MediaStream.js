import { useRef, useEffect } from 'react';

const MediaStream = ({ stream, regionConfig = null }) => {
  const videoRef = useRef(null);
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);
  const getVideoStyle = () => {
    if (!regionConfig) {
      return {};
    }
    const { x, y, width, height, totalWidth, totalHeight } = regionConfig;
    const scaleX = totalWidth ? totalWidth / width : 1;
    const scaleY = totalHeight ? totalHeight / height : 1;
    const translateX = -x * scaleX;
    const translateY = -y * scaleY;
    return {
      width: '100%',
      height: '100%',
      objectFit: 'fill',
      transform: `scale(${scaleX}, ${scaleY}) translate(${translateX}px, ${translateY}px)`,
      transformOrigin: 'top left',
    };
  };
  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={getVideoStyle()}
      />
    </div>
  );
};

export default MediaStream;
