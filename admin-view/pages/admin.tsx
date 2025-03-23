import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useSocket } from '../lib/socket';
import { useBroadcaster } from '../lib/webrtc';
import MediaStream from '../components/MediaStream';
import BoxGrid from '../components/BoxGrid';

interface ClientRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  totalWidth: number;
  totalHeight: number;
}

interface Client {
  clientId: string;
  name?: string;
  connected: boolean;
  region?: ClientRegion;
  socketId: string;
  [key: string]: any;
}

export default function AdminPage() {
  const socket = useSocket();
  const { streamRef, setMediaStream } = useBroadcaster(socket);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedSource, setSelectedSource] = useState<'screen' | 'camera'>('screen');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'visual' | 'manual'>('visual');
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  
  useEffect(() => {
    if (!socket) return;
    socket.on('clients-update', (updatedClients: Client[]) => {
      setClients(updatedClients);
    });
    socket.emit('get-clients');
    return () => {
      socket.off('clients-update');
    };
  }, [socket]);
  
  const startStreaming = async () => {
    try {
      let stream: MediaStream;
      if (selectedSource === 'screen') {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { 
            cursor: 'always',
            displaySurface: 'monitor',
          } as MediaTrackConstraints,
          audio: false,
        });
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }
      setMediaStream(stream);
      setIsStreaming(true);
      stream.getVideoTracks()[0].onended = () => {
        setIsStreaming(false);
      };
    } catch (error) {
      console.error('Error starting stream:', error);
      alert(`Failed to start streaming: ${(error as Error).message}`);
    }
  };
  
  const stopStreaming = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      setIsStreaming(false);
    }
  };
  
  const updateClientConfig = (clientId: string, config: Partial<Client>) => {
    if (socket) {
      socket.emit('update-client-config', { clientId, config });
    }
  };
  
  return (
    <>
      <Head>
        <title>TV Wall Admin</title>
      </Head>
      <div className="admin-container">
        <div className="preview-container">
          <h2>Stream Preview</h2>
          {isStreaming ? (
            <div className="stream-preview">
              <MediaStream stream={streamRef.current} />
            </div>
          ) : (
            <div className="start-streaming">
              <div className="source-selector">
                <label>
                  <input
                    type="radio"
                    value="screen"
                    checked={selectedSource === 'screen'}
                    onChange={() => setSelectedSource('screen')}
                  />
                  Screen Capture
                </label>
                <label>
                  <input
                    type="radio"
                    value="camera"
                    checked={selectedSource === 'camera'}
                    onChange={() => setSelectedSource('camera')}
                  />
                  Camera
                </label>
              </div>
              <button onClick={startStreaming}>Start Streaming</button>
            </div>
          )}
          {isStreaming && (
            <button onClick={stopStreaming} className="stop-button">
              Stop Streaming
            </button>
          )}
        </div>
        <div className="clients-container">
          <h2>Connected Clients</h2>
          
          <div className="tab-navigation mb-4">
            <button
              className={`tab-button ${activeTab === 'visual' ? 'active' : ''}`}
              onClick={() => setActiveTab('visual')}
            >
              Visual Editor
            </button>
            <button
              className={`tab-button ${activeTab === 'manual' ? 'active' : ''}`}
              onClick={() => setActiveTab('manual')}
            >
              Manual Configuration
            </button>
          </div>
          
          {activeTab === 'visual' ? (
            <div className="visual-editor">
              <div className="canvas-controls mb-4">
                <div className="flex items-center gap-4">
                  <div>
                    <label className="mr-2">Canvas Width:</label>
                    <input 
                      type="number" 
                      value={canvasSize.width} 
                      onChange={(e) => setCanvasSize(prev => ({ ...prev, width: parseInt(e.target.value, 10) }))} 
                      className="w-20 p-1 border rounded" 
                    />
                  </div>
                  <div>
                    <label className="mr-2">Canvas Height:</label>
                    <input 
                      type="number" 
                      value={canvasSize.height} 
                      onChange={(e) => setCanvasSize(prev => ({ ...prev, height: parseInt(e.target.value, 10) }))} 
                      className="w-20 p-1 border rounded" 
                    />
                  </div>
                </div>
              </div>
              
              <BoxGrid 
                clients={clients} 
                updateClientConfig={updateClientConfig} 
                containerWidth={canvasSize.width} 
                containerHeight={canvasSize.height} 
              />
              
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-2">Quick Actions</h3>
                <div className="flex flex-wrap gap-2">
                  {clients.map(client => (
                    <button
                      key={client.clientId}
                      onClick={() => {
                        const clientUrl = `${window.location.origin}/client?clientId=${client.clientId}`;
                        window.open(clientUrl, '_blank');
                      }}
                      className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                      Open {client.name || client.clientId}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="clients-grid">
              {clients.length === 0 ? (
                <p>No clients connected</p>
              ) : (
                clients.map(client => (
                  <div key={client.clientId} className="client-card">
                    <h3>{client.name || client.clientId}</h3>
                    <div className="client-status">
                      Status: {client.connected ? 'Connected' : 'Disconnected'}
                    </div>
                    <div className="client-config">
                      <h4>Region Configuration</h4>
                      <div className="input-group">
                        <label>X:</label>
                        <input
                          type="number"
                          value={client.region?.x || 0}
                          onChange={(e) => updateClientConfig(client.clientId, {
                            ...client,
                            region: {
                              x: parseInt(e.target.value, 10),
                              y: client.region?.y || 0,
                              width: client.region?.width || 100,
                              height: client.region?.height || 100,
                              totalWidth: client.region?.totalWidth || canvasSize.width,
                              totalHeight: client.region?.totalHeight || canvasSize.height
                            },
                          })}
                        />
                      </div>
                      <div className="input-group">
                        <label>Y:</label>
                        <input
                          type="number"
                          value={client.region?.y || 0}
                          onChange={(e) => updateClientConfig(client.clientId, {
                            ...client,
                            region: {
                              x: client.region?.x || 0,
                              y: parseInt(e.target.value, 10),
                              width: client.region?.width || 100,
                              height: client.region?.height || 100,
                              totalWidth: client.region?.totalWidth || canvasSize.width,
                              totalHeight: client.region?.totalHeight || canvasSize.height
                            },
                          })}
                        />
                      </div>
                      <div className="input-group">
                        <label>Width:</label>
                        <input
                          type="number"
                          value={client.region?.width || 100}
                          onChange={(e) => updateClientConfig(client.clientId, {
                            ...client,
                            region: {
                              x: client.region?.x || 0,
                              y: client.region?.y || 0,
                              width: parseInt(e.target.value, 10),
                              height: client.region?.height || 100,
                              totalWidth: client.region?.totalWidth || canvasSize.width,
                              totalHeight: client.region?.totalHeight || canvasSize.height
                            },
                          })}
                        />
                      </div>
                      <div className="input-group">
                        <label>Height:</label>
                        <input
                          type="number"
                          value={client.region?.height || 100}
                          onChange={(e) => updateClientConfig(client.clientId, {
                            ...client,
                            region: {
                              x: client.region?.x || 0,
                              y: client.region?.y || 0,
                              width: client.region?.width || 100,
                              height: parseInt(e.target.value, 10),
                              totalWidth: client.region?.totalWidth || canvasSize.width,
                              totalHeight: client.region?.totalHeight || canvasSize.height
                            },
                          })}
                        />
                      </div>
                    </div>
                    <div className="client-actions">
                      <button onClick={() => {
                        const clientUrl = `${window.location.origin}/client?clientId=${client.clientId}`;
                        window.open(clientUrl, '_blank');
                      }}>
                        Open Client View
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
      <style jsx>{`
        .admin-container {
          display: flex;
          flex-direction: column;
          padding: 20px;
          max-width: 1200px;
          margin: 0 auto;
        }
        .preview-container {
          margin-bottom: 30px;
        }
        .stream-preview {
          width: 100%;
          height: 400px;
          background: #000;
          border-radius: 8px;
          overflow: hidden;
        }
        .start-streaming {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 400px;
          background: #f0f0f0;
          border-radius: 8px;
          gap: 20px;
        }
        .source-selector {
          display: flex;
          gap: 20px;
        }
        .stop-button {
          margin-top: 10px;
          background: #e74c3c;
          color: white;
        }
        .clients-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 20px;
        }
        .client-card {
          background: #f9f9f9;
          border-radius: 8px;
          padding: 15px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        .client-status {
          margin-bottom: 15px;
        }
        .client-config {
          margin-bottom: 15px;
        }
        .input-group {
          display: flex;
          align-items: center;
          margin-bottom: 8px;
        }
        .input-group label {
          width: 60px;
        }
        .input-group input {
          width: 80px;
          padding: 5px;
        }
        button {
          padding: 8px 16px;
          background: #3498db;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        button:hover {
          background: #2980b9;
        }
        .tab-navigation {
          display: flex;
          border-bottom: 1px solid #e0e0e0;
          margin-bottom: 20px;
        }
        .tab-button {
          padding: 10px 20px;
          background: none;
          color: #333;
          border: none;
          border-bottom: 2px solid transparent;
          cursor: pointer;
        }
        .tab-button.active {
          border-bottom: 2px solid #3498db;
          font-weight: bold;
        }
        .visual-editor {
          margin-bottom: 30px;
        }
      `}</style>
    </>
  );
}
