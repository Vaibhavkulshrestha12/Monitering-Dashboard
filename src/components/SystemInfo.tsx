
import { SystemInfoData } from '../types';
import { Cpu, Server, Hash, Monitor } from 'lucide-react';

interface SystemInfoProps {
  info: SystemInfoData | null;
  isConnected: boolean;
}

export function SystemInfo({ info, isConnected }: SystemInfoProps) {
  if (!info) return null;

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">System Information</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm">Status:</span>
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm">{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="flex items-center gap-3">
          <Cpu className="w-5 h-5 text-indigo-600" />
          <div>
            <p className="text-sm text-gray-500">CPU Cores</p>
            <p className="font-semibold">{info.cpuCores}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Server className="w-5 h-5 text-indigo-600" />
          <div>
            <p className="text-sm text-gray-500">Platform</p>
            <p className="font-semibold">{info.platform}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Monitor className="w-5 h-5 text-indigo-600" />
          <div>
            <p className="text-sm text-gray-500">Hostname</p>
            <p className="font-semibold">{info.hostname}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Hash className="w-5 h-5 text-indigo-600" />
          <div>
            <p className="text-sm text-gray-500">Architecture</p>
            <p className="font-semibold">{info.arch}</p>
          </div>
        </div>
      </div>
    </div>
  );
}