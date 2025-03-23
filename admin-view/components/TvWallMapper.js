'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import ReactPlayer from 'react-player';
import OverlayBox from './OverlayBox';
import SaveLoadPanel from './SaveLoadPanel';
import ConnectionManager from './ConnectionManager';
import { saveProfile, loadProfile, getProfilesList } from '../utils/profileStorage';
import { initializePeerServer } from '../utils/webRTCServer';
import Peer from 'simple-peer';

const HIGH_QUALITY = 0.9; // Increase from 0.6 to 0.9 for better quality
const MEDIUM_QUALITY = 0.75; // For medium-sized screens
const LOW_QUALITY = 0.6; // Keep for very small screens only
const FRAME_RATE_CAP = 60; // Increase from 30 to 60 FPS
const TvWallMapper = () => {
  const [image, setImage] = useState(null);
  const [isVideo, setIsVideo] = useState(false);
  const streamingAnimationRef = useRef(null);
  const [boxes, setBoxes] = useState([]);
  const [selectedBoxId, setSelectedBoxId] = useState(null);
  const [nextBoxNumber, setNextBoxNumber] = useState(0);
  const [profiles, setProfiles] = useState([]);
  const [currentProfile, setCurrentProfile] = useState('');
  const [connections, setConnections] = useState([]);
  const [streamingActive, setStreamingActive] = useState(false);
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaRef = useRef(null);
  const peerServerRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const streamIntervalsRef = useRef({});

  // Initialize WebRTC peer server and connection manager
  useEffect(() => {
    const initPeerServer = async () => {
      const server = await initializePeerServer();
      peerServerRef.current = server;
      
      // Set up connection event listeners
      server.onConnection((connection) => {
        setConnections(prev => [...prev, connection]);
      });
      
      server.onDisconnection((connectionId) => {
        setConnections(prev => prev.filter(conn => conn.id !== connectionId));
        
        // Clear streaming interval if it exists
        if (streamIntervalsRef.current[connectionId]) {
          clearInterval(streamIntervalsRef.current[connectionId]);
          delete streamIntervalsRef.current[connectionId];
        }
        
        // Close peer connection if it exists
        if (peerConnectionsRef.current[connectionId]) {
          peerConnectionsRef.current[connectionId].close();
          delete peerConnectionsRef.current[connectionId];
        }
      });
      
      // Clean up on component unmount
      return () => {
        server.shutdown();
        
        // Close all peer connections
        Object.values(peerConnectionsRef.current).forEach(conn => {
          conn.close();
        });
        
        // Clear all intervals
        Object.values(streamIntervalsRef.current).forEach(interval => {
          clearInterval(interval);
        });
      };
    };
    
    initPeerServer();
    
    // Load the list of saved profiles
    const loadProfiles = async () => {
      const profileList = await getProfilesList();
      setProfiles(profileList);
    };
    
    loadProfiles();
  }, []);

  // Set up canvas for streaming frames
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx || !image) return;
    
    // Update canvas dimensions to match container
    const updateCanvasDimensions = () => {
      const container = containerRef.current;
      if (container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
      }
    };
    
    updateCanvasDimensions();
    window.addEventListener('resize', updateCanvasDimensions);
    
    return () => {
      window.removeEventListener('resize', updateCanvasDimensions);
    };
  }, [image]);

  // Update media reference when image/video changes
  useEffect(() => {
    if (!image) return;
    
    if (isVideo) {
      mediaRef.current = playerRef.current?.getInternalPlayer();
    } else {
      const img = new Image();
      img.src = image;
      img.onload = () => {
        mediaRef.current = img;
      };
    }
  }, [image, isVideo]);

  // Start or stop streaming when streamingActive changes
  useEffect(() => {
    if (streamingActive) {
      startStreaming();
    } else {
      stopStreaming();
    }
    
    return () => {
      stopStreaming();
    };
  }, [streamingActive, boxes, connections]);

  // Start streaming to all connected devices
  const startStreaming = () => {
    // Clear any existing animation frames
    if (streamingAnimationRef.current) {
      cancelAnimationFrame(streamingAnimationRef.current);
      streamingAnimationRef.current = null;
    }
    
    // Nothing to stream if no image or boxes
    if (!image || boxes.length === 0) return;
    
    // Create reusable canvases for each box to avoid recreating on each frame
    const boxCanvases = {};
    const boxContexts = {};
    
    boxes.forEach(box => {
      const canvas = document.createElement('canvas');
      canvas.width = box.width;
      canvas.height = box.height;
      const ctx = canvas.getContext('2d', { 
        alpha: false, 
        willReadFrequently: true,
        desynchronized: true // Helps performance by using a separate thread
      });
      
      // Enable image smoothing for better quality
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      boxCanvases[box.id] = canvas;
      boxContexts[box.id] = ctx;
    });
    
    const mainCanvas = canvasRef.current;
    const mainCtx = mainCanvas.getContext('2d', { 
      alpha: false,
      desynchronized: true
    });
    
    // Enable high-quality image smoothing on main canvas
    mainCtx.imageSmoothingEnabled = true;
    mainCtx.imageSmoothingQuality = 'high';
    
    // Set up WebRTC connections for each client
    connections.forEach(connection => {
      if (!connection.assignedBoxId) return;
      
      // Find the box for this connection
      const box = boxes.find(b => b.id === connection.assignedBoxId);
      if (!box) return;
      
      // Establish WebRTC connection if not already established
      if (!peerConnectionsRef.current[connection.id]) {
        setupPeerConnection(connection.id, connection.signalData);
      }
    });
    
    // Use requestAnimationFrame for smoother streaming
    const streamFrame = () => {
      if (!streamingActive || !mediaRef.current) {
        streamingAnimationRef.current = requestAnimationFrame(streamFrame);
        return;
      }
      
      // Draw the current frame to the main canvas
      mainCtx.drawImage(mediaRef.current, 0, 0, mainCanvas.width, mainCanvas.height);
      
      // Process each connection
      connections.forEach(connection => {
        if (!connection.assignedBoxId) return;
        
        // Find the box for this connection
        const box = boxes.find(b => b.id === connection.assignedBoxId);
        if (!box) return;
        
        // Skip frames for this connection based on frame rate throttling
        if (!connection.lastFrameTime || 
            Date.now() - connection.lastFrameTime >= (1000 / FRAME_RATE_CAP)) {
          
          // Extract the box region to its dedicated canvas
          const boxCanvas = boxCanvases[box.id];
          const boxCtx = boxContexts[box.id];
          
          // Clear previous frame
          boxCtx.clearRect(0, 0, boxCanvas.width, boxCanvas.height);
          
          // Extract the region of the screen this box represents
          boxCtx.drawImage(
            mainCanvas, 
            box.x, box.y, box.width, box.height, 
            0, 0, boxCanvas.width, boxCanvas.height
          );
          
          // Choose quality based on box size (larger boxes get higher quality)
          let quality = HIGH_QUALITY;
          const boxArea = box.width * box.height;
          
          
          
          // Stream the frame via WebRTC if connection is established
          sendFrameToDevice(connection.id, boxCanvas, quality);
          
          // Update last frame time
          connection.lastFrameTime = Date.now();
        }
      });
      
      // Request next animation frame
      streamingAnimationRef.current = requestAnimationFrame(streamFrame);
    };
    
    // Start the animation loop
    streamingAnimationRef.current = requestAnimationFrame(streamFrame);
  };

  // Stop all streaming
  const stopStreaming = () => {
    if (streamingAnimationRef.current) {
      cancelAnimationFrame(streamingAnimationRef.current);
      streamingAnimationRef.current = null;
    }
  };

  // Set up WebRTC peer connection for a device
  const setupPeerConnection = (deviceId, signalData) => {
    if (peerConnectionsRef.current[deviceId]) {
      return; // Connection already exists
    }
    
    // Improved WebRTC configuration options
    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
      // High performance configuration for video streaming
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceCandidatePoolSize: 10
    });
    
    // Store the connection
    peerConnectionsRef.current[deviceId] = peerConnection;
    
    // Set up data channel for sending frames with improved settings
    const dataChannel = peerConnection.createDataChannel('frames', {
      ordered: true, // Ordered delivery for video frames to prevent visual artifacts
      maxPacketLifeTime: 100, // Allow retransmits but with a time limit
      priority: 'high' // Prioritize this data channel
    });
    
    dataChannel.binaryType = 'arraybuffer'; // Use binary transfer for efficiency
    
    // Increase buffer sizes for better streaming performance
    if (dataChannel.maxRetransmits !== undefined) {
      dataChannel.maxRetransmits = 2; // Limit retransmissions to avoid backlog
    }
    
    // Monitor and optimize buffer sizes
    const monitorBufferSize = setInterval(() => {
      if (dataChannel.readyState === 'open') {
        // If we're building up a backlog, skip some frames temporarily
        if (dataChannel.bufferedAmount > 1024 * 1024) { // 1MB backlog
          console.log('Buffer size too large, throttling', dataChannel.bufferedAmount);
          // The connection object is stored in the connections array
          const conn = connections.find(c => c.id === deviceId);
          if (conn) {
            conn.skipFrames = 2; // Skip every other frame temporarily
          }
        } else {
          // Reset to normal
          const conn = connections.find(c => c.id === deviceId);
          if (conn) {
            conn.skipFrames = 0;
          }
        }
      }
    }, 1000);
    
    dataChannel.onopen = () => {
      console.log(`Data channel opened for device ${deviceId}`);
      
      // Update connection status
      setConnections(prev => 
        prev.map(conn => 
          conn.id === deviceId 
            ? { ...conn, dataChannelOpen: true, skipFrames: 0 } 
            : conn
        )
      );
    };
    
    dataChannel.onclose = () => {
      console.log(`Data channel closed for device ${deviceId}`);
      clearInterval(monitorBufferSize);
      
      // Update connection status
      setConnections(prev => 
        prev.map(conn => 
          conn.id === deviceId 
            ? { ...conn, dataChannelOpen: false } 
            : conn
        )
      );
    };
    
    // Save the dataChannel reference
    peerConnection.dataChannel = dataChannel;
    
    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        // Send this ICE candidate to the peer via signaling server
        if (peerServerRef.current) {
          peerServerRef.current.sendSignal(deviceId, {
            type: 'ice-candidate',
            candidate: event.candidate
          });
        }
      }
    };
    
    // Process the initial signal data if available
    if (signalData) {
      try {
        if (signalData.type === 'offer') {
          peerConnection.setRemoteDescription(new RTCSessionDescription(signalData))
            .then(() => peerConnection.createAnswer())
            .then(answer => peerConnection.setLocalDescription(answer))
            .then(() => {
              // Send answer to the peer
              if (peerServerRef.current) {
                peerServerRef.current.sendSignal(deviceId, peerConnection.localDescription);
              }
            })
            .catch(err => console.error('Error creating answer:', err));
        }
      } catch (err) {
        console.error('Error processing signal data:', err);
      }
    }
    
    return peerConnection;
  };

  // Send a frame to a device via WebRTC data channel
  const sendFrameToDevice = (deviceId, frameCanvas, quality = HIGH_QUALITY) => {
    // Check if we have a WebRTC connection
    const connection = peerConnectionsRef.current[deviceId];
    if (!connection) return;
    
    try {
      // Compress the image with the specified quality
      const frameData = frameCanvas.toDataURL('image/jpeg', quality);
      
      // Convert base64 to binary for more efficient transfer
      const base64Data = frameData.split(',')[1];
      const binaryData = atob(base64Data);
      const dataArray = new Uint8Array(binaryData.length);
      
      for (let i = 0; i < binaryData.length; i++) {
        dataArray[i] = binaryData.charCodeAt(i);
      }
      
      // Send the frame data through the appropriate channel
      if (typeof connection.send === 'function') {
        // This is a simple-peer connection
        connection.send(dataArray);
      } 
      // If using RTCDataChannel directly
      else if (connection.dataChannel && connection.dataChannel.readyState === 'open') {
        connection.dataChannel.send(dataArray);
      }
    } catch (error) {
      console.error('Error sending frame:', error);
    }
  };
  

  // Handle image upload
  const onDrop = useCallback((acceptedFiles) => {
    const file = acceptedFiles[0];
    if (file) {
      // Check if the file is a video
      const isVideo = file.type.startsWith('video/');
      
      if (isVideo) {
        // For videos, create an object URL
        const videoUrl = URL.createObjectURL(file);
        setImage(videoUrl);
        setIsVideo(true);
      } else {
        // For images, use FileReader
        const reader = new FileReader();
        reader.onload = () => {
          setImage(reader.result);
          setIsVideo(false);
        };
        reader.readAsDataURL(file);
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': [],
      'video/*': []
    },
    multiple: false
  });

  // Add a new box
  const addBox = () => {
    const newBox = {
      id: `box-${nextBoxNumber}`,
      number: nextBoxNumber,
      x: 50,
      y: 50,
      width: 150,
      height: 150,
      color: 'red'
    };
    setBoxes([...boxes, newBox]);
    setNextBoxNumber(nextBoxNumber + 1);
  };

  // Add a 2x2 grid of boxes
  const add2x2Grid = () => {
    const gridSize = 150;
    const padding = 10;
    const startX = 50;
    const startY = 50;
    
    const newBoxes = [
      {
        id: `box-${nextBoxNumber}`,
        number: nextBoxNumber,
        x: startX,
        y: startY,
        width: gridSize,
        height: gridSize,
        color: 'red'
      },
      {
        id: `box-${nextBoxNumber + 1}`,
        number: nextBoxNumber + 1,
        x: startX + gridSize + padding,
        y: startY,
        width: gridSize,
        height: gridSize,
        color: 'green'
      },
      {
        id: `box-${nextBoxNumber + 2}`,
        number: nextBoxNumber + 2,
        x: startX,
        y: startY + gridSize + padding,
        width: gridSize,
        height: gridSize,
        color: 'green'
      },
      {
        id: `box-${nextBoxNumber + 3}`,
        number: nextBoxNumber + 3,
        x: startX + gridSize + padding,
        y: startY + gridSize + padding,
        width: gridSize,
        height: gridSize,
        color: 'red'
      }
    ];
    
    setBoxes([...boxes, ...newBoxes]);
    setNextBoxNumber(nextBoxNumber + 4);
  };
  const handleNewConnection = (connection) => {
    // Add the connection to our connections list
    setConnections(prev => [...prev, {
      id: connection.id,
      name: connection.name,
      isConnected: connection.isConnected,
      assignedBoxId: connection.assignedBoxId
    }]);
    
    // Store the peer connection
    peerConnectionsRef.current[connection.id] = connection.peer;
  };
  // Remove selected box
  const removeSelected = () => {
    if (selectedBoxId) {
      setBoxes(boxes.filter(box => box.id !== selectedBoxId));
      setSelectedBoxId(null);
    }
  };

  // Update box position
  const updateBoxPosition = (id, x, y) => {
    setBoxes(boxes.map(box => 
      box.id === id ? { ...box, x, y } : box
    ));
  };

  // Update box size
  const updateBoxSize = (id, width, height) => {
    setBoxes(boxes.map(box => 
      box.id === id ? { ...box, width, height } : box
    ));
  };

  // Select a box
  const selectBox = (id) => {
    setSelectedBoxId(id === selectedBoxId ? null : id);
  };

  // Save current configuration as a profile
  const handleSaveProfile = async (profileName) => {
    const profile = {
      name: profileName,
      boxes: boxes,
      nextBoxNumber: nextBoxNumber
    };
    
    await saveProfile(profile);
    setProfiles([...profiles, profileName]);
    setCurrentProfile(profileName);
  };

  // Load a saved profile
  const handleLoadProfile = async (profileName) => {
    const profile = await loadProfile(profileName);
    if (profile) {
      setBoxes(profile.boxes);
      setNextBoxNumber(profile.nextBoxNumber);
      setCurrentProfile(profileName);
    }
  };

  // Assign a device to a box
  const assignDeviceToBox = (deviceId, boxId) => {
    if (peerServerRef.current) {
      // Update local connections state
      setConnections(prev => 
        prev.map(conn => 
          conn.id === deviceId 
            ? { ...conn, assignedBoxId: boxId } 
            : conn
        )
      );
      
      // Notify the device about its assignment
      peerServerRef.current.sendMessage(deviceId, {
        type: 'assigned',
        boxId: boxId,
        boxNumber: boxes.find(b => b.id === boxId)?.number
      });
      
      // Restart streaming if active
      if (streamingActive) {
        stopStreaming();
        startStreaming();
      }
    }
  };

  // Toggle streaming on/off
  const toggleStreaming = () => {
    setStreamingActive(!streamingActive);
  };

  return (
    <div className="flex flex-col w-full max-w-6xl mx-auto">
      <div className="flex gap-4 mb-4 p-4 bg-gray-800 rounded-lg items-center flex-wrap">
        <button 
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md transition-colors" 
          onClick={addBox}
        >
          Add Screen
        </button>
        <button 
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md transition-colors" 
          onClick={add2x2Grid}
        >
          Add 2×2 Grid
        </button>
        <button 
          className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-md transition-colors" 
          onClick={removeSelected}
        >
          Remove Selected
        </button>
        <button 
          className={`px-4 py-2 rounded-md transition-colors ${
            streamingActive 
              ? 'bg-yellow-600 hover:bg-yellow-700' 
              : 'bg-green-600 hover:bg-green-700'
          }`}
          onClick={toggleStreaming}
        >
          {streamingActive ? 'Stop Streaming' : 'Start Streaming'}
        </button>
        <div className="ml-auto text-gray-300">{boxes.length} Screens</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <div className="md:col-span-3">
          <div 
            className="relative h-[500px] bg-gray-800 border border-gray-700 flex justify-center items-center overflow-hidden"
            ref={containerRef}
          >
            {!image ? (
              <div 
                {...getRootProps()} 
                className={`flex flex-col items-center justify-center h-full w-full border-2 border-dashed border-gray-600 rounded-lg p-6 cursor-pointer ${
                  isDragActive ? 'border-blue-500 bg-blue-500/10' : ''
                }`}
              >
                <input {...getInputProps()} />
                <p className="text-gray-400 text-center">Drag & drop an image or video here, or click to select one</p>
              </div>
            ) : (
              <div className="relative w-full h-full">
                {isVideo ? (
                  <ReactPlayer
                    ref={playerRef}
                    url={image}
                    width="100%"
                    height="100%"
                    controls={false}
                    playing={true}
                    className="absolute top-0 left-0 z-[1]"
                  />
                ) : (
                  <img 
                    src={image} 
                    alt="Background" 
                    className="absolute top-0 left-0 w-full h-full object-contain"
                  />
                )}
                
                {boxes.map((box) => (
                  <OverlayBox
                    key={box.id}
                    id={box.id}
                    number={box.number}
                    x={box.x}
                    y={box.y}
                    width={box.width}
                    height={box.height}
                    color={box.color}
                    isSelected={selectedBoxId === box.id}
                    updatePosition={updateBoxPosition}
                    updateSize={updateBoxSize}
                    onSelect={selectBox}
                  />
                ))}
                
                {streamingActive && (
                  <div className="absolute top-2 right-2 bg-red-600 text-white px-3 py-1 rounded-full text-sm flex items-center">
                    <span className="animate-pulse inline-block w-3 h-3 bg-white rounded-full mr-2"></span>
                    Streaming
                  </div>
                )}
              </div>
            )}
            
            {/* Hidden canvas for processing video frames */}
            <canvas 
              ref={canvasRef}
              width={800}
              height={600}
              className="hidden"
            />
          </div>
        </div>
        
        <div className="md:col-span-1">
          <SaveLoadPanel 
            profiles={profiles}
            currentProfile={currentProfile}
            onSave={handleSaveProfile}
            onLoad={handleLoadProfile}
          />
          
          <div className="mt-4">
            <ConnectionManager 
              connections={connections}
              boxes={boxes}
              onAssign={assignDeviceToBox}
              streamingActive={streamingActive}
            />
            <ManualConnectionPanel onNewConnection={handleNewConnection} />
          </div>
        </div>
      </div>
    </div>
  );
};


const ManualConnectionPanel = ({ onNewConnection }) => {
  const [clientSignalInput, setClientSignalInput] = useState('');
  const [serverSignals, setServerSignals] = useState([]);
  const [status, setStatus] = useState('');
  
  // Handle client signal submission
  const handleClientSignal = (e) => {
    e.preventDefault();
    
    try {
      if (!clientSignalInput.trim()) {
        setStatus('Please enter a client signal');
        return;
      }
      
      // Try to parse the signal
      const signalData = JSON.parse(clientSignalInput);
      
      // Create a unique ID for this client
      const clientId = `client-${Math.random().toString(36).substring(2, 8)}`;
      
      // Create a new peer for this client
      const peer = new Peer({ initiator: false, trickle: false });
      
      // Set up peer event handlers
      peer.on('signal', (data) => {
        console.log('Generated server signal for client:', clientId);
        
        // Add to server signals list
        setServerSignals(prev => [...prev, {
          clientId,
          signal: data
        }]);
        
        setStatus(`Signal generated for client ${clientId}`);
      });
      
      peer.on('connect', () => {
        console.log('Client connected:', clientId);
        
        // Notify the parent component about the new connection
        if (onNewConnection) {
          onNewConnection({
            id: clientId,
            name: `Client ${clientId.substring(0, 4)}`,
            isConnected: true,
            assignedBoxId: null,
            peer
          });
        }
        
        setStatus(`Client ${clientId} connected!`);
      });
      
      peer.on('data', (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log('Received message from client:', message);
          
          // Handle client identification
          if (message.type === 'identify') {
            // Update the client info if needed
          }
        } catch (err) {
          console.error('Error parsing message:', err);
        }
      });
      
      peer.on('close', () => {
        console.log('Client disconnected:', clientId);
      });
      
      peer.on('error', (err) => {
        console.error('Peer error with client:', clientId, err);
        setStatus(`Error with client ${clientId}: ${err.message}`);
      });
      
      // Apply the client's signal to initiate the connection
      peer.signal(signalData);
      
      // Clear the input
      setClientSignalInput('');
      
    } catch (err) {
      setStatus(`Error: ${err.message}`);
      console.error('Error handling client signal:', err);
    }
  };
  
  // Copy a server signal to clipboard
  const copyServerSignal = (signalIndex) => {
    const signal = serverSignals[signalIndex];
    if (signal) {
      navigator.clipboard.writeText(JSON.stringify(signal.signal))
        .then(() => {
          setStatus(`Signal for client ${signal.clientId} copied to clipboard!`);
        })
        .catch(err => {
          console.error('Could not copy signal:', err);
          setStatus('Failed to copy signal. Please select and copy it manually.');
        });
    }
  };
  
  return (
    <div className="bg-gray-800 rounded-lg p-4 mt-4">
      <h2 className="text-lg font-semibold mb-3">Manual Connection</h2>
      
      {status && (
        <div className={`p-2 rounded mb-3 text-sm ${
          status.includes('Error') 
            ? 'bg-red-900/50 text-red-200' 
            : 'bg-blue-900/50 text-blue-200'
        }`}>
          {status}
        </div>
      )}
      
      <form onSubmit={handleClientSignal} className="mb-4">
        <h3 className="font-medium mb-2">Apply Client Signal</h3>
        <textarea
          value={clientSignalInput}
          onChange={(e) => setClientSignalInput(e.target.value)}
          placeholder="Paste client signal data here..."
          className="w-full p-2 bg-gray-700 rounded text-white text-sm mb-2"
          rows={5}
        />
        <button 
          type="submit"
          className="w-full py-2 bg-blue-600 rounded hover:bg-blue-700"
        >
          Apply Client Signal
        </button>
      </form>
      
      {serverSignals.length > 0 && (
        <div>
          <h3 className="font-medium mb-2">Server Signals (Copy & send to clients)</h3>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {serverSignals.map((signal, index) => (
              <div key={index} className="relative">
                <div className="bg-gray-900 p-2 rounded text-xs font-mono mb-1">
                  <p className="text-green-400 mb-1">For client: {signal.clientId}</p>
                  <pre className="overflow-auto max-h-32">
                    {JSON.stringify(signal.signal, null, 2)}
                  </pre>
                </div>
                <button 
                  onClick={() => copyServerSignal(index)}
                  className="absolute top-2 right-2 bg-blue-800 hover:bg-blue-700 text-xs py-1 px-2 rounded"
                >
                  Copy
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <div className="mt-4 text-xs text-gray-400">
        <p><strong>Server ID:</strong> server-123456</p>
        <p className="mt-1">This is the ID clients should use to connect</p>
      </div>
    </div>
  );
};

export default TvWallMapper;
