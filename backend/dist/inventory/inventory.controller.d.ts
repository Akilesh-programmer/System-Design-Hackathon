import { InventoryService } from './inventory.service';
import { ReserveInventoryDto, ConfirmPaymentDto, ResetInventoryDto } from './dto/inventory.dto';
export declare class InventoryController {
    private readonly inventoryService;
    constructor(inventoryService: InventoryService);
    reserve(dto: ReserveInventoryDto, headerIdempotencyKey?: string, altHeaderKey?: string): Promise<{
        success: boolean;
        status: string;
        message: string;
        availableStock: number;
        data?: undefined;
        reservationId?: undefined;
        productId?: undefined;
        userId?: undefined;
        quantity?: undefined;
        remainingStock?: undefined;
        expiresAt?: undefined;
        ttlSeconds?: undefined;
    } | {
        success: boolean;
        status: string;
        message: string;
        data: any;
        availableStock?: undefined;
        reservationId?: undefined;
        productId?: undefined;
        userId?: undefined;
        quantity?: undefined;
        remainingStock?: undefined;
        expiresAt?: undefined;
        ttlSeconds?: undefined;
    } | {
        success: boolean;
        status: string;
        reservationId: string;
        productId: string;
        userId: string;
        quantity: number;
        remainingStock: number;
        expiresAt: string;
        ttlSeconds: number;
        message?: undefined;
        availableStock?: undefined;
        data?: undefined;
    }>;
    confirmPayment(dto: ConfirmPaymentDto, headerIdempotencyKey?: string, altHeaderKey?: string): Promise<{
        success: boolean;
        status: string;
        message: string;
        data: any;
        reservationId?: undefined;
        finalState?: undefined;
        restoredStock?: undefined;
        paymentReference?: undefined;
    } | {
        success: boolean;
        status: "PAYMENT_CONFIRMED" | "PAYMENT_FAILED_AND_RELEASED";
        reservationId: string;
        finalState: string;
        restoredStock: number;
        paymentReference: string;
        message?: undefined;
        data?: undefined;
    }>;
    getStatus(productId: string): Promise<{
        productId: string;
        redis: {
            productId: string;
            availableStock: number;
            soldStock: number;
            activeReservations: number;
            totalTracked: number;
        };
        database: {
            totalInDb: number;
            reservedInDb: number;
            soldInDb: number;
            expiredInDb: number;
            cancelledInDb: number;
        };
        isConsistent: boolean;
        timestamp: string;
    }>;
    reset(dto: ResetInventoryDto): Promise<{
        success: boolean;
        message: string;
        productId: string;
        initialStock: number;
    }>;
}
