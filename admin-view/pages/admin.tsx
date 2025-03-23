import { useState, useEffect } from "react";
import Head from "next/head";
import { useSocket } from "../lib/socket";
import { useBroadcaster } from "../lib/webrtc";
import BoxGrid from "../components/BoxGrid";

interface RegionConfig {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Client {
  clientId: string;
  name?: string;
  connected: boolean;
  region?: RegionConfig;
  socketId: string;
}

const AdminPage = () => {
  const socket = useSocket();
  const { 
    isStreaming, 
    streamRef, 
    streamDimensions, 
    startStreaming, 
    stopStreaming 
  } = useBroadcaster(socket);
  
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedSource, setSelectedSource] = useState<"screen" | "camera">("screen");
  const [canvasSize, setCanvasSize] = useState({ width: 1920, height: 1080 });
  const [error, setError] = useState<string | null>(null);
  
  // Initialize canvas size from stream dimensions
  useEffect(() => {
    if (streamDimensions) {
      setCanvasSize({
        width: streamDimensions.width,
        height: streamDimensions.height
      });
    }
  }, [streamDimensions]);
  
  // Load clients
  useEffect(() => {
    if (!socket) return;
    
    // Handler for client updates
    const handleClientsUpdate = (updatedClients: Client[]) => {
      setClients(updatedClients);
    };
    
    // Handler for stream dimensions updates
    const handleStreamDimensionsUpdate = (dimensions: { width: number; height: number }) => {
      setCanvasSize(dimensions);
    };
    
    // Register event listeners
    socket.on("clients-update", handleClientsUpdate);
    socket.on("stream-dimensions-update", handleStreamDimensionsUpdate);
    
    // Request initial client list
    socket.emit("get-clients");
    
    return () => {
      socket.off("clients-update", handleClientsUpdate);
      socket.off("stream-dimensions-update", handleStreamDimensionsUpdate);
    };
  }, [socket]);
  
  // Start streaming handler
  const handleStartStreaming = async () => {
    try {
      setError(null);
      await startStreaming(selectedSource);
    } catch (err: any) {
      setError(`Failed to start streaming: ${err.message}`);
      console.error("Error starting stream:", err);
    }
  };
  
  // Update client configuration
  const updateClientConfig = (clientId: string, config: Partial<Client>) => {
    if (socket) {
      socket.emit("update-client-config", { clientId, config });
    }
  };
  
  // Open client in new window
  const openClientWindow = (clientId: string) => {
    const clientUrl = `${window.location.origin}/client?clientId=${clientId}`;
    window.open(clientUrl, "_blank");
  };
  
  return (
    <>
      <Head>
        <title>TV Wall Admin</title>
      </Head>
      
      <div className="p-4 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">TV Wall Admin</h1>
        
        {/* Stream Section */}
        <div className="mb-8 p-4 border rounded-lg bg-white shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Stream Control</h2>
          
          {isStreaming ? (
            <div className="space-y-4">
              {/* Stream Preview */}
              <div className="relative bg-black rounded-lg overflow-hidden" 
                style={{ 
                  width: '100%',
                  aspectRatio: `${canvasSize.width}/${canvasSize.height}`
                }}>
                <video
                  autoPlay
                  playsInline
                  muted
                  ref={(el) => {
                    if (el && streamRef.current && el.srcObject !== streamRef.current) {
                      el.srcObject = streamRef.current;
                    }
                  }}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>
              
              {/* Stream Info */}
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-600">
                    Stream dimensions: {canvasSize.width} × {canvasSize.height}
                  </p>
                </div>
                
                <button
                  onClick={stopStreaming}
                  className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                >
                  Stop Streaming
                </button>
              </div>
            </div>
          ) : (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <h3 className="text-lg font-medium mb-4">Start a new stream</h3>
              
              {/* Source Selection */}
              <div className="flex justify-center gap-4 mb-6">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="screen"
                    checked={selectedSource === "screen"}
                    onChange={() => setSelectedSource("screen")}
                    className="mr-2"
                  />
                  Screen Capture
                </label>
                
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="camera"
                    checked={selectedSource === "camera"}
                    onChange={() => setSelectedSource("camera")}
                    className="mr-2"
                  />
                  Camera
                </label>
              </div>
              
              {/* Error Display */}
              {error && (
                <div className="text-red-500 mb-4 p-2 bg-red-50 rounded">
                  {error}
                </div>
              )}
              
              <button
                onClick={handleStartStreaming}
                className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 shadow-sm"
              >
                Start Streaming
              </button>
            </div>
          )}
        </div>
        
        {/* Client Configuration Section */}
        <div className="p-4 border rounded-lg bg-white shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Client Configuration</h2>
          
       
          

            <div>
              {/* Canvas Size Controls */}
              <div className="flex gap-4 mb-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Width</label>
                  <input
                    type="number"
                    value={canvasSize.width}
                    onChange={(e) => setCanvasSize({ 
                      ...canvasSize, 
                      width: parseInt(e.target.value) || 0 
                    })}
                    className="w-24 p-2 border rounded"
                  />
                </div>
                
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Height</label>
                  <input
                    type="number"
                    value={canvasSize.height}
                    onChange={(e) => setCanvasSize({ 
                      ...canvasSize, 
                      height: parseInt(e.target.value) || 0 
                    })}
                    className="w-24 p-2 border rounded"
                  />
                </div>
                
                {streamDimensions && (
                  <div className="flex items-end mb-2">
                    <button
                      onClick={() => setCanvasSize(streamDimensions)}
                      className="px-3 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm"
                    >
                      Reset to Stream Size
                    </button>
                  </div>
                )}
              </div>
              
              {/* Box Grid Editor */}
              <BoxGrid
                clients={clients}
                updateClientConfig={updateClientConfig}
                containerWidth={canvasSize.width}
                containerHeight={canvasSize.height}
              />
            </div>
   
        </div>
      </div>
    </>
  );
};

export default AdminPage;