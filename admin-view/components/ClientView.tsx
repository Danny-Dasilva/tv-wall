import { useState, useEffect, useRef } from 'react';
import { useSocket } from '../lib/socket';
import { useViewer } from '../lib/webrtc';
import MediaStream from './MediaStream';
import { useRouter } from 'next/router';

interface ClientConfig {
  clientId: string;
  name?: string;
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
    totalWidth: number;
    totalHeight: number;
  };
  [key: string]: any;
}

const ClientView = () => {
  const socket = useSocket();
  const [clientConfig, setClientConfig] = useState<ClientConfig | null>(null);
  const [connecting, setConnecting] = useState<boolean>(true);
  const configRequestedRef = useRef<boolean>(false);
  const router = useRouter();
  const clientIdRef = useRef<string | null>(null);
  const lastRegionUpdateTimeRef = useRef<number>(0);
  
  useEffect(() => {
    if (!socket || !router.isReady) return;
    
    // Only extract client ID from query params when router is ready
    const queryClientId = router.query.clientId;
    const clientId = typeof queryClientId === 'string' 
      ? queryClientId 
      : `client-${Math.floor(Math.random() * 10000)}`;
    
    clientIdRef.current = clientId;
    
    // Only request config once per socket connection
    if (!configRequestedRef.current) {
      console.log('Requesting client config for', clientId);
      socket.emit('get-client-config', { clientId });
      configRequestedRef.current = true;
    }
    
    // Handle reconnection
    socket.on('connect', () => {
      if (clientIdRef.current) {
        console.log('Socket reconnected, re-requesting config');
        socket.emit('get-client-config', { clientId: clientIdRef.current });
      }
    });
    
    // Handle full client configuration updates
    socket.on('client-config', (config: ClientConfig) => {
      console.log('Received client config:', config);
      setClientConfig(config);
      setConnecting(false);
    });
    
    // Handle region-only updates to prevent stream interruption
    socket.on('region-update', ({ clientId: updatedClientId, region }) => {
      const now = Date.now();
      console.log('Received region update:', updatedClientId, region);
      
      // Rate limit region updates (keep only 1 update every 100ms)
      if (now - lastRegionUpdateTimeRef.current < 100) {
        console.log('Skipping rapid region update');
        return;
      }
      
      lastRegionUpdateTimeRef.current = now;
      
      setClientConfig(prevConfig => {
        if (prevConfig && prevConfig.clientId === updatedClientId) {
          return {
            ...prevConfig,
            region
          };
        }
        return prevConfig;
      });
    });
    
    return () => {
      socket.off('client-config');
      socket.off('region-update');
      socket.off('connect');
    };
  }, [socket, router.isReady, router.query]);
  
  const { streamRef, connected } = useViewer(socket, clientConfig);
  
  if (!clientConfig) {
    return (
      <div className="flex items-center justify-center flex-col h-screen">
        <div className="text-2xl mb-2">Waiting for configuration...</div>
        {router.isReady && (
          <div className="text-sm text-gray-400">
            Client ID: {router.query.clientId || 'generating...'}
          </div>
        )}
      </div>
    );
  }
  
  return (
    <div 
      className="relative overflow-hidden bg-black w-screen h-screen"
    >
      {/* Display the full stream - we're not doing cropping on the server yet */}
      <MediaStream 
        stream={streamRef.current} 
        regionConfig={clientConfig.region} 
      />
      
      {!connected && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10">
          <div className="text-2xl text-white mb-2">Connecting to stream...</div>
          <div className="text-sm text-gray-400">
            {clientConfig.name || clientConfig.clientId}
          </div>
        </div>
      )}
      
      <div className="absolute bottom-4 right-4 px-3 py-1.5 bg-black bg-opacity-50 rounded text-sm text-white">
        {clientConfig.name || clientConfig.clientId}
        {clientConfig.region && (
          <span className="ml-2 text-xs opacity-70">
            [{Math.round(clientConfig.region.width)}×{Math.round(clientConfig.region.height)}]
          </span>
        )}
      </div>
    </div>
  );
};

export default ClientView;