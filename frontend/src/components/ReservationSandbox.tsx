import React, { useState, useEffect } from 'react';
import { api, ReserveResponse } from '../api/client';
import { ShoppingBag, Timer, CheckCircle, XCircle, Copy, AlertCircle, Sparkles } from 'lucide-react';

interface ActiveReservation {
  id: string;
  userId: string;
  productId: string;
  quantity: number;
  remainingStock: number;
  expiresAtMs: number;
  idempotencyKey: string;
}

interface ReservationSandboxProps {
  productId: string;
  onRefreshStatus: () => void;
  onLogEvent: (event: string, type: 'info' | 'success' | 'warning' | 'error') => void;
}

export const ReservationSandbox: React.FC<ReservationSandboxProps> = ({
  productId,
  onRefreshStatus,
  onLogEvent,
}) => {
  const [userId, setUserId] = useState(`user_${Math.floor(Math.random() * 9000 + 1000)}`);
  const [isLoading, setIsLoading] = useState(false);
  const [activeReservation, setActiveReservation] = useState<ActiveReservation | null>(null);
  const [timeLeftMs, setTimeLeftMs] = useState<number>(0);
  const [idempotencyMsg, setIdempotencyMsg] = useState<string | null>(null);

  // Live Countdown Timer
  useEffect(() => {
    if (!activeReservation) return;

    const interval = setInterval(() => {
      const remaining = activeReservation.expiresAtMs - Date.now();
      if (remaining <= 0) {
        setTimeLeftMs(0);
        setActiveReservation(null);
        onLogEvent(`Reservation [${activeReservation.id}] expired. Leased stock returned to pool by background sweeper.`, 'warning');
        onRefreshStatus();
        clearInterval(interval);
      } else {
        setTimeLeftMs(remaining);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [activeReservation]);

  const handleReserve = async (useDuplicateKey = false) => {
    setIsLoading(true);
    setIdempotencyMsg(null);

    const key = useDuplicateKey && activeReservation
      ? activeReservation.idempotencyKey
      : `idemp_ui_${userId}_${Date.now()}`;

    try {
      const res: ReserveResponse = await api.reserve({
        productId,
        userId,
        quantity: 1,
        idempotencyKey: key,
      });

      if (res.status === 'RESERVED' && res.reservationId) {
        const expiresAtMs = new Date(res.expiresAt!).getTime();
        setActiveReservation({
          id: res.reservationId,
          userId,
          productId,
          quantity: res.quantity || 1,
          remainingStock: res.remainingStock || 0,
          expiresAtMs,
          idempotencyKey: key,
        });
        setTimeLeftMs(expiresAtMs - Date.now());
        onLogEvent(`Reserved 1 unit for ${userId} (ID: ${res.reservationId}). 15s TTL lease registered.`, 'success');
        onRefreshStatus();
      } else if (res.status === 'IDEMPOTENT_HIT') {
        setIdempotencyMsg(`Duplicate request blocked! Returned cached reservation [${res.data?.reservationId || 'N/A'}] without stock decrement.`);
        onLogEvent(`Idempotency Protection: Replayed request for key '${key}' safely deduplicated.`, 'info');
      } else if (res.status === 'OUT_OF_STOCK') {
        onLogEvent(`Reservation rejected: Product is OUT OF STOCK. Zero oversell enforced.`, 'error');
      }
    } catch (err: any) {
      onLogEvent(`Reservation failed: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmPayment = async (status: 'SUCCESS' | 'FAILED') => {
    if (!activeReservation) return;
    setIsLoading(true);

    try {
      const res = await api.confirmPayment({
        reservationId: activeReservation.id,
        paymentStatus: status,
        paymentReference: `tx_${Date.now()}`,
        paymentIdempotencyKey: `pay_${activeReservation.id}`,
      });

      if (res.status === 'PAYMENT_CONFIRMED') {
        onLogEvent(`Payment successful! Order confirmed & item permanently marked as SOLD for ${activeReservation.id}.`, 'success');
        setActiveReservation(null);
        onRefreshStatus();
      } else if (res.status === 'PAYMENT_FAILED_AND_RELEASED') {
        onLogEvent(`Payment failed simulation! Leased unit immediately restored (+1) to available stock.`, 'warning');
        setActiveReservation(null);
        onRefreshStatus();
      }
    } catch (err: any) {
      onLogEvent(`Payment error: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const timerProgress = activeReservation
    ? Math.max(0, Math.min(100, (timeLeftMs / 15000) * 100))
    : 0;

  return (
    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Single User Purchase Sandbox</h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            Test reservation leases, live TTL expiry, idempotency, and payment lifecycle
          </p>
        </div>
        <span className="badge badge-cyan">
          <Sparkles size={12} />
          Interactive Flow
        </span>
      </div>

      {/* Input controls */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
            SIMULATED USER ID
          </label>
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'rgba(0, 0, 0, 0.4)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-main)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.875rem',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ alignSelf: 'flex-end', display: 'flex', gap: '8px' }}>
          <button
            onClick={() => handleReserve(false)}
            disabled={isLoading || !!activeReservation}
            className="btn btn-primary"
          >
            <ShoppingBag size={16} />
            <span>{isLoading ? 'Processing...' : 'Reserve Unit (15s Lease)'}</span>
          </button>

          <button
            onClick={() => handleReserve(true)}
            disabled={isLoading || !activeReservation}
            className="btn btn-ghost"
            title="Sends a duplicate request with the exact same Idempotency Key"
          >
            <Copy size={16} />
            <span>Test Duplicate</span>
          </button>
        </div>
      </div>

      {/* Idempotency Alert Box */}
      {idempotencyMsg && (
        <div style={{
          background: 'rgba(99, 102, 241, 0.1)',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          borderRadius: '8px',
          padding: '10px 14px',
          fontSize: '0.8125rem',
          color: '#c7d2fe',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <AlertCircle size={16} color="#818cf8" />
          <span>{idempotencyMsg}</span>
        </div>
      )}

      {/* Active Reservation Active State Card */}
      {activeReservation ? (
        <div style={{
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: '12px',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="badge badge-amber animate-pulse-glow">RESERVED (HELD)</span>
              <span className="font-mono" style={{ fontSize: '0.875rem', color: '#fbbf24', fontWeight: 600 }}>
                {activeReservation.id}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fbbf24' }}>
              <Timer size={16} />
              <span className="font-mono" style={{ fontSize: '1rem', fontWeight: 700 }}>
                {(timeLeftMs / 1000).toFixed(1)}s left
              </span>
            </div>
          </div>

          {/* Progress Bar for Lease */}
          <div style={{
            height: '6px',
            width: '100%',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '9999px',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${timerProgress}%`,
              background: 'linear-gradient(90deg, #f59e0b, #ef4444)',
              transition: 'width 0.1s linear',
            }} />
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Complete checkout before the Redis TTL lease expires:
            </span>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => handleConfirmPayment('SUCCESS')}
                disabled={isLoading}
                className="btn btn-emerald"
                style={{ padding: '8px 14px', fontSize: '0.8125rem' }}
              >
                <CheckCircle size={15} />
                <span>Pay & Confirm (SOLD)</span>
              </button>

              <button
                onClick={() => handleConfirmPayment('FAILED')}
                disabled={isLoading}
                className="btn btn-rose"
                style={{ padding: '8px 14px', fontSize: '0.8125rem' }}
              >
                <XCircle size={15} />
                <span>Simulate Failure (Release)</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          border: '1px dashed var(--border-subtle)',
          borderRadius: '12px',
          padding: '24px',
          textAlign: 'center',
          color: 'var(--text-dim)',
          fontSize: '0.875rem',
        }}>
          No active reservation. Click <strong style={{ color: '#818cf8' }}>"Reserve Unit"</strong> above to hold an item for 15 seconds.
        </div>
      )}
    </div>
  );
};
