import { useState, useEffect } from 'react';
import { useSocket } from '../lib/socket';
import { useViewer } from '../lib/webrtc';
import MediaStream from './MediaStream';

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
  
  useEffect(() => {
    if (!socket) return;
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('clientId') || `client-${Math.floor(Math.random() * 10000)}`;
    socket.emit('get-client-config', { clientId });
    
    // Handle full client configuration updates
    socket.on('client-config', (config: ClientConfig) => {
      console.log('Received client config:', config);
      setClientConfig(config);
    });
    
    // Handle region-only updates to prevent stream interruption
    socket.on('region-update', ({ clientId: updatedClientId, region }) => {
      console.log('Received region update:', region);
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
    };
  }, [socket]);
  
  const { streamRef, connected } = useViewer(socket, clientConfig);
  
  if (!clientConfig) {
    return <div className="loading">Waiting for configuration...</div>;
  }
  
  if (!connected) {
    return <div className="connecting">Connecting to stream...</div>;
  }
  
  return (
    <div className="client-view" style={{ width: '100vw', height: '100vh' }}>
      <MediaStream stream={streamRef.current} regionConfig={clientConfig.region} />
      <div className="status-overlay">
        {clientConfig.name || clientConfig.clientId}
      </div>
    </div>
  );
};

export default ClientView;
