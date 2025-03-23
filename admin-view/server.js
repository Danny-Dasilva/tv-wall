const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const next = require('next');

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
  const clients = {};
  let broadcaster = null;
  
  io.on('connection', (socket) => {
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
    socket.on('register-as-viewer', (config) => {
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
    socket.on('get-client-config', ({ clientId }) => {
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
    socket.on('update-client-config', ({ clientId, config }) => {
      if (clients[clientId]) {
        clients[clientId] = {
          ...clients[clientId],
          ...config,
        };
        
        // Notify the client of its updated config
        if (clients[clientId].socketId) {
          io.to(clients[clientId].socketId).emit('client-config', clients[clientId]);
        }
        
        // Update all admin views
        io.emit('clients-update', Object.values(clients));
      }
    });
    
    // WebRTC signaling - more robust error handling
    socket.on('broadcaster-offer', ({ viewerId, offer }) => {
      if (!viewerId) {
        console.log('Invalid broadcaster offer - missing viewerId');
        return;
      }
      
      console.log(`Broadcaster sending offer to viewer: ${viewerId}`);
      io.to(viewerId).emit('broadcaster-offer', { offer });
    });
    
    socket.on('viewer-answer', ({ answer }) => {
      if (!broadcaster) {
        console.log('Received viewer answer but no broadcaster registered');
        return;
      }
      
      console.log(`Viewer ${socket.id} sending answer to broadcaster`);
      io.to(broadcaster).emit('viewer-answer', { viewerId: socket.id, answer });
    });
    
    socket.on('broadcaster-ice-candidate', ({ viewerId, candidate }) => {
      if (!viewerId) {
        console.log('Invalid broadcaster ICE candidate - missing viewerId');
        return;
      }
      
      console.log(`Broadcaster sending ICE candidate to viewer: ${viewerId}`);
      io.to(viewerId).emit('broadcaster-ice-candidate', { candidate });
    });
    
    socket.on('viewer-ice-candidate', ({ candidate }) => {
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