import { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';

// Simplified ICE server configuration
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// Interface for region configuration
interface RegionConfig {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Stream dimensions interface
interface StreamDimensions {
  width: number;
  height: number;
}

// Create a cropped video stream based on a region
const createCroppedStream = (
  sourceStream: MediaStream,
  region: RegionConfig
): MediaStream => {
  const video = document.createElement('video');
  video.srcObject = sourceStream;
  video.autoplay = true;
  video.muted = true;
  
  const canvas = document.createElement('canvas');
  canvas.width = region.width;
  canvas.height = region.height;
  
  const ctx = canvas.getContext('2d');
  
  // Draw the cropped region to the canvas
  const drawVideo = () => {
    if (ctx) {
      ctx.drawImage(
        video,
        region.x, region.y, region.width, region.height,
        0, 0, canvas.width, canvas.height
      );
    }
    requestAnimationFrame(drawVideo);
  };
  
  video.onloadedmetadata = () => {
    video.play();
    drawVideo();
  };
  
  // Create a stream from the canvas
  const stream = canvas.captureStream(30); // 30 FPS
  
  // If the source has audio, add it to the new stream
  const audioTrack = sourceStream.getAudioTracks()[0];
  if (audioTrack) {
    stream.addTrack(audioTrack);
  }
  
  return stream;
};

// Hook for broadcaster functionality
export const useBroadcaster = (socket: Socket | null) => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamDimensions, setStreamDimensions] = useState<StreamDimensions | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const croppedStreams = useRef<Map<string, MediaStream>>(new Map());
  const isRegisteredRef = useRef(false);

  // Get client configuration by ID
  const getClientConfig = (clientId: string): Promise<any> => {
    return new Promise((resolve) => {
      if (!socket) {
        resolve(null);
        return;
      }
      
      const handleResponse = (config: any) => {
        socket.off('client-config-response', handleResponse);
        resolve(config);
      };
      
      socket.on('client-config-response', handleResponse);
      socket.emit('get-client-config-for-broadcaster', { clientId });
      
      // Timeout in case no response
      setTimeout(() => {
        socket.off('client-config-response', handleResponse);
        resolve(null);
      }, 2000);
    });
  };

  // Utility to get viewer ID for a client
  const getViewerIdForClient = (clientId: string): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!socket) {
        resolve(null);
        return;
      }
      
      const handleResponse = (viewerId: string | null) => {
        socket.off('viewer-id-response', handleResponse);
        resolve(viewerId);
      };
      
      socket.on('viewer-id-response', handleResponse);
      socket.emit('get-viewer-id-for-client', { clientId });
      
      // Timeout
      setTimeout(() => {
        socket.off('viewer-id-response', handleResponse);
        resolve(null);
      }, 1000);
    });
  };

  // Update client stream when region changes
  const updateClientStream = async (clientId: string, region: RegionConfig) => {
    if (!streamRef.current) return;
    
    // Find the viewer socket ID for this client
    const viewerId = await getViewerIdForClient(clientId);
    if (!viewerId || !peerConnections.current.has(viewerId)) return;
    
    // Get the existing connection
    const peerConnection = peerConnections.current.get(viewerId)!;
    
    // Create a new cropped stream
    const croppedStream = createCroppedStream(streamRef.current, region);
    
    // Store the cropped stream for reference
    if (croppedStreams.current.has(viewerId)) {
      // Stop tracks on the old cropped stream
      const oldStream = croppedStreams.current.get(viewerId)!;
      oldStream.getTracks().forEach(track => track.stop());
    }
    croppedStreams.current.set(viewerId, croppedStream);
    
    // Replace the existing tracks
    const senders = peerConnection.getSenders();
    const newTracks = croppedStream.getTracks();
    
    // Replace video track
    const videoSender = senders.find(sender => sender.track?.kind === 'video');
    const newVideoTrack = newTracks.find(track => track.kind === 'video');
    
    if (videoSender && newVideoTrack) {
      await videoSender.replaceTrack(newVideoTrack);
      console.log(`Updated stream for client ${clientId} with region:`, region);
    }
  };

  // Register as broadcaster when socket connects
  useEffect(() => {
    if (!socket) return;

    const registerAsBroadcaster = () => {
      if (isRegisteredRef.current || !streamRef.current) return;
      
      console.log('Registering as broadcaster');
      socket.emit('register-as-broadcaster', { 
        dimensions: streamDimensions 
      });
      isRegisteredRef.current = true;
    };

    // Handle new viewer connection
    const handleNewViewer = async ({ viewerId, clientId }: { viewerId: string, clientId: string }) => {
      console.log('New viewer connected:', viewerId, clientId);
      
      if (!streamRef.current) {
        console.log('No stream available for viewer');
        return;
      }
      
      try {
        // Clean up any existing connection
        if (peerConnections.current.has(viewerId)) {
          const oldConnection = peerConnections.current.get(viewerId);
          oldConnection?.close();
          peerConnections.current.delete(viewerId);
          
          // Clean up any existing cropped stream
          if (croppedStreams.current.has(viewerId)) {
            const oldStream = croppedStreams.current.get(viewerId)!;
            oldStream.getTracks().forEach(track => track.stop());
            croppedStreams.current.delete(viewerId);
          }
        }
        
        // Create new peer connection
        const peerConnection = new RTCPeerConnection(ICE_SERVERS);
        peerConnections.current.set(viewerId, peerConnection);
        
        // Get client configuration to check for region
        const clientConfig = await getClientConfig(clientId);
        let streamToSend = streamRef.current;
        
        // If client has a region defined, create a cropped stream
        if (clientConfig?.region) {
          console.log(`Creating cropped stream for client ${clientId} with region:`, clientConfig.region);
          streamToSend = createCroppedStream(streamRef.current, clientConfig.region);
          croppedStreams.current.set(viewerId, streamToSend);
        }
        
        // Add stream tracks to peer connection
        streamToSend.getTracks().forEach(track => {
          peerConnection.addTrack(track, streamToSend);
        });
        
        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
          if (event.candidate && socket.connected) {
            socket.emit('broadcaster-ice-candidate', {
              viewerId,
              candidate: event.candidate
            });
          }
        };
        
        // Log connection state changes for debugging
        peerConnection.onconnectionstatechange = () => {
          console.log(`Connection state for ${viewerId}: ${peerConnection.connectionState}`);
          
          if (['failed', 'closed'].includes(peerConnection.connectionState)) {
            console.log(`Connection to ${viewerId} failed or closed`);
            peerConnection.close();
            peerConnections.current.delete(viewerId);
            
            // Clean up cropped stream
            if (croppedStreams.current.has(viewerId)) {
              const stream = croppedStreams.current.get(viewerId)!;
              stream.getTracks().forEach(track => track.stop());
              croppedStreams.current.delete(viewerId);
            }
          }
        };
        
        // Create and send offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        socket.emit('broadcaster-offer', { viewerId, offer });
      } catch (error) {
        console.error('Error establishing connection with viewer:', error);
      }
    };
    
    // Handle viewer answer
    const handleViewerAnswer = async ({ viewerId, answer }: { viewerId: string, answer: RTCSessionDescriptionInit }) => {
      try {
        const peerConnection = peerConnections.current.get(viewerId);
        if (!peerConnection) {
          console.log('No connection found for viewer answer:', viewerId);
          return;
        }
        
        // Set remote description
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        console.log(`Remote description set for ${viewerId}`);
      } catch (error) {
        console.error('Error handling viewer answer:', error);
      }
    };
    
    // Handle viewer ICE candidate
    const handleViewerIceCandidate = async ({ viewerId, candidate }: { viewerId: string, candidate: RTCIceCandidateInit }) => {
      try {
        const peerConnection = peerConnections.current.get(viewerId);
        if (!peerConnection) return;
        
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('Error handling ICE candidate:', error);
      }
    };
    
    // Handle viewer disconnection
    const handleViewerDisconnected = (viewerId: string) => {
      const peerConnection = peerConnections.current.get(viewerId);
      if (peerConnection) {
        peerConnection.close();
        peerConnections.current.delete(viewerId);
        
        // Clean up cropped stream
        if (croppedStreams.current.has(viewerId)) {
          const stream = croppedStreams.current.get(viewerId)!;
          stream.getTracks().forEach(track => track.stop());
          croppedStreams.current.delete(viewerId);
        }
        
        console.log(`Viewer disconnected and connection closed: ${viewerId}`);
      }
    };
    
    // Handle client region updated
    const handleClientRegionUpdated = async ({ clientId, region }: { clientId: string, region: RegionConfig }) => {
      console.log(`Region updated for client ${clientId}:`, region);
      await updateClientStream(clientId, region);
    };
    
    // Set up event listeners
    socket.on('new-viewer', handleNewViewer);
    socket.on('viewer-answer', handleViewerAnswer);
    socket.on('viewer-ice-candidate', handleViewerIceCandidate);
    socket.on('viewer-disconnected', handleViewerDisconnected);
    socket.on('client-region-updated', handleClientRegionUpdated);
    
    // Re-register on reconnection
    socket.on('connect', () => {
      console.log('Socket reconnected, re-registering as broadcaster');
      isRegisteredRef.current = false;
      if (streamRef.current) {
        registerAsBroadcaster();
      }
    });
    
    // If we already have a stream, register as broadcaster
    if (streamRef.current) {
      registerAsBroadcaster();
    }
    
    return () => {
      // Clean up event listeners
      socket.off('new-viewer', handleNewViewer);
      socket.off('viewer-answer', handleViewerAnswer);
      socket.off('viewer-ice-candidate', handleViewerIceCandidate);
      socket.off('viewer-disconnected', handleViewerDisconnected);
      socket.off('client-region-updated', handleClientRegionUpdated);
      socket.off('connect');
      
      // Close all peer connections and clean up streams
      peerConnections.current.forEach(connection => {
        connection.close();
      });
      peerConnections.current.clear();
      
      // Clean up all cropped streams
      croppedStreams.current.forEach(stream => {
        stream.getTracks().forEach(track => track.stop());
      });
      croppedStreams.current.clear();
    };
  }, [socket, streamDimensions]);
  
  // Start streaming function
  const startStreaming = async (sourceType: 'screen' | 'camera') => {
    try {
      console.log(`Starting ${sourceType} capture...`);
      
      // Stop any existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      // Get new stream with explicit constraints
      let stream: MediaStream;
      if (sourceType === 'screen') {
        // For screen capture
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            cursor: 'always',
            displaySurface: 'monitor'
          } as MediaTrackConstraints,
          audio: false
        });
        console.log("Screen capture stream obtained:", stream);
      } else {
        // For camera
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,  // Simplified to ensure camera works
          audio: false
        });
        console.log("Camera stream obtained:", stream);
      }
      
      // Log available tracks for debugging
      stream.getTracks().forEach(track => {
        console.log(`Track of kind ${track.kind} added:`, track.getSettings());
      });
      
      // Save the stream
      streamRef.current = stream;
      setIsStreaming(true);
      
      // Add tracks to existing peer connections - we need to update all connections with new cropped streams
      if (peerConnections.current.size > 0 && stream.getTracks().length > 0) {
        console.log(`Updating ${peerConnections.current.size} existing connections with new stream`);
        
        // We need to update each connection individually with its respective cropped stream
        const updatePromises = Array.from(peerConnections.current.entries()).map(async ([viewerId, pc]) => {
          try {
            // Find the client ID for this viewer
            const clientIdResponse = await new Promise<{clientId: string | null}>((resolve) => {
              if (!socket) {
                resolve({clientId: null});
                return;
              }
              
              const handleResponse = (response: {clientId: string | null}) => {
                socket.off('client-id-response', handleResponse);
                resolve(response);
              };
              
              socket.on('client-id-response', handleResponse);
              socket.emit('get-client-id-for-viewer', { viewerId });
              
              // Timeout
              setTimeout(() => {
                socket.off('client-id-response', handleResponse);
                resolve({clientId: null});
              }, 1000);
            });
            
            if (!clientIdResponse.clientId) return;
            
            // Get client config
            const clientConfig = await getClientConfig(clientIdResponse.clientId);
            
            if (!clientConfig?.region) {
              // If no region, use the full stream
              const senders = pc.getSenders();
              stream.getTracks().forEach(track => {
                const sender = senders.find(s => s.track?.kind === track.kind);
                if (sender) {
                  sender.replaceTrack(track);
                } else {
                  pc.addTrack(track, stream);
                }
              });
            } else {
              // Create a cropped stream
              const croppedStream = createCroppedStream(stream, clientConfig.region);
              
              // Clean up old cropped stream if it exists
              if (croppedStreams.current.has(viewerId)) {
                const oldStream = croppedStreams.current.get(viewerId)!;
                oldStream.getTracks().forEach(track => track.stop());
              }
              
              // Store the new cropped stream
              croppedStreams.current.set(viewerId, croppedStream);
              
              // Replace tracks
              const senders = pc.getSenders();
              croppedStream.getTracks().forEach(track => {
                const sender = senders.find(s => s.track?.kind === track.kind);
                if (sender) {
                  sender.replaceTrack(track);
                } else {
                  pc.addTrack(track, croppedStream);
                }
              });
            }
            
            // Renegotiate connection
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            
            if (socket?.connected) {
              socket.emit('broadcaster-offer', { 
                viewerId, 
                offer: pc.localDescription 
              });
            }
          } catch (err) {
            console.error(`Error updating connection for viewer ${viewerId}:`, err);
          }
        });
        
        // Wait for all connections to update
        await Promise.all(updatePromises);
      }
      
      // Get accurate dimensions with a delay to ensure settings are available
      setTimeout(() => {
        if (!streamRef.current) return;
        
        const videoTrack = streamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          const settings = videoTrack.getSettings();
          console.log("Video track settings:", settings);
          
          if (settings.width && settings.height) {
            const dimensions = {
              width: settings.width,
              height: settings.height
            };
            console.log("Setting stream dimensions:", dimensions);
            setStreamDimensions(dimensions);
            
            // Register as broadcaster with dimensions
            if (socket?.connected) {
              console.log("Registering as broadcaster with dimensions");
              socket.emit('register-as-broadcaster', { dimensions });
              isRegisteredRef.current = true;
            }
          }
        }
      }, 500);
      
      // Handle stream ending
      stream.getVideoTracks()[0].onended = () => {
        console.log("Stream ended");
        setIsStreaming(false);
        streamRef.current = null;
      };
      
      return stream;
    } catch (error) {
      console.error('Error starting stream:', error);
      setIsStreaming(false);
      throw error;
    }
  };
  
  // Stop streaming function
  const stopStreaming = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setIsStreaming(false);
    }
    
    // Close all peer connections
    peerConnections.current.forEach(connection => {
      connection.close();
    });
    peerConnections.current.clear();
    
    // Clean up all cropped streams
    croppedStreams.current.forEach(stream => {
      stream.getTracks().forEach(track => track.stop());
    });
    croppedStreams.current.clear();
  };
  
  return {
    isStreaming,
    streamRef,
    streamDimensions,
    startStreaming,
    stopStreaming
  };
};

// Hook for viewer functionality
export const useViewer = (socket: Socket | null, clientId: string | null) => {
  const [connected, setConnected] = useState(false);
  const [region, setRegion] = useState<RegionConfig | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const connectionClosed = useRef(false);
  const pendingCandidates = useRef<RTCIceCandidate[]>([]);
  
  useEffect(() => {
    if (!socket || !clientId) return;
    
    console.log(`Initializing viewer for client ${clientId}`);
    connectionClosed.current = false;
    
    // Create peer connection with explicit config
    const pc = new RTCPeerConnection({
      ...ICE_SERVERS,
      iceCandidatePoolSize: 10
    });
    peerConnection.current = pc;
    
    // Handle incoming tracks
    pc.ontrack = (event) => {
      console.log(`Received track: ${event.track.kind}`, event.track);
      
      // Create a new stream for the first track
      if (!streamRef.current) {
        console.log("Creating new stream for track");
        streamRef.current = new MediaStream();
      }
      
      // Check if track already exists
      const trackExists = streamRef.current.getTracks().some(
        t => t.id === event.track.id
      );
      
      if (!trackExists) {
        console.log(`Adding ${event.track.kind} track to stream`);
        streamRef.current.addTrack(event.track);
      }
    };
    
    // Log all connection state changes
    pc.oniceconnectionstatechange = () => {
      console.log(`ICE connection state: ${pc.iceConnectionState}`);
      
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        console.log("WebRTC connection established!");
        setConnected(true);
      } else if (['disconnected', 'failed', 'closed'].includes(pc.iceConnectionState)) {
        console.log(`WebRTC connection changed to ${pc.iceConnectionState}`);
        setConnected(false);
      }
    };
    
    pc.onconnectionstatechange = () => {
      console.log(`Connection state: ${pc.connectionState}`);
    };
    
    pc.onsignalingstatechange = () => {
      console.log(`Signaling state: ${pc.signalingState}`);
    };
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socket.connected) {
        console.log("Sending ICE candidate to broadcaster");
        socket.emit('viewer-ice-candidate', { candidate: event.candidate });
      }
    };
    
    // Handle offer from broadcaster
    const handleBroadcasterOffer = async ({ offer }: { offer: RTCSessionDescriptionInit }) => {
      if (connectionClosed.current) return;
      
      console.log("Received offer from broadcaster", offer);
      
      try {
        // Handle potential glare (https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation)
        const offerCollision = 
          pc.signalingState !== "stable" && 
          offer.type === "offer";
            
        if (offerCollision) {
          console.log("Handling offer collision - rolling back");
          await Promise.all([
            pc.setLocalDescription({type: "rollback"} as RTCSessionDescription),
            pc.setRemoteDescription(new RTCSessionDescription(offer))
          ]);
        } else {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
        }
        
        console.log("Creating answer");
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        console.log("Sending answer to broadcaster");
        socket.emit('viewer-answer', { answer });
        
        // Apply any pending ICE candidates
        if (pendingCandidates.current.length > 0) {
          console.log(`Applying ${pendingCandidates.current.length} pending ICE candidates`);
          for (const candidate of pendingCandidates.current) {
            await pc.addIceCandidate(candidate);
          }
          pendingCandidates.current = [];
        }
      } catch (error) {
        console.error('Error handling offer:', error);
      }
    };
    
    // Handle ICE candidate from broadcaster
    const handleBroadcasterIceCandidate = async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      if (connectionClosed.current) return;
      
      try {
        const iceCandidate = new RTCIceCandidate(candidate);
        
        // If we have a remote description, add the candidate immediately
        if (pc.remoteDescription && pc.remoteDescription.type) {
          console.log("Adding ICE candidate");
          await pc.addIceCandidate(iceCandidate);
        } else {
          // Otherwise store it for later
          console.log("Storing ICE candidate for later");
          pendingCandidates.current.push(iceCandidate);
        }
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    };
    
    // Handle region updates
    const handleRegionUpdate = ({ region, totalDimensions }: { region: RegionConfig, totalDimensions?: StreamDimensions }) => {
      console.log("Region update received:", region);
      setRegion(region);
    };
    
    // Handle client configuration
    const handleClientConfig = (config: any) => {
      console.log("Client config received:", config);
      if (config.region) {
        setRegion(config.region);
      }
    };
    
    // Handle broadcaster disconnection
    const handleBroadcasterDisconnected = () => {
      console.log("Broadcaster disconnected");
      setConnected(false);
      
      // Clear stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
    
    // Register as viewer
    console.log("Registering as viewer");
    socket.emit('register-as-viewer', { clientId });
    
    // Set up event listeners
    socket.on('broadcaster-offer', handleBroadcasterOffer);
    socket.on('broadcaster-ice-candidate', handleBroadcasterIceCandidate);
    socket.on('region-update', handleRegionUpdate);
    socket.on('client-config', handleClientConfig);
    socket.on('broadcaster-disconnected', handleBroadcasterDisconnected);
    
    // Handle reconnection
    socket.on('connect', () => {
      if (connectionClosed.current) return;
      
      console.log("Socket reconnected, re-registering as viewer");
      socket.emit('register-as-viewer', { clientId });
    });
    
    return () => {
      // Mark connection as closed
      connectionClosed.current = true;
      console.log("Cleaning up viewer connection");
      
      // Clean up event listeners
      socket.off('broadcaster-offer', handleBroadcasterOffer);
      socket.off('broadcaster-ice-candidate', handleBroadcasterIceCandidate);
      socket.off('region-update', handleRegionUpdate);
      socket.off('client-config', handleClientConfig);
      socket.off('broadcaster-disconnected', handleBroadcasterDisconnected);
      socket.off('connect');
      
      // Close peer connection
      if (peerConnection.current) {
        peerConnection.current.close();
        peerConnection.current = null;
      }
      
      // Clear stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, [socket, clientId]);
  
  return { streamRef, connected, region };
};