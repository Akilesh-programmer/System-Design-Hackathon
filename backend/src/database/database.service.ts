import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool | null = null;
  public isDbConnected = false;

  // In-Memory Database Fallback
  private memoryReservations: Map<string, any> = new Map();
  private memoryOrders: Map<string, any> = new Map();
  private memoryLedger: any[] = [];

  constructor() {
    const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgrespassword@localhost:5433/flash_sale_db';
    
    this.pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('error', (err) => {
      if (this.isDbConnected) {
        this.logger.warn(`PostgreSQL background connection issue: ${err.message}`);
      }
      this.isDbConnected = false;
    });
  }

  async onModuleInit() {
    try {
      const client = await this.pool.connect();
      this.isDbConnected = true;
      this.logger.log('Connected to PostgreSQL successfully');

      const candidates = [
        path.join(__dirname, 'schema.sql'),
        path.join(process.cwd(), 'src', 'database', 'schema.sql'),
        path.join(process.cwd(), 'backend', 'src', 'database', 'schema.sql'),
        path.join(process.cwd(), 'dist', 'database', 'schema.sql'),
      ];
      const schemaPath = candidates.find(p => fs.existsSync(p));
      if (schemaPath) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        await client.query(schemaSql);
        this.logger.log(`PostgreSQL schema initialized from: ${schemaPath}`);
      }
      client.release();
    } catch (error) {
      this.isDbConnected = false;
      this.logger.warn(`PostgreSQL not reachable at ${process.env.DATABASE_URL || 'localhost:5433'}. In-Memory Database Store active.`);
    }
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end().catch(() => {});
    }
  }

  async query(text: string, params: any[] = []): Promise<{ rows: any[] }> {
    if (this.isDbConnected && this.pool) {
      try {
        return await this.pool.query(text, params);
      } catch (err) {
        this.logger.warn(`Postgres query failed, falling back to memory: ${err.message}`);
        this.isDbConnected = false;
      }
    }

    // In-memory simple query simulator for status & inserts
    const upper = text.toUpperCase().trim();

    if (upper.startsWith('INSERT INTO RESERVATIONS')) {
      const [id, productId, userId, quantity, status, idempotencyKey, expiresAt] = params;
      this.memoryReservations.set(id, { id, productId, userId, quantity, status, idempotencyKey, expiresAt });
      return { rows: [] };
    }

    if (upper.startsWith('UPDATE RESERVATIONS')) {
      const [status, id] = params;
      const r = this.memoryReservations.get(id);
      if (r) r.status = status;
      return { rows: [] };
    }

    if (upper.startsWith('INSERT INTO ORDERS')) {
      const [id, paymentStatus, paymentReference, reservationId] = params;
      this.memoryOrders.set(id, { id, paymentStatus, paymentReference, reservationId });
      return { rows: [] };
    }

    if (upper.startsWith('INSERT INTO INVENTORY_LEDGER')) {
      const [productId, action, delta, referenceId] = params;
      this.memoryLedger.push({ productId, action, delta, referenceId, createdAt: new Date() });
      return { rows: [] };
    }

    if (upper.startsWith('SELECT') && upper.includes('COUNT(*)')) {
      const all = Array.from(this.memoryReservations.values());
      const reserved = all.filter(r => r.status === 'RESERVED').length;
      const sold = all.filter(r => r.status === 'SOLD' || r.status === 'CONFIRMED').length;
      const expired = all.filter(r => r.status === 'EXPIRED').length;
      const cancelled = all.filter(r => r.status === 'CANCELLED').length;

      return {
        rows: [{
          total: all.length,
          reserved,
          sold,
          expired,
          cancelled,
        }],
      };
    }

    if (upper.startsWith('DELETE FROM')) {
      this.memoryReservations.clear();
      this.memoryOrders.clear();
      this.memoryLedger = [];
      return { rows: [] };
    }

    return { rows: [] };
  }
}
