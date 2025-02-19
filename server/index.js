import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import os from 'os';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});


function getCpuUsage() {
  return new Promise((resolve) => {
    const startMeasure = os.cpus();
    
    setTimeout(() => {
      const endMeasure = os.cpus();
      const cpuPercentages = startMeasure.map((startCpu, i) => {
        const endCpu = endMeasure[i];

        const idleDiff = endCpu.times.idle - startCpu.times.idle;
        const totalDiff = Object.keys(endCpu.times).reduce(
          (acc, type) => acc + (endCpu.times[type] - startCpu.times[type]),
          0
        );

        return 100 - (100 * idleDiff) / totalDiff;
      });

      resolve({
        cores: cpuPercentages.length,
        usage: cpuPercentages,
        averageUsage: cpuPercentages.reduce((acc, usage) => acc + usage, 0) / cpuPercentages.length
      });
    }, 1000); // Measure CPU usage over 1 second
  });
}

// Function to get system metrics
async function getSystemMetrics() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = {
    total: totalMemory,
    free: freeMemory,
    used: usedMemory,
    percentage: (usedMemory / totalMemory) * 100
  };

  const cpuData = await getCpuUsage(); // Wait for CPU usage calculation

  return {
    timestamp: Date.now(),
    memory: memoryUsage,
    cpu: cpuData,
    loadAverage: os.loadavg(),
    uptime: os.uptime()
  };
}

io.on('connection', (socket) => {
  console.log('Client connected');

  // Send system info on connection
  socket.emit('systemInfo', {
    cpuCores: os.cpus().length,
    platform: os.platform(),
    hostname: os.hostname(),
    arch: os.arch()
  });

  // Send metrics every second
  const metricsInterval = setInterval(async () => {
    const metrics = await getSystemMetrics();
    socket.emit('metrics', metrics);
  }, 1000);

  socket.on('disconnect', () => {
    console.log('Client disconnected');
    clearInterval(metricsInterval);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
