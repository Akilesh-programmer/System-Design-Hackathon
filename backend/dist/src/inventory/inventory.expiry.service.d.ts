import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { RedisService, ExpiredReservation } from '../redis/redis.service';
import { DatabaseService } from '../database/database.service';
export declare class InventoryExpiryService implements OnModuleInit, OnModuleDestroy {
    private readonly redisService;
    private readonly dbService;
    private readonly logger;
    private timer;
    private isProcessing;
    constructor(redisService: RedisService, dbService: DatabaseService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    private startSweeper;
    private stopSweeper;
    sweepLeases(): Promise<ExpiredReservation[]>;
}
