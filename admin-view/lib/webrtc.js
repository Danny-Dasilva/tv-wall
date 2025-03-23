import { useEffect, useRef, useState } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export const useBroadcaster = (socket) => {
  const [connections, setConnections] = useState({});
  const streamRef = useRef(null);
  const mediaStream = useRef(null);
  const isRegistered = useRef(false);
  const connectionsRef = useRef({}); // Reference to the current connections state

  // Update the ref whenever connections change
  useEffect(() => {
    connectionsRef.current = connections;
  }, [connections]);

  useEffect(() => {
    if (!socket) return;

    const handleNewViewer = async (viewerId) => {
      console.log('New viewer connected:', viewerId);
      
      // Check if connection already exists
      if (connectionsRef.current[viewerId]) {
        console.log('Connection already exists for viewer:', viewerId);
        return;
      }
      
      try {
        const peerConnection = new RTCPeerConnection(ICE_SERVERS);
        
        // Add tracks when they exist
        if (mediaStream.current) {
          mediaStream.current.getTracks().forEach(track => {
            peerConnection.addTrack(track, mediaStream.current);
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
        
        // Store the connection with its pending state first, before creating an offer
        setConnections(prev => ({
          ...prev,
          [viewerId]: {
            connection: peerConnection,
            pendingCandidates: [],
            state: 'new'
          },
        }));
        
        const offer = await peerConnection.createOffer({
          offerToReceiveAudio: false,
          offerToReceiveVideo: true
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
      } catch (error) {
        console.error('Error creating offer:', error);
      }
    };
    
    const handleViewerAnswer = async ({ viewerId, answer }) => {
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
              // Check again that the connection is still valid
              if (peerConnection.connectionState !== 'closed') {
                await peerConnection.addIceCandidate(candidate);
              }
            } catch (err) {
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
    
    const handleViewerIceCandidate = async ({ viewerId, candidate }) => {
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
          } catch (err) {
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
    
    const handleViewerDisconnect = (viewerId) => {
      console.log('Viewer disconnected:', viewerId);
      try {
        const connectionData = connectionsRef.current[viewerId];
        if (connectionData) {
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
      
      // Close all connections
      Object.values(connectionsRef.current).forEach(connectionData => {
        try {
          if (connectionData.connection && connectionData.connection.connectionState !== 'closed') {
            connectionData.connection.close();
          }
        } catch (e) {
          console.error('Error closing connection during cleanup:', e);
        }
      });
      
      // Reset state
      setConnections({});
      isRegistered.current = false;
    };
  }, [socket]);
  
  // Function to set the media stream
  const setMediaStream = (stream) => {
    mediaStream.current = stream;
    streamRef.current = stream;
    
    // Add tracks to any existing connections
    Object.entries(connectionsRef.current).forEach(([viewerId, connectionData]) => {
      try {
        const peerConnection = connectionData.connection;
        if (peerConnection && 
            stream && 
            peerConnection.connectionState !== 'closed') {
          // Remove any existing tracks
          const senders = peerConnection.getSenders();
          senders.forEach(sender => {
            try {
              peerConnection.removeTrack(sender);
            } catch (err) {
              console.warn('Error removing track:', err);
            }
          });
          
          // Add the new tracks
          stream.getTracks().forEach(track => {
            try {
              peerConnection.addTrack(track, stream);
            } catch (err) {
              console.warn('Error adding track:', err);
            }
          });
        }
      } catch (error) {
        console.error('Error updating stream for connection:', error);
      }
    });
  };
  
  return { streamRef, setMediaStream };
};

export const useViewer = (socket, config) => {
  const [connected, setConnected] = useState(false);
  const streamRef = useRef(null);
  const peerConnection = useRef(null);
  const pendingIceCandidates = useRef([]);
  const hasRegistered = useRef(false);
  const connectionClosed = useRef(false);
  
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
    
    // Create a new RTCPeerConnection
    const pc = new RTCPeerConnection(ICE_SERVERS);
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
    
    const handleBroadcasterOffer = async ({ offer }) => {
      if (connectionClosed.current) return;
      
      console.log('Received offer from broadcaster');
      try {
        // If we're in a strange state, reset the connection
        if (pc.signalingState !== 'stable' && pc.signalingState !== 'have-local-pranswer') {
          console.log('Resetting connection before processing offer');
          try {
            await pc.setLocalDescription({type: "rollback"});
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
            } catch (err) {
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
    
    const handleBroadcasterIceCandidate = async ({ candidate }) => {
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
          } catch (err) {
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