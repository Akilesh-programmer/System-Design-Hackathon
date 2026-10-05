"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryController = void 0;
const common_1 = require("@nestjs/common");
const inventory_service_1 = require("./inventory.service");
const inventory_dto_1 = require("./dto/inventory.dto");
let InventoryController = class InventoryController {
    constructor(inventoryService) {
        this.inventoryService = inventoryService;
    }
    async reserve(dto, headerIdempotencyKey, altHeaderKey) {
        const key = headerIdempotencyKey || altHeaderKey;
        return this.inventoryService.reserve(dto, key);
    }
    async confirmPayment(dto, headerIdempotencyKey, altHeaderKey) {
        const key = headerIdempotencyKey || altHeaderKey;
        return this.inventoryService.confirmPayment(dto, key);
    }
    async getStatus(productId) {
        return this.inventoryService.getStatus(productId);
    }
    async reset(dto) {
        return this.inventoryService.reset(dto);
    }
};
exports.InventoryController = InventoryController;
__decorate([
    (0, common_1.Post)('reserve'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Headers)('x-idempotency-key')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [inventory_dto_1.ReserveInventoryDto, String, String]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "reserve", null);
__decorate([
    (0, common_1.Post)('confirm-payment'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Headers)('x-idempotency-key')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [inventory_dto_1.ConfirmPaymentDto, String, String]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "confirmPayment", null);
__decorate([
    (0, common_1.Get)('status/:productId'),
    __param(0, (0, common_1.Param)('productId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "getStatus", null);
__decorate([
    (0, common_1.Post)('reset'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [inventory_dto_1.ResetInventoryDto]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "reset", null);
exports.InventoryController = InventoryController = __decorate([
    (0, common_1.Controller)('inventory'),
    __metadata("design:paramtypes", [inventory_service_1.InventoryService])
], InventoryController);
//# sourceMappingURL=inventory.controller.js.map