# Travel CRM ("FOD Holidays") — Project Context

> Feed this file to Claude/ChatGPT to get full project understanding without exploring the codebase.
> **Last verified accurate:** 2026-09-03. The previous version of this file (and SETUP.md) described an
> EC2/Docker deployment with only Admin/Employee roles and no Bookings/Payments/Finance/Operations
> modules — that was the state of the project many months ago. Both were **severely out of date**
> before this rewrite: entire modules that are now live in production were listed as "not started."
> If you're an AI reading this to understand the project, trust this file over any older doc or your
> own assumptions from a partial code read — verify against the live code for anything load-bearing.

---

## 1. What This Is

A **multi-tenant SaaS CRM** for a trek & pilgrimage travel agency (**FOD Holidays**), covering the
full lifecycle: lead capture (WhatsApp, Instagram, Meta Ads, Website, Manual) → employee assignment →
follow-ups → booking confirmation → payment collection & verification → operations (departures, hotels,
vehicles, trip captains) → finance (ledgers, refunds, vendor payments, payroll) → reporting/analytics.

**Production URL:** `https://final-crm-kappa.vercel.app`
**GitHub repo (active/deployed):** `https://github.com/amitchauhan-112/Final-CRM` — remote name `final-crm`, branch `main`, Vercel auto-deploys on push.
**GitHub repo (stale, do not use):** an `origin` remote also exists pointing to `https://github.com/Cyberamit007/travel-crm.git` — this is a leftover from an earlier fork and is **not** what's deployed. Always push to `final-crm`.
**Local working directory:** `C:\Users\Amit FOD holidays\Desktop\master crm` — note a separate, unrelated older copy also exists at `Desktop\travel-crm-master`; ignore it.
**Branding:** "Travel CRM — Trek & Pilgrimage"

### Standing workflow rule (non-negotiable)
**Nothing gets pushed to `main` (= production) without the explicit password "amit" from the user**,
given *after* local verification (type-check + build, and a live test against the test DB for anything
with real logic). This rule has been enforced consistently across the whole project history — don't
skip it even if a change seems trivial or the user seems to be asking for it implicitly.

---

## 2. Tech Stack

### Backend
| Layer | Technology |
|-------|-----------|
| Runtime | Node.js (ESM — `.js` extensions in relative imports even though source is `.ts`) |
| Framework | Express 5 |
| Language | TypeScript |
| ORM | Prisma 5+ + PostgreSQL (hosted on **Supabase**) |
| Auth | JWT access token (`JWT_EXPIRES_IN=7d`, not short-lived) + rotating refresh tokens (httpOnly cookie, SHA-256 hashed in DB) |
| Password hashing | bcrypt, cost factor 12 — **one-way, cannot be reversed or displayed**; only reset (overwrite) is possible, ever |
| Real-time | **None** — Socket.IO was removed during the Vercel migration (serverless functions can't hold persistent connections). Replaced everywhere by React Query `refetchInterval` polling. If you see a comment like "Replaces the old 'finance_updated' Socket.IO event", that's why. |
| File storage | Supabase Storage (S3-compatible) via `@aws-sdk/client-s3` — not local disk (`multer` still handles the multipart parsing, but files are uploaded to Supabase's S3 endpoint, not `/uploads`) |
| Logging | Winston |
| Rate limiting | express-rate-limit |
| Security headers | Helmet |
| Cron / scheduled jobs | **GitHub Actions** (`.github/workflows/cron.yml`), not node-cron — Vercel serverless can't host a persistent scheduler. The workflow calls `POST /api/cron/*` routes on a schedule, authenticated via an `x-cron-secret` header matched against `CRON_SECRET`. Jobs: `reminders-followup`/`reminders-operations`/`reminders-finance` (every 30 min), `meta-sync`/`automation-sweep` (every 5 min), `lead-backfill` (every 10 min). |
| PDF/Excel | pdfkit, exceljs (finance documents, exports) |

### Frontend
| Layer | Technology |
|-------|-----------|
| Framework | React 18 + Vite |
| Language | TypeScript |
| Routing | React Router v6 (nested routes, one layout per role) |
| State (server) | TanStack Query v5 — `staleTime: 30s`, `refetchOnMount: true` globally (see `main.tsx`) |
| State (client) | Zustand (`useAuthStore`) |
| Forms | React Hook Form + `Controller` for non-native inputs |
| HTTP client | Axios (silent 401→refresh interceptor) |
| Styling | Tailwind CSS — custom `primary` (sky blue) and `mountain` (violet) palettes, `enterprise` easing curve, extensive `@layer components` classes in `index.css` (`.card`, `.btn-primary`, `.input`, `.badge`, etc. — reuse these, don't hand-roll new button/input styles) |
| Charts | Recharts |
| Icons | lucide-react |
| Toasts | react-hot-toast |
| Excel export | xlsx / jspdf+jspdf-autotable |

### Deployment architecture (important, non-obvious)
- **One Vercel project** serves both the static frontend build and the backend API as a single serverless function.
- `vercel.json` rewrites `/api/:path*` → `/api` (a single file, `api/index.ts` at the repo root), and everything else → `/index.html` (SPA fallback).
- `api/index.ts` is a **two-line wrapper**: `import app from '../backend/src/app.js'; export default app;` — the existing Express app is exported directly. **Do not add a `serverless-http` wrapper** — that was tried and silently broke every response (Express logged requests as received but the client never got a byte back). Vercel's Node runtime already hands the function a plain `(req, res)` pair Express understands natively.
- **Do not rename `api/index.ts` to a catch-all like `api/[...path].ts`** — that's a Next.js convention that silently only matches single-segment paths on a plain Vercel project (multi-segment routes like `/api/auth/login` 404 at the platform level before reaching the handler). This was tested and confirmed broken; the rewrite-based approach is deliberate.
- `vercel.json` also pins `"regions": ["syd1"]` (Sydney) to co-locate the function with the Supabase database (also Sydney) — this fixed a severe latency issue (1.3–1.6s → 0.34–0.55s per request) from an earlier default-region deployment.
- Build command runs both `frontend` and `backend` installs plus `prisma generate` (see `vercel.json`'s `buildCommand`).

---

## 3. Roles & Access Model

Four roles, each with its own layout, dashboard, and route namespace. `User.role` is a plain string
(`ADMIN | EMPLOYEE | OPERATIONS | FINANCE`), enforced by `middleware/auth.ts` (`requireAdmin`,
`requireAdminOrOperations`, `requireFinanceOrAdmin`, `requireAdminOrSelf`).

| Role | Route prefix | Layout | Purpose |
|------|--------------|--------|---------|
| **ADMIN** | `/admin/*` | `AdminLayout` | Full visibility — leads, campaigns, org/employees, packages, bookings, customers, finance/ops oversight, BI, settings, automation |
| **EMPLOYEE** (Sales) | `/employee/*` | `EmployeeLayout` | Own leads/customers/bookings only (server-enforced via `assignedToId` filters, never trust a client-supplied override) |
| **OPERATIONS** | `/operations/*` | shares `EmployeeSettingsPage` for settings | Departures, hotels, vehicles, vendors, rooms/stay planning |
| **FINANCE** | `/finance/*` | shares `EmployeeSettingsPage` for settings | Payment verification, ledgers, refunds, vendor payments, expenses, payroll, reports |

**Employee data isolation is a server-side pattern repeated in every relevant controller** — e.g.
`getLeads`, `getAllBookings`, `getCustomers` all do `if (req.user?.role === 'EMPLOYEE') where.assignedToId
= req.user.id` (or `where.lead = { assignedToId: ... }` for bookings), overriding/ignoring any client
query param. Never rely on the frontend to hide data — always scope in the controller.

**Login:** default seeded admin is `admin@travelcrm.com` / `admin123` (see `backend/src/utils/seed.ts`
for other seeded employees, e.g. `amit@travelcrm.com`). Only usable against the **test** Supabase DB —
production has real accounts created by the real admin.

---

## 4. Repository Layout

```
Desktop\master crm\
├── api/
│   └── index.ts                 # Vercel serverless entry — wraps backend/src/app.js, see §2
├── vercel.json                  # Rewrites, region pin, build command
├── CONTEXT.md                   # This file
├── SETUP.md                     # Local dev setup (see §11 for current instructions)
├── backend/
│   ├── prisma/
│   │   └── schema.prisma        # ~50 models — single source of truth for the DB (see §5)
│   ├── .env                     # Real credentials — never print/paste this file's contents
│   ├── .env.example
│   ├── .env.supabase-test       # Test Supabase project creds — safe to use for local verification
│   └── src/
│       ├── app.ts               # Express app construction (separated from server-listen, for the Vercel wrapper)
│       ├── index.ts             # Local dev entry — same app, but actually calls .listen()
│       ├── lib/prisma.ts        # Singleton PrismaClient
│       ├── middleware/
│       │   ├── auth.ts          # authenticate + role guards
│       │   └── upload.ts        # Multer config, MIME allowlist, uploads to Supabase S3
│       ├── controllers/         # ~35 files, one per resource (lead, booking, payment, finance,
│       │                        #   departure, hotel, vehicle, vendor, expense, refund, packages,
│       │                        #   campaign, user, notification, analytics, webhook, ...)
│       ├── routes/
│       │   └── index.ts         # Mounts all sub-routers under /api
│       ├── services/            # lead.service.ts (createLead — shared by manual + webhook + backfill),
│       │                        #   notification.service.ts, metaSync.service.ts,
│       │                        #   metaLeadBackfill.service.ts, automationEngine.service.ts,
│       │                        #   paymentSchedule.service.ts, financeDocument generation, etc.
│       ├── types/index.ts       # AuthenticatedRequest, webhook payload types
│       └── utils/
│           ├── logger.ts
│           ├── encryption.ts    # Encrypts stored Meta system-user tokens etc.
│           └── seed.ts          # DB seeder — org, users, leads, campaigns, packages, bookings, ...
└── frontend/
    └── src/
        ├── App.tsx              # All routes — admin/*, employee/*, operations/*, finance/*
        ├── main.tsx             # QueryClient setup (staleTime 30s, refetchOnMount true)
        ├── store/authStore.ts   # Zustand — user, token, login/logout
        ├── services/api.ts      # Axios instance + silent refresh interceptor
        ├── types/index.ts       # All TS interfaces/enums — check here before assuming a field exists
        ├── index.css            # Tailwind layer components — .card/.btn-*/.input/.badge/animations
        ├── hooks/                # One file per resource, React Query wrappers (see §8)
        ├── pages/
        │   ├── LoginPage.tsx
        │   ├── admin/           # Dashboard, Leads, Campaigns, Organization, Packages, Bookings,
        │   │                    #   Customers, Business Intelligence, Reports, Report Center,
        │   │                    #   Automation Builder, Business Rules, System Health, Settings, ...
        │   ├── employee/        # Dashboard, Leads, Follow-ups, Packages (catalog), My Customers,
        │   │                    #   My Bookings, Tasks, My Targets, WhatsApp Inbox, Settings
        │   ├── operations/      # Dashboard, Departures, Departure Detail, Stay Planning,
        │   │                    #   Rooms Required, Vendors, Vendor Detail
        │   └── finance/         # Dashboard, Payment Verification, Customer Ledger, Pending
        │                        #   Tracker, Refunds, Vendor Payments, Vendor Ledger, Expenses,
        │                        #   Reports, Payroll
        └── components/
            ├── layout/           # AdminLayout, EmployeeLayout (Operations/Finance settings reuse
            │                     #   EmployeeSettingsPage), GlobalSearch, BookingLookup, FollowUpPopup
            ├── dashboard/        # AdminDashboard, EmployeeDashboard
            ├── leads/            # LeadForm, LeadDetail, StatusBar, KanbanBoard, BookingConfirmModal,
            │                     #   FollowUpModal, FollowUpOutcomeModal, LostReasonModal,
            │                     #   CommentsSection (merged with what used to be separate Notes)
            ├── finance/          # Payment/refund/expense forms
            ├── operations/       # Hotel/vehicle/trip-captain widgets
            └── ui/               # Badge, Modal, DateTimePicker (custom-built, not native
                                  #   <input type="datetime-local">), Table, Avatar, StatsCard, Skeleton
```

---

## 5. Database Schema — Key Models (Prisma / PostgreSQL, Supabase-hosted)

Full model list (see `backend/prisma/schema.prisma` for exact fields):
`Organization, User, RefreshToken, Campaign, MetaAdMap, CampaignEmployee, CampaignNote,
CampaignAttachment, Lead, Tag, LeadTag, LeadComment, LeaveRequest, Notification, ActivityLog,
WebhookLog, MetaConnection, WhatsAppAccount, WhatsAppConversation, WhatsAppMessage, CampaignArchive,
Feedback, Department, Designation, Destination, TourCategory, Booking, Traveler, Package,
PackageAuditLog, PackageItinerary, Payment, PaymentScheduleItem, BookingTask, Departure, Hotel,
Vehicle, Vendor, VendorDocument, OperationsDocument, OperationsNote, DepartureTask, Refund,
FinanceDocument, BusinessRule, ScheduledJobRun, AutomationRule, AutomationExecution, ErrorLog,
VendorPayment, Expense, SalesTarget, EmployeeSalaryConfig, EmployeePayout, FinanceSalaryAccess`

### Lead — the primary entity, the sales pipeline
```
status: NEW | NOT_CONTACTED | CONTACTED | INTERESTED | FOLLOW_UP_SCHEDULED | CONFIRMED | LOST
source: WHATSAPP | INSTAGRAM | MANUAL | WEBSITE | META_ADS
priority, followUpDate?, followUpNotes?, followUpDone, preferredDate? (customer's preferred
  departure, plain YYYY-MM-DD string), assignedToId?, campaignId?, deletedAt? (soft delete only —
  never hard-deleted), createdAt, updatedAt
```
**Status pipeline rules (server-enforced in `updateLead`, `lead.controller.ts`, applies to every role
including ADMIN):**
- **Forward-only.** A lead can never move backward through
  `NEW → NOT_CONTACTED → CONTACTED → INTERESTED → FOLLOW_UP_SCHEDULED → CONFIRMED`.
- **LOST is always reachable** as an exit from any status *except* CONFIRMED (see next point).
- **One narrow, deliberate exception:** `FOLLOW_UP_SCHEDULED → INTERESTED` is allowed (completing a
  follow-up can legitimately mean "still interested, no concrete next date yet").
- **Once CONFIRMED, the status is permanently locked — nothing can ever change it again, not even to
  LOST.** A confirmed lead has become a booking; any post-confirmation outcome (cancellation) belongs
  on `Booking.status` (`ACTIVE | CANCELLED | COMPLETED`), not by moving the lead backward. (Note:
  `Booking.status` has the enum but no UI/endpoint sets it to `CANCELLED` yet — flagged as an unbuilt
  gap, not a bug.)
- Setting status to `CONFIRMED` always routes through the full booking-confirmation flow
  (`BookingConfirmModal` → `createBooking`) — never a bare status PATCH.

**Sort order convention (applies to Leads, Bookings, and Customers lists — deliberately, not everywhere):**
these three lists default to sorting by **`updatedAt desc`**, not `createdAt`, so a lead/booking that
was just confirmed/edited/paid rises to the top instead of staying wherever its original creation time
placed it — with a deterministic 3-level tiebreaker (`updatedAt → createdAt → id`, all `desc`) so exact
timestamp ties never produce unstable/flip-flopping pagination. **This is a deliberate, explicit product
decision requested by the user — do not "fix" it back to createdAt.** It is *not* applied to
task/itinerary/schedule-type lists (those correctly stay chronological-by-due-date or sequence-ordered),
notification/activity-log lists (correctly `createdAt desc` — those entities are never edited after
creation so createdAt already *is* "latest first"), or master/reference data (correctly alphabetical).
One related gotcha already fixed: the Meta lead backfill sync backdates `createdAt` to the real
historical submission time but must **also** backdate `updatedAt` to match — otherwise a months-old
backfilled lead would jump to the top of every list as if it just came in.

### Booking
```
leadId (unique — one booking per lead), bookingNumber, packageId?, travelerName, numberOfTravelers,
foodPreference (VEG|NON_VEG|JAIN|NO_PREFERENCE), roomSharing (SINGLE|DOUBLE|TRIPLE|QUAD),
roomSplit support via Traveler rows (split a group across room types at confirmation time),
tourType (FIT|GIT), departureDate?, returnDate?, finalPrice, amountPaid, balanceAmount,
balanceDueDate?, departureId?, travelerPortalTokenHash? (customer self-service link),
status: ACTIVE | CANCELLED | COMPLETED
```
`createBooking` requires an initial `amountPaid` (advance) on first confirmation; calling it again for
an already-booked lead **upserts** onto the same Booking row (adds a new Payment, doesn't create a
second booking) — expect this if testing repeatedly against the same lead.

### Payment
```
status: PENDING | VERIFIED | REJECTED | CORRECTION_REQUESTED
type: ADVANCE | INSTALLMENT | REFUND
recordedById (whoever submitted it — often Sales, but Ops/Finance can record on a customer's behalf)
```
Finance approves/rejects/requests-correction. **On any of these three actions, both the recorder AND
the lead's assigned Sales rep get notified** (deduplicated if the same person) — this was a deliberate
fix for a real gap where a Sales rep never heard about a rejection if someone else had recorded the
payment.

### Notification
```
type (free string — see notification.service.ts's TYPE_META for the full taxonomy),
category: SALES | OPERATIONS | FINANCE | CUSTOMER | SYSTEM (defaulted per-type)
severity: INFO | REMINDER | SUCCESS | WARNING | CRITICAL
channel: IN_APP only — EMAIL/SMS/WHATSAPP are architecture-ready tags, never actually dispatched
```
Follow-up due/overdue reminders are the one notification type that also gets a dedicated **in-app modal
popup** (`components/layout/FollowUpPopup.tsx` + `hooks/useFollowUpNotifications.ts`), not just a bell
entry — it fires at (or after, never before) the exact scheduled time, checked every 5s, queues if
several come due together, and is shown **only to EMPLOYEE, deliberately not to ADMIN** (admin is a
monitoring role — they get aggregate stats like Pending Leads / Overdue Follow-ups on their dashboard
instead of per-lead interruptions).

---

## 6. Key Business Rules & Conventions (things a fresh AI would NOT infer from a partial code read)

- **bcrypt is one-way.** No admin "view employee password" feature exists or should ever be built —
  only reset (overwrite) is possible. This has been explicitly asked for and explicitly declined twice.
- **User "deletion" is always a soft deactivate** (`User.isActive = false`), never a real SQL delete —
  ~30 tables have Restrict-constrained FKs to User that must stay attributed after someone leaves.
  Deleting an employee with active leads/campaigns/tasks triggers a reassignment flow (transaction-safe,
  handles the `CampaignEmployee` unique-constraint collision case).
- **Package `code` is auto-generated** (`${packageType}-${slug}-${rand}`), never user-entered — the
  field is immutable after creation and hidden from every create/edit UI.
- **Payments only affect `Booking.amountPaid` on approval**, not on submission — a `PENDING` payment
  sitting unverified doesn't move the ledger yet.
- **`orgFilter(req)` pattern**: every controller defines/uses this to scope queries by
  `req.user.organizationId` — repeated per-file, not centralized in middleware.
- **DateTimePicker is custom-built**, not the native `<input type="datetime-local">` — a
  Date→Hour→Minute wizard component in `components/ui/DateTimePicker.tsx`, used everywhere a
  follow-up date/time is picked, styled to match the app instead of the OS picker.
- **No email/SMS infrastructure exists** — `nodemailer` is an installed dependency but is never
  imported/used anywhere. "Forgot password" is a static "contact your admin" info panel, not a real
  token-based email flow, by explicit user choice.
- **Meta Ads integration** has two paths into the same `createLead()` service function: a real-time
  webhook (`webhook.controller.ts`, Instagram DMs + leadgen) and a periodic backfill safety-net
  (`metaLeadBackfill.service.ts`, catches anything the webhook missed, plus a one-off "Import Historical
  Leads" full scan from Admin Settings → Integrations). The backfill requires the connected Page to be
  assigned to the Meta System User with `leads_retrieval` permission — a missing permission can return
  an empty list silently (no error) rather than failing loudly, which looks identical to "genuinely no
  leads yet" from the UI.

---

## 7. Frontend Hooks Reference (React Query)

Convention: `use<Resource>()` for lists/single items, `use<Verb><Resource>()` for mutations, query keys
as arrays starting with the resource name (e.g. `['leads', filters]`, `['erp-bookings', filters]`,
`['customers', filters]`). Mutations invalidate every list their change could affect — this has been a
recurring source of bugs when a new mutation forgets to invalidate a *related* list (e.g. confirming a
booking needs to invalidate `['leads']`, `['erp-bookings']`, **and** `['customers']`, not just the one
that feels most directly related).

| Hook file | Covers |
|-----------|--------|
| `useLeads.ts` | Leads CRUD, transfer, stats |
| `useBookings.ts` | Booking create/update, review/referral marking |
| `usePayments.ts` | Record/delete payment |
| `useFinance.ts` | Payment verification (approve/reject/correction), refunds |
| `useErp.ts` | `useAllBookings` (`/erp/bookings-list`), `useCustomers` (`/erp/customers`) — shared by Admin and Employee "My X" pages, auto-scoped server-side by role |
| `useAnalytics.ts` | Business Intelligence tabs — package/destination/campaign/customer/**employee** analytics |
| `useUsers.ts` | Employee CRUD, `useDeleteUser` (handles reassignment) |
| `useNotifications.ts` | Bell dropdown |
| `useFollowUpNotifications.ts` | The in-app popup system (not the bell) |
| `useCampaigns.ts`, `usePackages.ts`, `useOperations.ts`, `useMasters.ts`, `useDepartments.ts`, `useDesignations.ts` | As named |

---

## 8. Environment Variables

### Backend — production (`.env`, never paste its real values into chat/artifacts)
Key vars: `DATABASE_URL`, `DIRECT_URL` (Prisma needs both — pooled + direct connection to Supabase),
`JWT_SECRET`, `JWT_EXPIRES_IN=7d`, `TOKEN_ENCRYPTION_KEY` (encrypts stored Meta tokens), `CRON_SECRET`
(matched against the GitHub Actions cron requests), `SUPABASE_S3_*` (file storage), Meta/WhatsApp
tokens, `SMTP_*` (unused — see §6).

### Backend — test (`.env.supabase-test`, safe to use for local verification)
A separate `travelcrm-test` Supabase project, reused across sessions for local backend testing since
local Docker Postgres isn't reachable in this environment. Start the backend against it on an ad-hoc
free port, e.g.:
```
export DATABASE_URL="<from .env.supabase-test>"
export DIRECT_URL="<from .env.supabase-test>"
export JWT_SECRET="<from .env.supabase-test>"
export PORT=51xx   # pick something free
npx tsx src/index.ts
```
then curl against `http://localhost:51xx/api/...`, verify, and kill the process afterward. Never test
destructive/writing operations against production data directly — always use this test project first.

### Frontend
`VITE_API_URL` — empty in production (same-origin, since frontend+API are one Vercel deployment).

---

## 9. Verification Workflow (how every change in this project's history has been shipped)

1. Implement the change.
2. `npx tsc --noEmit` on both `frontend/` and `backend/` — backend has a **known pre-existing baseline
   of ~35 unrelated errors** in `booking.controller.ts`/`departure.controller.ts`; a clean diff means
   "same count as before your change," not zero.
3. For anything with real logic (not pure UI), start the backend against the test Supabase project and
   exercise it live via curl — create real records, verify the actual behavior, clean up test data
   afterward (soft-delete leads/users created for the test).
4. `npm run build` on the frontend (catches issues `tsc --noEmit` alone sometimes misses).
5. Summarize what changed and what was verified to the user.
6. **Wait for the literal word "amit"** before committing/pushing — this is a password, not a rubber
   stamp; general enthusiasm ("yes deploy it", "go ahead") is explicitly *not* sufficient per the
   standing rule and should prompt asking for the password again.
7. Commit, push to `final-crm main`.
8. Poll the deployed HTML for a bundle-hash change (`grep -oE 'assets/index-[a-zA-Z0-9_-]*\.js'`) to
   confirm the new build actually went live, then run basic health checks (frontend 200, wrong-login
   401, unauthenticated API call 401). For higher confidence on a specific change, download the live JS
   bundle and grep it for a string unique to the new code — this has caught cases where the deploy
   looked "successful" per Vercel but the user still reported seeing the old page (browser cache on
   their end, not a deploy failure — confirmed by fetching the live bundle directly).

---

## 10. Known Gaps / Things Flagged But Not Built

- No UI/endpoint sets `Booking.status = 'CANCELLED'` yet, even though the schema and the Lead-status
  permanent-lock design both anticipate it as the right place for post-confirmation cancellations.
- No email/SMS dispatch (see §6).
- No real-time WebSocket layer (removed with the Vercel migration; polling only).
- The "avg follow-up delay" analytics metric (Employee Analytics tab) is a documented approximation —
  there's no dedicated "follow-up completed at" timestamp, so it uses `Lead.updatedAt`, which a later
  unrelated edit to the same lead would slightly inflate.

---

## 11. Local Dev Setup (current, Supabase-based — supersedes SETUP.md's local-Postgres instructions)

```bash
cd "Desktop/master crm/backend"
npm install
# Use .env for real work, or .env.supabase-test for safe experimentation
npm run db:generate
npm run dev            # backend on the port set in whichever env you loaded

cd "Desktop/master crm/frontend"
npm install
npm run dev             # Vite dev server, default port 5173
```
Seeded login (test DB / seed.ts): `admin@travelcrm.com` / `admin123` (ADMIN), plus several seeded
`EMPLOYEE` accounts (e.g. `amit@travelcrm.com`) — see `backend/src/utils/seed.ts` for the full list and
their passwords.
