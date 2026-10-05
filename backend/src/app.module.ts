import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { InventoryModule } from './inventory/inventory.module';

@Module({
  imports: [DatabaseModule, RedisModule, InventoryModule],
})
export class AppModule {}
