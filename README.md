# ShopSphere

ShopSphere is a React/Vite single-page storefront with a separate Express API. Product browsing, search, category filters, cart, wishlist, registration, sign-in, profile details and profile photos, cash-on-delivery checkout, order history, and an admin console are included. Profile photos are resized to JPEG in the browser and stored on the user's MongoDB record with an 180 KB limit.

## Requirements

- Node.js 20.19 or newer (or 22.12+)
- npm
- MongoDB Atlas database for persistent accounts, products, categories, and orders

## Run locally

1. Install frontend dependencies from the project root:

   ```sh
   npm install
   ```

2. Copy `server/.env.example` to `server/.env` (the API reads `server/.env`, not the example file). In `server/.env`, set `MONGO_URI` to your Atlas connection string and `JWT_SECRET` to a unique random secret of at least 32 characters. Replace all URI placeholders without angle brackets; URL-encode any special characters in the database password. Add your local frontend URL to `FRONTEND_URL`. Never put real credentials in `.env.example` or share them in chat.

3. Install API dependencies and seed the initial catalog:

   ```sh
   npm --prefix server install
   npm --prefix server run seed
   ```

4. In one terminal, start the API:

   ```sh
   npm run dev:api
   ```

5. In another terminal, start the React/Vite app:

   ```sh
   npm run dev
   ```

   Open the Vite URL shown in the terminal (normally `http://localhost:5173`). Vite proxies `/api` to `http://localhost:5000` for local development. Set `VITE_API_URL` in a root `.env` file to use another API.

6. To enable the admin console, fill `ADMIN_EMAIL`, `ADMIN_NAME`, and a unique `ADMIN_PASSWORD` (12 or more characters) in `server/.env`, then run:

   ```sh
   npm --prefix server run create-admin
   ```

   Register or sign in with that account and visit `/admin`. Never commit `.env` files or share database credentials.

If the API is offline, product pages use a clearly labeled preview catalog; authentication, checkout, and admin changes require the API and database to be available. No customer, order, or database data is faked in preview mode.

## Super admin control center

The owner dashboard is at `/super-admin`. Super admins can manage products (including homepage featuring), collections, order status, customer and staff access, website branding, homepage hero content, support details, shipping prices and whether checkout accepts new orders. The overview shows live order and inventory counts; the activity log shows the last 100 successful administrator mutations.

To provision an owner account, set `MONGO_URI`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_NAME`, and a unique `SUPER_ADMIN_PASSWORD` of 12–128 characters in `server/.env`, then run from the project root:

```sh
npm --prefix server run create-super-admin
npm run start:api
```

Sign in at `/login`; a super admin is redirected to `/super-admin`. If the email already belongs to an account, the command promotes that account and keeps its existing password. There are no default owner credentials and public registration always creates a customer. The command needs a reachable MongoDB database; the dashboard never substitutes preview data for users or orders.

Customer and admin accounts can be blocked or assigned the customer/admin role. Super admin accounts are protected from changes in the UI and API to avoid owner lockout; provision additional owners with the server command. Every authenticated request loads the current account role and status, so blocking and role changes also affect previously issued tokens.

Website settings are stored in MongoDB and applied to the storefront on reload (or immediately after the owner saves). Shipping charges and the checkout pause are enforced by the server. Update the announcement bar when changing a shipping promotion. Activity logging is best effort and contains the actor, HTTP method, resource path and timestamp; request bodies and passwords are not logged. Existing changes before this feature was installed are not backfilled.

Run the authorization and settings checks with `npm --prefix server test`. These exercise real HTTP routing and JWT authentication with isolated database model stubs; live database persistence needs a configured MongoDB instance.

## Production build

```sh
npm run build
npm run preview
```

Vercel can now host both the Vite SPA and the existing Express API in one project. `api/index.js` is the Node function; it imports `server/app.js`, which contains all existing routes and does not open a port or exit the process on import. `server/index.js` remains the local/Render listening entry point. The root install command installs both package-lock files, so Express, Mongoose and other nested backend dependencies are available when Vercel traces the function.

The frontend defaults to same-origin `/api` in production. A separate backend URL is no longer required. `vercel.json` sends `/api` and every `/api/*` path to the API function before the SPA fallback. Unknown API endpoints return JSON 404 responses; unknown SPA paths go to the React app. Vite's local proxy is used only by the development server.

Configure this existing Vercel project as follows:

| Setting | Value |
| --- | --- |
| Root Directory | Repository root (`.`), not `server` or `dist` |
| Framework Preset | Vite |
| Install Command | `npm ci && npm --prefix server ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node.js version | 22.x |

The install/build/output settings are also committed in `vercel.json`. Remove old dashboard overrides that conflict with them. Do not use `npm start` or `npm run start:api` as Vercel's build command. After deployment, the Functions list should contain the `api/index` function.

Set these in Vercel → Project → Settings → Environment Variables, for Production and any Preview deployments that should use the backend:

| Variable | Value / purpose |
| --- | --- |
| `VITE_API_URL` | `/api`, or remove the variable to use the same default. Replace any stale external-backend URL. This is the only frontend variable required. |
| `MONGO_URI` | Your actual MongoDB Atlas URI, including the database name. Server-only. |
| `JWT_SECRET` | A strong random secret of at least 32 characters. Server-only; reuse the previous secret if existing tokens must remain valid. |
| `FRONTEND_URL` | `https://shop-sand-gamma.vercel.app` for the stated production site. Additional trusted frontend origins can be comma-separated. Same-origin requests and Vercel's supplied deployment hostnames are also supported. |
| `NODEJS_HELPERS` | `0`, so Vercel does not preparse request bodies needed by the signed Razorpay raw-body webhook. |
| `CRON_SECRET` | A separate strong random secret of at least 32 characters, used by the protected notification retry cron. |

Never prefix database, authentication, payment or email secrets with `VITE_`: Vite exposes prefixed values in the browser bundle. Local `.env` files are excluded from upload in `.vercelignore`; set real production secrets in the Vercel dashboard. MongoDB Atlas must permit connections from your deployment's egress network, and the database user needs access to the selected database. Order placement/payment reconciliation requires a transaction-capable Atlas deployment. A missing configuration or failed connection returns JSON 503; it is not reported as healthy.

Optional server-only variables remain unchanged: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, and `ORDER_NOTIFICATION_EMAIL`. Point Razorpay's webhook to `https://shop-sand-gamma.vercel.app/api/payments/webhook` for this deployment. Admin provisioning variables are needed only for the one-time provisioning scripts, not normal API requests. Deployment does not seed products or create an administrator automatically.

MongoDB connections and in-flight connection promises are reused within a warm function instance, with a small pool and bounded connection timeout. Failed connections can be retried by later requests. The function never disconnects the pool at the end of a request.

Notification and audit work is retained with Vercel's `waitUntil`. The durable outbox is also retried in bounded batches after successful API requests. A protected daily cron (`06:00 UTC`) handles idle retries; this schedule is compatible with the Hobby daily-cron limit. This is not a continuously running 15-second worker. For frequent retries on an otherwise idle site, configure a scheduler allowed by your plan or keep the existing always-on Render worker. Local/Render startup retains the existing worker. The cron requires `Authorization: Bearer <CRON_SECRET>`; Vercel supplies it when `CRON_SECRET` is configured.

Save the variables, then redeploy the latest commit. Vite replaces frontend variables at build time, so changes do not affect an already-built deployment. Verify the real deployment with:

```sh
npm run verify:production -- https://shop-sand-gamma.vercel.app
```

This requires `/api/health` to return HTTP 200 JSON with `database: "connected"`, verifies catalog JSON, login validation, authentication enforcement, API 404 JSON and the `/login` SPA fallback. To also test a real existing account, set `SHOPSPHERE_SMOKE_EMAIL` and `SHOPSPHERE_SMOKE_PASSWORD` locally before running the script; the credentials and returned token are never logged. The smoke script does not create customers, orders, payments or emails. A working local build or stubbed test suite does not prove that the live API is configured.

Reference: [Vite functions on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [Node.js functions](https://vercel.com/docs/functions/runtimes/node-js), [Node.js helper configuration](https://vercel.com/docs/functions/runtimes/node-js/advanced-node-configuration), and [cron authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

The separate Render deployment remains optional: use `render.yaml`, keep secrets on Render, and set `VITE_API_URL` to its actual HTTPS `/api` base only if choosing that architecture. No external backend URL is hardcoded or inferred.

## Main routes

- `/`, `/products`, `/products/:id`, `/categories/:category`
- `/cart`, `/wishlist`, `/checkout`
- `/login`, `/register`, `/my-orders`, `/my-orders/:id`, `/profile`
- `/admin` (administrator account required)
- `/super-admin` (super administrator account required)

The API is mounted at `/api`; `GET /api/health` reports API and database connection status.

## Sale, sample catalog, payment and email setup

The preview now includes **48 sample products across four collections**, with computed sale discounts. Sale products appear in a banner, a dedicated homepage section and `/products?sale=true`. Set a product's compare-at price above its selling price to include it in the sale. The super admin can edit the sale text and turn the promotion on or off in Website settings.

To add the sample products to a connected database, run `npm --prefix server run seed`. The seed adds missing products and categories without overwriting existing entries. Sample ratings and reviews are illustrative; seeded sample items are marked as demo products. No fake customers, orders, email delivery or payment success is generated. Test products cannot be charged using live Razorpay keys. Replace their details with actual inventory and remove the demo flag when ready to sell them.

For **Razorpay + cash on delivery**:

1. Put `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` in `server/.env`. Start with test-mode keys.
2. In Razorpay, enable automatic payment capture. Add a webhook at your public API's `/api/payments/webhook` URL, subscribe to `payment.captured` and use the same webhook secret.
3. In Super admin → Website settings, enable Razorpay. Select **INR for UPI** and set your actual INR catalog/shipping prices first. The catalog now defaults to INR. Existing USD catalog values can be converted once using the migration command below. Currency selection does not convert prices; USD checkout requires a Razorpay account enabled for that currency. Orders keep a currency snapshot, and dashboard totals are grouped by currency.
4. Test a payment, cancellation, retry and webhook before enabling live keys. The app creates the gateway order server-side, checks callback signatures, fetches the captured payment and validates its order, amount and currency before confirming the order. It never receives card details. See the [official Razorpay integration guide](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/) and [webhook validation guide](https://razorpay.com/docs/webhooks/validate-test/).

Unpaid online orders do not reserve stock and remain awaiting payment. Stock is allocated transactionally after capture; repeated callbacks/webhooks do not allocate it twice. If an item sells out before payment is confirmed, the order is cancelled and flagged `refund_required`, and both parties receive a payment-review notification. Refunds must be reviewed and issued in the gateway dashboard; the app does not issue refunds automatically. Cancelling a paid, unshipped order also marks it for refund review. Unpaid orders cannot be fulfilled through the admin status selector.

For **order emails**, configure `RESEND_API_KEY`, `RESEND_FROM` (a verified sender/domain), and `ORDER_NOTIFICATION_EMAIL` (the store owner's real address). Customer confirmations go to the checkout email. [Resend's sending API](https://resend.com/docs/api-reference/emails/send-email) is used from the server. Cash-on-delivery orders queue confirmations when placed; online orders queue them after verified capture. The database outbox is written in the order transaction, and the API worker retries transient failures with backoff, for up to eight attempts. Provider idempotency keys and stored sent status prevent normal retries from duplicating emails. "Sent" means accepted by the provider, not guaranteed inbox delivery.

The Orders table shows customer email status and can retry unsent notifications. Owner emails need the owner address configured; retry a historical order after adding it to enqueue the missing owner notification. Website settings shows whether gateway, email sender and owner recipient configuration is present; it never displays secret keys. Without configuration, online payment stays unavailable and email jobs remain queued. MongoDB must support transactions (for example Atlas).

Validation: `npm --prefix server test` covers role enforcement, COD checkout, payment signatures and ownership, amount/currency mismatches, duplicate captures, missing configuration, out-of-stock capture, email escaping, retries and the sample catalog. These checks use isolated database/provider stubs; they do not charge cards, send email or replace end-to-end testing with configured services.


## Advanced commerce workspace

OTP, forgot-password and administrator 2FA were intentionally left out of this upgrade. Existing password sign-in and server-side authentication remain in place.

Open **Super admin / Commerce tools**, or visit `/management` after signing in as an authorized administrator. The original `/admin` catalog/order workspace remains available. Customer notifications are at `/notifications`; invoices and shipment history are in each customer's order details.

- **Variants:** Add size/color options with unique immutable SKUs, independent prices and stock in the product editor. Existing SKU stock is changed through Inventory, so checkout and adjustments share the same transaction-backed ledger. Prices are reloaded from MongoDB at checkout; browser totals are never trusted. Existing orders keep their original item/variant prices. Product starting price is the cheapest option, including sold-out options; customers must choose an available option.
- **Offers:** Create fixed or percentage codes with currency, minimum cart value, discount cap, start/expiry dates and total usage limit. Each customer can use a code once. Capacity and customer use are reserved transactionally for online orders; pending reservations expire after 30 minutes and are released by maintenance. Shipping eligibility uses the subtotal after discounts. Cancelled orders release the reservation; discounted cancelled orders must be reordered rather than reopened. Captures arriving after the payment window are flagged for refund review, not fulfilled automatically.
- **Inventory:** Adjust stock with a reason, inspect recent movements and import up to 100 rows atomically. CSV header: `productId,variantSku,stock,reason`. `stock` is the desired final quantity; use a blank SKU for products without options. Product IDs/SKUs appear in the overview. Low-stock crossings queue an owner email when the recipient and email provider are configured. Earlier stock changes are not backfilled. Products in active orders cannot be deleted.
- **Reviews:** Customers can submit/update one review per product after a delivered purchase, with up to three HTTPS photo URLs. Photos use externally hosted URLs; this does not upload files to Vercel. Staff with review permission can hide/publish reviews. Ratings are calculated from published verified reviews. Preview/sample rating figures are not added to product structured data.
- **Reports:** 7/30/90-day order value and online collected amounts grouped by currency, daily UTC charts, best-selling quantities and inactive signed-in customer carts (30+ minutes), plus CSV export. Order value includes COD orders and is not profit or cash collected. Best-seller item value is before order-level discounts/shipping. Carts are repriced by the server when saved; guest carts are local only. Current screens show at most 100 inactive carts, 100 recent stock movements, 100 review submissions, 200 coupons and 500 inventory products.
- **Staff permissions:** The owner assigns catalog, inventory, orders, support, reviews and reports under Users & access. New staff promoted through the dashboard start with no scopes; select the required permissions. Existing legacy administrator accounts without a permission list retain their previous full access. An explicit empty list grants no staff scopes. A super admin always retains owner access. Public registration cannot assign roles or permissions.
- **Shipment tracking:** Assign a carrier, AWB, optional HTTPS carrier link and delivery estimate in Shipments. Customers see shipment history and the order page polls the store API every 30 seconds. Set the carrier to `Shiprocket` for courier sync; while the shipment is active, opening/polling the order page requests courier updates with a five-minute cache. A manual refresh button uses the same cache. Provider scans never change payment or fulfillment state. Staff still mark order fulfillment status in the Orders workspace. Other couriers work through the entered tracking link and manually managed order states.
- **Notifications:** Price-drop and back-in-stock subscriptions are on product pages; customers can remove them in Notifications. They use the product's starting price and total stock, not individual variant availability. Triggered subscriptions are one-shot; changes are checked when product prices/stock are updated through the application. Direct database changes do not generate alerts. Order-status changes queue customer email and an inbox update. Emails use the existing durable Resend outbox.
- **Invoices:** Order owners and authorized order/support staff can download authenticated PDFs with original item prices, discounts, shipping, currency and actual payment state. Pending online orders are labelled pro forma; COD invoices say payment pending. This is an order invoice without tax calculation or GST registration fields, not an automatically generated GST tax invoice. Noto Sans Devanagari fonts embed English and Hindi names/addresses; fields are not translated.
- **Shopping assistant:** Enable it in Website settings only after configuring the OpenAI server variables below. Questions are sent to the Responses API with a bounded public catalog subset. No order/customer account data or mutation tools are exposed. Six requests per minute per function instance are permitted; production-wide spend caps/rate limits should also be set on the provider account. No AI replies are simulated when configuration is missing. The selected model must support the Responses API.
- **SEO:** `/sitemap.xml` and `/robots.txt` are served by the API. Direct product URLs receive HTML with server-rendered title/description, canonical URL, Open Graph image and Product/Offer JSON-LD, then load the SPA. Product metadata is generated from MongoDB, not a preview catalog. These routes are routed ahead of the SPA fallback in `vercel.json`; the built HTML template and invoice fonts are included with the function.

Additional Vercel **server-only** variables (set for the deployment environment, then redeploy):

| Variable | Configuration |
| --- | --- |
| `PUBLIC_SITE_URL` | `https://shop-sand-gamma.vercel.app` for the stated storefront, or your actual HTTPS custom domain. Used for canonical URLs/sitemap. Vercel's `VERCEL_PROJECT_PRODUCTION_URL` is the fallback. |
| `SHIPROCKET_TOKEN` | Your valid Shiprocket bearer token for AWB tracking. Rotate/refresh it when the provider expires it. Without it, manual tracking still works and automatic sync returns a clear configuration error. |
| `OPENAI_API_KEY` | Secret server OpenAI project API key. Never use a `VITE_` prefix. |
| `OPENAI_MODEL` | Your chosen Responses-compatible model ID available to that project. No model is silently selected. |

Continue using `MONGO_URI`, `JWT_SECRET`, `VITE_API_URL=/api`, `NODEJS_HELPERS=0`, `CRON_SECRET` and the Razorpay/Resend variables documented above. The same protected maintenance job now expires old unpaid orders before retrying emails. On Vercel it runs after successful requests and on the daily cron; on the local persistent server it runs every 15 seconds. On an idle Vercel deployment coupon capacity can remain reserved until the next maintenance run; no expired order is allowed to start payment or be fulfilled after late capture.

Run `npm test` and `npm run build` before deployment. Automated API checks isolate database/provider calls and do not establish that production credentials, courier access, email delivery or payments work. Test those integrations with their real configured environments before enabling them for customers. A build alone is not a successful production deployment.

Integration references: [OpenAI text generation](https://developers.openai.com/api/docs/guides/text), [Shiprocket AWB tracking](https://www.postman.com/shiprocketdev/shiprocket-dev-s-public-workspace/request/mwbf7qq/get-tracking-through-awb), and [PDFKit fonts](https://pdfkit.org/docs/text.html).


For an opt-in check against your configured MongoDB connection, set `RUN_COMMERCE_INTEGRATION=1` locally and run `npm run verify:commerce`. It creates a new randomly named `shopsphere_feature_qa_*` database, runs actual transaction/rollback/concurrent-checkout tests, then removes only that QA database. Existing store data is not modified. The database account must permit creating/removing a separate QA database. No payment, email, courier or AI provider is called. Use a test Atlas account if the normal application account cannot create an isolated database.


## Shop Wallet, shopping festival and Quick delivery

The new customer routes are `/wallet`, `/sale` and `/quick-delivery`. The navigation and homepage link to each page. Customer-facing catalog prices default to INR, while historical orders/invoices retain their original currency.

### Shop Wallet

The wallet stores **integer paise** in MongoDB and has a unique, append-only transaction ledger. Customers can add INR 100-10,000 per top-up through the existing Razorpay integration, inspect their latest 100 transactions and pay a full INR order using their available balance. There are no direct balance-edit, transfer or withdrawal endpoints. Wallet purchases of sample products are rejected.

The server creates the provider order, verifies callback HMACs, fetches the captured payment and validates the exact amount, currency and gateway order before crediting. The existing signed `/api/payments/webhook` now reconciles both order payments and wallet top-ups. Repeated callbacks/webhooks and concurrent captures cannot credit the same top-up twice. Pending top-ups with an existing gateway order appear on the wallet page with **Check payment** so a customer can reconcile a captured payment after closing checkout.

Wallet debits, product stock changes, coupons and order creation run in the same MongoDB transaction. The client supplies a unique checkout key and retries reuse it, preventing duplicate orders/debits. Insufficient balances reject checkout; balances cannot go below zero. Cancelling an unshipped wallet order credits the original order total once and marks it refunded. Refunded wallet orders cannot be reopened; place a new order instead. These refunds return to the store wallet, not a bank account.

The owner can view total customer wallet balances and recent ledger activity under **Super admin / Shop Wallet**. **Website settings / Shop Wallet & 15-minute delivery** can pause new wallet payments/top-ups while preserving balance/history access. Top-ups require INR currency, enabled online payments and all three existing Razorpay variables: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. No additional provider key is introduced. Enable the captured-payment webhook and test with Razorpay test keys before real funding; fixture tests do not make real charges.

### Sale page

`/sale` includes a branded shopping-festival hero, discounts calculated from actual product price/compare-at price, a product spotlight, category tiles, budget/discount sorting and active coupon offers. There are no invented bank discounts, sales counts or stock countdowns. Set the sale headline/description and optional **sale event end** in Website settings. A countdown appears only for a configured future end time; ending an event does not automatically reprice products. Update catalog prices when an offer should expire. Coupon expiry and usage limits continue to be enforced by the server.

### 15-minute delivery

`/quick-delivery` checks a six-digit delivery PIN and shows the Quick catalog. Express checkout requires all of the following on the server: Quick enabled, INR currency, a configured service PIN, current time inside the configured IST operating window, every product marked Quick eligible and sufficient stock. Standard delivery remains available. Express uses its own delivery fee and snapshots a 15-minute estimated arrival when the order is confirmed (after capture for Razorpay).

Configure **Website settings / Shop Wallet & 15-minute delivery**:

- Turn on **Enable 15-minute delivery** after local fulfillment is ready.
- Enter only actual serviceable PIN codes, separated by commas or spaces. No production PIN code is assumed.
- Set the express fee (default INR 29) and operating hours in IST (default 08:00-23:00).
- Mark the appropriate products **Eligible for 15-minute delivery** in the product editor.

The page remains available while service areas are being set up. Empty/unconfigured areas cannot use express checkout. Fifteen minutes is an estimate; the application does not dispatch a delivery fleet or guarantee traffic conditions. Online captures recheck express eligibility; if service or stock is no longer available, the existing refund-review flow applies rather than silently substituting another delivery method.

### One-time USD-to-INR conversion

The conversion snapshot is **INR 95.18 per USD**, reference date **2026-10-26**, retrieved from [Frankfurter's published USD/INR reference](https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR). This is a fixed one-time catalog repricing, not a live exchange rate feed. Sample catalog values and the default shipping amounts use the same rate.

For a configured existing USD database, run from the repository root:

```sh
npm --prefix server run convert-to-inr
```

The command briefly pauses checkout for 60 seconds to drain old requests, then converts product/variant prices, compare-at prices, USD coupon monetary values, price-alert targets, USD saved carts and shipping settings in a transaction. Percentage coupon rates are unchanged; dollar amounts in the announcement are updated. Checkout resumes afterward. Existing orders, invoices, captured payment amounts and INR wallet balances are not converted. Running it again on an INR catalog is a no-op. The script needs the intended database's `MONGO_URI` in `server/.env`; deploy the latest application code alongside the migration. New clients refresh cached cart/wishlist product prices, and checkout rejects stale displayed currency/subtotals.

`npm test` includes wallet ledger bounds, callback/webhook signatures and ownership, duplicate credits/refunds, delivery eligibility and conversion policy checks. `RUN_COMMERCE_INTEGRATION=1` plus `npm run verify:commerce` also exercises real transaction-backed wallet concurrency, express orders, currency migration idempotency and unchanged historical order values in an isolated QA database that is removed afterward.
