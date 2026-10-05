import React from 'react';
import { Zap, RefreshCw, Server, ShieldCheck, Database } from 'lucide-react';

interface HeaderProps {
  isConnected: boolean;
  isResetting: boolean;
  onReset: () => void;
  productId: string;
}

export const Header: React.FC<HeaderProps> = ({
  isConnected,
  isResetting,
  onReset,
  productId,
}) => {
  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '20px 32px',
      borderBottom: '1px solid var(--border-subtle)',
      background: 'rgba(17, 22, 34, 0.8)',
      backdropFilter: 'blur(12px)',
      position: 'sticky',
      top: 0,
      zIndex: 50,
    }}>
      {/* Brand & Context */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{
          width: '44px',
          height: '44px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 16px var(--color-primary-glow)',
        }}>
          <Zap size={24} color="#ffffff" />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
              Flash Sale Concurrency Engine
            </h1>
            <span className="badge badge-indigo">
              <ShieldCheck size={12} />
              Zero-Oversell Prototype
            </span>
          </div>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            High-contention simulation on <span className="font-mono" style={{ color: '#818cf8' }}>{productId}</span> (100 units max)
          </p>
        </div>
      </div>

      {/* Status & Quick Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 14px',
          borderRadius: '9999px',
          background: isConnected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
          border: `1px solid ${isConnected ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)'}`,
          fontSize: '0.8125rem',
          fontWeight: 600,
          color: isConnected ? '#34d399' : '#fb7185',
        }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: isConnected ? '#10b981' : '#f43f5e',
            boxShadow: isConnected ? '0 0 10px #10b981' : '0 0 10px #f43f5e',
          }} />
          <Server size={14} />
          <span>{isConnected ? 'Backend Live (:3000)' : 'Backend Disconnected'}</span>
        </div>

        <button
          onClick={onReset}
          disabled={isResetting}
          className="btn btn-ghost"
          style={{ padding: '8px 16px', fontSize: '0.8125rem' }}
          title="Resets Redis inventory and Postgres ledger back to 100 units"
        >
          <RefreshCw size={14} style={{ animation: isResetting ? 'spin 1s linear infinite' : 'none' }} />
          <span>{isResetting ? 'Resetting...' : 'Reset Demo (100 Units)'}</span>
        </button>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </header>
  );
};
