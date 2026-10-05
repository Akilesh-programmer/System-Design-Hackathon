"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const common_1 = require("@nestjs/common");
const dotenv = require("dotenv");
dotenv.config();
async function bootstrap() {
    const logger = new common_1.Logger('Bootstrap');
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        logger: ['error', 'warn', 'log'],
    });
    app.enableCors({
        origin: '*',
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
        credentials: true,
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
    }));
    const port = process.env.PORT || 3000;
    await app.listen(port);
    logger.log(`🚀 Flash Sale Concurrency Service running at: http://localhost:${port}`);
    logger.log(`⚡ Reservation Endpoint: POST http://localhost:${port}/inventory/reserve`);
    logger.log(`⚡ Status Endpoint: GET http://localhost:${port}/inventory/status/product_x`);
}
bootstrap();
//# sourceMappingURL=main.js.map