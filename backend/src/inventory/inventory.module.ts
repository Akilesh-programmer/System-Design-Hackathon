import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryExpiryService } from './inventory.expiry.service';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, InventoryExpiryService],
  exports: [InventoryService, InventoryExpiryService],
})
export class InventoryModule {}
