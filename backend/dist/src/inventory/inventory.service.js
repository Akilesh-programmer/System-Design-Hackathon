"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var InventoryService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryService = void 0;
const common_1 = require("@nestjs/common");
const redis_service_1 = require("../redis/redis.service");
const database_service_1 = require("../database/database.service");
const uuid_1 = require("uuid");
let InventoryService = InventoryService_1 = class InventoryService {
    constructor(redisService, dbService) {
        this.redisService = redisService;
        this.dbService = dbService;
        this.logger = new common_1.Logger(InventoryService_1.name);
        this.reservationTtlSeconds = parseInt(process.env.RESERVATION_TTL_SECONDS || '15', 10);
    }
    async reserve(dto, headerIdempotencyKey) {
        const idempotencyKey = headerIdempotencyKey || dto.idempotencyKey || `idemp_${dto.userId}_${dto.productId}`;
        const reservationId = `res_${(0, uuid_1.v4)().replace(/-/g, '').substring(0, 16)}`;
        const result = await this.redisService.reserveInventory({
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
            throw new common_1.NotFoundException(result.message);
        }
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
    async confirmPayment(dto, headerIdempotencyKey) {
        const paymentIdempotencyKey = headerIdempotencyKey || dto.paymentIdempotencyKey;
        const result = await this.redisService.confirmPayment({
            reservationId: dto.reservationId,
            paymentStatus: dto.paymentStatus,
            paymentReference: dto.paymentReference,
            paymentIdempotencyKey,
        });
        if (result.status === 'RESERVATION_NOT_FOUND') {
            throw new common_1.NotFoundException('Reservation not found or has already expired');
        }
        if (result.status === 'ALREADY_INVALIDATED') {
            throw new common_1.BadRequestException(`Cannot process payment. Reservation is in state: ${result.currentStatus}`);
        }
        if (result.status === 'ALREADY_COMPLETED' || result.status === 'IDEMPOTENT_HIT') {
            return {
                success: true,
                status: 'IDEMPOTENT_HIT',
                message: 'Payment already processed for this reservation.',
                data: result.reservation || result.data,
            };
        }
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
    async getStatus(productId) {
        const redisStatus = await this.redisService.getInventoryStatus(productId);
        let dbStatus = { totalInDb: 0, reservedInDb: 0, soldInDb: 0, expiredInDb: 0, cancelledInDb: 0 };
        try {
            const dbRes = await this.dbService.query(`SELECT 
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE status = 'RESERVED') as reserved,
           COUNT(*) FILTER (WHERE status = 'SOLD' OR status = 'CONFIRMED') as sold,
           COUNT(*) FILTER (WHERE status = 'EXPIRED') as expired,
           COUNT(*) FILTER (WHERE status = 'CANCELLED') as cancelled
         FROM reservations WHERE product_id = $1`, [productId]);
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
        }
        catch (err) {
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
    async reset(dto) {
        const productId = dto.productId || 'product_x';
        const totalStock = dto.totalStock !== undefined ? dto.totalStock : 100;
        await this.redisService.resetState(productId, totalStock);
        try {
            await this.dbService.query('DELETE FROM orders');
            await this.dbService.query('DELETE FROM reservations');
            await this.dbService.query('DELETE FROM inventory_ledger');
            await this.dbService.query(`INSERT INTO products (id, name, total_stock)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET total_stock = EXCLUDED.total_stock`, [productId, `Flash Sale Item - ${productId}`, totalStock]);
            await this.dbService.query(`INSERT INTO inventory_ledger (product_id, action, delta, reference_id)
         VALUES ($1, 'INITIAL_LOAD', $2, 'SYSTEM_RESET')`, [productId, totalStock]);
        }
        catch (err) {
            this.logger.warn('Error resetting DB state:', err.message);
        }
        return {
            success: true,
            message: `System reset successfully for product '${productId}' with ${totalStock} units.`,
            productId,
            initialStock: totalStock,
        };
    }
    async persistReservationAsync(data) {
        await this.dbService.query(`INSERT INTO reservations (id, product_id, user_id, quantity, status, idempotency_key, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (idempotency_key) DO NOTHING`, [data.id, data.productId, data.userId, data.quantity, data.status, data.idempotencyKey, data.expiresAt]);
        await this.dbService.query(`INSERT INTO inventory_ledger (product_id, action, delta, reference_id)
       VALUES ($1, 'RESERVE', $2, $3)`, [data.productId, -data.quantity, data.id]);
    }
    async persistPaymentConfirmationAsync(data) {
        const isSuccess = data.paymentStatus === 'SUCCESS';
        const status = isSuccess ? 'SOLD' : 'CANCELLED';
        await this.dbService.query(`UPDATE reservations
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`, [status, data.reservationId]);
        if (isSuccess) {
            const orderId = `ord_${(0, uuid_1.v4)().replace(/-/g, '').substring(0, 16)}`;
            await this.dbService.query(`INSERT INTO orders (id, reservation_id, user_id, product_id, quantity, payment_status, payment_reference)
         SELECT $1, r.id, r.user_id, r.product_id, r.quantity, $2, $3
         FROM reservations r WHERE r.id = $4`, [orderId, data.paymentStatus, data.paymentReference, data.reservationId]);
            await this.dbService.query(`INSERT INTO inventory_ledger (product_id, action, delta, reference_id)
         VALUES ($1, 'CONFIRM_SALE', 0, $2)`, [data.productId, data.reservationId]);
        }
        else {
            await this.dbService.query(`INSERT INTO inventory_ledger (product_id, action, delta, reference_id)
         VALUES ($1, 'RELEASE_FAILED', $2, $3)`, [data.productId, data.quantity, data.reservationId]);
        }
    }
};
exports.InventoryService = InventoryService;
exports.InventoryService = InventoryService = InventoryService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [redis_service_1.RedisService,
        database_service_1.DatabaseService])
], InventoryService);
//# sourceMappingURL=inventory.service.js.map