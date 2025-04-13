import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { SystemMetrics, SystemInfoData } from '../types';

const SOCKET_URL = 'http://localhost:3000';
const MAX_METRICS_HISTORY = 30;
const RECONNECT_DELAY = 5000;
const MAX_RECONNECT_ATTEMPTS = 3;
const METRICS_UPDATE_INTERVAL = 3000; // Increased to 3 seconds

export function usePerformanceMetrics() {
  const [metrics, setMetrics] = useState<SystemMetrics[]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfoData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const connectSocket = () => {
      if (socketRef.current?.connected) return;

      const socket = io(SOCKET_URL, {
        transports: ['websocket'],
        reconnection: false,
        timeout: 10000, // Increased timeout
        forceNew: true
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        reconnectAttempts.current = 0;
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      });

      socket.on('disconnect', () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        handleReconnect();
      });

      socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        setIsConnected(false);
        handleReconnect();
      });

      socket.on('systemInfo', (info: SystemInfoData) => {
        setSystemInfo(info);
      });

      socket.on('metrics', (newMetrics: SystemMetrics) => {
        setMetrics(prev => {
          const updated = [...prev, {
            ...newMetrics,
            cpu: {
              ...newMetrics.cpu,
              averageUsage: parseFloat(newMetrics.cpu.averageUsage.toFixed(1)),
              threadUsage: newMetrics.cpu.threadUsage.map(usage => 
                parseFloat(Math.min(usage, 100).toFixed(1))
              )
            },
            memory: {
              ...newMetrics.memory,
              percentage: parseFloat(((newMetrics.memory.used / newMetrics.memory.total) * 100).toFixed(1))
            }
          }];
          return updated.slice(-MAX_METRICS_HISTORY);
        });
      });

      return socket;
    };

    const handleReconnect = () => {
      if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
        console.log('Max reconnection attempts reached');
        return;
      }

      const delay = RECONNECT_DELAY * Math.pow(2, reconnectAttempts.current);
      console.log(`Attempting reconnect in ${delay}ms`);

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectAttempts.current += 1;
        console.log(`Reconnection attempt ${reconnectAttempts.current}/${MAX_RECONNECT_ATTEMPTS}`);
        
        if (socketRef.current) {
          socketRef.current.connect();
        } else {
          connectSocket();
        }
      }, delay);
    };

    const socket = connectSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socket) {
        socket.removeAllListeners();
        socket.close();
        socketRef.current = null;
      }
    };
  }, []);

  return {
    metrics,
    systemInfo,
    isConnected
  };
}