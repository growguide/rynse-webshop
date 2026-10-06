// Test environment — imported FIRST (ESM imports are hoisted, so env must live in its own module).
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://postgres@127.0.0.1:5432/rynse_test';
process.env.PAYMENT_PROVIDER = 'emulator';
process.env.EMULATOR_MANUAL_WEBHOOKS = 'true'; // tests deliver webhooks explicitly to control ordering
process.env.SITE_URL = 'http://test.local';
process.env.ADMIN_TOKEN = 'test-admin-token-0123456789';
process.env.CRON_SECRET = 'test-cron-secret';
process.env.EMAIL_PROVIDER = 'log';
process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters-long';
process.env.LOYALTY_YEAR_2_DISCOUNT = process.env.LOYALTY_YEAR_2_DISCOUNT || '10';
process.env.LOYALTY_YEAR_3_DISCOUNT = process.env.LOYALTY_YEAR_3_DISCOUNT || '15';

