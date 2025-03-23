import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import next from 'next';

interface ClientConfig {
  clientId: string;
  socketId: string;
  connected: boolean;
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

interface ClientsMap {
  [clientId: string]: ClientConfig;
}

interface ViewerRegistrationConfig {
  clientId: string;
  [key: string]: any;
}

interface ClientConfigRequest {
  clientId: string;
}

interface ClientConfigUpdate {
  clientId: string;
  config: Partial<ClientConfig>;
}

interface BroadcasterOffer {
  viewerId: string;
  offer: RTCSessionDescriptionInit;
}

interface ViewerAnswer {
  answer: RTCSessionDescriptionInit;
}

interface BroadcasterIceCandidate {
  viewerId: string;
  candidate: RTCIceCandidateInit;
}

interface ViewerIceCandidate {
  candidate: RTCIceCandidateInit;
}

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = express();
  const httpServer = http.createServer(server);
  
  // Create Socket.io server with more robust settings
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    pingInterval: 10000,
    pingTimeout: 5000
  });
  
  // Store connected clients and their configurations
  const clients: ClientsMap = {};
  let broadcaster: string | null = null;
  
  io.on('connection', (socket: Socket) => {
    console.log('New socket connection:', socket.id);
    
    // Broadcaster registration
    socket.on('register-as-broadcaster', () => {
      // Only register if not already registered or different socket
      if (broadcaster !== socket.id) {
        if (broadcaster) {
          console.log('Replacing broadcaster from', broadcaster, 'to', socket.id);
        }
        
        broadcaster = socket.id;
        console.log('Broadcaster registered:', broadcaster);
        
        // Notify all connected viewers about the broadcaster
        Object.keys(clients).forEach(clientId => {
          if (clients[clientId].socketId && clients[clientId].connected) {
            socket.emit('new-viewer', clients[clientId].socketId);
          }
        });
      } else {
        console.log('Broadcaster already registered with ID:', broadcaster);
      }
    });
    
    // Viewer registration
    socket.on('register-as-viewer', (config: ViewerRegistrationConfig) => {
      if (!config || !config.clientId) {
        console.log('Invalid viewer registration - missing clientId');
        return;
      }
      
      const clientId = config.clientId;
      
      // Create or update client record
      clients[clientId] = {
        ...clients[clientId],
        ...config,
        socketId: socket.id,
        connected: true,
      };
      
      console.log('Viewer registered:', clientId);
      
      // Notify the broadcaster about this viewer only if broadcaster exists
      if (broadcaster) {
        io.to(broadcaster).emit('new-viewer', socket.id);
      } else {
        console.log('No broadcaster available for viewer:', clientId);
      }
      
      // Update all admin views
      io.emit('clients-update', Object.values(clients));
    });
    
    // Client config requests
    socket.on('get-client-config', ({ clientId }: ClientConfigRequest) => {
      console.log('Config request for client:', clientId);
      
      // Return existing config or create a new one
      if (!clients[clientId]) {
        clients[clientId] = {
          clientId,
          socketId: socket.id,
          connected: true,
          region: {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            totalWidth: 1920,
            totalHeight: 1080,
          },
        };
        console.log('Created new config for client:', clientId);
      } else {
        clients[clientId].socketId = socket.id;
        clients[clientId].connected = true;
        console.log('Updated existing config for client:', clientId);
      }
      
      // Send configuration to this client
      socket.emit('client-config', clients[clientId]);
      
      // Update all admin views
      io.emit('clients-update', Object.values(clients));
    });
    
    // Admin requests client list
    socket.on('get-clients', () => {
      socket.emit('clients-update', Object.values(clients));
    });
    
    // Admin updates client config
    // This is the optimized handler for the server.ts file 
// to handle client configuration updates more efficiently

// Admin updates client config
socket.on('update-client-config', ({ clientId, config }: ClientConfigUpdate) => {
  if (!clients[clientId]) {
    console.log('Client not found:', clientId);
    return;
  }
  
  // Store previous configuration
  const prevConfig = { ...clients[clientId] };
  
  // Check if this is a region-only update (most common during resizing/moving)
  const isRegionOnlyUpdate = config.region && Object.keys(config).length === 1;
  
  // For region updates, implement debouncing to avoid flickering
  // Only send substantial changes to reduce network traffic
  if (isRegionOnlyUpdate && prevConfig.region) {
    const prevRegion = prevConfig.region;
    const newRegion = config.region;
    
    // Check if change is significant enough to send
    // Using 2 pixels tolerance to reduce unnecessary updates
    const hasSignificantChange = newRegion ? (
      Math.abs((newRegion.x || 0) - (prevRegion.x || 0)) > 2 ||
      Math.abs((newRegion.y || 0) - (prevRegion.y || 0)) > 2 ||
      Math.abs((newRegion.width || 0) - (prevRegion.width || 0)) > 2 ||
      Math.abs((newRegion.height || 0) - (prevRegion.height || 0)) > 2 ||
      // Always update if total dimensions change
      (newRegion.totalWidth !== prevRegion.totalWidth) ||
      (newRegion.totalHeight !== prevRegion.totalHeight)
    ) : false;
    
    // Always update admin UI
    clients[clientId] = {
      ...prevConfig,
      ...config,
    };
    
    // Update clients list for admin
    io.emit('clients-update', Object.values(clients));
    
    // Skip small updates to clients
    if (!hasSignificantChange) {
      return;
    }
  } else {
    // Update client configuration for non-region updates
    clients[clientId] = {
      ...prevConfig,
      ...config,
    };
  }
  
  // Only send updates to clients that are connected
  if (clients[clientId].socketId && clients[clientId].connected) {
    // For region updates, broadcast to all clients for smoother transition
    // This ensures other clients know about region changes that might affect their view
    io.emit('clients-update', Object.values(clients));
  }
});
    
    // WebRTC signaling - more robust error handling
    socket.on('broadcaster-offer', ({ viewerId, offer }: BroadcasterOffer) => {
      if (!viewerId) {
        console.log('Invalid broadcaster offer - missing viewerId');
        return;
      }
      
      console.log(`Broadcaster sending offer to viewer: ${viewerId}`);
      io.to(viewerId).emit('broadcaster-offer', { offer });
    });
    
    socket.on('viewer-answer', ({ answer }: ViewerAnswer) => {
      if (!broadcaster) {
        console.log('Received viewer answer but no broadcaster registered');
        return;
      }
      
      console.log(`Viewer ${socket.id} sending answer to broadcaster`);
      io.to(broadcaster).emit('viewer-answer', { viewerId: socket.id, answer });
    });
    
    socket.on('broadcaster-ice-candidate', ({ viewerId, candidate }: BroadcasterIceCandidate) => {
      if (!viewerId) {
        console.log('Invalid broadcaster ICE candidate - missing viewerId');
        return;
      }
      
      console.log(`Broadcaster sending ICE candidate to viewer: ${viewerId}`);
      io.to(viewerId).emit('broadcaster-ice-candidate', { candidate });
    });
    
    socket.on('viewer-ice-candidate', ({ candidate }: ViewerIceCandidate) => {
      if (!broadcaster) {
        console.log('Received viewer ICE candidate but no broadcaster registered');
        return;
      }
      
      console.log(`Viewer ${socket.id} sending ICE candidate to broadcaster`);
      io.to(broadcaster).emit('viewer-ice-candidate', { viewerId: socket.id, candidate });
    });
    
    // Handle disconnections
    socket.on('disconnect', () => {
      console.log('Socket disconnected:', socket.id);
      
      // If broadcaster disconnected
      if (broadcaster === socket.id) {
        console.log('Broadcaster disconnected');
        broadcaster = null;
      }
      
      // If a client disconnected
      Object.keys(clients).forEach(clientId => {
        if (clients[clientId].socketId === socket.id) {
          clients[clientId].connected = false;
          console.log('Client disconnected:', clientId);
          
          // Notify broadcaster that viewer disconnected
          if (broadcaster) {
            io.to(broadcaster).emit('viewer-disconnect', socket.id);
          }
        }
      });
      
      // Update all admin views
      io.emit('clients-update', Object.values(clients));
    });
  });
  
  // Handle Next.js requests
  server.all('*', (req, res) => {
    return handle(req, res);
  });
  
  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Admin URL: http://localhost:${PORT}/admin`);
    console.log(`Client URL example: http://localhost:${PORT}/client?clientId=test-client-1`);
  });
});
