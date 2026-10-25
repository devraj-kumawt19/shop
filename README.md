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

The Express API is a separate Render service (`render.yaml`); Vercel only hosts the React SPA. The SPA rewrite deliberately excludes `/api/*`, so a missing API configuration cannot silently return `index.html` for JSON requests. The production frontend requires `VITE_API_URL` in Vercel, set to the full HTTPS Render API URL ending in `/api` (for example, `https://your-service.onrender.com/api`). Do not set it to `/api` in Vercel. The local development default remains `/api` and Vite proxies it to `http://localhost:5000`.

In Vercel, set `VITE_API_URL` for Production and any Preview environments that should use the API, then redeploy because Vite embeds this value at build time. In Render, deploy the included `render.yaml` (or create a Node web service with root directory `server`, build command `npm install`, start command `npm start`, and health check `/api/health`). Set `MONGO_URI`, `JWT_SECRET` (random, at least 32 characters), and `FRONTEND_URL` (the exact deployed Vercel origin, such as `https://shop-sand-gamma.vercel.app`) in the Render service environment. Seed the Atlas catalog with `npm --prefix server run seed` from the project root in a trusted local environment; the seed script inserts missing sample products/categories without overwriting existing entries. Create the administrator using the documented script. Restrict the Atlas network access list to the deployment environment where possible.

Optional Render API variables: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` enable online payments; `RESEND_API_KEY` and `RESEND_FROM` enable email; `ORDER_NOTIFICATION_EMAIL` enables owner order notifications. Admin account provisioning variables are only needed when running the one-time create-admin/create-super-admin scripts. Never set API secrets in Vercel's frontend environment; only `VITE_API_URL` is needed there.

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
