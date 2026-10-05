import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
export declare class DatabaseService implements OnModuleInit, OnModuleDestroy {
    private readonly logger;
    private pool;
    isDbConnected: boolean;
    private memoryReservations;
    private memoryOrders;
    private memoryLedger;
    constructor();
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    query(text: string, params?: any[]): Promise<{
        rows: any[];
    }>;
}
