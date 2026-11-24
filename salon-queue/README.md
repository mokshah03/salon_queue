# Salon Queue Management System (MERN)

React + Vite · Node + Express · MongoDB + Mongoose · JavaScript · plain CSS. No Socket.IO — screens poll every 4–6 s.

## Setup
```bash
npm run install:all
cp server/.env.example server/.env      # Windows: copy server\.env.example server\.env
```
MongoDB must be running (default `mongodb://127.0.0.1:27017/salon_queue`). On first start the server seeds demo
services and stylists if both collections are empty.

## Run (two terminals)
```bash
npm run dev:server    # API -> http://localhost:5001
npm run dev:client    # App -> http://localhost:5173
```

## Screens
| URL | Screen |
|---|---|
| http://localhost:5173/ | Customer: services, search, categories, selection |
| http://localhost:5173/check-in | Customer: details + confirm |
| http://localhost:5173/queue/:id | Customer: live token tracking |
| http://localhost:5173/staff/queue | Staff dashboard |
| http://localhost:5173/display | Waiting-room TV display (1920×1080) |
| http://localhost:5173/admin | Admin dashboard (demo access, no login) |

A small DEV switcher bar appears in `npm run dev` only (never on `/display`, never in production builds).

## API (all under /api)
- `GET /health`, `GET /settings`, `GET /services`, `GET /stylists`
- Customer: `POST /customer/queue`, `GET /customer/queue/:id`, `POST /customer/queue/:id/cancel`
- Staff: `GET /staff/queue`, `POST /staff/call-next`, `POST /staff/queue/:id/{start|complete|no-show|return|cancel}`, `PATCH /staff/stylists/:id/status`
- Display: `GET /display` (no phone numbers or customer names)
- Admin: `GET /admin/overview`, services CRUD + `PATCH /admin/services/:id/availability`, stylists CRUD + `PATCH /admin/stylists/:id/status`

## Key rules implemented
- Tokens `S-001…` per salon day (timezone `SALON_TZ`, default Asia/Kolkata), from an atomic `$inc` on a daily counter collection.
- One active entry per mobile number per day (unique sparse index) + idempotent `clientRequestId` for double clicks.
- Status transitions enforced in the database update itself: WAITING→CALLED→IN_SERVICE→COMPLETED, WAITING→CANCELLED, CALLED→NO_SHOW, NO_SHOW→WAITING (staff, confirmed).
- A stylist with no services assigned can perform every service.

## Manual test checklist
1. `/` → search "facial", filter "Nail Services", select two services, Join Queue.
2. Check-in with a blank name or a mobile like `12345` → inline errors, no token.
3. Valid check-in → `/queue/:id` shows token, position, estimate; refresh keeps it.
4. Open `/staff/queue` in a second window → entry appears within ~5 s. Call Next → customer page shows "Please head to reception."
5. Start Service → Complete → `/display` updates; completed entry leaves the active lists.
6. Admin: mark a service unavailable → it is greyed out on `/` within ~6 s. Add a service → it appears on `/`.
7. Set a stylist to Break → Call Next refuses to assign that stylist.
8. Two windows, click Call Next at the same time → each customer is called only once.

## Automated tests (server)
```bash
cd server
npm run test:unit          # pure business rules, no database needed
npm run test:integration   # real API + MongoDB, uses database "salon_queue_test" (dropped at start and end)
npm test                   # both
```
Set `MONGODB_URI_TEST` to use a different test database (its name must contain "test"). If MongoDB is not
reachable the integration tests are skipped with a warning instead of failing.

## Production build check
```bash
npm run build:client       # outputs client/dist
npm --prefix client run preview
```
