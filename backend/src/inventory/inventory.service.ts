import { Injectable, Logger, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { RedisService, ReservationResult, PaymentConfirmResult } from '../redis/redis.service';
import { DatabaseService } from '../database/database.service';
import { ReserveInventoryDto, ConfirmPaymentDto, ResetInventoryDto } from './dto/inventory.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);
  private readonly reservationTtlSeconds: number;

  constructor(
    private readonly redisService: RedisService,
    private readonly dbService: DatabaseService,
  ) {
    this.reservationTtlSeconds = parseInt(process.env.RESERVATION_TTL_SECONDS || '15', 10);
  }

  /**
   * Fast-path Concurrency-Safe Inventory Reservation
   * 1. Generates unique reservation ID and idempotency key (if not provided).
   * 2. Executes atomic Redis Lua script (checks stock, decrements counter, writes lease, stores idempotency).
   * 3. Schedules asynchronous write-behind persistence to PostgreSQL for durability without slowing down the hot-path.
   */
  async reserve(dto: ReserveInventoryDto, headerIdempotencyKey?: string) {
    const idempotencyKey = headerIdempotencyKey || dto.idempotencyKey || `idemp_${dto.userId}_${dto.productId}`;
    const reservationId = `res_${uuidv4().replace(/-/g, '').substring(0, 16)}`;

    // 1. Fast-Path Atomic Reservation in Redis
    const result: ReservationResult = await this.redisService.reserveInventory({
      productId: dto.productId,
      userId: dto.userId,
      quantity: dto.quantity || 1,
      reservationId,
      idempotencyKey,
      ttlSeconds: this.reservationTtlSeconds,
    });

    if (result.status === 'OUT_OF_STOCK') {
      return {
        success: false,
        status: 'OUT_OF_STOCK',
        message: 'Product is sold out or insufficient stock available.',
        availableStock: result.remainingStock ?? 0,
      };
    }

    if (result.status === 'IDEMPOTENT_HIT') {
      return {
        success: true,
        status: 'IDEMPOTENT_HIT',
        message: 'Duplicate request identified. Returned cached reservation state.',
        data: result.data,
      };
    }

    if (result.status === 'PRODUCT_NOT_FOUND') {
      throw new NotFoundException(result.message);
    }

    // 2. Asynchronous Write-Behind to PostgreSQL (Non-blocking for high contention)
    this.persistReservationAsync({
      id: reservationId,
      productId: dto.productId,
      userId: dto.userId,
      quantity: dto.quantity || 1,
      status: 'RESERVED',
      idempotencyKey,
      expiresAt: new Date(result.expiresAt),
    }).catch(err => {
      this.logger.error(`Write-behind persistence failed for reservation ${reservationId}:`, err.message);
    });

    return {
      success: true,
      status: 'RESERVED',
      reservationId,
      productId: dto.productId,
      userId: dto.userId,
      quantity: dto.quantity || 1,
      remainingStock: result.remainingStock,
      expiresAt: new Date(result.expiresAt).toISOString(),
      ttlSeconds: this.reservationTtlSeconds,
    };
  }

  /**
   * Processes payment confirmation and manages lifecycle transitions:
   * RESERVED -> PAYMENT_PENDING -> CONFIRMED -> SOLD (on success)
   * RESERVED -> CANCELLED & inventory returned (on failure)
   */
  async confirmPayment(dto: ConfirmPaymentDto, headerIdempotencyKey?: string) {
    const paymentIdempotencyKey = headerIdempotencyKey || dto.paymentIdempotencyKey;

    // 1. Execute atomic state transition in Redis
    const result: PaymentConfirmResult = await this.redisService.confirmPayment({
      reservationId: dto.reservationId,
      paymentStatus: dto.paymentStatus,
      paymentReference: dto.paymentReference,
      paymentIdempotencyKey,
    });

    if (result.status === 'RESERVATION_NOT_FOUND') {
      throw new NotFoundException('Reservation not found or has already expired');
    }

    if (result.status === 'ALREADY_INVALIDATED') {
      throw new BadRequestException(`Cannot process payment. Reservation is in state: ${result.currentStatus}`);
    }

    if (result.status === 'ALREADY_COMPLETED' || result.status === 'IDEMPOTENT_HIT') {
      return {
        success: true,
        status: 'IDEMPOTENT_HIT',
        message: 'Payment already processed for this reservation.',
        data: result.reservation || result.data,
      };
    }

    // 2. Asynchronously sync order and updated status to PostgreSQL
    this.persistPaymentConfirmationAsync({
      reservationId: dto.reservationId,
      paymentStatus: dto.paymentStatus,
      paymentReference: dto.paymentReference || `tx_${Date.now()}`,
      quantity: result.quantity || 1,
      productId: result.productId,
    }).catch(err => {
      this.logger.error(`Failed to persist payment status for reservation ${dto.reservationId}:`, err.message);
    });

    return {
      success: true,
      status: result.status,
      reservationId: dto.reservationId,
      finalState: result.finalState,
      restoredStock: result.restoredStock,
      paymentReference: dto.paymentReference,
    };
  }

  /**
   * Retrieves real-time combined Redis & PostgreSQL inventory metrics for reconciliation
   */
  async getStatus(productId: string) {
    const redisStatus = await this.redisService.getInventoryStatus(productId);

    // PostgreSQL Status
    let dbStatus = { totalInDb: 0, reservedInDb: 0, soldInDb: 0, expiredInDb: 0, cancelledInDb: 0 };
    try {
      const dbRes = await this.dbService.query(
        `SELECT 
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE status = 'RESERVED') as reserved,
           COUNT(*) FILTER (WHERE status = 'SOLD' OR status = 'CONFIRMED') as sold,
           COUNT(*) FILTER (WHERE status = 'EXPIRED') as expired,
           COUNT(*) FILTER (WHERE status = 'CANCELLED') as cancelled
         FROM reservations WHERE product_id = $1`,
        [productId],
      );
      if (dbRes.rows.length > 0) {
        const row = dbRes.rows[0];
        dbStatus = {
          totalInDb: parseInt(row.total, 10),
          reservedInDb: parseInt(row.reserved, 10),
          soldInDb: parseInt(row.sold, 10),
          expiredInDb: parseInt(row.expired, 10),
          cancelledInDb: parseInt(row.cancelled, 10),
        };
      }
    } catch (err) {
      this.logger.warn('Could not fetch DB stats for reconciliation:', err.message);
    }

    return {
      productId,
      redis: redisStatus,
      database: dbStatus,
      isConsistent: (redisStatus.soldStock + redisStatus.availableStock + redisStatus.activeReservations) === 100,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Resets database and Redis state for benchmarking / hackathon demos
   */
  async reset(dto: ResetInventoryDto) {
    const productId = dto.productId || 'product_x';
    const totalStock = dto.totalStock !== undefined ? dto.totalStock : 100;

    // Reset Redis
    await this.redisService.resetState(productId, totalStock);

    // Reset PostgreSQL
    try {
      await this.dbService.query('DELETE FROM orders');
      await this.dbService.query('DELETE FROM reservations');
      await this.dbService.query('DELETE FROM inventory_ledger');
      await this.dbService.query(
        `INSERT INTO products (id, name, total_stock)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET total_stock = EXCLUDED.total_stock`,
        [productId, `Flash Sale Item - ${productId}`, totalStock],
      );
      await this.dbService.query(
        `INSERT INTO inventory_ledger (product_id, action, delta, reference_id)
         VALUES ($1, 'INITIAL_LOAD', $2, 'SYSTEM_RESET')`,
        [productId, totalStock],
      );
    } catch (err) {
      this.logger.warn('Error resetting DB state:', err.message);
    }

    return {
      success: true,
      message: `System reset successfully for product '${productId}' with ${totalStock} units.`,
      productId,
      initialStock: totalStock,
    };
  }

  /**
   * Persists reservation record to PostgreSQL (write-behind)
   */
  private async persistReservationAsync(data: {
    id: string;
    productId: string;
    userId: string;
    quantity: number;
    status: string;
    idempotencyKey: string;
    expiresAt: Date;
  }) {
    await this.dbService.query(
      `INSERT INTO reservations (id, product_id, user_id, quantity, status, idempotency_key, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [data.id, data.productId, data.userId, data.quantity, data.status, data.idempotencyKey, data.expiresAt],
    );

    await this.dbService.query(
      `INSERT INTO inventory_ledger (product_id, action, delta, reference_id)
       VALUES ($1, 'RESERVE', $2, $3)`,
      [data.productId, -data.quantity, data.id],
    );
  }

  /**
   * Persists payment confirmation and order creation to PostgreSQL
   */
  private async persistPaymentConfirmationAsync(data: {
    reservationId: string;
    paymentStatus: string;
    paymentReference: string;
    quantity: number;
    productId: string;
  }) {
    const isSuccess = data.paymentStatus === 'SUCCESS';
    const status = isSuccess ? 'SOLD' : 'CANCELLED';

    await this.dbService.query(
      `UPDATE reservations
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [status, data.reservationId],
    );

    if (isSuccess) {
      const orderId = `ord_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
      await this.dbService.query(
        `INSERT INTO orders (id, reservation_id, user_id, product_id, quantity, payment_status, payment_reference)
         SELECT $1, r.id, r.user_id, r.product_id, r.quantity, $2, $3
         FROM reservations r WHERE r.id = $4`,
        [orderId, data.paymentStatus, data.paymentReference, data.reservationId],
      );

      await this.dbService.query(
        `INSERT INTO inventory_ledger (product_id, action, delta, reference_id)
         VALUES ($1, 'CONFIRM_SALE', 0, $2)`,
        [data.productId, data.reservationId],
      );
    } else {
      await this.dbService.query(
        `INSERT INTO inventory_ledger (product_id, action, delta, reference_id)
         VALUES ($1, 'RELEASE_FAILED', $2, $3)`,
        [data.productId, data.quantity, data.reservationId],
      );
    }
  }
}
