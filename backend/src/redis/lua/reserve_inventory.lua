-- reserve_inventory.lua
-- KEYS[1] = inventory:product:{productId}:stock
-- KEYS[2] = reservation:{reservationId}
-- KEYS[3] = reservation:leases (ZSET)
-- KEYS[4] = idempotency:{idempotencyKey}
-- ARGV[1] = quantity (number)
-- ARGV[2] = reservationId
-- ARGV[3] = userId
-- ARGV[4] = productId
-- ARGV[5] = ttlSeconds (number)
-- ARGV[6] = expiryTimestampMs (number)
-- ARGV[7] = createdAtIso

-- 1. Idempotency check: if key exists, return stored result
local existingIdempotency = redis.call('GET', KEYS[4])
if existingIdempotency then
    return cjson.encode({
        status = "IDEMPOTENT_HIT",
        data = cjson.decode(existingIdempotency)
    })
end

-- 2. Check stock
local stockStr = redis.call('GET', KEYS[1])
if not stockStr then
    return cjson.encode({
        status = "PRODUCT_NOT_FOUND",
        message = "Product inventory key not initialized"
    })
end

local currentStock = tonumber(stockStr)
local reqQuantity = tonumber(ARGV[1])

if currentStock < reqQuantity then
    return cjson.encode({
        status = "OUT_OF_STOCK",
        availableStock = currentStock,
        requestedQuantity = reqQuantity
    })
end

-- 3. Atomic Decrement
local remainingStock = redis.call('DECRBY', KEYS[1], reqQuantity)

-- 4. Create Reservation Data
local reservation = {
    id = ARGV[2],
    productId = ARGV[4],
    userId = ARGV[3],
    quantity = reqQuantity,
    status = "RESERVED",
    createdAt = ARGV[7],
    expiresAt = tonumber(ARGV[6])
}
local reservationJson = cjson.encode(reservation)

-- Store reservation data with a safety buffer TTL (TTL + 300s)
local ttlSec = tonumber(ARGV[5])
redis.call('SETEX', KEYS[2], ttlSec + 300, reservationJson)

-- 5. Add to Lease Expiry Sorted Set (score = expiry timestamp in ms)
redis.call('ZADD', KEYS[3], tonumber(ARGV[6]), ARGV[2])

-- 6. Store Idempotency payload
local responsePayload = {
    status = "RESERVED",
    reservationId = ARGV[2],
    productId = ARGV[4],
    userId = ARGV[3],
    quantity = reqQuantity,
    remainingStock = remainingStock,
    expiresAt = tonumber(ARGV[6]),
    createdAt = ARGV[7]
}
redis.call('SETEX', KEYS[4], ttlSec * 4, cjson.encode(responsePayload))

return cjson.encode(responsePayload)
