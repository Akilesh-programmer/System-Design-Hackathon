-- sweep_leases.lua
-- KEYS[1] = reservation:leases (ZSET)
-- ARGV[1] = currentTimestampMs
-- ARGV[2] = batchLimit (e.g. 100)

local currentMs = tonumber(ARGV[1])
local limit = tonumber(ARGV[2]) or 100

-- Find all leases that expired on or before currentMs
local expiredIds = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', currentMs, 'LIMIT', 0, limit)
local expiredResults = {}

for _, resId in ipairs(expiredIds) do
    -- Remove from lease ZSET
    redis.call('ZREM', KEYS[1], resId)

    local resKey = 'reservation:' .. resId
    local resJson = redis.call('GET', resKey)

    if resJson then
        local res = cjson.decode(resJson)
        if res.status == "RESERVED" or res.status == "PAYMENT_PENDING" then
            -- Transition state to EXPIRED
            res.status = "EXPIRED"
            res.expiredAt = currentMs
            redis.call('SET', resKey, cjson.encode(res))

            -- Restore inventory to product stock pool
            local stockKey = 'inventory:product:' .. res.productId .. ':stock'
            local restoredStock = redis.call('INCRBY', stockKey, res.quantity)

            table.insert(expiredResults, {
                id = res.id,
                productId = res.productId,
                userId = res.userId,
                quantity = res.quantity,
                restoredStock = restoredStock,
                expiredAt = currentMs
            })
        end
    end
end

return cjson.encode(expiredResults)
