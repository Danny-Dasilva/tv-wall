'use client';
import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Peer from 'simple-peer';

export default function ClientApp() {
  // *** HARDCODED SERVER ID - This must match your server's ID: "server-123456" ***
  const HARDCODED_SERVER_ID = "server-123456";
  
  const [connected, setConnected] = useState(false);
  const [clientId] = useState(() => `client-${Math.random().toString(36).substring(2, 15)}`);
  const [signalData, setSignalData] = useState(null);
  const [serverSignalInput, setServerSignalInput] = useState('');
  const [assignedBox, setAssignedBox] = useState(null);
  const [status, setStatus] = useState('Initializing connection...');
  const [frames, setFrames] = useState(0);
  const [fps, setFps] = useState(0);
  
  const canvasRef = useRef(null);
  const peerRef = useRef(null);
  const fpsCounterRef = useRef({ count: 0, lastUpdate: Date.now() });
  
  // Set up FPS counter
  useEffect(() => {
    const fpsInterval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - fpsCounterRef.current.lastUpdate;
      if (elapsed >= 1000) {
        setFps(Math.round((fpsCounterRef.current.count * 1000) / elapsed));
        fpsCounterRef.current.count = 0;
        fpsCounterRef.current.lastUpdate = now;
      }
    }, 1000);
    
    return () => {
      clearInterval(fpsInterval);
      if (peerRef.current) peerRef.current.destroy();
    };
  }, []);
  
  // Initialize WebRTC connection
  useEffect(() => {
    initializeConnection();
  }, []);
  
  const initializeConnection = () => {
    if (peerRef.current) {
      peerRef.current.destroy();
    }
    
    setStatus('Creating connection offer...');
    
    // Create a new WebRTC peer
    const peer = new Peer({ initiator: true, trickle: false });
    peerRef.current = peer;
    
    // Set up peer event handlers
    peer.on('signal', (data) => {
      console.log('Generated client signal for server:', data);
      
      // Store the signal data to display to the user
      setSignalData(data);
      
      setStatus('Ready to connect. Copy your signal and paste it into the server.');
    });
    
    peer.on('connect', () => {
      console.log('Connected to server!');
      setConnected(true);
      setStatus('Connected to server! Waiting for box assignment...');
      
      // Send identification
      peer.send(JSON.stringify({
        type: 'identify',
        clientId: clientId,
        name: `Client ${clientId.substring(0, 4)}`
      }));
    });
    
    peer.on('data', (data) => {
      try {
        // Check if this is binary frame data
        if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
          renderFrame(data);
          return;
        }
        
        // Otherwise, treat as JSON message
        const message = JSON.parse(data.toString());
        
        if (message.type === 'assigned') {
          console.log('Assigned to box:', message);
          setAssignedBox({
            id: message.boxId,
            number: message.boxNumber
          });
          setStatus(`Assigned to Screen ${message.boxNumber}. Waiting for frames...`);
        }
      } catch (err) {
        // If we get an error parsing as JSON, assume it's binary frame data
        renderFrame(data);
      }
    });
    
    peer.on('close', () => {
      console.log('Connection closed');
      setConnected(false);
      setStatus('Connection closed. Reconnect by refreshing the page.');
      setAssignedBox(null);
    });
    
    peer.on('error', (err) => {
      console.error('Peer error:', err);
      setStatus(`Connection error: ${err.message}`);
      setConnected(false);
      setAssignedBox(null);
    });
  };
  
  // Apply server signal
  const handleApplyServerSignal = (e) => {
    e.preventDefault();
    
    try {
      if (!serverSignalInput.trim()) {
        setStatus('Please enter the server signal');
        return;
      }
      
      const signalObj = JSON.parse(serverSignalInput);
      
      if (peerRef.current) {
        peerRef.current.signal(signalObj);
        setStatus('Applied server signal. Establishing connection...');
      } else {
        setStatus('Peer connection not initialized. Refresh the page and try again.');
      }
    } catch (err) {
      setStatus(`Error applying signal: ${err.message}`);
      console.error('Error applying signal:', err);
    }
  };
  
  // Copy client signal to clipboard
  const copyClientSignal = () => {
    if (signalData) {
      navigator.clipboard.writeText(JSON.stringify(signalData))
        .then(() => {
          setStatus('Signal copied to clipboard! Paste it into the server.');
        })
        .catch(err => {
          console.error('Could not copy signal:', err);
          setStatus('Failed to copy signal. Please select and copy it manually.');
        });
    }
  };
  
  // Render received frame
  const renderFrame = (frameData) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d', { alpha: false });
    
    // Convert binary frame data to image
    const blob = new Blob([frameData], { type: 'image/jpeg' });
    const url = URL.createObjectURL(blob);
    
    const img = new Image();
    img.onload = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw the image
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      // Count frames
      setFrames(prev => prev + 1);
      fpsCounterRef.current.count++;
      
      // Clean up
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };
  
  return (
    <div className="bg-gray-900 min-h-screen text-white">
      <Head>
        <title>TV Wall Client</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      </Head>
      
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-center mb-4">TV Wall Client</h1>
        
        <div className="max-w-xl mx-auto">
          <div className="bg-gray-800 rounded-lg p-4 mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="font-medium">Status:</span>
              <span className={`text-sm px-2 py-1 rounded ${connected ? 'bg-green-600' : 'bg-red-600'}`}>
                {connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <p className="text-gray-300 text-sm mb-2">{status}</p>
            
            {!connected && signalData && (
              <div className="mt-3 p-3 border border-gray-700 rounded">
                <h3 className="font-medium mb-2">Step 1: Copy your client signal</h3>
                <div className="relative">
                  <div className="bg-gray-900 p-2 rounded text-xs font-mono mb-2 overflow-auto max-h-40">
                    <pre>{JSON.stringify(signalData, null, 2)}</pre>
                  </div>
                  <button 
                    onClick={copyClientSignal}
                    className="absolute top-2 right-2 bg-blue-800 hover:bg-blue-700 text-xs py-1 px-2 rounded"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-xs text-gray-400 mb-3">
                  Copy this signal and paste it in the server's "Apply Client Signal" section
                </p>
                
                <h3 className="font-medium mb-2">Step 2: Enter server's response signal</h3>
                <form onSubmit={handleApplyServerSignal}>
                  <textarea
                    value={serverSignalInput}
                    onChange={(e) => setServerSignalInput(e.target.value)}
                    placeholder="Paste server signal here"
                    className="w-full p-2 bg-gray-700 rounded text-white text-sm mb-2"
                    rows={5}
                  />
                  <button 
                    type="submit"
                    className="w-full py-2 bg-blue-600 rounded hover:bg-blue-700"
                  >
                    Apply Server Signal
                  </button>
                </form>
              </div>
            )}
            
            {assignedBox && (
              <div className="mt-2 bg-blue-900/30 p-2 rounded">
                <span className="block text-sm">Assigned to Screen {assignedBox.number}</span>
                <span className="block text-xs text-gray-400">Box ID: {assignedBox.id}</span>
              </div>
            )}
            
            <div className="mt-2 text-xs text-gray-400">
              <div>Client ID: {clientId}</div>
              <div>Server ID: {HARDCODED_SERVER_ID}</div>
              <div>Frames: {frames} (FPS: {fps})</div>
            </div>
          </div>
          
          <div className="bg-black rounded-lg overflow-hidden relative">
            <canvas
              ref={canvasRef}
              width={640}
              height={360}
              className="w-full"
            />
            
            {!connected && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                <div className="text-center p-4">
                  <div className="animate-spin mb-4 mx-auto h-10 w-10 border-4 border-t-blue-500 border-r-transparent border-b-blue-500 border-l-transparent rounded-full"></div>
                  <p>Waiting for connection...</p>
                </div>
              </div>
            )}
          </div>
          
          <div className="mt-4 p-4 bg-gray-800 rounded-lg">
            <h2 className="font-bold mb-2">Connection Instructions</h2>
            <ol className="list-decimal list-inside text-sm space-y-1">
              <li>This client is trying to connect to server ID: <span className="font-mono">{HARDCODED_SERVER_ID}</span></li>
              <li>Copy your client signal (Step 1 above)</li>
              <li>Go to the server (port 3001) and click "Configure"</li>
              <li>Find the "Apply Client Signal" section and paste your client signal there</li>
              <li>The server will generate a response signal - copy it</li>
              <li>Return here and paste the server's signal in Step 2</li>
              <li>Click "Apply Server Signal"</li>
              <li>Once connected, the server can assign you to a screen region</li>
            </ol>
          </div>
        </div>
      </main>
    </div>
  );
}