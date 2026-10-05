import React, { useState, useEffect, useCallback } from 'react';
import { api, InventoryStatusResponse } from './api/client';
import { Header } from './components/Header';
import { InventoryGauge } from './components/InventoryGauge';
import { ReservationSandbox } from './components/ReservationSandbox';
import { StressTestRunner } from './components/StressTestRunner';
import { StateFlowDiagram } from './components/StateFlowDiagram';
import { LiveLedger, LogEntry } from './components/LiveLedger';
import { Cpu, Database, Zap, Layers } from 'lucide-react';

export const App: React.FC = () => {
  const [status, setStatus] = useState<InventoryStatusResponse | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const productId = 'product_x';

  const logEvent = useCallback((message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const newEntry: LogEntry = {
      id: `log_${Date.now()}_${Math.random()}`,
      timestamp: new Date().toLocaleTimeString(),
      message,
      type,
    };
    setLogs((prev) => [newEntry, ...prev.slice(0, 99)]);
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.getStatus(productId);
      setStatus(data);
      setIsConnected(true);
    } catch (err) {
      setIsConnected(false);
    }
  }, [productId]);

  // Polling inventory status
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 1500);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await api.reset(productId, 100);
      logEvent('System state reset: 100 available units restored in Redis & Postgres.', 'success');
      await fetchStatus();
    } catch (err: any) {
      logEvent(`Failed to reset state: ${err.message}`, 'error');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header
        isConnected={isConnected}
        isResetting={isResetting}
        onReset={handleReset}
        productId={productId}
      />

      <main style={{
        flex: 1,
        maxWidth: '1440px',
        width: '100%',
        margin: '0 auto',
        padding: '32px 24px',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)',
        gap: '24px',
      }}>
        {/* Left Column: Live Gauges, Sandbox & 10k Stress Test */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <InventoryGauge status={status} />
          <ReservationSandbox
            productId={productId}
            onRefreshStatus={fetchStatus}
            onLogEvent={logEvent}
          />
          <StressTestRunner
            productId={productId}
            onRefreshStatus={fetchStatus}
            onLogEvent={logEvent}
          />
        </div>

        {/* Right Column: State Lifecycle, Event Ledger & Architecture Highlights */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <StateFlowDiagram />
          <LiveLedger logs={logs} onClear={() => setLogs([])} />

          {/* Architecture Rationale Card */}
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={18} color="#818cf8" />
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700 }}>System Design Highlights</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.8125rem' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <Cpu size={16} color="#34d399" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong style={{ color: '#e2e8f0' }}>Single-Threaded Redis Lua Fast-Path:</strong>
                  <div style={{ color: 'var(--text-muted)' }}>
                    Executes check-and-decrement in sub-millisecond memory, safely deflecting 9,900 concurrent rejections with 0 DB overhead.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <Zap size={16} color="#fbbf24" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong style={{ color: '#e2e8f0' }}>ZSET Reliable Lease Sweeper:</strong>
                  <div style={{ color: 'var(--text-muted)' }}>
                    Recovers expired holds via Sorted Sets with 0-loss guarantee even during server restarts.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <Database size={16} color="#818cf8" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong style={{ color: '#e2e8f0' }}>Async Write-Behind Durability:</strong>
                  <div style={{ color: 'var(--text-muted)' }}>
                    PostgreSQL persistence and immutable ledger entries are updated asynchronously to preserve raw reservation throughput.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer style={{
        padding: '20px',
        textAlign: 'center',
        fontSize: '0.75rem',
        color: 'var(--text-dim)',
        borderTop: '1px solid var(--border-subtle)',
      }}>
        System Design Hackathon Prototype | NestJS + PostgreSQL + Redis + React
      </footer>
    </div>
  );
};

export default App;
