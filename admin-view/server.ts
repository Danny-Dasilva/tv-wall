import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import next from 'next';

// Simplified client configuration interface
interface ClientConfig {
  clientId: string;
  socketId: string;
  connected: boolean;
  name?: string;
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

// Main interface for client store
interface ClientStore {
  clients: Record<string, ClientConfig>;
  broadcaster: string | null;
  streamDimensions: {
    width: number;
    height: number;
  } | null;
}

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// Create a clean central store for all client data
const store: ClientStore = {
  clients: {},
  broadcaster: null,
  streamDimensions: null
};

app.prepare().then(() => {
  const server = express();
  const httpServer = http.createServer(server);
  
  // Create Socket.io server with simplified settings
  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingInterval: 25000, // Less frequent pings
    pingTimeout: 10000   // More time for timeout
  });
  
  // Middleware to log all socket events for debugging
  io.use((socket, next) => {
    console.log(`[${new Date().toISOString()}] New connection attempt: ${socket.id}`);
    next();
  });
  
  io.on('connection', (socket: Socket) => {
    console.log(`[${new Date().toISOString()}] Socket connected: ${socket.id}`);
    
    // BROADCASTER EVENTS
    
    // Handle broadcaster registration
    socket.on('register-as-broadcaster', ({ dimensions }) => {
      console.log(`[${new Date().toISOString()}] Broadcaster registered: ${socket.id}`);
      
      // Update store
      store.broadcaster = socket.id;
      store.streamDimensions = dimensions;
      
      // Notify all connected clients
      Object.values(store.clients).forEach(client => {
        if (client.connected) {
          // Send directly to broadcaster to notify about this viewer
          socket.emit('new-viewer', { viewerId: client.socketId, clientId: client.clientId });
          
          // Also notify client about stream dimensions
          io.to(client.socketId).emit('stream-dimensions', dimensions);
        }
      });
      
      // Notify all admins about stream dimensions
      io.emit('stream-dimensions-update', store.streamDimensions);
    });
    
    // VIEWER EVENTS
    
    // Handle viewer registration with simplified config
    socket.on('register-as-viewer', ({ clientId, name }) => {
      if (!clientId) {
        console.log(`[${new Date().toISOString()}] Invalid viewer registration - missing clientId`);
        return;
      }
      
      // Create or update client
      store.clients[clientId] = {
        ...store.clients[clientId],
        clientId,
        name: name || clientId,
        socketId: socket.id,
        connected: true
      };
      
      console.log(`[${new Date().toISOString()}] Viewer registered: ${clientId} (${socket.id})`);
      
      // Notify broadcaster about this viewer
      if (store.broadcaster) {
        io.to(store.broadcaster).emit('new-viewer', { 
          viewerId: socket.id, 
          clientId 
        });
      }
      
      // Send initial config to this client
      socket.emit('client-config', store.clients[clientId]);
      
      // If we have stream dimensions, send those too
      if (store.streamDimensions) {
        socket.emit('stream-dimensions', store.streamDimensions);
      }
      
      // Update all admin views
      io.emit('clients-update', Object.values(store.clients));
    });
    
    // CLIENT CONFIG EVENTS
    
    // Handle client requesting its configuration
    socket.on('get-client-config', ({ clientId }) => {
      // If client doesn't exist, create a default config
      if (!store.clients[clientId]) {
        store.clients[clientId] = {
          clientId,
          socketId: socket.id,
          connected: true,
          name: clientId,
          // Don't set a default region - let admin configure it
        };
      } else {
        // Update socket ID and connection status
        store.clients[clientId].socketId = socket.id;
        store.clients[clientId].connected = true;
      }
      
      // Send the config to the client
      socket.emit('client-config', store.clients[clientId]);
      
      // If we have stream dimensions, send those too
      if (store.streamDimensions) {
        socket.emit('stream-dimensions', store.streamDimensions);
      }
      
      // Update all admin views
      io.emit('clients-update', Object.values(store.clients));
    });
    
    // NEW: Handle broadcaster requesting client configuration
    socket.on('get-client-config-for-broadcaster', ({ clientId }) => {
      if (!store.clients[clientId]) {
        console.log(`[${new Date().toISOString()}] Client not found for broadcaster request: ${clientId}`);
        socket.emit('client-config-response', null);
        return;
      }
      
      socket.emit('client-config-response', store.clients[clientId]);
    });
    
    // NEW: Get viewer socket ID for a client ID
    socket.on('get-viewer-id-for-client', ({ clientId }) => {
      if (!store.clients[clientId] || !store.clients[clientId].connected) {
        socket.emit('viewer-id-response', null);
        return;
      }
      
      socket.emit('viewer-id-response', store.clients[clientId].socketId);
    });
    
    // NEW: Get client ID for a viewer socket ID
    socket.on('get-client-id-for-viewer', ({ viewerId }) => {
      // Find client with matching socket ID
      const client = Object.values(store.clients).find(c => c.socketId === viewerId && c.connected);
      
      if (!client) {
        socket.emit('client-id-response', { clientId: null });
        return;
      }
      
      socket.emit('client-id-response', { clientId: client.clientId });
    });
    
    // ADMIN EVENTS
    
    // Admin requests all clients
    socket.on('get-clients', () => {
      socket.emit('clients-update', Object.values(store.clients));
      
      // Also send stream dimensions if available
      if (store.streamDimensions) {
        socket.emit('stream-dimensions-update', store.streamDimensions);
      }
    });
    
    // Admin updates client config - simplified approach
    socket.on('update-client-config', ({ clientId, config }) => {
      if (!store.clients[clientId]) {
        console.log(`[${new Date().toISOString()}] Client not found for update: ${clientId}`);
        return;
      }
      
      // Update client configuration
      store.clients[clientId] = {
        ...store.clients[clientId],
        ...config
      };
      
      // If this was a region update, send targeted update to client
      if (config.region && store.clients[clientId].connected) {
        io.to(store.clients[clientId].socketId).emit('region-update', {
          region: config.region,
          totalDimensions: store.streamDimensions
        });
        
        // NEW: Also notify broadcaster about region update for this client
        if (store.broadcaster) {
          io.to(store.broadcaster).emit('client-region-updated', {
            clientId,
            region: config.region
          });
          
          console.log(`[${new Date().toISOString()}] Notified broadcaster of region update for client ${clientId}`);
        }
      }
      
      // Update all admin views
      io.emit('clients-update', Object.values(store.clients));
    });
    
    // WEBRTC SIGNALING - Simplified
    
    // Forward broadcaster offer to viewer
    socket.on('broadcaster-offer', ({ viewerId, offer }) => {
      console.log(`[${new Date().toISOString()}] Forwarding offer to viewer: ${viewerId}`);
      io.to(viewerId).emit('broadcaster-offer', { offer });
    });
    
    // Forward viewer answer to broadcaster
    socket.on('viewer-answer', ({ answer }) => {
      if (!store.broadcaster) {
        console.log(`[${new Date().toISOString()}] Received viewer answer but no broadcaster`);
        return;
      }
      
      console.log(`[${new Date().toISOString()}] Forwarding answer to broadcaster from: ${socket.id}`);
      io.to(store.broadcaster).emit('viewer-answer', { viewerId: socket.id, answer });
    });
    
    // Forward ICE candidates in both directions
    socket.on('broadcaster-ice-candidate', ({ viewerId, candidate }) => {
      io.to(viewerId).emit('broadcaster-ice-candidate', { candidate });
    });
    
    socket.on('viewer-ice-candidate', ({ candidate }) => {
      if (!store.broadcaster) return;
      
      io.to(store.broadcaster).emit('viewer-ice-candidate', { 
        viewerId: socket.id, 
        candidate 
      });
    });
    
    // DISCONNECTION HANDLING
    
    socket.on('disconnect', () => {
      console.log(`[${new Date().toISOString()}] Socket disconnected: ${socket.id}`);
      
      // If broadcaster disconnected
      if (store.broadcaster === socket.id) {
        console.log(`[${new Date().toISOString()}] Broadcaster disconnected`);
        store.broadcaster = null;
        
        // Notify all clients
        Object.values(store.clients).forEach(client => {
          if (client.connected) {
            io.to(client.socketId).emit('broadcaster-disconnected');
          }
        });
      }
      
      // If a client disconnected
      Object.entries(store.clients).forEach(([clientId, client]) => {
        if (client.socketId === socket.id) {
          store.clients[clientId].connected = false;
          console.log(`[${new Date().toISOString()}] Client disconnected: ${clientId}`);
          
          // Notify broadcaster that viewer disconnected
          if (store.broadcaster) {
            io.to(store.broadcaster).emit('viewer-disconnected', socket.id);
          }
        }
      });
      
      // Update all admin views
      io.emit('clients-update', Object.values(store.clients));
    });
  });
  
  // Handle Next.js requests
  server.all('*', (req, res) => {
    return handle(req, res);
  });
  
  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, () => {
    console.log(`[${new Date().toISOString()}] Server running on port ${PORT}`);
    console.log(`[${new Date().toISOString()}] Admin URL: http://localhost:${PORT}/admin`);
    console.log(`[${new Date().toISOString()}] Client URL example: http://localhost:${PORT}/client?clientId=client-1`);
  });
});