import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { RedisService, ExpiredReservation } from '../redis/redis.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class InventoryExpiryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InventoryExpiryService.name);
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    private readonly redisService: RedisService,
    private readonly dbService: DatabaseService,
  ) {}

  onModuleInit() {
    this.startSweeper();
  }

  onModuleDestroy() {
    this.stopSweeper();
  }

  private startSweeper() {
    // Sweep expired reservation leases every 500ms
    this.timer = setInterval(async () => {
      await this.sweepLeases();
    }, 500);
    this.logger.log('Inventory Expiry Background Sweeper started (interval: 500ms)');
  }

  private stopSweeper() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Sweeps expired reservation leases from Redis Sorted Set and restores inventory
   */
  async sweepLeases(): Promise<ExpiredReservation[]> {
    if (this.isProcessing) return [];
    this.isProcessing = true;

    try {
      // 1. Atomic Redis Lease Sweep & Stock Replenishment
      const expiredLeases = await this.redisService.sweepExpiredLeases(100);

      if (expiredLeases && expiredLeases.length > 0) {
        this.logger.log(`Swept and released ${expiredLeases.length} expired reservation leases back to inventory.`);

        // 2. Asynchronously sync expired state to PostgreSQL
        for (const expired of expiredLeases) {
          try {
            await this.dbService.query(
              `UPDATE reservations
               SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP
               WHERE id = $1 AND status = 'RESERVED'`,
              [expired.id],
            );

            await this.dbService.query(
              `INSERT INTO inventory_ledger (product_id, action, delta, reference_id)
               VALUES ($1, 'RELEASE_EXPIRED', $2, $3)`,
              [expired.productId, expired.quantity, expired.id],
            );
          } catch (dbErr) {
            this.logger.error(`Failed to update DB for expired reservation ${expired.id}:`, dbErr.message);
          }
        }
      }

      return expiredLeases;
    } catch (err) {
      this.logger.error('Error during lease sweep cycle:', err.message);
      return [];
    } finally {
      this.isProcessing = false;
    }
  }
}
