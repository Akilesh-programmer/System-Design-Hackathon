import { IsString, IsNotEmpty, IsInt, Min, IsOptional } from 'class-validator';

export class ReserveInventoryDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsInt()
  @Min(1)
  quantity: number = 1;

  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}

export class ConfirmPaymentDto {
  @IsString()
  @IsNotEmpty()
  reservationId: string;

  @IsString()
  @IsNotEmpty()
  paymentStatus: 'SUCCESS' | 'FAILED';

  @IsString()
  @IsOptional()
  paymentReference?: string;

  @IsString()
  @IsOptional()
  paymentIdempotencyKey?: string;
}

export class ResetInventoryDto {
  @IsString()
  @IsOptional()
  productId?: string = 'product_x';

  @IsInt()
  @Min(0)
  @IsOptional()
  totalStock?: number = 100;
}
