const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface InventoryStatusResponse {
  productId: string;
  redis: {
    productId: string;
    availableStock: number;
    soldStock: number;
    activeReservations: number;
    totalTracked: number;
  };
  database: {
    totalInDb: number;
    reservedInDb: number;
    soldInDb: number;
    expiredInDb: number;
    cancelledInDb: number;
  };
  isConsistent: boolean;
  timestamp: string;
}

export interface ReserveResponse {
  success: boolean;
  status: 'RESERVED' | 'OUT_OF_STOCK' | 'IDEMPOTENT_HIT' | 'ERROR';
  reservationId?: string;
  productId?: string;
  userId?: string;
  quantity?: number;
  remainingStock?: number;
  expiresAt?: string;
  ttlSeconds?: number;
  message?: string;
  data?: any;
}

export interface ConfirmPaymentResponse {
  success: boolean;
  status: 'PAYMENT_CONFIRMED' | 'PAYMENT_FAILED_AND_RELEASED' | 'ALREADY_COMPLETED' | 'ALREADY_INVALIDATED' | 'IDEMPOTENT_HIT';
  reservationId?: string;
  finalState?: string;
  restoredStock?: number;
  paymentReference?: string;
  message?: string;
}

export const api = {
  async getStatus(productId = 'product_x'): Promise<InventoryStatusResponse> {
    const res = await fetch(`${API_BASE_URL}/inventory/status/${productId}`);
    if (!res.ok) throw new Error(`Status check failed: ${res.statusText}`);
    return res.json();
  },

  async reserve(data: {
    productId: string;
    userId: string;
    quantity: number;
    idempotencyKey?: string;
  }): Promise<ReserveResponse> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (data.idempotencyKey) {
      headers['X-Idempotency-Key'] = data.idempotencyKey;
    }
    const res = await fetch(`${API_BASE_URL}/inventory/reserve`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async confirmPayment(data: {
    reservationId: string;
    paymentStatus: 'SUCCESS' | 'FAILED';
    paymentReference?: string;
    paymentIdempotencyKey?: string;
  }): Promise<ConfirmPaymentResponse> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (data.paymentIdempotencyKey) {
      headers['X-Idempotency-Key'] = data.paymentIdempotencyKey;
    }
    const res = await fetch(`${API_BASE_URL}/inventory/confirm-payment`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async reset(productId = 'product_x', totalStock = 100) {
    const res = await fetch(`${API_BASE_URL}/inventory/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, totalStock }),
    });
    return res.json();
  },
};
