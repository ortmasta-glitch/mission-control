'use client';

import { useGatewayStatus } from '@/hooks/useGatewayStatus';

interface GatewayStatusIndicatorProps {
  /** Show extended details (latency, session count). Default: false */
  verbose?: boolean;
  /** Size variant */
  size?: 'sm' | 'md';
}

export function GatewayStatusIndicator({ verbose = false, size = 'sm' }: GatewayStatusIndicatorProps) {
  const status = useGatewayStatus();

  const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3';
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs';

  return (
    <div className="flex items-center gap-1.5" title={`Gateway: ${status.connectionState}${status.lastError ? ` — ${status.lastError}` : ''}${status.latencyMs ? ` | ${status.latencyMs}ms` : ''}`}>
      <span className={`${dotSize} rounded-full ${status.colorClass} ${status.connectionState === 'connecting' ? 'animate-pulse' : ''}`} />
      <span className={`${textSize} font-medium uppercase tracking-wider ${
        status.connectionState === 'connected' ? 'text-mc-accent-green' :
        status.connectionState === 'degraded' ? 'text-yellow-400' :
        status.connectionState === 'connecting' ? 'text-yellow-400' :
        status.connectionState === 'unconfigured' ? 'text-gray-400' :
        'text-mc-accent-red'
      }`}>
        {status.label}
      </span>
      {verbose && status.isFunctional && (
        <>
          {status.latencyMs !== null && (
            <span className="text-[10px] text-mc-text-secondary ml-1">
              {status.latencyMs}ms
            </span>
          )}
          {status.activeSessions > 0 && (
            <span className="text-[10px] text-mc-text-secondary ml-1">
              {status.activeSessions} session{status.activeSessions !== 1 ? 's' : ''}
            </span>
          )}
        </>
      )}
    </div>
  );
}