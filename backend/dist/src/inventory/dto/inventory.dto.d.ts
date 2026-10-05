export declare class ReserveInventoryDto {
    productId: string;
    userId: string;
    quantity: number;
    idempotencyKey?: string;
}
export declare class ConfirmPaymentDto {
    reservationId: string;
    paymentStatus: 'SUCCESS' | 'FAILED';
    paymentReference?: string;
    paymentIdempotencyKey?: string;
}
export declare class ResetInventoryDto {
    productId?: string;
    totalStock?: number;
}
