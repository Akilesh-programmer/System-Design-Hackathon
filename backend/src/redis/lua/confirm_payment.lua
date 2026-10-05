-- confirm_payment.lua
-- KEYS[1] = reservation:{reservationId}
-- KEYS[2] = reservation:leases (ZSET)
-- KEYS[3] = inventory:product:{productId}:stock
-- KEYS[4] = inventory:product:{productId}:sold
-- KEYS[5] = idempotency:{paymentIdempotencyKey}
-- ARGV[1] = reservationId
-- ARGV[2] = paymentStatus ("SUCCESS" or "FAILED")
-- ARGV[3] = paymentReference (transaction ID / mock ref)
-- ARGV[4] = timestampIso

-- 1. Idempotency Check
if KEYS[5] and #KEYS[5] > 0 then
    local existing = redis.call('GET', KEYS[5])
    if existing then
        return cjson.encode({
            status = "IDEMPOTENT_HIT",
            data = cjson.decode(existing)
        })
    end
end

-- 2. Fetch Reservation
local reservationJson = redis.call('GET', KEYS[1])
if not reservationJson then
    return cjson.encode({
        status = "RESERVATION_NOT_FOUND",
        message = "Reservation does not exist or has expired"
    })
end

local res = cjson.decode(reservationJson)

-- 3. Check current state
if res.status == "SOLD" or res.status == "CONFIRMED" then
    return cjson.encode({
        status = "ALREADY_COMPLETED",
        reservation = res
    })
end

if res.status == "EXPIRED" or res.status == "CANCELLED" then
    return cjson.encode({
        status = "ALREADY_INVALIDATED",
        currentStatus = res.status,
        message = "Reservation has already expired or been cancelled"
    })
end

-- 4. Remove from expiry lease set
redis.call('ZREM', KEYS[2], ARGV[1])

local paymentSuccess = (ARGV[2] == "SUCCESS")

if paymentSuccess then
    -- Transition: RESERVED -> CONFIRMED -> SOLD
    res.status = "SOLD"
    res.paymentStatus = "SUCCESS"
    res.paymentReference = ARGV[3]
    res.confirmedAt = ARGV[4]

    redis.call('SET', KEYS[1], cjson.encode(res))
    redis.call('INCRBY', KEYS[4], res.quantity)

    local result = {
        status = "PAYMENT_CONFIRMED",
        reservationId = res.id,
        productId = res.productId,
        quantity = res.quantity,
        finalState = "SOLD",
        paymentReference = ARGV[3]
    }

    if KEYS[5] and #KEYS[5] > 0 then
        redis.call('SETEX', KEYS[5], 600, cjson.encode(result))
    end

    return cjson.encode(result)
else
    -- Payment failed: Transition to CANCELLED and restore inventory
    res.status = "CANCELLED"
    res.paymentStatus = "FAILED"
    res.cancelledAt = ARGV[4]

    redis.call('SET', KEYS[1], cjson.encode(res))
    
    -- Atomic inventory replenishment
    local newStock = redis.call('INCRBY', KEYS[3], res.quantity)

    local result = {
        status = "PAYMENT_FAILED_AND_RELEASED",
        reservationId = res.id,
        productId = res.productId,
        quantity = res.quantity,
        restoredStock = newStock,
        finalState = "CANCELLED"
    }

    if KEYS[5] and #KEYS[5] > 0 then
        redis.call('SETEX', KEYS[5], 600, cjson.encode(result))
    end

    return cjson.encode(result)
end
