import React from 'react';
import { ArrowRight, RotateCcw, Check, Sparkles } from 'lucide-react';

export const StateFlowDiagram: React.FC = () => {
  return (
    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Reservation State Lifecycle</h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            Finite State Machine governing inventory transitions, TTL leases, and rollback releases
          </p>
        </div>
        <span className="badge badge-indigo">
          <Sparkles size={12} />
          State Flow
        </span>
      </div>

      {/* Lifecycle Visual Pipeline */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px',
        padding: '16px 12px',
        background: 'rgba(0, 0, 0, 0.3)',
        borderRadius: '12px',
        border: '1px solid var(--border-subtle)',
      }}>
        {/* Step 1: AVAILABLE */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
          padding: '8px 14px',
          borderRadius: '8px',
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
        }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#34d399' }}>1. AVAILABLE</span>
          <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>In stock pool</span>
        </div>

        <ArrowRight size={16} color="var(--text-dim)" />

        {/* Step 2: RESERVED */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
          padding: '8px 14px',
          borderRadius: '8px',
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
        }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#fbbf24' }}>2. RESERVED</span>
          <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>15s Atomic Lease</span>
        </div>

        <ArrowRight size={16} color="var(--text-dim)" />

        {/* Step 3: PAYMENT_PENDING */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
          padding: '8px 14px',
          borderRadius: '8px',
          background: 'rgba(6, 182, 212, 0.1)',
          border: '1px solid rgba(6, 182, 212, 0.3)',
        }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8' }}>3. PAYMENT_PENDING</span>
          <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>Gateway processing</span>
        </div>

        <ArrowRight size={16} color="var(--text-dim)" />

        {/* Step 4: CONFIRMED */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
          padding: '8px 14px',
          borderRadius: '8px',
          background: 'rgba(99, 102, 241, 0.1)',
          border: '1px solid rgba(99, 102, 241, 0.3)',
        }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#818cf8' }}>4. CONFIRMED</span>
          <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>Payment Verified</span>
        </div>

        <ArrowRight size={16} color="var(--text-dim)" />

        {/* Step 5: SOLD */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
          padding: '8px 14px',
          borderRadius: '8px',
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(16, 185, 129, 0.2))',
          border: '1px solid rgba(99, 102, 241, 0.4)',
        }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#a5b4fc' }}>5. SOLD</span>
          <span style={{ fontSize: '0.6875rem', color: '#6ee7b7' }}>Fulfillment Done</span>
        </div>
      </div>

      {/* Rollback & Release Paths */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 14px',
          background: 'rgba(244, 63, 94, 0.06)',
          border: '1px dashed rgba(244, 63, 94, 0.3)',
          borderRadius: '8px',
          fontSize: '0.75rem',
        }}>
          <RotateCcw size={16} color="#fb7185" />
          <div>
            <strong style={{ color: '#fb7185' }}>TTL Expiry Branch (ZSET Sweeper):</strong>
            <div style={{ color: 'var(--text-muted)' }}>RESERVED → EXPIRED → Stock Restored (+1)</div>
          </div>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 14px',
          background: 'rgba(244, 63, 94, 0.06)',
          border: '1px dashed rgba(244, 63, 94, 0.3)',
          borderRadius: '8px',
          fontSize: '0.75rem',
        }}>
          <RotateCcw size={16} color="#fb7185" />
          <div>
            <strong style={{ color: '#fb7185' }}>Payment Failure Branch:</strong>
            <div style={{ color: 'var(--text-muted)' }}>PAYMENT_PENDING → CANCELLED → Stock Restored (+1)</div>
          </div>
        </div>
      </div>
    </div>
  );
};
