# Cashier Module Feature Documentation

This document describes the features, database models, API endpoints, frontend interfaces, microservices, and functionality flags of the **Cashier** module.

---

## 1. Module Name & Purpose
- **Module Name**: Cashier Payment Gateway & Billing
- **Directory**: `modules/cashier`
- **Purpose**: Facilitates physical store transaction updates by displaying active production jobs, collecting payments, and updating payment statuses.

---

## 2. Database Models & Relations
The Cashier module operates on the following tables/relations:
- **`Job`**:
  - `paymentStatus`: Enum `UNPAID` | `PAID` | `ADMIN_APPROVED` (updated to `PAID` upon collection).
  - `paymentMode`: `CASH` | `UPI` | `CARD` | `ONLINE` | `CREDIT`.
  - `paymentHandledById` (mapped from `paymentHandledBy`): Maps to the `User` record of the cashier who recorded the payment.
  - `jobStatus`: Determines if a job is active or excluded (`jobStatus: { $ne: 'DISPATCHED' }`).
- **`Customer`**:
  - Used in population (`customerId` relation) to determine `isCreditCustomer` status.

---

## 3. Features & Functional Workflows

### A. Backend APIs
Mapped to Express under `/api/cashier`:
- **`GET /jobs`**: Mapped in `cashier.js`. Retrieves recent jobs matching:
  - `date`: Defaults to today's date range (`createdAt: { $gte: startOfDay, $lte: endOfDay }`).
  - `search`: Filter matching customer name or job ID.
  - `paymentStatus`: Filter by `UNPAID` or `PAID`.
  - `hideDispatched`: Hides jobs already shipped (`jobStatus: { $ne: 'DISPATCHED' }`).
- **`PATCH /jobs/:jobId/payment`**: Updates job's `paymentStatus` to `'PAID'`, sets `paymentHandledBy` to current user ID, and records the `paymentMode` (defaulting to `'CASH'`).

### B. Frontend Dashboards
- **CashierDashboard (`CashierDashboard.tsx`)**:
  - Displays list of active/unpaid jobs for the selected date.
  - Highlights credit customers using the `isCreditCustomer` tag.
  - Triggers a modal popup to select payment method (Cash, UPI, Card, Online, Credit) and completes the PATCH request.

### C. Microservice
- **File**: `modules/cashier/backend/microservice.js`
- **Port**: `3004` (by default or as configured)
- **Role**: Standalone payment state tracking and processing.

---

## 4. Functionality Flags & Parameters
- **`paymentStatus`** query parameter: Determines filtering logic (`ALL`, `UNPAID`, `PAID`).
- **`hideDispatched`** query parameter: Boolean flag to filter out shipped/closed orders.
- **Authorization**: Restricts actions only to authenticated users with the `CASHIER` role.

---

## 5. Additional Features (Not Yet Implemented)

### A. Daily Revenue Summary
- `GET /summary?date=` — Aggregates total cash collected for the day, broken down by payment mode (Cash, UPI, Card, Online, Credit).
- Uses `prisma.job.groupBy({ by: ['paymentMode'], where: { paymentStatus: 'PAID', updatedAt: { gte: startOfDay, lte: endOfDay } } })`.
- Displayed as a summary strip at the top of CashierDashboard.

### B. Payment Reconciliation Report
- `GET /reconciliation?date=` — Compares number of jobs marked PAID per mode vs expected cash in drawer.
- Cashier enters actual cash-in-hand; system shows variance for end-of-day audit.
- Stored as a new `CashierReconciliation` record (new table) or in `SystemConfig` as a daily JSON snapshot.

### C. Receipt Generation (Thermal Print)
- `GET /jobs/:jobId/receipt` — Returns a formatted receipt payload (customer name, job ID, items count, amount, payment mode, cashier name, timestamp).
- Frontend renders via `window.print()` with a thermal-width CSS media query for 58mm/80mm printers.
- No new DB table required — derived from existing `Job` + `Customer` records.

### D. Credit Customer Outstanding Balance Ledger
- Requires a new `CreditLedger` table:
  ```
  CreditLedger { id, customerId, jobId, amount, settledAt, createdAt }
  ```
- `GET /credit-ledger/:customerId` — Returns unpaid credit balance.
- `PATCH /credit-ledger/:ledgerId/settle` — Records partial or full settlement.
- `Customer.isCreditCustomer` already flags eligible customers; this feature tracks their running balance.

### E. Payment Mode Enforcement via Enum
- `Job.paymentMode` is currently `String?` — accepts any value.
- Once schema is updated to use `PaymentMode` enum (`CASH | UPI | CARD | ONLINE | CREDIT`), the cashier PATCH endpoint should validate and return `400` for unknown modes.

### F. Multi-Job Batch Payment
- `POST /jobs/bulk-payment` — Accept `[{ jobId, paymentMode }]` array to mark multiple jobs paid in one request.
- Uses a single Prisma `$transaction` to update all jobs atomically.
- Useful when a customer pays for multiple jobs at once at the counter.

### G. Cashier Activity Log
- `GET /activity?date=` — Returns list of payment actions performed by the logged-in cashier for the day, sourced from `JobEvent` with `actionType = 'COMPLETED'` cross-referenced with `Job.paymentHandledById`.
