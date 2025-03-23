import { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';

interface RTCIceServerConfig {
  iceServers: Array<{
    urls: string | string[];
  }>;
}

interface ConnectionData {
  connection: RTCPeerConnection;
  pendingCandidates: RTCIceCandidate[];
  state: 'new' | 'offering' | 'connected';
  canvas?: HTMLCanvasElement;
  canvasStream?: MediaStream;
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface Connections {
  [viewerId: string]: ConnectionData;
}

interface ViewerConfig {
  clientId: string;
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

interface ViewerAnswerPayload {
  viewerId: string;
  answer: RTCSessionDescription;
}

interface ViewerIceCandidatePayload {
  viewerId: string;
  candidate: RTCIceCandidate;
}

interface BroadcasterOfferPayload {
  offer: RTCSessionDescription;
}

interface BroadcasterIceCandidatePayload {
  candidate: RTCIceCandidate;
}

const ICE_SERVERS: RTCIceServerConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ],
};

export const useBroadcaster = (socket: Socket | null) => {
  const [connections, setConnections] = useState<Connections>({});
  const streamRef = useRef<MediaStream | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const isRegistered = useRef<boolean>(false);
  const connectionsRef = useRef<Connections>({});
  const [streamDimensions, setStreamDimensions] = useState<{width: number, height: number} | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const clientConfigsRef = useRef<{[clientId: string]: ViewerConfig}>({});
  const rafRef = useRef<number | null>(null);

  // Update the ref whenever connections change
  useEffect(() => {
    connectionsRef.current = connections;
  }, [connections]);

  // Set up a global video element for the source stream
  useEffect(() => {
    if (!videoRef.current) {
      videoRef.current = document.createElement('video');
      videoRef.current.autoplay = true;
      videoRef.current.muted = true;
      videoRef.current.playsInline = true;
    }
    
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  // Animation frame loop to draw cropped video to canvases
  const updateCanvases = () => {
    if (!videoRef.current || !mediaStream.current || videoRef.current.readyState < 2) {
      rafRef.current = requestAnimationFrame(updateCanvases);
      return;
    }

    const connections = connectionsRef.current;
    Object.entries(connections).forEach(([viewerId, connectionData]) => {
      if (connectionData.canvas && connectionData.region) {
        const ctx = connectionData.canvas.getContext('2d');
        if (ctx) {
          const { x, y, width, height } = connectionData.region;
          
          // Only draw if we have valid dimensions
          if (width > 0 && height > 0) {
            // Draw the cropped region to the canvas
            ctx.drawImage(
              videoRef.current!,
              x, y, width, height,
              0, 0, connectionData.canvas.width, connectionData.canvas.height
            );
          }
        }
      }
    });

    rafRef.current = requestAnimationFrame(updateCanvases);
  };

  // Update client regions from socket updates
  useEffect(() => {
    if (!socket) return;

    const handleClientsUpdate = (clients: ViewerConfig[]) => {
      // Store client configs
      clients.forEach(client => {
        if (client.clientId) {
          clientConfigsRef.current[client.clientId] = client;
          
          // Find the connection that matches this client
          Object.entries(connectionsRef.current).forEach(([socketId, connectionData]) => {
            const viewerSocketId = connectionData.connection.remoteDescription?.sdp.match(/a=msid:.+ (.+)/)?.[1];
            
            if (client.socketId === socketId || viewerSocketId === socketId) {
              if (client.region && connectionData.region && 
                  (client.region.x !== connectionData.region.x ||
                   client.region.y !== connectionData.region.y ||
                   client.region.width !== connectionData.region.width ||
                   client.region.height !== connectionData.region.height)) {
                
                // Update the connection's region
                updateRegionForClient(socketId, client.region);
              }
            }
          });
        }
      });
    };

    socket.on('clients-update', handleClientsUpdate);
    
    return () => {
      socket.off('clients-update', handleClientsUpdate);
    };
  }, [socket]);

  // Update a client's region and recreate its canvas stream if needed
  const updateRegionForClient = (viewerId: string, region: { x: number, y: number, width: number, height: number, totalWidth: number, totalHeight: number }) => {
    const connectionData = connectionsRef.current[viewerId];
    if (!connectionData) return;

    // Check if we need to update the canvas size and recreate the stream
    const needsNewCanvas = !connectionData.canvas || 
                           connectionData.canvas.width !== region.width || 
                           connectionData.canvas.height !== region.height;

    // Store the region in the connection data
    setConnections(prev => ({
      ...prev,
      [viewerId]: {
        ...prev[viewerId],
        region: {
          x: region.x,
          y: region.y,
          width: region.width, 
          height: region.height
        }
      }
    }));

    // If we need a new canvas or the region changed significantly, update the stream
    if (needsNewCanvas && mediaStream.current) {
      updateClientStream(viewerId, region.width, region.height);
    }
  };

  // Create/update a canvas and stream for a specific client
  const updateClientStream = (viewerId: string, width: number, height: number) => {
    const connectionData = connectionsRef.current[viewerId];
    if (!connectionData || !mediaStream.current) return;

    // Stop any existing canvas stream
    if (connectionData.canvasStream) {
      connectionData.canvasStream.getTracks().forEach(track => track.stop());
    }

    // Create or resize canvas
    let canvas = connectionData.canvas;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
    } else {
      canvas.width = width;
      canvas.height = height;
    }

    // Create a new stream from the canvas
    const canvasStream = canvas.captureStream(30); // 30fps
    
    // Get the peer connection
    const peerConnection = connectionData.connection;
    
    // Replace tracks in the peer connection
    const senders = peerConnection.getSenders();
    senders.forEach(sender => {
      if (sender.track?.kind === 'video' && canvasStream.getVideoTracks()[0]) {
        sender.replaceTrack(canvasStream.getVideoTracks()[0])
          .catch(err => console.error('Error replacing track:', err));
      }
    });

    // Update connection data with new canvas and stream
    setConnections(prev => ({
      ...prev,
      [viewerId]: {
        ...prev[viewerId],
        canvas,
        canvasStream
      }
    }));

    // Start canvas drawing if not already running
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(updateCanvases);
    }
  };

  useEffect(() => {
    if (!socket) return;

    const handleNewViewer = async (viewerId: string) => {
      console.log('New viewer connected:', viewerId);
      
      // Check if connection already exists
      if (connectionsRef.current[viewerId]) {
        console.log('Connection already exists for viewer:', viewerId);
        return;
      }
      
      try {
        const peerConnection = new RTCPeerConnection({
          ...ICE_SERVERS,
          iceCandidatePoolSize: 10,
          sdpSemantics: 'unified-plan'
        });
        
        // Find config for this viewer
        const clientConfig = Object.values(clientConfigsRef.current).find(
          config => config.socketId === viewerId
        );
        
        let canvas: HTMLCanvasElement | undefined;
        let canvasStream: MediaStream | undefined;
        
        // Create canvas and stream if we have region info
        if (clientConfig?.region && mediaStream.current) {
          canvas = document.createElement('canvas');
          canvas.width = clientConfig.region.width;
          canvas.height = clientConfig.region.height;
          canvasStream = canvas.captureStream(30); // 30fps
          
          // Add cropped video track to peer connection
          if (canvasStream.getVideoTracks()[0]) {
            peerConnection.addTrack(canvasStream.getVideoTracks()[0], canvasStream);
          }
        } 
        // Fall back to original stream if no region
        else if (mediaStream.current) {
          console.log('Adding original media tracks to new connection');
          mediaStream.current.getTracks().forEach(track => {
            if (mediaStream.current) {
              peerConnection.addTrack(track, mediaStream.current);
            }
          });
        }
        
        peerConnection.onicecandidate = (event) => {
          if (event.candidate && socket.connected) {
            socket.emit('broadcaster-ice-candidate', {
              viewerId,
              candidate: event.candidate,
            });
          }
        };
        
        peerConnection.oniceconnectionstatechange = () => {
          console.log(`ICE connection state for ${viewerId}:`, peerConnection.iceConnectionState);
          
          // If the connection is failed or disconnected, close it
          if (['failed', 'closed'].includes(peerConnection.iceConnectionState)) {
            console.log(`Connection to ${viewerId} failed, cleaning up`);
            try {
              peerConnection.close();
            } catch (err) {
              console.error('Error closing connection:', err);
            }
            
            setConnections(prev => {
              const newConnections = { ...prev };
              delete newConnections[viewerId];
              return newConnections;
            });
          }
        };
        
        // Store connection data including canvas and region
        setConnections(prev => ({
          ...prev,
          [viewerId]: {
            connection: peerConnection,
            pendingCandidates: [],
            state: 'new',
            canvas,
            canvasStream,
            region: clientConfig?.region ? {
              x: clientConfig.region.x,
              y: clientConfig.region.y,
              width: clientConfig.region.width,
              height: clientConfig.region.height
            } : undefined
          },
        }));
        
        const offer = await peerConnection.createOffer({
          offerToReceiveAudio: false,
          offerToReceiveVideo: false
        });
        
        await peerConnection.setLocalDescription(offer);
        
        // Update the connection state
        setConnections(prev => ({
          ...prev,
          [viewerId]: {
            ...prev[viewerId],
            state: 'offering'
          },
        }));
        
        // Only send the offer if socket is still connected
        if (socket.connected) {
          socket.emit('broadcaster-offer', {
            viewerId,
            offer: peerConnection.localDescription,
          });
        }
        
        // Start canvas drawing if we have a canvas
        if (canvas && rafRef.current === null) {
          rafRef.current = requestAnimationFrame(updateCanvases);
        }
      } catch (error) {
        console.error('Error creating offer:', error);
      }
    };
    
    const handleViewerAnswer = async ({ viewerId, answer }: ViewerAnswerPayload) => {
      console.log('Received viewer answer:', viewerId);
      try {
        const connectionData = connectionsRef.current[viewerId];
        if (!connectionData) {
          console.log('No connection found for viewer:', viewerId);
          return;
        }
        
        const peerConnection = connectionData.connection;
        
        // Verify the connection is still valid
        if (!peerConnection || peerConnection.connectionState === 'closed') {
          console.log('Connection already closed for viewer:', viewerId);
          return;
        }
        
        // Only set remote description if we're in the right state
        const currentState = peerConnection.signalingState;
        
        if (currentState === 'have-local-offer') {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
          console.log(`Remote description set for ${viewerId}`);
          
          // Process any pending ICE candidates
          const pendingCandidates = connectionData.pendingCandidates || [];
          for (const candidate of pendingCandidates) {
            try {
              if (peerConnection.connectionState !== 'closed') {
                await peerConnection.addIceCandidate(candidate);
              }
            } catch (err: any) {
              console.warn(`Error adding stored ICE candidate: ${err.message}`);
            }
          }
          
          // Update connection state
          setConnections(prev => ({
            ...prev,
            [viewerId]: {
              ...prev[viewerId],
              state: 'connected',
              pendingCandidates: []
            },
          }));
        } else {
          console.warn(`Cannot set remote answer in state ${currentState} for ${viewerId}`);
        }
      } catch (error) {
        console.error('Error handling viewer answer:', error);
      }
    };
    
    const handleViewerIceCandidate = async ({ viewerId, candidate }: ViewerIceCandidatePayload) => {
      try {
        const connectionData = connectionsRef.current[viewerId];
        if (!connectionData) {
          console.log('No connection found for viewer when handling ICE:', viewerId);
          return;
        }
        
        const peerConnection = connectionData.connection;
        
        // Skip if the connection is closed or null
        if (!peerConnection || peerConnection.connectionState === 'closed') {
          console.log('Connection closed or null when handling ICE for viewer:', viewerId);
          return;
        }
        
        const iceCandidate = new RTCIceCandidate(candidate);
        
        // If we have a remote description and connection is still open, add the candidate immediately
        if (peerConnection.remoteDescription && 
            peerConnection.remoteDescription.type && 
            peerConnection.connectionState !== 'closed') {
          try {
            await peerConnection.addIceCandidate(iceCandidate);
          } catch (err: any) {
            console.warn(`Error adding ICE candidate: ${err.message}`);
          }
        } else {
          // Otherwise, store it for later
          console.log('Storing ICE candidate for later for viewer:', viewerId);
          setConnections(prev => {
            // Check if the connection still exists in our state
            if (!prev[viewerId]) return prev;
            
            return {
              ...prev,
              [viewerId]: {
                ...prev[viewerId],
                pendingCandidates: [...(prev[viewerId].pendingCandidates || []), iceCandidate]
              },
            };
          });
        }
      } catch (error) {
        console.error('Error handling viewer ICE candidate:', error);
      }
    };
    
    const handleViewerDisconnect = (viewerId: string) => {
      console.log('Viewer disconnected:', viewerId);
      try {
        const connectionData = connectionsRef.current[viewerId];
        if (connectionData) {
          // Stop canvas stream if it exists
          if (connectionData.canvasStream) {
            connectionData.canvasStream.getTracks().forEach(track => track.stop());
          }
          
          const peerConnection = connectionData.connection;
          if (peerConnection && peerConnection.connectionState !== 'closed') {
            peerConnection.close();
          }
          
          setConnections(prev => {
            const newConnections = { ...prev };
            delete newConnections[viewerId];
            return newConnections;
          });
        }
      } catch (error) {
        console.error('Error handling viewer disconnect:', error);
      }
    };
    
    const registerAsBroadcaster = () => {
      if (isRegistered.current) {
        console.log('Already registered as broadcaster, skipping');
        return;
      }
      
      console.log('Registering as broadcaster');
      socket.emit('register-as-broadcaster');
      isRegistered.current = true;
    };
    
    // Set up socket event listeners
    socket.on('new-viewer', handleNewViewer);
    socket.on('viewer-answer', handleViewerAnswer);
    socket.on('viewer-ice-candidate', handleViewerIceCandidate);
    socket.on('viewer-disconnect', handleViewerDisconnect);
    
    // Register as a broadcaster only once
    registerAsBroadcaster();
    
    // Handle reconnection
    socket.on('connect', () => {
      console.log('Socket reconnected, registering as broadcaster again');
      isRegistered.current = false; // Reset flag to allow re-registration
      registerAsBroadcaster();
    });
    
    return () => {
      // Clean up event listeners
      socket.off('new-viewer', handleNewViewer);
      socket.off('viewer-answer', handleViewerAnswer);
      socket.off('viewer-ice-candidate', handleViewerIceCandidate);
      socket.off('viewer-disconnect', handleViewerDisconnect);
      socket.off('connect');
      
      // Close all connections and clean up
      Object.values(connectionsRef.current).forEach(connectionData => {
        try {
          // Stop canvas streams
          if (connectionData.canvasStream) {
            connectionData.canvasStream.getTracks().forEach(track => track.stop());
          }
          
          if (connectionData.connection && connectionData.connection.connectionState !== 'closed') {
            connectionData.connection.close();
          }
        } catch (e) {
          console.error('Error closing connection during cleanup:', e);
        }
      });
      
      // Stop animation frame
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      
      // Reset state
      setConnections({});
      isRegistered.current = false;
    };
  }, [socket]);
  
  // Function to set the media stream
  const setMediaStream = (stream: MediaStream) => {
    console.log('Setting media stream', stream);
    mediaStream.current = stream;
    streamRef.current = stream;
    
    // Connect the stream to our video element
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
    
    // Get stream dimensions
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      const settings = videoTrack.getSettings();
      console.log('Video track settings:', settings);
      if (settings.width && settings.height) {
        setStreamDimensions({
          width: settings.width,
          height: settings.height
        });
      }
    }
    
    // Update all existing connections with the new stream
    Object.entries(connectionsRef.current).forEach(([viewerId, connectionData]) => {
      // For connections with a canvas, just let the animation loop handle it
      if (!connectionData.canvas) {
        const peerConnection = connectionData.connection;
        
        // Replace existing tracks
        const senders = peerConnection.getSenders();
        senders.forEach((sender) => {
          // Remove video tracks
          if (sender.track?.kind === 'video') {
            try {
              stream.getVideoTracks().forEach(track => {
                sender.replaceTrack(track).catch(err => {
                  console.warn('Error replacing track:', err);
                });
              });
            } catch (err) {
              console.warn('Error replacing tracks:', err);
            }
          }
        });
      } else if (connectionData.region) {
        // For connections with canvas, update them with new dimensions
        updateClientStream(
          viewerId, 
          connectionData.region.width, 
          connectionData.region.height
        );
      }
    });
    
    // Start canvas drawing if needed
    if (Object.values(connectionsRef.current).some(conn => conn.canvas) && rafRef.current === null) {
      rafRef.current = requestAnimationFrame(updateCanvases);
    }
  };
  
  return { streamRef, setMediaStream, streamDimensions };
};

export const useViewer = (socket: Socket | null, config: ViewerConfig | null) => {
  const [connected, setConnected] = useState<boolean>(false);
  const streamRef = useRef<MediaStream | null>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const pendingIceCandidates = useRef<RTCIceCandidate[]>([]);
  const hasRegistered = useRef<boolean>(false);
  const connectionClosed = useRef<boolean>(false);
  
  // Reset connection state when socket or config changes
  useEffect(() => {
    connectionClosed.current = false;
    return () => {
      connectionClosed.current = true;
    };
  }, [socket, config]);
  
  useEffect(() => {
    if (!socket || !config) return;
    
    console.log('Setting up viewer with config:', config);
    
    // Create a new RTCPeerConnection with optimized settings
    const pc = new RTCPeerConnection({
      ...ICE_SERVERS,
      iceCandidatePoolSize: 10,
      sdpSemantics: 'unified-plan'
    });
    peerConnection.current = pc;
    
    // Handle incoming tracks
    pc.ontrack = (event) => {
      console.log('Received track:', event.track.kind);
      
      // Skip if the connection is closed
      if (connectionClosed.current) return;
      
      // Create a new MediaStream for the first track received
      if (!streamRef.current) {
        const newStream = new MediaStream();
        newStream.addTrack(event.track);
        streamRef.current = newStream;
      } else {
        // For subsequent tracks, add to the existing stream
        const tracks = streamRef.current.getTracks();
        const trackExists = tracks.some(t => t.kind === event.track.kind);
        
        if (!trackExists) {
          streamRef.current.addTrack(event.track);
        }
      }
    };
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socket.connected && !connectionClosed.current) {
        console.log('Sending ICE candidate to broadcaster');
        socket.emit('viewer-ice-candidate', {
          candidate: event.candidate,
        });
      }
    };
    
    // Log ICE connection state changes
    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
      
      if (connectionClosed.current) return;
      
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setConnected(true);
      } else if (['disconnected', 'failed', 'closed'].includes(pc.iceConnectionState)) {
        setConnected(false);
        
        // Only try to reconnect if it's not intentionally closed
        if (pc.iceConnectionState !== 'closed' && !connectionClosed.current) {
          console.log('Connection lost, attempting to reconnect...');
          // Wait a bit before trying to reconnect
          setTimeout(() => {
            if (socket.connected && !hasRegistered.current && !connectionClosed.current) {
              console.log('Attempting to re-register as viewer');
              socket.emit('register-as-viewer', config);
              hasRegistered.current = true;
            }
          }, 2000);
        }
      }
    };
    
    // Handle signaling state changes
    pc.onsignalingstatechange = () => {
      console.log('Signaling state:', pc.signalingState);
    };
    
    const handleBroadcasterOffer = async ({ offer }: BroadcasterOfferPayload) => {
      if (connectionClosed.current) return;
      
      console.log('Received offer from broadcaster');
      try {
        // If we're in a strange state, reset the connection
        if (pc.signalingState !== 'stable' && pc.signalingState !== 'have-local-pranswer') {
          console.log('Resetting connection before processing offer');
          try {
            await pc.setLocalDescription({type: "rollback"} as RTCSessionDescription);
          } catch (err) {
            console.warn('Error rolling back:', err);
            // If rollback fails, just continue - some browsers don't support rollback
          }
        }
        
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        
        // Process any stored ICE candidates
        if (pendingIceCandidates.current.length > 0) {
          console.log('Processing pending ICE candidates:', pendingIceCandidates.current.length);
          for (const candidate of pendingIceCandidates.current) {
            try {
              if (!connectionClosed.current && pc.connectionState !== 'closed') {
                await pc.addIceCandidate(candidate);
              }
            } catch (err: any) {
              console.warn(`Error adding stored ICE candidate: ${err.message}`);
            }
          }
          pendingIceCandidates.current = [];
        }
        
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        console.log('Sending answer to broadcaster');
        if (socket.connected && !connectionClosed.current) {
          socket.emit('viewer-answer', {
            answer: pc.localDescription,
          });
        }
      } catch (error) {
        console.error('Error handling offer:', error);
      }
    };
    
    const handleBroadcasterIceCandidate = async ({ candidate }: BroadcasterIceCandidatePayload) => {
      if (connectionClosed.current) return;
      
      try {
        const iceCandidate = new RTCIceCandidate(candidate);
        
        // Skip if connection is closed
        if (pc.connectionState === 'closed') {
          console.log('Connection closed, ignoring ICE candidate');
          return;
        }
        
        // Only add candidate if we have a remote description
        if (pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(iceCandidate);
          } catch (err: any) {
            console.warn(`Error adding ICE candidate: ${err.message}`);
          }
        } else {
          console.log('Storing ICE candidate for later');
          pendingIceCandidates.current.push(iceCandidate);
        }
      } catch (error) {
        console.error('Error handling broadcaster ICE candidate:', error);
      }
    };
    
    // Set up socket event listeners
    socket.on('broadcaster-offer', handleBroadcasterOffer);
    socket.on('broadcaster-ice-candidate', handleBroadcasterIceCandidate);
    
    // Register as a viewer with config
    const registerAsViewer = () => {
      if (hasRegistered.current || connectionClosed.current) return;
      
      console.log('Registering as viewer with config');
      socket.emit('register-as-viewer', config);
      hasRegistered.current = true;
    };
    
    registerAsViewer();
    
    // Handle reconnection
    socket.on('connect', () => {
      if (connectionClosed.current) return;
      
      console.log('Socket reconnected, registering as viewer again');
      hasRegistered.current = false; // Reset flag to allow re-registration
      registerAsViewer();
    });
    
    return () => {
      // Mark connection as closed to prevent further operations
      connectionClosed.current = true;
      
      // Clean up event listeners
      socket.off('broadcaster-offer', handleBroadcasterOffer);
      socket.off('broadcaster-ice-candidate', handleBroadcasterIceCandidate);
      socket.off('connect');
      
      // Close the connection
      try {
        if (pc && pc.connectionState !== 'closed') {
          pc.close();
        }
      } catch (err) {
        console.error('Error closing peer connection:', err);
      }
      
      hasRegistered.current = false;
      pendingIceCandidates.current = [];
    };
  }, [socket, config]);
  
  return { streamRef, connected };
};