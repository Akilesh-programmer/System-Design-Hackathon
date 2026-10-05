-- Schema initialization for Flash Sale Prototype

CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    total_stock INT NOT NULL CHECK (total_stock >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reservations (
    id VARCHAR(64) PRIMARY KEY,
    product_id VARCHAR(64) NOT NULL REFERENCES products(id),
    user_id VARCHAR(64) NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    status VARCHAR(32) NOT NULL, -- 'RESERVED', 'PAYMENT_PENDING', 'CONFIRMED', 'SOLD', 'EXPIRED', 'CANCELLED'
    idempotency_key VARCHAR(128) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reservations_product_status ON reservations(product_id, status);
CREATE INDEX IF NOT EXISTS idx_reservations_expires_at ON reservations(expires_at) WHERE status = 'RESERVED';

CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(64) PRIMARY KEY,
    reservation_id VARCHAR(64) NOT NULL REFERENCES reservations(id),
    user_id VARCHAR(64) NOT NULL,
    product_id VARCHAR(64) NOT NULL REFERENCES products(id),
    quantity INT NOT NULL,
    payment_status VARCHAR(32) NOT NULL, -- 'SUCCESS', 'FAILED'
    payment_reference VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_ledger (
    id SERIAL PRIMARY KEY,
    product_id VARCHAR(64) NOT NULL REFERENCES products(id),
    action VARCHAR(32) NOT NULL, -- 'INITIAL_LOAD', 'RESERVE', 'RELEASE_EXPIRED', 'RELEASE_FAILED', 'CONFIRM_SALE'
    delta INT NOT NULL, -- negative for reserves, positive for releases
    reference_id VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
