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
var InventoryExpiryService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryExpiryService = void 0;
const common_1 = require("@nestjs/common");
const redis_service_1 = require("../redis/redis.service");
const database_service_1 = require("../database/database.service");
let InventoryExpiryService = InventoryExpiryService_1 = class InventoryExpiryService {
    constructor(redisService, dbService) {
        this.redisService = redisService;
        this.dbService = dbService;
        this.logger = new common_1.Logger(InventoryExpiryService_1.name);
        this.timer = null;
        this.isProcessing = false;
    }
    onModuleInit() {
        this.startSweeper();
    }
    onModuleDestroy() {
        this.stopSweeper();
    }
    startSweeper() {
        this.timer = setInterval(async () => {
            await this.sweepLeases();
        }, 500);
        this.logger.log('Inventory Expiry Background Sweeper started (interval: 500ms)');
    }
    stopSweeper() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    async sweepLeases() {
        if (this.isProcessing)
            return [];
        this.isProcessing = true;
        try {
            const expiredLeases = await this.redisService.sweepExpiredLeases(100);
            if (expiredLeases && expiredLeases.length > 0) {
                this.logger.log(`Swept and released ${expiredLeases.length} expired reservation leases back to inventory.`);
                for (const expired of expiredLeases) {
                    try {
                        await this.dbService.query(`UPDATE reservations
               SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP
               WHERE id = $1 AND status = 'RESERVED'`, [expired.id]);
                        await this.dbService.query(`INSERT INTO inventory_ledger (product_id, action, delta, reference_id)
               VALUES ($1, 'RELEASE_EXPIRED', $2, $3)`, [expired.productId, expired.quantity, expired.id]);
                    }
                    catch (dbErr) {
                        this.logger.error(`Failed to update DB for expired reservation ${expired.id}:`, dbErr.message);
                    }
                }
            }
            return expiredLeases;
        }
        catch (err) {
            this.logger.error('Error during lease sweep cycle:', err.message);
            return [];
        }
        finally {
            this.isProcessing = false;
        }
    }
};
exports.InventoryExpiryService = InventoryExpiryService;
exports.InventoryExpiryService = InventoryExpiryService = InventoryExpiryService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [redis_service_1.RedisService,
        database_service_1.DatabaseService])
], InventoryExpiryService);
//# sourceMappingURL=inventory.expiry.service.js.map