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
  const { clientId: queryClientId } = router.query;
  
  useEffect(() => {
    if (!socket || !router.isReady) return;
    
    const clientId = (typeof queryClientId === 'string' ? queryClientId : null) || 
                     `client-${Math.floor(Math.random() * 10000)}`;
    
    // Only request config once per socket connection
    if (!configRequestedRef.current) {
      console.log('Requesting client config for', clientId);
      socket.emit('get-client-config', { clientId });
      configRequestedRef.current = true;
    }
    
    // Handle reconnection
    socket.on('connect', () => {
      console.log('Socket reconnected, re-requesting config');
      socket.emit('get-client-config', { clientId });
    });
    
    // Handle full client configuration updates
    socket.on('client-config', (config: ClientConfig) => {
      console.log('Received client config:', config);
      setClientConfig(config);
      setConnecting(false);
    });
    
    // Handle region-only updates to prevent stream interruption
    socket.on('region-update', ({ clientId: updatedClientId, region }) => {
      console.log('Received region update:', updatedClientId, region);
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
  }, [socket, router.isReady, queryClientId, router.query]);
  
  const { streamRef, connected } = useViewer(socket, clientConfig);
  
  if (!clientConfig) {
    return (
      <div className="loading">
        <div>Waiting for configuration...</div>
        <div className="text-sm mt-2 text-gray-400">
          Client ID: {typeof queryClientId === 'string' ? queryClientId : 'loading...'}
        </div>
      </div>
    );
  }
  
  return (
    <div className="client-view" style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <MediaStream stream={streamRef.current} regionConfig={clientConfig.region} />
      
      {!connected && (
        <div className="connecting" style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#000',
          zIndex: 10
        }}>
          <div>Connecting to stream...</div>
          <div className="text-sm mt-2 text-gray-400">
            {clientConfig.name || clientConfig.clientId}
          </div>
        </div>
      )}
      
      <div className="status-overlay">
        {clientConfig.name || clientConfig.clientId}
        {clientConfig.region && (
          <span className="ml-2 text-xs opacity-70">
            [{clientConfig.region.width}×{clientConfig.region.height}]
          </span>
        )}
      </div>
    </div>
  );
};

export default ClientView;