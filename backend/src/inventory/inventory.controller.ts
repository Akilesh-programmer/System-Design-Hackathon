import { Controller, Post, Get, Body, Headers, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { ReserveInventoryDto, ConfirmPaymentDto, ResetInventoryDto } from './dto/inventory.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  /**
   * High-concurrency inventory reservation endpoint
   * Protects against overselling using atomic Redis Lua scripts and validates idempotency
   */
  @Post('reserve')
  @HttpCode(HttpStatus.OK)
  async reserve(
    @Body() dto: ReserveInventoryDto,
    @Headers('x-idempotency-key') headerIdempotencyKey?: string,
    @Headers('idempotency-key') altHeaderKey?: string,
  ) {
    const key = headerIdempotencyKey || altHeaderKey;
    return this.inventoryService.reserve(dto, key);
  }

  /**
   * Payment confirmation & lifecycle state transition endpoint
   * Handles: RESERVED -> CONFIRMED -> SOLD or CANCELLED (replenishing stock on failure)
   */
  @Post('confirm-payment')
  @HttpCode(HttpStatus.OK)
  async confirmPayment(
    @Body() dto: ConfirmPaymentDto,
    @Headers('x-idempotency-key') headerIdempotencyKey?: string,
    @Headers('idempotency-key') altHeaderKey?: string,
  ) {
    const key = headerIdempotencyKey || altHeaderKey;
    return this.inventoryService.confirmPayment(dto, key);
  }

  /**
   * Real-time stock status & reconciliation validation
   */
  @Get('status/:productId')
  async getStatus(@Param('productId') productId: string) {
    return this.inventoryService.getStatus(productId);
  }

  /**
   * Reset endpoint for automated benchmark testing
   */
  @Post('reset')
  @HttpCode(HttpStatus.OK)
  async reset(@Body() dto: ResetInventoryDto) {
    return this.inventoryService.reset(dto);
  }
}
