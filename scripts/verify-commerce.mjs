import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
if (process.env.RUN_COMMERCE_INTEGRATION !== '1') { console.error('Set RUN_COMMERCE_INTEGRATION=1 to run isolated MongoDB integration checks. The script creates and removes its own QA database.'); process.exit(1); }
const require = createRequire(new URL('../server/package.json', import.meta.url));
const dotenv = require('dotenv'), mongoose = require('mongoose'), jwt = require('jsonwebtoken');
dotenv.config({ path: new URL('../server/.env', import.meta.url), quiet: true });
const uri = process.env.MONGO_URI;
if (!uri) throw new Error('No database configured');
const qaDbName = 'shopsphere_feature_qa_' + randomUUID().replaceAll('-', '').slice(0, 16);
for (const key of ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'RESEND_API_KEY', 'RESEND_FROM', 'ORDER_NOTIFICATION_EMAIL', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'SHIPROCKET_TOKEN']) delete process.env[key];
process.env.JWT_SECRET = 'temporary-qa-' + randomUUID(); process.env.NODE_ENV = 'test'; process.env.PUBLIC_SITE_URL = 'https://shop-sand-gamma.vercel.app';
let server;
try {
    await mongoose.connect(uri, { dbName: qaDbName, serverSelectionTimeoutMS: 8000, maxPoolSize: 5 });
    assert.equal(mongoose.connection.name, qaDbName);
    const models = await import('../server/db/models.js');
    await Promise.all(Object.values(models).map(model => model.init()));
    const { User, Category, Product, Order, Coupon, CartState, Inbox, Review, StockMovement, StoreSettings } = models;
    await StoreSettings.create({ _id: "store", currency: "INR", shippingFee: 0, freeShippingThreshold: 75 });
    const { app } = await import('../server/app.js');
    const owner = await User.create({ name: 'QA Owner', email: 'owner@example.test', password: 'temporary-test-password', role: 'superadmin' });
    const customer = await User.create({ name: 'QA Customer', email: 'customer@example.test', password: 'temporary-test-password' });
    const other = await User.create({ name: 'QA Other', email: 'other@example.test', password: 'temporary-test-password' });
    await Category.create({ name: 'QA Collection', slug: 'qa' });
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve) });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(path, { method = 'GET', body, account = customer, raw = false, root = false } = {}) {
        const response = await fetch(base + (root ? '' : '/api') + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ sub: account.id }, process.env.JWT_SECRET)}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        return { status: response.status, body: raw ? await response.text() : response.headers.get('content-type')?.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()) };
    }
    const created = await request('/admin/products', { account: owner, method: 'POST', body: { name: 'QA Tee', category: 'QA Collection', categorySlug: 'qa', description: 'QA item for isolated feature tests.', image: 'https://example.test/item.jpg', price: 100, stock: 0, variants: [{ sku: 'QA-M', size: 'M', color: 'Blue', price: 100, stock: 10 }, { sku: 'QA-L', size: 'L', color: 'Blue', price: 125, stock: 5 }] } });
    assert.equal(created.status, 201, JSON.stringify(created.body)); const product = created.body.product;
    const couponResponse = await request('/admin/coupons', { account: owner, method: 'POST', body: { code: 'QA10', type: 'percent', currency: 'INR', amount: 10, minimum: 0, maximumDiscount: 0, maxUses: 1 } }); assert.equal(couponResponse.status, 201, JSON.stringify(couponResponse.body));
    const shippingAddress = { firstName: 'QA', lastName: 'Customer', email: 'customer@example.test', street: '1 Test Lane', city: 'Test City', state: 'Test', postalCode: '12345', phone: '1234567890' };
    const body = { items: [{ product: product._id, variantSku: 'QA-M', quantity: 2 }], shippingAddress, paymentMethod: 'cash_on_delivery', couponCode: 'QA10', total: .01 };
    const placed = await request('/orders', { method: 'POST', body }); assert.equal(placed.status, 201, JSON.stringify(placed.body)); assert.equal(placed.body.order.total, 180); const order = placed.body.order;
    assert.equal((await Product.findById(product._id)).variants[0].stock, 8);
    assert.equal((await request('/orders', { method: 'POST', body, account: other })).status, 400);
    assert.equal((await request(`/orders/${order._id}/invoice`, { account: other })).status, 404);
    for (const status of ['processing', 'shipped', 'delivered']) { const response = await request(`/admin/orders/${order._id}`, { account: owner, method: 'PATCH', body: { status } }); assert.equal(response.status, 200, JSON.stringify(response.body)); }
    const submitted = await request(`/products/${product._id}/review`, { method: 'PUT', body: { rating: 5, title: 'A good find', text: 'A comfortable everyday tee.', photos: [] } }); assert.equal(submitted.status, 200, JSON.stringify(submitted.body)); assert.equal(await Review.countDocuments(), 1); assert.equal((await Product.findById(product._id)).rating, 5);
    const alert = await request(`/products/${product._id}/alerts`, { method: 'POST', body: { type: 'price', targetPrice: 90 } }); assert.equal(alert.status, 200, JSON.stringify(alert.body));
    const current = await Product.findById(product._id).lean(); const variants = current.variants.map(({ sku, size, color, price, stock }) => ({ sku, size, color, price: sku === 'QA-M' ? 80 : price, stock }));
    const changed = await request(`/admin/products/${product._id}`, { account: owner, method: 'PATCH', body: { variants } }); assert.equal(changed.status, 200, JSON.stringify(changed.body)); assert.equal(changed.body.product.price, 80); assert.ok(await Inbox.exists({ user: customer.id, key: { $regex: '^product-alert/' } }));
    for (const variantSku of ['QA-M', 'QA-L']) { const r = await request('/admin/inventory/adjust', { account: owner, method: 'POST', body: { productId: product._id, variantSku, stock: 0, reason: 'QA reset' } }); assert.equal(r.status, 200, JSON.stringify(r.body)); }
    assert.equal((await request(`/products/${product._id}/alerts`, { method: 'POST', body: { type: 'stock' } })).status, 200);
    assert.equal((await request('/admin/inventory/adjust', { account: owner, method: 'POST', body: { productId: product._id, variantSku: 'QA-M', stock: 3, reason: 'QA restock' } })).status, 200);
    const missingId = new mongoose.Types.ObjectId(); const csv = `productId,variantSku,stock,reason\n${product._id},QA-M,10,QA valid row\n${missingId},,1,QA missing product`;
    const imported = await request('/admin/inventory/import', { account: owner, method: 'POST', body: { csv } }); assert.equal(imported.status, 404, JSON.stringify(imported.body)); assert.equal((await Product.findById(product._id)).variants[0].stock, 3, 'CSV changes must roll back on a later invalid row');
    const orderBody = { ...body, couponCode: '', items: [{ product: product._id, variantSku: 'QA-M', quantity: 2 }] };
    const race = await Promise.all([request('/orders', { method: 'POST', body: orderBody }), request('/orders', { method: 'POST', body: orderBody, account: other })]); assert.deepEqual(race.map(r => r.status).sort(), [201, 409]); assert.equal((await Product.findById(product._id)).variants[0].stock, 1, 'Concurrent checkout must not oversell');
    await request('/cart', { account: other, method: 'PUT', body: { items: [{ product: product._id, variantSku: 'QA-M', quantity: 1 }] } });
    await CartState.updateOne({ user: other.id }, { $set: { updatedAt: new Date(Date.now() - 3600000) } }, { timestamps: false });
    const report = await request('/admin/reports?days=30', { account: owner }); assert.equal(report.status, 200, JSON.stringify(report.body)); assert.equal(report.body.bestsellers[0].units, 4); assert.equal(report.body.abandoned.length, 1);
    const invoice = await request(`/orders/${order._id}/invoice`); assert.equal(invoice.status, 200); assert.equal(invoice.body.subarray(0, 5).toString(), '%PDF-');
    const seo = await request(`/products/${product._id}`, { root: true, raw: true }); assert.equal(seo.status, 200); assert.match(seo.body, /application\/ld\+json/); assert.match(seo.body, /<title>QA Tee/);
    const sitemap = await request('/sitemap.xml', { root: true, raw: true }); assert.equal(sitemap.status, 200); assert.ok(sitemap.body.includes(product._id));
    const staff = await User.create({ name: 'QA Inventory', email: 'staff@example.test', password: 'temporary-test-password', role: 'admin', permissions: ['inventory'] }); assert.equal((await request('/admin/products', { account: staff })).status, 403); assert.equal((await request('/admin/inventory', { account: staff })).status, 200);
    assert.ok(await StockMovement.countDocuments() > 4); assert.equal(await Coupon.findOne({ code: 'QA10' }).then(c => c.uses), 1);
    // Real database wallet/express checks use isolated, explicitly synthetic captured-payment fixtures.
    const { Wallet, WalletEntry, WalletTopup, ProductAlert } = models;
    const { ensureWallet, finalizeTopup } = await import('../server/routes/wallet.js');
    await StoreSettings.updateOne({ _id: 'store' }, { $set: { walletEnabled: true, quickDeliveryEnabled: true, quickPincodes: '110001', quickDeliveryFee: 29, quickOpenHour: 0, quickCloseHour: 24 } });
    await Product.updateOne({ _id: product._id }, { $set: { quickEligible: true } });
    assert.equal((await request('/admin/inventory/adjust', { account: owner, method: 'POST', body: { productId: product._id, variantSku: 'QA-M', stock: 20, reason: 'Wallet and express QA restock' } })).status, 200);
    await ensureWallet(customer.id);
    const topup = await WalletTopup.create({ user: customer.id, amountMinor: 100000, requestKey: 'isolated-wallet-qa-topup', gatewayOrderId: 'order_isolatedWalletQA' });
    const payment = { id: 'pay_isolatedWalletQA', order_id: topup.gatewayOrderId, amount: 100000, currency: 'INR', status: 'captured' };
    await Promise.all([finalizeTopup(payment), finalizeTopup(payment)]);
    assert.equal((await Wallet.findOne({ user: customer.id })).balanceMinor, 100000);
    assert.equal(await WalletEntry.countDocuments({ user: customer.id, kind: 'topup' }), 1, 'Concurrent callbacks must credit the wallet once');
    const walletBody = { items: [{ product: product._id, variantSku: 'QA-M', quantity: 1 }], shippingAddress: { ...shippingAddress, postalCode: '110001' }, paymentMethod: 'wallet', deliveryMethod: 'express15', checkoutKey: 'qa-wallet-checkout-request-0001', expectedCurrency: 'INR', expectedSubtotal: 80 };
    const walletOrder = await request('/orders', { method: 'POST', body: walletBody }); assert.equal(walletOrder.status, 201, JSON.stringify(walletOrder.body));
    assert.equal(walletOrder.body.order.total, 109); assert.equal(walletOrder.body.order.paymentStatus, 'paid'); assert.ok(walletOrder.body.order.estimatedDeliveryAt);
    assert.equal((await Wallet.findOne({ user: customer.id })).balanceMinor, 89100);
    assert.equal((await request('/orders', { method: 'POST', body: walletBody })).status, 200); assert.equal((await Wallet.findOne({ user: customer.id })).balanceMinor, 89100, 'Checkout retries must not debit again');
    const outOfArea = await request('/orders', { method: 'POST', body: { ...walletBody, checkoutKey: 'qa-wallet-outside-area-0001', shippingAddress: { ...shippingAddress, postalCode: '400001' } } }); assert.equal(outOfArea.status, 409); assert.equal((await Wallet.findOne({ user: customer.id })).balanceMinor, 89100);
    const walletCancelled = await request(`/admin/orders/${walletOrder.body.order._id}`, { account: owner, method: 'PATCH', body: { status: 'cancelled' } }); assert.equal(walletCancelled.status, 200, JSON.stringify(walletCancelled.body)); assert.equal(walletCancelled.body.order.paymentStatus, 'refunded');
    await request(`/admin/orders/${walletOrder.body.order._id}`, { account: owner, method: 'PATCH', body: { status: 'cancelled' } }); assert.equal((await Wallet.findOne({ user: customer.id })).balanceMinor, 100000, 'Wallet refunds must be idempotent');
    assert.equal((await request(`/admin/orders/${walletOrder.body.order._id}`, { account: owner, method: 'PATCH', body: { status: 'placed' } })).status, 409);
    const spend = { ...walletBody, deliveryMethod: 'standard', items: [{ product: product._id, variantSku: 'QA-M', quantity: 10 }], expectedSubtotal: 800 };
    const spendRace = await Promise.all([request('/orders', { method: 'POST', body: { ...spend, checkoutKey: 'qa-wallet-race-checkout-0001' } }), request('/orders', { method: 'POST', body: { ...spend, checkoutKey: 'qa-wallet-race-checkout-0002' } })]);
    assert.deepEqual(spendRace.map(r => r.status).sort(), [201, 409]); assert.equal((await Wallet.findOne({ user: customer.id })).balanceMinor, 20000, 'Concurrent checkout must not double-spend wallet funds');
    const oldTotal = order.total; await Order.updateOne({ _id: order._id }, { $set: { currency: 'USD' } });
    await StoreSettings.updateOne({ _id: 'store' }, { $set: { currency: 'USD', shippingFee: 6.95, freeShippingThreshold: 75, announcement: 'Free delivery over $75' } });
    const fixed = await Coupon.create({ code: 'QAFX', type: 'fixed', currency: 'USD', amount: 1, minimum: 2, maximumDiscount: 3, maxUses: 0 });
    const { convertCatalogToInr } = await import('../server/convertCurrency.js');
    const conversion = await convertCatalogToInr(); assert.equal(conversion.changed, true); assert.equal((await Product.findById(product._id)).price, 7614.4); assert.equal((await Coupon.findById(fixed.id)).amount, 95.18); assert.equal((await StoreSettings.findById('store')).currency, 'INR');
    assert.equal((await Order.findById(order._id)).currency, 'USD'); assert.equal((await Order.findById(order._id)).total, oldTotal); assert.equal((await Wallet.findOne({ user: customer.id })).balanceMinor, 20000);
    assert.equal((await convertCatalogToInr()).changed, false, 'INR conversion must not run twice');
    console.log('PASS wallet/express/currency integration: concurrent top-up idempotency, authoritative wallet checkout, PIN restrictions, refunds, double-spend protection, one-time INR migration and unchanged historical orders.');
    console.log('PASS isolated MongoDB integration: real schemas/indexes/transactions, product variants, coupon usage, COD order, fulfillment, verified review, price/stock alerts, CSV rollback, concurrent stock allocation, reports, authenticated PDF, sitemap/product HTML and scoped staff access.');
} catch (error) { console.error('QA integration failed:', error.name, error.message?.replace(/mongodb[^\s]+/g, '[redacted]')); process.exitCode = 1; }
finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === qaDbName && /^shopsphere_feature_qa_[a-f0-9]{16}$/.test(qaDbName)) { try { await mongoose.connection.dropDatabase(); console.log('Removed the isolated QA database.'); } catch { console.error('Could not remove the QA database:', qaDbName); process.exitCode = 1; } }
    await mongoose.disconnect();
}
