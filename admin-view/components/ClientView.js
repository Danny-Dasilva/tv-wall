import { useState, useEffect } from 'react';
import { useSocket } from '../lib/socket';
import { useViewer } from '../lib/webrtc';
import MediaStream from './MediaStream';

const ClientView = () => {
  const socket = useSocket();
  const [clientConfig, setClientConfig] = useState(null);
  useEffect(() => {
    if (!socket) return;
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('clientId') || `client-${Math.floor(Math.random() * 10000)}`;
    socket.emit('get-client-config', { clientId });
    socket.on('client-config', (config) => {
      console.log('Received client config:', config);
      setClientConfig(config);
    });
    return () => {
      socket.off('client-config');
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
