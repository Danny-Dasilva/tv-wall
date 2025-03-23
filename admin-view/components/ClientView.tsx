import { useState, useEffect, useRef } from 'react';
import { useSocket } from '../lib/socket';
import { useViewer } from '../lib/webrtc';
import { useRouter } from 'next/router';

interface RegionConfig {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface StreamDimensions {
  width: number;
  height: number;
}

const ClientView = () => {
  const router = useRouter();
  const [clientId, setClientId] = useState<string | null>(null);
  const [region, setRegion] = useState<RegionConfig | null>(null);
  const [streamDimensions, setStreamDimensions] = useState<StreamDimensions | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [status, setStatus] = useState('Initializing...');
  const socket = useSocket();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  
  // Extract client ID from URL
  useEffect(() => {
    if (!router.isReady) return;
    
    // Get client ID from URL or generate one
    const queryClientId = router.query.clientId as string | undefined;
    const newClientId = queryClientId || `client-${Math.floor(Math.random() * 10000)}`;
    setClientId(newClientId);
  }, [router.isReady, router.query]);
  
  // Initialize viewer hook once client ID is available
  const { streamRef, connected, region: viewerRegion } = useViewer(socket, clientId);
  
  // Handle client configuration
  useEffect(() => {
    if (!socket || !clientId) return;
    
    // Update status
    setStatus('Connecting to server...');
    
    // Handler for client configuration
    const handleClientConfig = (config: any) => {
      setStatus('Configuration received');
      
      if (config.region) {
        setRegion(config.region);
      }
      
      setConnecting(false);
    };
    
    // Handler for region updates
    const handleRegionUpdate = ({ region, totalDimensions }: { region: RegionConfig, totalDimensions: StreamDimensions | null }) => {
      setRegion(region);
      if (totalDimensions) {
        setStreamDimensions(totalDimensions);
      }
    };
    
    // Handler for stream dimensions
    const handleStreamDimensions = (dimensions: StreamDimensions) => {
      setStreamDimensions(dimensions);
    };
    
    // Register event listeners
    socket.on('client-config', handleClientConfig);
    socket.on('region-update', handleRegionUpdate);
    socket.on('stream-dimensions', handleStreamDimensions);
    
    // Request client configuration
    socket.emit('get-client-config', { clientId });
    
    // Cleanup
    return () => {
      socket.off('client-config', handleClientConfig);
      socket.off('region-update', handleRegionUpdate);
      socket.off('stream-dimensions', handleStreamDimensions);
    };
  }, [socket, clientId]);
  
  // Update from viewer region if available
  useEffect(() => {
    if (viewerRegion) {
      setRegion(viewerRegion);
    }
  }, [viewerRegion]);
  
  // Apply stream to video element
  useEffect(() => {
    if (!videoRef.current || !streamRef.current) return;
    
    // Only update if stream changed
    if (videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      
      // Update status when playing
      videoRef.current.onplaying = () => {
        setStatus('Stream playing');
      };
    }
  }, [streamRef]);
  
  // Display connection status
  if (connecting) {
    return (
      <div className="connecting">
        <div>
          <div className="text-2xl mb-2">{status}</div>
          <div className="text-sm opacity-70">Client ID: {clientId || 'Initializing...'}</div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="client-view h-screen w-screen overflow-hidden bg-black relative">
      {/* Video container */}
      <div className="absolute inset-0">
        {connected ? (
          <video
            ref={(el) => {
              videoRef.current = el;
              if (el && streamRef.current && el.srcObject !== streamRef.current) {
                console.log("Setting video srcObject");
                el.srcObject = streamRef.current;
                el.play().catch(e => console.error("Error playing video:", e));
              }
            }}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain'
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-white text-xl">Waiting for stream...</div>
          </div>
        )}
      </div>
      
      {/* Status overlay */}
      <div className="status-overlay">
        <div>Client: {clientId}</div>
        {region && (
          <div>Region: {region.width}×{region.height}</div>
        )}
      </div>
    </div>
  );
};

export default ClientView;