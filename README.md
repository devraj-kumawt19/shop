# ShopSphere

ShopSphere is a React/Vite single-page storefront with a separate Express API. Product browsing, search, category filters, cart, wishlist, registration, sign-in, profile, cash-on-delivery checkout, order history, and an admin console are included.

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
3. In Super admin → Website settings, enable Razorpay. Select **INR for UPI** and set your actual INR catalog/shipping prices first. The existing catalog defaults to USD to preserve earlier pricing. Currency selection does not convert prices; USD checkout requires a Razorpay account enabled for that currency. Orders keep a currency snapshot, and dashboard totals are grouped by currency.
4. Test a payment, cancellation, retry and webhook before enabling live keys. The app creates the gateway order server-side, checks callback signatures, fetches the captured payment and validates its order, amount and currency before confirming the order. It never receives card details. See the [official Razorpay integration guide](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/) and [webhook validation guide](https://razorpay.com/docs/webhooks/validate-test/).

Unpaid online orders do not reserve stock and remain awaiting payment. Stock is allocated transactionally after capture; repeated callbacks/webhooks do not allocate it twice. If an item sells out before payment is confirmed, the order is cancelled and flagged `refund_required`, and both parties receive a payment-review notification. Refunds must be reviewed and issued in the gateway dashboard; the app does not issue refunds automatically. Cancelling a paid, unshipped order also marks it for refund review. Unpaid orders cannot be fulfilled through the admin status selector.

For **order emails**, configure `RESEND_API_KEY`, `RESEND_FROM` (a verified sender/domain), and `ORDER_NOTIFICATION_EMAIL` (the store owner's real address). Customer confirmations go to the checkout email. [Resend's sending API](https://resend.com/docs/api-reference/emails/send-email) is used from the server. Cash-on-delivery orders queue confirmations when placed; online orders queue them after verified capture. The database outbox is written in the order transaction, and the API worker retries transient failures with backoff, for up to eight attempts. Provider idempotency keys and stored sent status prevent normal retries from duplicating emails. "Sent" means accepted by the provider, not guaranteed inbox delivery.

The Orders table shows customer email status and can retry unsent notifications. Owner emails need the owner address configured; retry a historical order after adding it to enqueue the missing owner notification. Website settings shows whether gateway, email sender and owner recipient configuration is present; it never displays secret keys. Without configuration, online payment stays unavailable and email jobs remain queued. MongoDB must support transactions (for example Atlas).

Validation: `npm --prefix server test` covers role enforcement, COD checkout, payment signatures and ownership, amount/currency mismatches, duplicate captures, missing configuration, out-of-stock capture, email escaping, retries and the sample catalog. These checks use isolated database/provider stubs; they do not charge cards, send email or replace end-to-end testing with configured services.
