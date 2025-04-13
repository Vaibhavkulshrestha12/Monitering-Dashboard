import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import os from 'os';
import si from 'systeminformation';
import cors from 'cors';

const app = express();
app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"]
  },
  pingTimeout: 10000,
  pingInterval: 5000
});

// Optimize cache duration
const CACHE_DURATION = 2000; // 2 second cache
let metricsCache = null;
let metricsCacheTime = 0;

async function getSystemInfo() {
  try {
    const [cpu, mem, osInfo, graphics] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.osInfo(),
      si.graphics()
    ]);

    return {
      cpu: {
        manufacturer: cpu.manufacturer,
        brand: cpu.brand,
        physicalCores: cpu.physicalCores,
        cores: cpu.cores,
        speed: cpu.speed
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

async function getDiskInfo() {
  try {
    const [fsSize, blockDevices] = await Promise.all([
      si.fsSize(),
      si.blockDevices()
    ]);

    const devices = new Map(blockDevices.map(device => [device.mount, device]));

    return fsSize
      .filter(fs => fs.size > 0)
      .map(fs => {
        const device = devices.get(fs.mount);
        return {
          device: fs.fs,
          type: fs.type,
          total: fs.size,
          used: fs.used,
          free: fs.size - fs.used,
          percentage: Math.round((fs.used / fs.size) * 100 * 10) / 10,
          mount: fs.mount,
          physical: device ? {
            name: device.name,
            type: device.type,
            vendor: device.vendor,
            size: device.size,
            protocol: device.protocol
          } : null
        };
      });
  } catch (error) {
    console.error('Error getting disk information:', error);
    return [];
  }
}

async function getProcessList() {
  try {
    const [processes, users] = await Promise.all([
      si.processes(),
      si.users()
    ]);

    const processUsers = new Map(users.map(user => [user.pid, user.user]));
    const totalMem = os.totalmem();

    const allProcesses = processes.list
      .map(process => ({
        pid: process.pid,
        name: process.name,
        cpu: Math.round(process.cpu * 10) / 10 || 0,
        memory: Math.round((process.memRss / totalMem) * 100 * 10) / 10,
        memoryRaw: process.memRss,
        status: process.state || 'unknown',
        started: process.started,
        user: processUsers.get(process.pid) || process.user || 'system',
        command: process.command || '',
        path: process.path || ''
      }))
      .sort((a, b) => b.cpu - a.cpu || b.memory - a.memory)
      .slice(0, 10); // Always show top 10 processes

    return allProcesses;
  } catch (error) {
    console.error('Error getting process list:', error);
    return [];
  }
}

async function getCpuUsage() {
  try {
    const [load, temp, speed] = await Promise.all([
      si.currentLoad(),
      si.cpuTemperature(),
      si.cpuCurrentSpeed()
    ]);

    return {
      cores: os.cpus().length,
      threads: os.cpus().length,
      usage: load.cpus.map(core => Math.min(core.load, 100)),
      threadUsage: load.cpus.map(core => Math.min(core.load, 100)),
      averageUsage: Math.min(load.currentLoad, 100),
      temperature: temp.main,
      speed: speed.avg
    };
  } catch (error) {
    console.error('Error getting CPU usage:', error);
    return {
      cores: 0,
      threads: 0,
      usage: [],
      threadUsage: [],
      averageUsage: 0,
      temperature: null,
      speed: 0
    };
  }
}

async function getSystemMetrics(force = false) {
  const now = Date.now();
  
  if (!force && metricsCache && (now - metricsCacheTime) < CACHE_DURATION) {
    return metricsCache;
  }

  try {
    const [memData, cpuData, processes, disks, time] = await Promise.all([
      si.mem(),
      getCpuUsage(),
      getProcessList(),
      getDiskInfo(),
      si.time()
    ]);

    const metrics = {
      timestamp: now,
      bootTime: time.boottime * 1000,
      memory: {
        total: memData.total,
        free: memData.available,
        used: memData.active,
        percentage: Math.min((memData.active / memData.total) * 100, 100),
        swap: {
          total: memData.swaptotal,
          used: memData.swapused,
          free: memData.swapfree,
          percentage: memData.swaptotal ? Math.min((memData.swapused / memData.swaptotal) * 100, 100) : 0
        }
      },
      cpu: cpuData,
      loadAverage: os.loadavg(),
      uptime: os.uptime(),
      processes,
      disk: disks
    };

    metricsCache = metrics;
    metricsCacheTime = now;

    return metrics;
  } catch (error) {
    console.error('Error getting system metrics:', error);
    return metricsCache || null;
  }
}

io.on('connection', async (socket) => {
  console.log('Client connected');
  let metricsInterval;

  try {
    // Send initial system information
    const sysInfo = await getSystemInfo();
    if (sysInfo) {
      socket.emit('systemInfo', sysInfo);
    }

    // Send initial metrics
    const initialMetrics = await getSystemMetrics(true);
    if (initialMetrics) {
      socket.emit('metrics', initialMetrics);
    }

    // Update metrics every 2 seconds
    metricsInterval = setInterval(async () => {
      const metrics = await getSystemMetrics();
      if (metrics) {
        socket.emit('metrics', metrics);
      }
    }, 2000);

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

// Process termination endpoint
app.delete('/process/:pid', async (req, res) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const pid = parseInt(req.params.pid);
    if (isNaN(pid)) {
      return res.status(400).json({ error: 'Invalid PID' });
    }

    try {
      process.kill(pid, 0);
    } catch (e) {
      return res.status(404).json({ error: 'Process not found' });
    }

    try {
      process.kill(pid, 'SIGTERM');
      
      setTimeout(() => {
        try {
          process.kill(pid, 0);
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