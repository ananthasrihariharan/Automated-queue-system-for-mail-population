# Customer Module Feature Documentation

This document describes the features, database models, API endpoints, frontend interfaces, microservices, and functionality flags of the **Customer** module.

---

## 1. Module Name & Purpose
- **Module Name**: Customer Dashboard & Packing Preferences
- **Directory**: `modules/customer`
- **Purpose**: Allows external customers to track order progress, choose packaging configurations (Single, Multiple), confirm shipment methods, and view historical invoices.

---

## 2. Database Models & Relations
The Customer module interacts with the following tables/relations:
- **`Customer`**:
  - Main customer repository containing profile details, emails list, password hashes, and credit settings.
- **`CustomerPreference`**:
  - Learns preferred prepress designer affinities based on customer email and matches.
- **`Job`**:
  - `customerId`: Filters orders assigned to the logged-in customer.
  - `packingPreference`: Confirmed packing format (`SINGLE` | `MULTIPLE` | `MIXED`).
  - `customerConfirmedAt`: Timestamp when customer locks in their preference.
  - `jobStatus`: Categorizes jobs between active orders (`jobStatus: { $ne: 'DISPATCHED' }`) and histories (`jobStatus: 'DISPATCHED'`).

---

## 3. Features & Functional Workflows

### A. Backend APIs
Mapped to Express under `/api/customer` and `/api/customer-auth`:
- **Auth Layer (`customer-auth.js`)**:
  - `POST /login` — Validates customer phone and password credentials against the `Customer` table, returning a JWT token with `customerId`.
- **Jobs Interface (`customer.js`)**:
  - `GET /jobs` — Retrieves all jobs belonging to the authenticated customer (allows filtering by `status: 'active'` or `'history'`).
  - `GET /jobs/:jobId` — Retrieves details of a specific job.
  - `POST /jobs/:jobId/packing` — Saves packaging preferences and parcel details confirmed by the customer.

### B. Frontend Dashboards
- **customerDashboard (`customerDashboard.tsx`)**:
  - Displays customer's active jobs and history in tabbed lists.
  - Links to the parcel packing configuration page when orders require layout decisions.
- **CustomerPacking (`CustomerPacking.tsx`)**:
  - Interactive item selection interface where customers assign printing items to specific package boxes, finalizing their `packingPreference`.

### C. Microservice
- **File**: `modules/customer/backend/microservice.js`
- **Port**: `3002` (by default or as configured)
- **Role**: Standalone customer microservice.

---

## 4. Functionality Flags & Parameters
- **`status`** query parameter: Switch between active jobs (`active`) and historical/shipped jobs (`history`).
- **Authorization**: Protected via `customerAuth` middleware which decodes `customerId` from the JWT token and verifies it.

---

## 5. Additional Features (Not Yet Implemented)

### A. QR-Based Parcel Tracking
- `GET /parcels/:qrCode` — Resolves a parcel's current status from `JobParcel.qrCode`.
- Allows customers to scan a printed QR label on their parcel and see: packed date, rack location, dispatch status, and delivery type.
- No authentication required for this endpoint (public parcel lookup by QR payload).

### B. Order Status Push Notifications
- When `Job.jobStatus` transitions (e.g., PRINTED → PACKED → DISPATCHED), send a WhatsApp or SMS notification to `Customer.phone`.
- Hook into the existing `eventBus` service: subscribe to `workflow:updated` events and push notification via the existing WhatsApp gateway.
- Store customer notification preference in `CustomerPreference` or a new `NotificationPreference` record.

### C. Customer Profile Self-Update
- `PATCH /profile` — Allow customer to update their own name and alternate phone numbers (`Customer.alternatePhones[]`).
- Password change: `POST /profile/change-password` — Validates current password, hashes new one.
- Does NOT allow phone number change (phone is the login identity; only admin can change it).

### D. Payment Status Visibility
- `GET /jobs/:jobId/payment` — Returns `paymentStatus`, `paymentMode`, and timestamp for the job.
- Allows credit customers to see whether their order has been marked as paid or is still on credit.

### E. Delivery Preference Update Window
- Allow customer to change packing preference only before the job reaches `PRINTED` status.
- `PATCH /jobs/:jobId/packing` already exists; add a guard:
  ```
  if (job.jobStatus !== 'PENDING' && job.jobStatus !== 'CREATED') {
    return res.status(403).json({ message: 'Packing preference locked after printing' });
  }
  ```

### F. Order History Download
- `GET /jobs/:jobId/summary` — Returns a printable summary (job ID, items, specs, dates, packing, payment) as JSON that the frontend can render as a downloadable PDF.

### G. Preferred Staff Display
- `GET /preferences` — Shows the customer's preferred prepress staff member name (from `CustomerPreference` table).
- Allows customer to understand who typically handles their jobs, building trust.

### H. Customer Registration by Self
- Currently customers are created by prepress staff when a job is created.
- `POST /register` — Allow new walk-in customers to self-register (name, phone, password) from a public kiosk page.
- Requires admin approval flag (`Customer.isActive Boolean`) before the account is usable.
