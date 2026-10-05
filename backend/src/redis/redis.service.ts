import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import * as fs from 'fs';
import * as path from 'path';

export interface ReservationResult {
  status: 'RESERVED' | 'OUT_OF_STOCK' | 'IDEMPOTENT_HIT' | 'PRODUCT_NOT_FOUND' | 'ERROR';
  reservationId?: string;
  productId?: string;
  userId?: string;
  quantity?: number;
  remainingStock?: number;
  expiresAt?: number;
  createdAt?: string;
  data?: any;
  message?: string;
}

export interface PaymentConfirmResult {
  status: 'PAYMENT_CONFIRMED' | 'PAYMENT_FAILED_AND_RELEASED' | 'ALREADY_COMPLETED' | 'ALREADY_INVALIDATED' | 'RESERVATION_NOT_FOUND' | 'IDEMPOTENT_HIT';
  reservationId?: string;
  productId?: string;
  quantity?: number;
  finalState?: string;
  currentStatus?: string;
  paymentReference?: string;
  restoredStock?: number;
  reservation?: any;
  data?: any;
  message?: string;
}

export interface ExpiredReservation {
  id: string;
  productId: string;
  userId: string;
  quantity: number;
  restoredStock: number;
  expiredAt: number;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  public isRedisConnected = false;

  private reserveLua: string;
  private confirmLua: string;
  private sweepLua: string;

  // In-Memory Fallback Engine (Active if external Redis is offline)
  private memoryStock: Map<string, number> = new Map([['product_x', 100]]);
  private memorySold: Map<string, number> = new Map([['product_x', 0]]);
  private memoryReservations: Map<string, any> = new Map();
  private memoryLeases: Map<string, number> = new Map(); // reservationId -> expiryMs
  private memoryIdempotency: Map<string, { data: any; expiresAt: number }> = new Map();

  constructor() {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = Number(process.env.REDIS_PORT) || 6379;
    const password = process.env.REDIS_PASSWORD || undefined;

    this.client = new Redis({
      host,
      port,
      password,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableAutoPipelining: true,
      retryStrategy: (times) => {
        if (times > 3) {
          return null; // Stop retrying if Redis is not running locally
        }
        return Math.min(times * 100, 1000);
      },
    });

    // Suppress unhandled error crashes from ioredis
    this.client.on('error', (err) => {
      if (this.isRedisConnected) {
        this.logger.warn(`Redis connection issue: ${err.message}`);
      }
      this.isRedisConnected = false;
    });

    this.client.on('connect', () => {
      this.isRedisConnected = true;
      this.logger.log('Connected to Redis server successfully');
    });
  }

  async onModuleInit() {
    // 1. Load Lua Scripts from disk
    try {
      const candidates = [
        path.join(__dirname, 'lua'),
        path.join(process.cwd(), 'src', 'redis', 'lua'),
        path.join(process.cwd(), 'backend', 'src', 'redis', 'lua'),
        path.join(process.cwd(), 'dist', 'redis', 'lua'),
      ];
      const luaDir = candidates.find(dir => fs.existsSync(dir));
      if (luaDir) {
        this.reserveLua = fs.readFileSync(path.join(luaDir, 'reserve_inventory.lua'), 'utf8');
        this.confirmLua = fs.readFileSync(path.join(luaDir, 'confirm_payment.lua'), 'utf8');
        this.sweepLua = fs.readFileSync(path.join(luaDir, 'sweep_leases.lua'), 'utf8');
        this.logger.log(`Redis Lua scripts loaded from: ${luaDir}`);
      }
    } catch (err) {
      this.logger.warn(`Could not load Lua script files: ${err.message}`);
    }

    // 2. Attempt Redis connection
    try {
      await this.client?.connect();
    } catch (error) {
      this.isRedisConnected = false;
      this.logger.warn('Redis server is not running on port 6379. Seamless In-Memory Atomic Engine activated.');
    }
  }

  async onModuleDestroy() {
    if (this.isRedisConnected && this.client) {
      await this.client.quit().catch(() => {});
    }
  }

  getClient(): Redis | null {
    return this.client;
  }

  async initializeProductStock(productId: string, totalStock: number): Promise<void> {
    this.memoryStock.set(productId, totalStock);
    this.memorySold.set(productId, 0);

    if (this.isRedisConnected && this.client) {
      const stockKey = `inventory:product:${productId}:stock`;
      const soldKey = `inventory:product:${productId}:sold`;
      await this.client.mset(stockKey, totalStock.toString(), soldKey, '0').catch(() => {});
    }
  }

  /**
   * Concurrency-safe reservation: uses Redis Lua script if connected, or In-Memory Atomic engine
   */
  async reserveInventory(params: {
    productId: string;
    userId: string;
    quantity: number;
    reservationId: string;
    idempotencyKey: string;
    ttlSeconds: number;
  }): Promise<ReservationResult> {
    const { productId, userId, quantity, reservationId, idempotencyKey, ttlSeconds } = params;

    // --- Path A: External Redis with Lua Script ---
    if (this.isRedisConnected && this.client) {
      try {
        const stockKey = `inventory:product:${productId}:stock`;
        const resKey = `reservation:${reservationId}`;
        const leaseZsetKey = 'reservation:leases';
        const idempKey = `idempotency:${idempotencyKey}`;

        const now = Date.now();
        const expiryTimestampMs = now + ttlSeconds * 1000;
        const createdAtIso = new Date(now).toISOString();

        const rawResult = (await this.client.eval(
          this.reserveLua,
          4,
          stockKey,
          resKey,
          leaseZsetKey,
          idempKey,
          quantity,
          reservationId,
          userId,
          productId,
          ttlSeconds,
          expiryTimestampMs,
          createdAtIso,
        )) as string;

        return JSON.parse(rawResult);
      } catch (err) {
        this.logger.warn(`Redis command failed, switching to in-memory: ${err.message}`);
        this.isRedisConnected = false;
      }
    }

    // --- Path B: In-Memory Atomic Simulation Engine ---
    const now = Date.now();
    const expiryTimestampMs = now + ttlSeconds * 1000;
    const createdAtIso = new Date(now).toISOString();

    // 1. Check Idempotency
    const cachedIdemp = this.memoryIdempotency.get(idempotencyKey);
    if (cachedIdemp && cachedIdemp.expiresAt > now) {
      return {
        status: 'IDEMPOTENT_HIT',
        data: cachedIdemp.data,
      };
    }

    // 2. Check Stock
    const currentStock = this.memoryStock.get(productId) ?? 0;
    if (currentStock < quantity) {
      return {
        status: 'OUT_OF_STOCK',
        remainingStock: currentStock,
      };
    }

    // 3. Atomic Decrement
    const remainingStock = currentStock - quantity;
    this.memoryStock.set(productId, remainingStock);

    // 4. Save Reservation & Lease
    const reservationData = {
      id: reservationId,
      productId,
      userId,
      quantity,
      status: 'RESERVED',
      createdAt: createdAtIso,
      expiresAt: expiryTimestampMs,
    };
    this.memoryReservations.set(reservationId, reservationData);
    this.memoryLeases.set(reservationId, expiryTimestampMs);

    // 5. Store Idempotency
    const responsePayload: ReservationResult = {
      status: 'RESERVED',
      reservationId,
      productId,
      userId,
      quantity,
      remainingStock,
      expiresAt: expiryTimestampMs,
      createdAt: createdAtIso,
    };
    this.memoryIdempotency.set(idempotencyKey, {
      data: responsePayload,
      expiresAt: now + ttlSeconds * 4000,
    });

    return responsePayload;
  }

  /**
   * Payment Confirmation & State Transition
   */
  async confirmPayment(params: {
    reservationId: string;
    paymentStatus: 'SUCCESS' | 'FAILED';
    paymentReference?: string;
    paymentIdempotencyKey?: string;
  }): Promise<PaymentConfirmResult> {
    const { reservationId, paymentStatus, paymentReference, paymentIdempotencyKey } = params;

    // --- Path A: External Redis ---
    if (this.isRedisConnected && this.client) {
      try {
        const resJson = await this.client.get(`reservation:${reservationId}`);
        let productId = 'product_x';
        if (resJson) {
          const parsed = JSON.parse(resJson);
          productId = parsed.productId || productId;
        }

        const resKey = `reservation:${reservationId}`;
        const leaseZsetKey = 'reservation:leases';
        const stockKey = `inventory:product:${productId}:stock`;
        const soldKey = `inventory:product:${productId}:sold`;
        const idempKey = paymentIdempotencyKey ? `idempotency:${paymentIdempotencyKey}` : '';

        const rawResult = (await this.client.eval(
          this.confirmLua,
          5,
          resKey,
          leaseZsetKey,
          stockKey,
          soldKey,
          idempKey,
          reservationId,
          paymentStatus,
          paymentReference || `tx_${Date.now()}`,
          new Date().toISOString(),
        )) as string;

        return JSON.parse(rawResult);
      } catch (err) {
        this.isRedisConnected = false;
      }
    }

    // --- Path B: In-Memory Engine ---
    if (paymentIdempotencyKey) {
      const cached = this.memoryIdempotency.get(paymentIdempotencyKey);
      if (cached && cached.expiresAt > Date.now()) {
        return { status: 'IDEMPOTENT_HIT', data: cached.data };
      }
    }

    const res = this.memoryReservations.get(reservationId);
    if (!res) {
      return { status: 'RESERVATION_NOT_FOUND', message: 'Reservation not found or has expired' };
    }

    if (res.status === 'SOLD' || res.status === 'CONFIRMED') {
      return { status: 'ALREADY_COMPLETED', reservation: res };
    }

    if (res.status === 'EXPIRED' || res.status === 'CANCELLED') {
      return { status: 'ALREADY_INVALIDATED', currentStatus: res.status };
    }

    // Remove lease
    this.memoryLeases.delete(reservationId);

    if (paymentStatus === 'SUCCESS') {
      res.status = 'SOLD';
      res.paymentReference = paymentReference;
      const currentSold = this.memorySold.get(res.productId) || 0;
      this.memorySold.set(res.productId, currentSold + res.quantity);

      const result: PaymentConfirmResult = {
        status: 'PAYMENT_CONFIRMED',
        reservationId: res.id,
        productId: res.productId,
        quantity: res.quantity,
        finalState: 'SOLD',
        paymentReference,
      };

      if (paymentIdempotencyKey) {
        this.memoryIdempotency.set(paymentIdempotencyKey, { data: result, expiresAt: Date.now() + 600000 });
      }
      return result;
    } else {
      res.status = 'CANCELLED';
      const curStock = this.memoryStock.get(res.productId) || 0;
      const restored = curStock + res.quantity;
      this.memoryStock.set(res.productId, restored);

      const result: PaymentConfirmResult = {
        status: 'PAYMENT_FAILED_AND_RELEASED',
        reservationId: res.id,
        productId: res.productId,
        quantity: res.quantity,
        restoredStock: restored,
        finalState: 'CANCELLED',
      };

      if (paymentIdempotencyKey) {
        this.memoryIdempotency.set(paymentIdempotencyKey, { data: result, expiresAt: Date.now() + 600000 });
      }
      return result;
    }
  }

  /**
   * Lease Sweeper Worker
   */
  async sweepExpiredLeases(batchLimit = 100): Promise<ExpiredReservation[]> {
    if (this.isRedisConnected && this.client) {
      try {
        const rawResult = (await this.client.eval(
          this.sweepLua,
          1,
          'reservation:leases',
          Date.now(),
          batchLimit,
        )) as string;
        return JSON.parse(rawResult);
      } catch (err) {
        // Fallback to memory
      }
    }

    const now = Date.now();
    const expired: ExpiredReservation[] = [];

    for (const [resId, expiryMs] of Array.from(this.memoryLeases.entries())) {
      if (expiryMs <= now) {
        this.memoryLeases.delete(resId);
        const res = this.memoryReservations.get(resId);
        if (res && (res.status === 'RESERVED' || res.status === 'PAYMENT_PENDING')) {
          res.status = 'EXPIRED';
          const curStock = this.memoryStock.get(res.productId) || 0;
          const restored = curStock + res.quantity;
          this.memoryStock.set(res.productId, restored);

          expired.push({
            id: res.id,
            productId: res.productId,
            userId: res.userId,
            quantity: res.quantity,
            restoredStock: restored,
            expiredAt: now,
          });
        }
      }
    }

    return expired;
  }

  /**
   * Real-time Inventory Status
   */
  async getInventoryStatus(productId: string) {
    if (this.isRedisConnected && this.client) {
      try {
        const [stock, sold, activeLeasesCount] = await Promise.all([
          this.client.get(`inventory:product:${productId}:stock`),
          this.client.get(`inventory:product:${productId}:sold`),
          this.client.zcard('reservation:leases'),
        ]);

        const avail = stock ? parseInt(stock, 10) : 0;
        const sld = sold ? parseInt(sold, 10) : 0;
        const active = activeLeasesCount || 0;

        return {
          productId,
          availableStock: avail,
          soldStock: sld,
          activeReservations: active,
          totalTracked: avail + sld + active,
        };
      } catch (err) {
        // Fallback
      }
    }

    const avail = this.memoryStock.get(productId) ?? 100;
    const sld = this.memorySold.get(productId) ?? 0;
    const active = this.memoryLeases.size;

    return {
      productId,
      availableStock: avail,
      soldStock: sld,
      activeReservations: active,
      totalTracked: avail + sld + active,
    };
  }

  async resetState(productId: string, initialStock: number) {
    this.memoryStock.set(productId, initialStock);
    this.memorySold.set(productId, 0);
    this.memoryReservations.clear();
    this.memoryLeases.clear();
    this.memoryIdempotency.clear();

    if (this.isRedisConnected && this.client) {
      try {
        await this.client.flushdb();
        await this.initializeProductStock(productId, initialStock);
      } catch (err) {}
    }
  }
}
