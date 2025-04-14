import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import os from 'os';
import si from 'systeminformation';
import cors from 'cors';

const app = express();
const METRIC_INTERVAL = 1000; // 1 second for more responsive updates
const PROCESS_LIMIT = 10;

app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  pingTimeout: 5000,
  pingInterval: 2000
});

let processOffset = 0;
let metricsCache = null;
let metricsCacheTime = 0;
const CACHE_DURATION = 500; // 500ms cache to prevent excessive CPU usage

async function getSystemInfo() {
  try {
    const [cpu, mem, osInfo, graphics, cpuTemp] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.osInfo(),
      si.graphics(),
      si.cpuTemperature()
    ]);

    return {
      cpu: {
        manufacturer: cpu.manufacturer,
        brand: cpu.brand,
        physicalCores: cpu.physicalCores,
        cores: cpu.cores,
        speed: cpu.speed,
        temperature: cpuTemp.main || null
      },
      memory: {
        total: mem.total,
        free: mem.available,
        used: mem.active,
        swapTotal: mem.swaptotal,
        swapUsed: mem.swapused,
        cacheMemory: mem.cached
      },
      os: {
        platform: osInfo.platform,
        distro: osInfo.distro,
        release: osInfo.release,
        kernel: osInfo.kernel,
        arch: osInfo.arch
      },
      gpu: graphics.controllers.map(controller => ({
        model: controller.model,
        vendor: controller.vendor,
        vram: controller.vram,
        driver: controller.driver
      }))
    };
  } catch (error) {
    console.error('Error getting system information:', error);
    return null;
  }
}

async function getProcesses() {
  try {
    const [processes, users] = await Promise.all([
      si.processes(),
      si.users()
    ]);

    const userMap = new Map(users.map(user => [user.pid, user.user]));
    const totalMem = os.totalmem();

    // Rotate through processes
    processOffset = (processOffset + PROCESS_LIMIT) % Math.max(processes.list.length, PROCESS_LIMIT);

    return processes.list
      .map(process => ({
        pid: process.pid,
        name: process.name,
        cpu: process.cpu ? Math.min(process.cpu, 100) : 0,
        memory: process.memRss ? Math.min((process.memRss / totalMem) * 100, 100) : 0,
        memoryRaw: process.memRss || 0,
        status: process.state || 'unknown',
        started: process.started,
        user: userMap.get(process.pid) || process.user || 'system',
        command: process.command || '',
        path: process.path || ''
      }))
      .filter(process => process.cpu > 0 || process.memory > 0)
      .sort((a, b) => b.cpu - a.cpu || b.memory - a.memory)
      .slice(processOffset, processOffset + PROCESS_LIMIT);
  } catch (error) {
    console.error('Error getting process list:', error);
    return [];
  }
}

async function getMetrics(force = false) {
  const now = Date.now();
  
  if (!force && metricsCache && (now - metricsCacheTime) < CACHE_DURATION) {
    return metricsCache;
  }

  try {
    const [currentLoad, memory, fsSize, time, cpuTemp] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.time(),
      si.cpuTemperature()
    ]);

    const processes = await getProcesses();
    const cpus = os.cpus();

    const metrics = {
      timestamp: now,
      bootTime: time.boottime * 1000,
      memory: {
        total: memory.total,
        free: memory.available,
        used: memory.active,
        percentage: Math.min((memory.active / memory.total) * 100, 100),
        swap: {
          total: memory.swaptotal,
          used: memory.swapused,
          free: memory.swapfree,
          percentage: memory.swaptotal ? 
            Math.min((memory.swapused / memory.swaptotal) * 100, 100) : 0
        }
      },
      cpu: {
        cores: cpus.length,
        threads: cpus.length,
        usage: currentLoad.cpus.map(cpu => Math.min(cpu.load, 100)),
        threadUsage: currentLoad.cpus.map(cpu => Math.min(cpu.load, 100)),
        averageUsage: Math.min(currentLoad.currentLoad, 100),
        temperature: cpuTemp.main || null,
        speed: cpus[0].speed
      },
      loadAverage: os.loadavg(),
      uptime: os.uptime(),
      processes,
      disk: fsSize
        .filter(fs => fs.size > 0)
        .map(fs => ({
          device: fs.fs,
          type: fs.type,
          total: fs.size,
          used: fs.used,
          free: fs.size - fs.used,
          percentage: Math.min((fs.used / fs.size) * 100, 100),
          mount: fs.mount
        }))
    };

    metricsCache = metrics;
    metricsCacheTime = now;

    return metrics;
  } catch (error) {
    console.error('Error getting metrics:', error);
    return metricsCache || null;
  }
}

io.on('connection', async (socket) => {
  console.log('Client connected');
  let metricsInterval;

  try {
    const sysInfo = await getSystemInfo();
    if (sysInfo) {
      socket.emit('systemInfo', sysInfo);
    }

    const initialMetrics = await getMetrics(true);
    if (initialMetrics) {
      socket.emit('metrics', initialMetrics);
    }

    metricsInterval = setInterval(async () => {
      if (socket.connected) {
        const metrics = await getMetrics();
        if (metrics) {
          socket.emit('metrics', metrics);
        }
      }
    }, METRIC_INTERVAL);

  } catch (error) {
    console.error('Error in socket connection:', error);
  }

  socket.on('disconnect', () => {
    console.log('Client disconnected');
    if (metricsInterval) {
      clearInterval(metricsInterval);
    }
  });
});

app.delete('/process/:pid', async (req, res) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const pid = parseInt(req.params.pid);
    if (isNaN(pid)) {
      return res.status(400).json({ error: 'Invalid PID' });
    }

    // Check if process exists before attempting to kill it
    try {
      process.kill(pid, 0); // Test if process exists
    } catch (e) {
      return res.status(404).json({ error: 'Process not found' });
    }

    try {
      // First try SIGTERM for graceful shutdown
      process.kill(pid, 'SIGTERM');
      
      // Give the process a moment to terminate gracefully
      setTimeout(() => {
        try {
          // Check if process still exists
          process.kill(pid, 0);
          // If we get here, process is still running, try SIGKILL
          process.kill(pid, 'SIGKILL');
        } catch (e) {
          // Process already terminated
        }
      }, 500);

      res.json({ success: true });
    } catch (error) {
      console.error('Error terminating process:', error);
      res.status(500).json({ error: 'Failed to terminate process' });
    }
  } catch (error) {
    console.error('Error in process termination:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});