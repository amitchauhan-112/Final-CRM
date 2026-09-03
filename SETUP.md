# Travel CRM ("FOD Holidays") — Setup Guide

> For full project understanding (architecture, deployment, roles, business rules), see `CONTEXT.md`.
> This file covers local development setup only.

## Prerequisites

1. **Node.js 18+** — https://nodejs.org (LTS version)
2. **A Supabase project** — the database is Postgres hosted on Supabase, not local PostgreSQL. You
   need connection strings (`DATABASE_URL`, `DIRECT_URL`) for either:
   - The **test** Supabase project (`travelcrm-test`) — safe to experiment against, credentials in
     `backend/.env.supabase-test`.
   - **Production** — real customer data, only for actual deployed use, never for testing changes.
3. **Git**

---

## Step 1: Install Node.js

Download and install from https://nodejs.org. Verify: `node --version` and `npm --version`.

---

## Step 2: Configure the Backend

```bash
cd "Desktop/master crm/backend"
cp .env.example .env    # or use .env.supabase-test values directly for local testing
```

Edit `.env` (or export the equivalent vars inline) with your Supabase project's values:
```env
DATABASE_URL="postgresql://...supabase pooled connection..."
DIRECT_URL="postgresql://...supabase direct connection..."
JWT_SECRET="..."
JWT_EXPIRES_IN="7d"
TOKEN_ENCRYPTION_KEY="..."
CRON_SECRET="..."
SUPABASE_S3_ENDPOINT="..."
SUPABASE_S3_REGION="..."
SUPABASE_S3_ACCESS_KEY_ID="..."
SUPABASE_S3_SECRET_ACCESS_KEY="..."
SUPABASE_STORAGE_BUCKET="..."
PORT=5000
NODE_ENV=development
FRONTEND_URL="http://localhost:5173"
```
Both `DATABASE_URL` (pooled, via pgbouncer) and `DIRECT_URL` (direct connection) are required — Prisma
uses the direct one for migrations/introspection and the pooled one for normal query traffic.

---

## Step 3: Install & Run Backend

```bash
cd "Desktop/master crm/backend"
npm install
npm run db:generate    # Generate Prisma client
npm run db:push        # Push schema to your Supabase database (only if it's not already provisioned)
npm run db:seed        # Seed sample org, users, leads, campaigns, packages, bookings, ...
npm run dev            # Start backend (port from .env, default 5000)
```

---

## Step 4: Install & Run Frontend

Open a new terminal:
```bash
cd "Desktop/master crm/frontend"
npm install
npm run dev            # Vite dev server, default port 5173
```

---

## Step 5: Access the Dashboard

Open browser: http://localhost:5173

### Seeded login credentials (after `npm run db:seed`)
| Role | Email | Password |
|------|-------|----------|
| Admin | admin@travelcrm.com | admin123 |
| Employee (Sales) | amit@travelcrm.com | emp123 |
| Employee (Sales) | kaptan@travelcrm.com | emp123 |
| Employee (Sales) | biswas@travelcrm.com | emp123 |

`seed.ts` also seeds Operations/Finance-role users, departments, designations, packages, and sample
bookings — check the file directly for the full current list, it's the source of truth (this table
covers Sales only for brevity).

---

## Meta (Facebook/Instagram) API Integration

Configured per-organization from the app itself — **Admin → Settings → Integrations** — not via `.env`.
That panel captures the Ad Account ID, Page ID, and a System User Token, and shows connection status,
last sync time, and any sync error inline.

1. Go to https://developers.facebook.com, create/use a Business App.
2. Add the **WhatsApp** and/or **Instagram/Meta Ads** products as needed.
3. For the real-time leadgen webhook: set the webhook URL to
   `https://<your-deployment>/api/webhooks/instagram` (production: `https://final-crm-kappa.vercel.app/api/webhooks/instagram`;
   for local testing you'll need a tunnel like ngrok, since Meta requires a public HTTPS URL).
4. Set the verify token to match `WHATSAPP_VERIFY_TOKEN` / the Instagram equivalent in your env.
5. Assign the Page to the System User with at least **`leads_retrieval`** permission — without it, the
   historical/backfill sync silently returns zero leads instead of erroring, which looks identical to
   "genuinely no submissions yet."
6. The periodic backfill sync (GitHub Actions cron, every 10 min in production) is a safety net that
   catches anything the real-time webhook missed — it doesn't require any extra local setup, just a
   working connection in Admin → Settings → Integrations.

---

## Project Structure

```
Desktop\master crm\
├── api/index.ts            # Vercel serverless entry (production only — not used by `npm run dev`)
├── vercel.json
├── CONTEXT.md               # Full project reference — read this for architecture/business rules
├── backend/
│   ├── prisma/schema.prisma # ~50 models — the DB source of truth
│   ├── .env                 # Real credentials
│   ├── .env.supabase-test   # Test project credentials — safe for local experimentation
│   └── src/
│       ├── app.ts           # Express app construction
│       ├── index.ts         # Local dev entry (calls .listen())
│       ├── controllers/     # ~35 files — lead, booking, payment, finance, departure, hotel,
│       │                    #   vehicle, vendor, expense, refund, packages, campaign, user,
│       │                    #   notification, analytics, webhook, ...
│       ├── middleware/       # auth.ts (role guards), upload.ts
│       ├── routes/          # index.ts mounts every sub-router under /api
│       ├── services/        # lead.service.ts, notification.service.ts, metaSync.service.ts,
│       │                    #   metaLeadBackfill.service.ts, automationEngine.service.ts, ...
│       └── utils/seed.ts    # DB seeder
└── frontend/
    └── src/
        ├── App.tsx           # All routes: admin/*, employee/*, operations/*, finance/*
        ├── components/
        │   ├── ui/           # Badge, Modal, DateTimePicker (custom-built), Table, Avatar, ...
        │   ├── layout/       # AdminLayout, EmployeeLayout, FollowUpPopup, GlobalSearch, ...
        │   ├── dashboard/    # AdminDashboard, EmployeeDashboard
        │   ├── leads/        # LeadForm, LeadDetail, KanbanBoard, BookingConfirmModal, ...
        │   ├── finance/      # Payment/refund/expense forms
        │   └── operations/   # Hotel/vehicle/trip-captain widgets
        ├── hooks/            # One file per resource — React Query wrappers
        ├── pages/
        │   ├── admin/        # Dashboard, Leads, Campaigns, Organization, Packages, Bookings,
        │   │                 #   Customers, Business Intelligence, Reports, Settings, ...
        │   ├── employee/     # Dashboard, Leads, Follow-ups, My Customers, My Bookings, Tasks, ...
        │   ├── operations/   # Dashboard, Departures, Stay Planning, Rooms Required, Vendors
        │   ├── finance/      # Dashboard, Payment Verification, Ledger, Refunds, Payroll, ...
        │   └── LoginPage.tsx
        ├── services/api.ts   # Axios instance + silent token-refresh interceptor
        ├── store/            # Zustand auth state
        └── types/index.ts    # All TypeScript interfaces/enums
```

---

## Key Features

- **Lead capture** — WhatsApp, Instagram, Meta Ads (real-time webhook + periodic backfill safety net), Website, Manual
- **Auto lead routing** — matches leads to campaigns by ad/keyword/number, auto-assigns to employees
- **Role-based access** — Admin (full), Employee/Sales (own leads only, server-enforced), Operations, Finance
- **Forward-only lead pipeline** with a permanent lock once Confirmed (see `CONTEXT.md` §5/§6)
- **Booking & payment workflow** — confirm bookings (with split-room support), record payments, Finance approve/reject/request-correction, dual notification to recorder + assigned Sales rep
- **Operations** — departures, hotel/vehicle booking, rooms-required and stay-plan engines, trip captain assignment
- **Finance** — customer ledgers, pending-balance tracker, refunds, vendor payments/ledger, expenses, payroll, reports
- **Follow-up reminders** — in-app popup (Employee only, fires at exact scheduled time) + notification bell
- **Business Intelligence** — package/destination/campaign/customer/employee analytics, including per-status lead breakdown and average follow-up delay per employee
- **Packages & itineraries** — day-by-day itinerary builder, FIT/GIT tour types
