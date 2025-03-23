import Peer from 'simple-peer';

// Initialize WebRTC peer server
const initializePeerServer = async () => {
  // Check if running in browser
  if (typeof window === 'undefined') {
    return null;
  }
  
  // In-memory storage for peer connections
  let peers = {};
  let callbacks = {
    onConnection: null,
    onDisconnection: null,
    onMessage: null
  };
  
  // Generate a unique ID for this server instance
  const serverId = 'server-123456'
  
  // Create signaling mechanism using WebRTC
  const setupSignalingServer = () => {
    // In a real app, you'd use a proper signaling server
    // For this example, we'll simulate with localStorage
    window.addEventListener('storage', (event) => {
      // Only process messages intended for this server
      if (event.key === 'webrtc-signaling' && event.newValue) {
        try {
          const signal = JSON.parse(event.newValue);
          
          // Only process signals addressed to this server
          if (signal.target === serverId) {
            handleSignal(signal);
          }
        } catch (err) {
          console.error('Error parsing signal:', err);
        }
      }
    });
    
    // Clear any previous messages
    localStorage.removeItem('webrtc-signaling');
    
    // Announce server presence
    broadcastServerInfo();
    
    // Periodically announce server to handle page refreshes of clients
    setInterval(broadcastServerInfo, 5000);
  };
  
  // Broadcast server information for discovery
  const broadcastServerInfo = () => {
    const serverInfo = {
      type: 'server-announce',
      serverId: serverId,
      timestamp: Date.now()
    };
    
    localStorage.setItem('webrtc-server-info', JSON.stringify(serverInfo));
  };
  
  // Handle incoming signals
  const handleSignal = (signal) => {
    const { peerId, type, data } = signal;
    
    switch (type) {
      case 'connect-request':
        // New peer wants to connect
        handleConnectionRequest(peerId, data);
        break;
      
      case 'signal-data':
        // Signal data from existing peer
        if (peers[peerId]) {
          peers[peerId].peer.signal(data);
        }
        break;
      
      case 'disconnect':
        // Peer disconnected
        handleDisconnect(peerId);
        break;
    }
  };
  
  // Handle new connection request
  const handleConnectionRequest = (peerId, metadata) => {
    console.log('New connection request from:', peerId);
    
    // Create a new WebRTC peer
    const peer = new Peer({ initiator: false, trickle: true });
    
    // Set up peer event handlers
    peer.on('signal', (data) => {
      // Send signal back to the peer
      sendSignalToPeer(peerId, {
        type: 'signal-data',
        data: data
      });
    });
    
    peer.on('connect', () => {
      console.log('Peer connected:', peerId);
      
      // Create connection object
      const connection = {
        id: peerId,
        name: metadata?.deviceName || `Device ${Object.keys(peers).length + 1}`,
        model: metadata?.deviceModel || 'Unknown',
        isConnected: true,
        assignedBoxId: null,
        peer: peer,
        metadata: metadata
      };
      
      // Store the peer
      peers[peerId] = connection;
      
      // Notify about new connection
      if (callbacks.onConnection) {
        // Don't expose the peer object to outside
        const { peer, ...connectionInfo } = connection;
        callbacks.onConnection(connectionInfo);
      }
    });
    
    peer.on('data', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        // Handle message from peer
        if (callbacks.onMessage) {
          callbacks.onMessage(peerId, message);
        }
      } catch (err) {
        console.error('Error parsing message:', err);
      }
    });
    
    peer.on('close', () => {
      handleDisconnect(peerId);
    });
    
    peer.on('error', (err) => {
      console.error('Peer error:', err);
      handleDisconnect(peerId);
    });
  };
  
  // Handle peer disconnect
  const handleDisconnect = (peerId) => {
    if (peers[peerId]) {
      console.log('Peer disconnected:', peerId);
      
      // Close peer connection
      peers[peerId].peer.destroy();
      
      // Remove from peers list
      delete peers[peerId];
      
      // Notify about disconnection
      if (callbacks.onDisconnection) {
        callbacks.onDisconnection(peerId);
      }
    }
  };
  
  // Send signal to a peer
  const sendSignalToPeer = (peerId, data) => {
    const signal = {
      source: serverId,
      target: peerId,
      peerId: serverId,
      type: data.type,
      data: data.data,
      timestamp: Date.now()
    };
    
    localStorage.setItem('webrtc-signaling', JSON.stringify(signal));
  };
  
  // Send message to a peer
  const sendMessageToPeer = (peerId, message) => {
    if (peers[peerId] && peers[peerId].peer) {
      try {
        peers[peerId].peer.send(JSON.stringify(message));
        return true;
      } catch (err) {
        console.error('Error sending message:', err);
        return false;
      }
    }
    return false;
  };
  
  // Start signaling server
  setupSignalingServer();
  
  // Return server API
  return {
    // Send a signal to a specific peer
    sendSignal: (peerId, data) => {
      return sendSignalToPeer(peerId, {
        type: 'signal-data',
        data: data
      });
    },
    
    // Send a message to a specific peer
    sendMessage: (peerId, message) => {
      return sendMessageToPeer(peerId, message);
    },
    
    // Get all connected peers
    getConnections: () => {
      return Object.values(peers).map(({ peer, ...rest }) => rest);
    },
    
    // Set callback for new connections
    onConnection: (callback) => {
      callbacks.onConnection = callback;
    },
    
    // Set callback for disconnections
    onDisconnection: (callback) => {
      callbacks.onDisconnection = callback;
    },
    
    // Set callback for messages
    onMessage: (callback) => {
      callbacks.onMessage = callback;
    },
    
    // Shutdown the server
    shutdown: () => {
      // Close all peer connections
      Object.values(peers).forEach(peer => {
        peer.peer.destroy();
      });
      
      peers = {};
      localStorage.removeItem('webrtc-server-info');
      console.log('WebRTC server shut down');
    }
  };
};

export { initializePeerServer };