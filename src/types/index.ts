export interface SystemInfoData {
  cpuCores: number;
  platform: string;
  hostname: string;
  arch: string;
}

export interface SystemMetrics {
  timestamp: number;
  memory: {
    total: number;
    free: number;
    used: number;
    percentage: number;
  };
  cpu: {
    cores: number;
    usage: number[];
    averageUsage: number;
  };
  loadAverage: number[];
  uptime: number;
}

export interface NetworkRequest {
  url: string;
  duration: number;
  timestamp: number;
}