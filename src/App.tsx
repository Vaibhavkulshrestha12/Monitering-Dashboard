
import { MemoryStick as Memory, Cpu, Network, Clock } from 'lucide-react';
import { Header } from './components/Header';
import { MetricCard } from './components/MetricCard';
import { PerformanceGraph } from './components/PerformanceGraph';
import { NetworkTable } from './components/NetworkTable';
import { SystemInfo } from './components/SystemInfo';
import { usePerformanceMetrics } from './hooks/usePerformanceMetrics';

function App() {
  const { metrics, systemInfo, networkRequests, isConnected } = usePerformanceMetrics();
  const latestMetrics = metrics[metrics.length - 1];

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <Header />
        <SystemInfo info={systemInfo} isConnected={isConnected} />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <MetricCard
            icon={Memory}
            title="Memory Usage"
            value={latestMetrics ? `${latestMetrics.memory.percentage.toFixed(1)}%` : 'N/A'}
          />
          <MetricCard
            icon={Cpu}
            title="CPU Usage"
            value={latestMetrics ? `${latestMetrics.cpu.averageUsage.toFixed(1)}%` : 'N/A'}
          />
          <MetricCard
            icon={Network}
            title="Network Requests"
            value={networkRequests.length.toString()}
          />
          <MetricCard
            icon={Clock}
            title="Uptime"
            value={latestMetrics ? `${Math.floor(latestMetrics.uptime / 3600)}h ${Math.floor((latestMetrics.uptime % 3600) / 60)}m` : 'N/A'}
          />
        </div>

        <PerformanceGraph data={metrics} />
        <NetworkTable requests={networkRequests} />
      </div>
    </div>
  );
}

export default App;