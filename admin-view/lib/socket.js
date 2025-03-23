import { io } from 'socket.io-client';
import { useEffect, useState, useRef } from 'react';

export const useSocket = () => {
  const [socket, setSocket] = useState(null);
  const isConnecting = useRef(false);
  
  useEffect(() => {
    // Prevent multiple connection attempts
    if (isConnecting.current) return;
    isConnecting.current = true;
    
    const socketInstance = io(process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin, {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      // Reduce the number of pings to prevent connection overload
      pingInterval: 10000,
      pingTimeout: 5000,
      transports: ['websocket', 'polling']
    });
    
    socketInstance.on('connect', () => {
      console.log('Socket connected:', socketInstance.id);
      setSocket(socketInstance);
    });
    
    socketInstance.on('disconnect', () => {
      console.log('Socket disconnected');
    });
    
    socketInstance.on('connect_error', (err) => {
      console.log('Socket connection error:', err);
      setTimeout(() => {
        // Only try to reconnect if we're not already connected
        if (socketInstance.disconnected) {
          socketInstance.connect();
        }
      }, 2000);
    });
    
    return () => {
      isConnecting.current = false;
      if (socketInstance) {
        socketInstance.disconnect();
      }
    };
  }, []);
  
  return socket;
};