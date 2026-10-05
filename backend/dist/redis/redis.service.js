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
var RedisService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisService = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = require("ioredis");
const fs = require("fs");
const path = require("path");
let RedisService = RedisService_1 = class RedisService {
    constructor() {
        this.logger = new common_1.Logger(RedisService_1.name);
        this.client = null;
        this.isRedisConnected = false;
        this.memoryStock = new Map([['product_x', 100]]);
        this.memorySold = new Map([['product_x', 0]]);
        this.memoryReservations = new Map();
        this.memoryLeases = new Map();
        this.memoryIdempotency = new Map();
        const host = process.env.REDIS_HOST || 'localhost';
        const port = Number(process.env.REDIS_PORT) || 6379;
        const password = process.env.REDIS_PASSWORD || undefined;
        this.client = new ioredis_1.default({
            host,
            port,
            password,
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            enableAutoPipelining: true,
            retryStrategy: (times) => {
                if (times > 3) {
                    return null;
                }
                return Math.min(times * 100, 1000);
            },
        });
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
        }
        catch (err) {
            this.logger.warn(`Could not load Lua script files: ${err.message}`);
        }
        try {
            await this.client?.connect();
        }
        catch (error) {
            this.isRedisConnected = false;
            this.logger.warn('Redis server is not running on port 6379. Seamless In-Memory Atomic Engine activated.');
        }
    }
    async onModuleDestroy() {
        if (this.isRedisConnected && this.client) {
            await this.client.quit().catch(() => { });
        }
    }
    getClient() {
        return this.client;
    }
    async initializeProductStock(productId, totalStock) {
        this.memoryStock.set(productId, totalStock);
        this.memorySold.set(productId, 0);
        if (this.isRedisConnected && this.client) {
            const stockKey = `inventory:product:${productId}:stock`;
            const soldKey = `inventory:product:${productId}:sold`;
            await this.client.mset(stockKey, totalStock.toString(), soldKey, '0').catch(() => { });
        }
    }
    async reserveInventory(params) {
        const { productId, userId, quantity, reservationId, idempotencyKey, ttlSeconds } = params;
        if (this.isRedisConnected && this.client) {
            try {
                const stockKey = `inventory:product:${productId}:stock`;
                const resKey = `reservation:${reservationId}`;
                const leaseZsetKey = 'reservation:leases';
                const idempKey = `idempotency:${idempotencyKey}`;
                const now = Date.now();
                const expiryTimestampMs = now + ttlSeconds * 1000;
                const createdAtIso = new Date(now).toISOString();
                const rawResult = (await this.client.eval(this.reserveLua, 4, stockKey, resKey, leaseZsetKey, idempKey, quantity, reservationId, userId, productId, ttlSeconds, expiryTimestampMs, createdAtIso));
                return JSON.parse(rawResult);
            }
            catch (err) {
                this.logger.warn(`Redis command failed, switching to in-memory: ${err.message}`);
                this.isRedisConnected = false;
            }
        }
        const now = Date.now();
        const expiryTimestampMs = now + ttlSeconds * 1000;
        const createdAtIso = new Date(now).toISOString();
        const cachedIdemp = this.memoryIdempotency.get(idempotencyKey);
        if (cachedIdemp && cachedIdemp.expiresAt > now) {
            return {
                status: 'IDEMPOTENT_HIT',
                data: cachedIdemp.data,
            };
        }
        const currentStock = this.memoryStock.get(productId) ?? 0;
        if (currentStock < quantity) {
            return {
                status: 'OUT_OF_STOCK',
                remainingStock: currentStock,
            };
        }
        const remainingStock = currentStock - quantity;
        this.memoryStock.set(productId, remainingStock);
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
        const responsePayload = {
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
    async confirmPayment(params) {
        const { reservationId, paymentStatus, paymentReference, paymentIdempotencyKey } = params;
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
                const rawResult = (await this.client.eval(this.confirmLua, 5, resKey, leaseZsetKey, stockKey, soldKey, idempKey, reservationId, paymentStatus, paymentReference || `tx_${Date.now()}`, new Date().toISOString()));
                return JSON.parse(rawResult);
            }
            catch (err) {
                this.isRedisConnected = false;
            }
        }
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
        this.memoryLeases.delete(reservationId);
        if (paymentStatus === 'SUCCESS') {
            res.status = 'SOLD';
            res.paymentReference = paymentReference;
            const currentSold = this.memorySold.get(res.productId) || 0;
            this.memorySold.set(res.productId, currentSold + res.quantity);
            const result = {
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
        }
        else {
            res.status = 'CANCELLED';
            const curStock = this.memoryStock.get(res.productId) || 0;
            const restored = curStock + res.quantity;
            this.memoryStock.set(res.productId, restored);
            const result = {
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
    async sweepExpiredLeases(batchLimit = 100) {
        if (this.isRedisConnected && this.client) {
            try {
                const rawResult = (await this.client.eval(this.sweepLua, 1, 'reservation:leases', Date.now(), batchLimit));
                return JSON.parse(rawResult);
            }
            catch (err) {
            }
        }
        const now = Date.now();
        const expired = [];
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
    async getInventoryStatus(productId) {
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
            }
            catch (err) {
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
    async resetState(productId, initialStock) {
        this.memoryStock.set(productId, initialStock);
        this.memorySold.set(productId, 0);
        this.memoryReservations.clear();
        this.memoryLeases.clear();
        this.memoryIdempotency.clear();
        if (this.isRedisConnected && this.client) {
            try {
                await this.client.flushdb();
                await this.initializeProductStock(productId, initialStock);
            }
            catch (err) { }
        }
    }
};
exports.RedisService = RedisService;
exports.RedisService = RedisService = RedisService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], RedisService);
//# sourceMappingURL=redis.service.js.map