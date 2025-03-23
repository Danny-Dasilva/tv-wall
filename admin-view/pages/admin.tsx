import { useState, useEffect, useRef } from "react";
import Head from "next/head";
import { useSocket } from "../lib/socket";
import { useBroadcaster } from "../lib/webrtc";
import MediaStream from "../components/MediaStream";
import BoxGrid from "../components/BoxGrid";

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
  const { streamRef, setMediaStream, streamDimensions } = useBroadcaster(socket);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedSource, setSelectedSource] = useState<"screen" | "camera">("screen");
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"visual" | "manual">("visual");
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Update when clients change
  useEffect(() => {
    if (!socket) return;
    socket.on("clients-update", (updatedClients: Client[]) => {
      setClients(updatedClients);
    });
    socket.emit("get-clients");
    return () => {
      socket.off("clients-update");
    };
  }, [socket]);

  // Update canvas size when stream dimensions change
  useEffect(() => {
    if (streamDimensions) {
      setCanvasSize({
        width: streamDimensions.width,
        height: streamDimensions.height
      });
    }
  }, [streamDimensions]);

  const startStreaming = async () => {
    try {
      let stream: MediaStream;
      if (selectedSource === "screen") {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            cursor: "always",
            displaySurface: "monitor",
          } as MediaTrackConstraints,
          audio: false,
        });
      } else {
        // For camera, explicitly request high resolution
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: false,
        });
      }
      
      // Set the stream first
      setMediaStream(stream);
      setIsStreaming(true);
      
      // Get accurate dimensions directly from the video track
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        console.log('Video track settings:', settings);
        
        // Force a timeout to ensure settings are fully loaded
        setTimeout(() => {
          if (settings.width && settings.height) {
            console.log('Updating canvas size to:', settings.width, settings.height);
            setCanvasSize({
              width: settings.width,
              height: settings.height
            });
          }
        }, 500);
      }
      
      // Handle stream ending
      stream.getVideoTracks()[0].onended = () => {
        setIsStreaming(false);
      };
    } catch (error) {
      console.error("Error starting stream:", error);
      alert(`Failed to start streaming: ${(error as Error).message}`);
    }
  };

  const stopStreaming = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      setIsStreaming(false);
    }
  };

  const updateClientConfig = (clientId: string, config: Partial<Client>) => {
    if (socket) {
      socket.emit("update-client-config", { clientId, config });
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
            <div className="stream-container">
              <div
                className="stream-preview"
                style={{ 
                  position: "relative", 
                  zIndex: 1,
                  width: canvasSize.width > 1200 ? '100%' : `${canvasSize.width}px`,
                  height: canvasSize.width > 1200 ? 'auto' : `${canvasSize.height}px`,
                  maxWidth: '100%',
                  aspectRatio: `${canvasSize.width} / ${canvasSize.height}`
                }}
              >
                <MediaStream stream={streamRef.current} />
              </div>
              <button onClick={stopStreaming} className="stop-button mt-2">
                Stop Streaming
              </button>
            </div>
          ) : (
            <div className="start-streaming">
              <div className="source-selector">
                <label>
                  <input
                    type="radio"
                    value="screen"
                    checked={selectedSource === "screen"}
                    onChange={() => setSelectedSource("screen")}
                  />
                  Screen Capture
                </label>
                <label>
                  <input
                    type="radio"
                    value="camera"
                    checked={selectedSource === "camera"}
                    onChange={() => setSelectedSource("camera")}
                  />
                  Camera
                </label>
              </div>
              <button onClick={startStreaming}>Start Streaming</button>
            </div>
          )}
        </div>

        <div className="clients-container">
          <h2>Connected Clients</h2>

          <div className="tab-navigation mb-4">
            <button
              className={`tab-button ${activeTab === "visual" ? "active" : ""}`}
              onClick={() => setActiveTab("visual")}
            >
              Visual Editor
            </button>
            <button
              className={`tab-button ${activeTab === "manual" ? "active" : ""}`}
              onClick={() => setActiveTab("manual")}
            >
              Manual Configuration
            </button>
          </div>

          {activeTab === "visual" ? (
            <div className="visual-editor">
              <div className="canvas-controls mb-4">
                <div className="flex items-center gap-4">
                  <div>
                    <label className="mr-2">Canvas Width:</label>
                    <input
                      type="number"
                      value={canvasSize.width}
                      onChange={(e) =>
                        setCanvasSize((prev) => ({
                          ...prev,
                          width: parseInt(e.target.value, 10),
                        }))
                      }
                      className="w-20 p-1 border rounded"
                    />
                  </div>
                  <div>
                    <label className="mr-2">Canvas Height:</label>
                    <input
                      type="number"
                      value={canvasSize.height}
                      onChange={(e) =>
                        setCanvasSize((prev) => ({
                          ...prev,
                          height: parseInt(e.target.value, 10),
                        }))
                      }
                      className="w-20 p-1 border rounded"
                    />
                  </div>
                </div>
                <div className="mt-2 text-sm text-gray-500">
                  {streamDimensions ? 
                    `Stream dimensions: ${streamDimensions.width}×${streamDimensions.height}` : 
                    "Stream dimensions will appear here when streaming starts"}
                </div>
              </div>

              {/* Relative container for both stream and boxes */}
              <div
                className="visual-container"
                style={{
                  position: "relative",
                  width: canvasSize.width > 1200 ? '100%' : `${canvasSize.width}px`,
                  height: canvasSize.width > 1200 ? 'auto' : `${canvasSize.height}px`,
                  maxWidth: '100%',
                  aspectRatio: `${canvasSize.width} / ${canvasSize.height}`,
                  overflow: "hidden",
                  background: "#000"
                }}
              >
                {/* Stream preview layer */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    zIndex: 1,
                  }}
                >
                  {isStreaming && <MediaStream stream={streamRef.current} />}
                </div>

                {/* BoxGrid component on top */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    zIndex: 2,
                    pointerEvents: "none", // Let pointer events pass through to boxes
                  }}
                >
                  <BoxGrid
                    clients={clients}
                    updateClientConfig={updateClientConfig}
                    containerWidth={canvasSize.width}
                    containerHeight={canvasSize.height}
                  />
                </div>
              </div>

              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-2">Quick Actions</h3>
                <div className="flex flex-wrap gap-2">
                  {clients.map((client) => (
                    <button
                      key={client.clientId}
                      onClick={() => {
                        const clientUrl = `${window.location.origin}/client?clientId=${client.clientId}`;
                        window.open(clientUrl, "_blank");
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
            // Manual configuration tab
            <div className="clients-grid">
              {/* Client list with manual configuration options */}
              <div className="grid gap-4">
                {clients.map((client) => (
                  <div key={client.clientId} className="p-4 border rounded">
                    <div className="font-bold">{client.name || client.clientId}</div>
                    <div className="text-sm">{client.connected ? "Connected" : "Disconnected"}</div>
                    
                    {client.region ? (
                      <div className="mt-2">
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <div>
                            <label className="block text-sm">X:</label>
                            <input 
                              type="number" 
                              value={client.region.x} 
                              onChange={(e) => updateClientConfig(client.clientId, {
                                region: {
                                  ...client.region!,
                                  x: parseInt(e.target.value, 10)
                                }
                              })}
                              className="w-full p-1 border rounded"
                            />
                          </div>
                          <div>
                            <label className="block text-sm">Y:</label>
                            <input 
                              type="number" 
                              value={client.region.y} 
                              onChange={(e) => updateClientConfig(client.clientId, {
                                region: {
                                  ...client.region!,
                                  y: parseInt(e.target.value, 10)
                                }
                              })}
                              className="w-full p-1 border rounded"
                            />
                          </div>
                          <div>
                            <label className="block text-sm">Width:</label>
                            <input 
                              type="number" 
                              value={client.region.width} 
                              onChange={(e) => updateClientConfig(client.clientId, {
                                region: {
                                  ...client.region!,
                                  width: parseInt(e.target.value, 10)
                                }
                              })}
                              className="w-full p-1 border rounded"
                            />
                          </div>
                          <div>
                            <label className="block text-sm">Height:</label>
                            <input 
                              type="number" 
                              value={client.region.height} 
                              onChange={(e) => updateClientConfig(client.clientId, {
                                region: {
                                  ...client.region!,
                                  height: parseInt(e.target.value, 10)
                                }
                              })}
                              className="w-full p-1 border rounded"
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 text-sm text-gray-500">No region assigned</div>
                    )}
                  </div>
                ))}
              </div>
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
          position: relative;
          overflow-x: auto;
        }
        .stream-container {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }
        .stream-preview {
          background: #000;
          border-radius: 8px;
          overflow: hidden;
          position: relative;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .visual-container {
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .visual-editor {
          margin-bottom: 30px;
          position: relative;
          overflow-x: auto;
          padding-bottom: 20px;
        }
        .tab-button {
          padding: 8px 16px;
          margin-right: 8px;
          border-radius: 4px;
          background-color: #f3f4f6;
          border: 1px solid #e5e7eb;
          cursor: pointer;
        }
        .tab-button.active {
          background-color: #3b82f6;
          color: white;
          border-color: #2563eb;
        }
        .stop-button {
          padding: 6px 12px;
          margin-top: 10px;
          background-color: #ef4444;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        .stop-button:hover {
          background-color: #dc2626;
        }
        .start-streaming {
          padding: 40px 20px;
          border: 2px dashed #ccc;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 15px;
          width: 100%;
          max-width: 400px;
          margin: 0 auto;
        }
        .source-selector {
          display: flex;
          gap: 15px;
        }
        .source-selector label {
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .source-selector input {
          margin: 0;
        }
        
        @media (max-width: 768px) {
          .admin-container {
            padding: 10px;
          }
        }
      `}</style>
    </>
  );
}