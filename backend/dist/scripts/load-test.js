"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const undici_1 = require("undici");
const uuid_1 = require("uuid");
const BASE_URL = process.env.TARGET_URL || 'http://localhost:3000';
const PRODUCT_ID = 'product_x';
const TOTAL_REQUESTS = 10000;
const DUPLICATE_PERCENT = 0.02;
const PAYMENT_FAILURE_PERCENT = 0.05;
const INITIAL_STOCK = 100;
async function runLoadTest() {
    console.log('\n================================================================');
    console.log('⚡ FLASH SALE HIGH-CONCURRENCY VALIDATION ENGINE (10,000 REQUESTS) ⚡');
    console.log('================================================================');
    console.log(`Target Service: ${BASE_URL}`);
    console.log(`Product: ${PRODUCT_ID} | Initial Inventory: ${INITIAL_STOCK} units`);
    console.log(`Simulated Traffic: ${TOTAL_REQUESTS.toLocaleString()} concurrent requests`);
    console.log(`Duplicate Request Ratio: ${DUPLICATE_PERCENT * 100}%`);
    console.log(`Payment Failure Simulation Ratio: ${PAYMENT_FAILURE_PERCENT * 100}%\n`);
    const pool = new undici_1.Pool(BASE_URL, {
        connections: 100,
        pipelining: 10,
        keepAliveTimeout: 30000,
    });
    console.log('🔄 [Step 0] Initializing and resetting state...');
    const resetRes = await pool.request({
        path: '/inventory/reset',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId: PRODUCT_ID, totalStock: INITIAL_STOCK }),
    });
    const resetBody = (await resetRes.body.json());
    console.log(`✅ System reset confirmed: ${resetBody.message}\n`);
    console.log('📦 Generating 10,000 request payloads...');
    const duplicateCount = Math.floor(TOTAL_REQUESTS * DUPLICATE_PERCENT);
    const uniqueCount = TOTAL_REQUESTS - duplicateCount;
    const payloads = [];
    for (let i = 0; i < uniqueCount; i++) {
        const userId = `user_${i.toString().padStart(5, '0')}`;
        const idempotencyKey = `idemp_req_${i}_${(0, uuid_1.v4)().substring(0, 8)}`;
        payloads.push({
            userId,
            productId: PRODUCT_ID,
            quantity: 1,
            idempotencyKey,
            isDuplicate: false,
        });
    }
    for (let i = 0; i < duplicateCount; i++) {
        const targetIdx = Math.floor(Math.random() * uniqueCount);
        const original = payloads[targetIdx];
        payloads.push({
            userId: original.userId,
            productId: original.productId,
            quantity: 1,
            idempotencyKey: original.idempotencyKey,
            isDuplicate: true,
        });
    }
    for (let i = payloads.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [payloads[i], payloads[j]] = [payloads[j], payloads[i]];
    }
    const metrics = {
        totalSent: 0,
        reservedSuccess: 0,
        outOfStock: 0,
        idempotencyHits: 0,
        errors: 0,
        latencies: [],
        reservations: [],
    };
    console.log(`🚀 [Step 1] Firing ${TOTAL_REQUESTS.toLocaleString()} concurrent requests at the contention bottleneck...`);
    const startTime = Date.now();
    const BATCH_CONCURRENCY = 250;
    for (let i = 0; i < payloads.length; i += BATCH_CONCURRENCY) {
        const batch = payloads.slice(i, i + BATCH_CONCURRENCY);
        await Promise.all(batch.map(async (reqPayload) => {
            const reqStart = Date.now();
            try {
                const res = await pool.request({
                    path: '/inventory/reserve',
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'x-idempotency-key': reqPayload.idempotencyKey,
                    },
                    body: JSON.stringify({
                        productId: reqPayload.productId,
                        userId: reqPayload.userId,
                        quantity: reqPayload.quantity,
                        idempotencyKey: reqPayload.idempotencyKey,
                    }),
                });
                const latency = Date.now() - reqStart;
                metrics.latencies.push(latency);
                metrics.totalSent++;
                const body = (await res.body.json());
                if (body.status === 'RESERVED' && body.reservationId) {
                    metrics.reservedSuccess++;
                    metrics.reservations.push({
                        reservationId: body.reservationId,
                        userId: reqPayload.userId,
                        idempotencyKey: reqPayload.idempotencyKey,
                    });
                }
                else if (body.status === 'OUT_OF_STOCK') {
                    metrics.outOfStock++;
                }
                else if (body.status === 'IDEMPOTENT_HIT') {
                    metrics.idempotencyHits++;
                }
                else {
                    metrics.errors++;
                }
            }
            catch (err) {
                metrics.errors++;
            }
        }));
    }
    const totalDurationMs = Date.now() - startTime;
    const rps = (metrics.totalSent / (totalDurationMs / 1000)).toFixed(2);
    console.log(`\n⏱️ Step 1 Execution Completed in ${(totalDurationMs / 1000).toFixed(2)}s (${rps} req/sec)`);
    console.log('----------------------------------------------------------------');
    console.log(`• Total Requests Sent:          ${metrics.totalSent.toLocaleString()}`);
    console.log(`• Successfully Reserved:        ${metrics.reservedSuccess} (Expected: Exactly ${INITIAL_STOCK})`);
    console.log(`• Out of Stock Rejections:      ${metrics.outOfStock.toLocaleString()}`);
    console.log(`• Idempotent Deduplications:    ${metrics.idempotencyHits}`);
    console.log(`• Unhandled HTTP Errors:        ${metrics.errors}`);
    metrics.latencies.sort((a, b) => a - b);
    const p50 = metrics.latencies[Math.floor(metrics.latencies.length * 0.5)];
    const p95 = metrics.latencies[Math.floor(metrics.latencies.length * 0.95)];
    const p99 = metrics.latencies[Math.floor(metrics.latencies.length * 0.99)];
    console.log(`• Latency (p50 / p95 / p99):    ${p50}ms / ${p95}ms / ${p99}ms`);
    console.log('----------------------------------------------------------------\n');
    console.log('💳 [Step 2] Processing payment lifecycle for active reservations...');
    let paidCount = 0;
    let failedCount = 0;
    let paymentIdempotencyHits = 0;
    const failureThreshold = Math.round(metrics.reservations.length * PAYMENT_FAILURE_PERCENT);
    for (let idx = 0; idx < metrics.reservations.length; idx++) {
        const resv = metrics.reservations[idx];
        const isPaymentFailure = idx < failureThreshold;
        const paymentStatus = isPaymentFailure ? 'FAILED' : 'SUCCESS';
        const payIdempKey = `pay_idemp_${resv.reservationId}`;
        const payRes = await pool.request({
            path: '/inventory/confirm-payment',
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-idempotency-key': payIdempKey,
            },
            body: JSON.stringify({
                reservationId: resv.reservationId,
                paymentStatus,
                paymentReference: `gateway_tx_${(0, uuid_1.v4)().substring(0, 10)}`,
                paymentIdempotencyKey: payIdempKey,
            }),
        });
        const payBody = (await payRes.body.json());
        if (payBody.status === 'PAYMENT_CONFIRMED') {
            paidCount++;
        }
        else if (payBody.status === 'PAYMENT_FAILED_AND_RELEASED') {
            failedCount++;
        }
        const dupPayRes = await pool.request({
            path: '/inventory/confirm-payment',
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-idempotency-key': payIdempKey,
            },
            body: JSON.stringify({
                reservationId: resv.reservationId,
                paymentStatus,
                paymentReference: `gateway_tx_duplicate`,
                paymentIdempotencyKey: payIdempKey,
            }),
        });
        const dupPayBody = (await dupPayRes.body.json());
        if (dupPayBody.status === 'IDEMPOTENT_HIT') {
            paymentIdempotencyHits++;
        }
    }
    console.log(`• Payment Successful (SOLD):    ${paidCount}`);
    console.log(`• Payment Failed (RELEASED):    ${failedCount}`);
    console.log(`• Payment Idempotent Hits:      ${paymentIdempotencyHits}\n`);
    console.log('🔍 [Step 3] Fetching real-time system status & reconciliation audit...');
    const statusRes = await pool.request({
        path: `/inventory/status/${PRODUCT_ID}`,
        method: 'GET',
    });
    const statusBody = (await statusRes.body.json());
    console.log('\n================================================================');
    console.log('📊 FINAL INVENTORY RECONCILIATION & CONCURRENCY PROOF 📊');
    console.log('================================================================');
    console.log('Redis Inventory State:');
    console.log(`  - Available Stock:         ${statusBody.redis.availableStock}`);
    console.log(`  - Sold Stock (Confirmed):  ${statusBody.redis.soldStock}`);
    console.log(`  - Active Held Leases:      ${statusBody.redis.activeReservations}`);
    console.log(`  - Total Redis Units:       ${statusBody.redis.totalTracked}`);
    console.log('\nPostgreSQL Persistence State:');
    console.log(`  - Total Rows:              ${statusBody.database.totalInDb}`);
    console.log(`  - Confirmed Sold in DB:    ${statusBody.database.soldInDb}`);
    console.log(`  - Cancelled/Failed in DB:  ${statusBody.database.cancelledInDb}`);
    console.log('----------------------------------------------------------------');
    const zeroOversellingPass = (statusBody.redis.soldStock + statusBody.redis.activeReservations) <= INITIAL_STOCK;
    const noNegativeInventory = statusBody.redis.availableStock >= 0;
    const stockConservationPass = statusBody.redis.totalTracked === INITIAL_STOCK;
    const initialCapPass = metrics.reservedSuccess === INITIAL_STOCK;
    console.log(`\n🛡️  VALIDATION CHECKS:`);
    console.log(`1. [${initialCapPass ? 'PASS ✅' : 'FAIL ❌'}] Never Reserved > ${INITIAL_STOCK} Units: ${metrics.reservedSuccess} reserved`);
    console.log(`2. [${zeroOversellingPass ? 'PASS ✅' : 'FAIL ❌'}] Zero Overselling Invariant: Sold + Held (${statusBody.redis.soldStock + statusBody.redis.activeReservations}) <= ${INITIAL_STOCK}`);
    console.log(`3. [${noNegativeInventory ? 'PASS ✅' : 'FAIL ❌'}] Non-Negative Stock Counter: Available Stock = ${statusBody.redis.availableStock}`);
    console.log(`4. [${stockConservationPass ? 'PASS ✅' : 'FAIL ❌'}] Inventory Conservation Invariant: Total Tracked (${statusBody.redis.totalTracked}) == ${INITIAL_STOCK}`);
    console.log(`5. [${metrics.idempotencyHits > 0 ? 'PASS ✅' : 'FAIL ❌'}] Reservation Idempotency Protection: Caught ${metrics.idempotencyHits} duplicate attempts`);
    console.log(`6. [${paymentIdempotencyHits === metrics.reservations.length ? 'PASS ✅' : 'FAIL ❌'}] Payment Idempotency Protection: ${paymentIdempotencyHits}/${metrics.reservations.length} verified`);
    console.log(`7. [${failedCount === failureThreshold ? 'PASS ✅' : 'FAIL ❌'}] Inventory Release on Failure: ${failedCount} units safely returned to pool`);
    console.log('\n================================================================');
    if (initialCapPass && zeroOversellingPass && noNegativeInventory && stockConservationPass) {
        console.log('🎉 ALL CONCURRENCY & INTEGRITY INVARIANTS SATISFIED! 🎉');
    }
    else {
        console.log('⚠️ CONCURRENCY INTEGRITY VIOLATION DETECTED!');
    }
    console.log('================================================================\n');
    await pool.close();
}
runLoadTest().catch((err) => {
    console.error('Fatal load test error:', err);
    process.exit(1);
});
//# sourceMappingURL=load-test.js.map