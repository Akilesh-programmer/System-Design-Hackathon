import React from 'react';
import { Terminal, Clock, Info, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

export interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

interface LiveLedgerProps {
  logs: LogEntry[];
  onClear: () => void;
}

export const LiveLedger: React.FC<LiveLedgerProps> = ({ logs, onClear }) => {
  const getIcon = (type: LogEntry['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 size={14} color="#34d399" />;
      case 'warning':
        return <AlertTriangle size={14} color="#fbbf24" />;
      case 'error':
        return <XCircle size={14} color="#fb7185" />;
      default:
        return <Info size={14} color="#818cf8" />;
    }
  };

  const getBadgeClass = (type: LogEntry['type']) => {
    switch (type) {
      case 'success':
        return 'badge-emerald';
      case 'warning':
        return 'badge-amber';
      case 'error':
        return 'badge-rose';
      default:
        return 'badge-indigo';
    }
  };

  return (
    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Terminal size={18} color="#818cf8" />
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Live System Ledger & Event Audit</h2>
        </div>
        <button
          onClick={onClear}
          className="btn btn-ghost"
          style={{ padding: '4px 10px', fontSize: '0.75rem' }}
        >
          Clear Stream
        </button>
      </div>

      <div style={{
        height: '180px',
        overflowY: 'auto',
        background: 'rgba(0, 0, 0, 0.45)',
        borderRadius: '10px',
        padding: '12px 14px',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.75rem',
      }}>
        {logs.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', textAlign: 'center', margin: 'auto' }}>
            Ledger idle. Reserve units or launch simulation to stream live events.
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                padding: '4px 0',
                borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
              }}
            >
              <span style={{ color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={11} />
                {log.timestamp}
              </span>
              <span className={`badge ${getBadgeClass(log.type)}`} style={{ padding: '2px 6px', fontSize: '0.6875rem' }}>
                {log.type}
              </span>
              <span style={{ color: 'var(--text-main)', flex: 1 }}>{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
