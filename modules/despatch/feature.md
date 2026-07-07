# Despatch Module Feature Documentation

This document describes the features, database models, API endpoints, frontend interfaces, microservices, and functionality flags of the **Despatch (Dispatch)** module.

---

## 1. Module Name & Purpose
- **Module Name**: Despatch (Dispatch) Logistics & Inventory
- **Directory**: `modules/despatch`
- **Purpose**: Manages the shipping cycle, including grouping finished print items into parcel containers, assigning shelf rack storage locations, printing labels, and dispatching orders via courier or walk-in.

---

## 2. Database Models & Relations
The Despatch module reads and writes the following tables:
- **`Job`**:
  - `jobStatus`: Mapped to `PENDING` | `CREATED` | `PRINTED` | `PACKED` | `DISPATCHED` | `PARTIAL_DISPATCH`.
  - `rackLocation`: Shelf location where finished items are held.
  - `dispatchedAt`: Global completion timestamp.
  - `packingPreference`: Confirmed packing format (`SINGLE` | `MULTIPLE` | `MIXED`).
- **`JobParcel` & `JobParcelItem`**:
  - Relational parcel structures that store parcel indexes, item contents, statuses (`PENDING`, `PACKED`, `DISPATCHED`), weights, and tracking barcodes.
- **`Customer`**:
  - Contains customer contact and phone details to map dispatch messages.

---

## 3. Features & Functional Workflows

### A. Backend APIs
Mapped to Express under `/api/dispatch`:
- **`GET /jobs`**:
  - Retrieves active/undispatched orders or history (fully/partially dispatched), with pagination and date/search filters.
- **`POST /jobs/:jobId/pack`**:
  - Sets parcel contents, updating statuses to `PACKED`. If no parcels are registered, a virtual parcel (Parcel 1) is automatically initialized under any layout mode to handle single-item jobs.
- **`POST /jobs/:jobId/rack`**:
  - Updates the physical rack shelf location where the job is stored. Supports bulk rack changes across multiple selected jobs.
- **`POST /jobs/:jobId/dispatch`**:
  - Marks specific parcels as `DISPATCHED`. If all parcels are dispatched, the job transitions to `DISPATCHED` and logs `dispatchedAt`. Otherwise, the status becomes `PARTIAL_DISPATCH`.

### B. Frontend Dashboards
- **DispatchDashboard (`DispatchDashboard.tsx`)**:
  - **Active Tab**: Displays orders in queue for packing and rack mapping.
  - **History Tab**: Displays completed or partially completed dispatches.
  - Features quick inline updates for rack assignments, barcode scanner input, parcel weight records, and quick dispatch confirmations.

### C. Microservice
- **File**: `modules/despatch/backend/microservice.js`
- **Port**: `3005` (by default or as configured)
- **Role**: Logistics, label generation, and dispatch state validation.

---

## 4. Functionality Flags & Parameters
- **`status`** query parameter (`active` | `history`): Determines whether to display pending items or finished shipments.
- **`hideDispatched`**: Enforces filtering of finalized items.
- **Authorization**: Restricts modifications to roles containing `DISPATCH` or `ADMIN`.

---

## 5. Additional Features (Not Yet Implemented)

### A. Courier AWB / Tracking Number Recording
- `PATCH /jobs/:jobId/parcels/:parcelNo/awb` — Record a courier Airway Bill (AWB) or tracking number against a dispatched parcel.
- Requires a new `awbNumber String?` column on `JobParcel`.
- Frontend: inline editable AWB field on the dispatch dashboard history row.

### B. Bulk Scan-and-Dispatch
- `POST /dispatch/bulk` — Accept an array of `{ jobId, parcelNo }` pairs and dispatch all in one transaction.
- Designed for scan-gun workflows where the operator scans multiple QR codes rapidly and submits a batch.

### C. Rack Location History
- Currently `JobParcel.rack` and `rackLocation` store the current rack; no history.
- Add a `JobParcelRackHistory` table: `{ id, jobParcelId, rack, assignedAt, assignedById }`.
- `GET /jobs/:jobId/rack-history` — Shows when and by whom each parcel's rack changed.

### D. Physical Shelf Occupancy View
- `GET /racks` — Returns a grouped view of all active (non-dispatched) parcels by rack location.
- Derived from `JobParcel WHERE status != 'DISPATCHED' GROUP BY rack`.
- Allows dispatch staff to see at a glance which racks are full.
- Uses the new `@@index([dispatchedAt])` on `Job` and parcel status for fast filtering.

### E. Delivery Proof Capture
- `POST /jobs/:jobId/parcels/:parcelNo/proof` — Upload a photo or record a signature as delivery proof.
- Stores the file path in a new `JobParcel.proofPath String?` column (or a separate `DeliveryProof` table for multi-photo support).
- Required for courier deliveries where the recipient must sign.

### F. Partial Dispatch Progress Indicator
- `GET /jobs/:jobId/dispatch-progress` — Returns the count of dispatched vs total parcels and their individual statuses.
- Already derivable from `JobParcel` and `JobParcelItem` data; expose as a dedicated lightweight endpoint without loading full item relations.

### G. Courier Partner Integration Webhook
- `POST /webhooks/courier/:partner` — Receive delivery status callbacks from courier APIs (e.g., Delhivery, Shiprocket).
- Update `JobParcel` status automatically from the webhook payload.
- Log delivery events to `JobEvent` with `actionType = 'COMPLETED'` when courier confirms delivery.

### H. Dispatch Summary Report
- `GET /reports/dispatch-summary?from=&to=` — Returns count of jobs dispatched per day, grouped by delivery type (COURIER vs WALK_IN), sourced from `Job.dispatchedAt` (indexed after Phase 1 schema change).

### I. QR Label Printing
- `GET /jobs/:jobId/parcels/:parcelNo/label` — Returns a printable label payload (customer name, phone, job ID, parcel no, rack, QR code, delivery type).
- Frontend renders via thermal print CSS (`@media print`). No new DB column needed — uses existing `JobParcel.qrCode`.
