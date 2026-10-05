import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
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
export declare class RedisService implements OnModuleInit, OnModuleDestroy {
    private readonly logger;
    private client;
    isRedisConnected: boolean;
    private reserveLua;
    private confirmLua;
    private sweepLua;
    private memoryStock;
    private memorySold;
    private memoryReservations;
    private memoryLeases;
    private memoryIdempotency;
    constructor();
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    getClient(): Redis | null;
    initializeProductStock(productId: string, totalStock: number): Promise<void>;
    reserveInventory(params: {
        productId: string;
        userId: string;
        quantity: number;
        reservationId: string;
        idempotencyKey: string;
        ttlSeconds: number;
    }): Promise<ReservationResult>;
    confirmPayment(params: {
        reservationId: string;
        paymentStatus: 'SUCCESS' | 'FAILED';
        paymentReference?: string;
        paymentIdempotencyKey?: string;
    }): Promise<PaymentConfirmResult>;
    sweepExpiredLeases(batchLimit?: number): Promise<ExpiredReservation[]>;
    getInventoryStatus(productId: string): Promise<{
        productId: string;
        availableStock: number;
        soldStock: number;
        activeReservations: number;
        totalTracked: number;
    }>;
    resetState(productId: string, initialStock: number): Promise<void>;
}
