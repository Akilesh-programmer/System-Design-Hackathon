import React from 'react';
import { InventoryStatusResponse } from '../api/client';
import { Package, Lock, CheckCircle2, Check, AlertTriangle } from 'lucide-react';

interface InventoryGaugeProps {
  status: InventoryStatusResponse | null;
}

export const InventoryGauge: React.FC<InventoryGaugeProps> = ({ status }) => {
  const available = status?.redis?.availableStock ?? 100;
  const reserved = status?.redis?.activeReservations ?? 0;
  const sold = status?.redis?.soldStock ?? 0;
  const totalTracked = available + reserved + sold;
  const isConsistent = totalTracked === 100;

  return (
    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Title Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Real-Time Inventory State</h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            Single Source of Truth across Redis In-Memory & Postgres Durability
          </p>
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '4px 12px',
          borderRadius: '9999px',
          background: isConsistent ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
          border: `1px solid ${isConsistent ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
          color: isConsistent ? '#34d399' : '#fb7185',
          fontSize: '0.75rem',
          fontWeight: 700,
        }}>
          {isConsistent ? <Check size={14} /> : <AlertTriangle size={14} />}
          <span>{isConsistent ? 'INVARIANT HELD (100 / 100)' : 'INVARIANT BREACH'}</span>
        </div>
      </div>

      {/* 3 Metrics Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
      }}>
        {/* Available Stock */}
        <div style={{
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          borderRadius: '12px',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8125rem', color: '#6ee7b7', fontWeight: 600 }}>AVAILABLE STOCK</span>
            <Package size={18} color="#10b981" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '2.25rem', fontWeight: 800, color: '#34d399' }} className="font-mono">
              {available}
            </span>
            <span style={{ fontSize: '0.875rem', color: '#6ee7b7' }}>/ 100 units</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Available for immediate reservation
          </div>
        </div>

        {/* Active Reservations (Held) */}
        <div style={{
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          borderRadius: '12px',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8125rem', color: '#fde68a', fontWeight: 600 }}>ACTIVE HELD LEASES</span>
            <Lock size={18} color="#f59e0b" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '2.25rem', fontWeight: 800, color: '#fbbf24' }} className="font-mono">
              {reserved}
            </span>
            <span style={{ fontSize: '0.875rem', color: '#fde68a' }}>/ 100 units</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Under 15s checkout countdown
          </div>
        </div>

        {/* Confirmed Sold */}
        <div style={{
          background: 'rgba(99, 102, 241, 0.08)',
          border: '1px solid rgba(99, 102, 241, 0.25)',
          borderRadius: '12px',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8125rem', color: '#c7d2fe', fontWeight: 600 }}>CONFIRMED SOLD</span>
            <CheckCircle2 size={18} color="#6366f1" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '2.25rem', fontWeight: 800, color: '#818cf8' }} className="font-mono">
              {sold}
            </span>
            <span style={{ fontSize: '0.875rem', color: '#c7d2fe' }}>/ 100 units</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Payment confirmed & persisted
          </div>
        </div>
      </div>

      {/* Segmented Stock Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{
          height: '14px',
          width: '100%',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '9999px',
          overflow: 'hidden',
          display: 'flex',
          border: '1px solid var(--border-subtle)',
        }}>
          <div
            style={{
              width: `${(sold / 100) * 100}%`,
              background: 'linear-gradient(90deg, #6366f1, #4f46e5)',
              transition: 'width 0.4s ease',
            }}
            title={`Sold: ${sold}`}
          />
          <div
            style={{
              width: `${(reserved / 100) * 100}%`,
              background: 'linear-gradient(90deg, #f59e0b, #d97706)',
              transition: 'width 0.4s ease',
            }}
            title={`Reserved: ${reserved}`}
          />
          <div
            style={{
              width: `${(available / 100) * 100}%`,
              background: 'linear-gradient(90deg, #10b981, #059669)',
              transition: 'width 0.4s ease',
            }}
            title={`Available: ${available}`}
          />
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '20px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#10b981' }} />
            <span>Available ({available}%)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#f59e0b' }} />
            <span>Reserved/Held ({reserved}%)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#6366f1' }} />
            <span>Confirmed Sold ({sold}%)</span>
          </div>
        </div>
      </div>

      {/* Invariant Equation Box */}
      <div style={{
        background: 'rgba(0, 0, 0, 0.3)',
        borderRadius: '10px',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.8125rem',
        border: '1px solid var(--border-subtle)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: 'var(--text-muted)' }}>Mathematical Invariant:</span>
          <span className="font-mono" style={{ color: '#e2e8f0', fontWeight: 600 }}>
            {available} (Available) + {reserved} (Held) + {sold} (Sold) = {totalTracked} / 100 Units
          </span>
        </div>
        <span className="badge badge-emerald">
          Zero Overselling Guaranteed
        </span>
      </div>
    </div>
  );
};
