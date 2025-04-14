import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { SystemMetrics, SystemInfoData } from '../types';

const SOCKET_URL = 'http://localhost:3000';
const MAX_METRICS_HISTORY = 30;
const RECONNECT_DELAY = 2000;
const MAX_RECONNECT_ATTEMPTS = 3;

export function usePerformanceMetrics() {
  const [metrics, setMetrics] = useState<SystemMetrics[]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfoData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const connectSocket = () => {
      if (socketRef.current?.connected) {
        return;
      }

      const socket = io(SOCKET_URL, {
        transports: ['websocket'],
        reconnection: false,
        timeout: 5000
      });

      socket.on('connect', () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        reconnectAttempts.current = 0;
      });

      socket.on('disconnect', () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        handleReconnect();
      });

      socket.on('systemInfo', (info: SystemInfoData) => {
        setSystemInfo(info);
      });

      socket.on('metrics', (newMetrics: SystemMetrics) => {
        setMetrics((prevMetrics) => {
          const updatedMetrics = [...prevMetrics, {
            ...newMetrics,
            cpu: {
              ...newMetrics.cpu,
              averageUsage: Math.min(newMetrics.cpu.averageUsage, 100),
              threadUsage: newMetrics.cpu.threadUsage.map(usage => 
                Math.min(usage, 100)
              )
            },
            memory: {
              ...newMetrics.memory,
              percentage: Math.min(
                (newMetrics.memory.used / newMetrics.memory.total) * 100,
                100
              )
            }
          }];

          return updatedMetrics.slice(-MAX_METRICS_HISTORY);
        });
      });

      socketRef.current = socket;
      return socket;
    };

    const handleReconnect = () => {
      if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
        console.log(`Reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) exceeded`);
        return;
      }

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
      }, RECONNECT_DELAY);
    };

    const socket = connectSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socket) {
        socket.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  return { metrics, systemInfo, isConnected };
}