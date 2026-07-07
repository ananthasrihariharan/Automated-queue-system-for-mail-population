# Bugfix Requirements Document

## Introduction

The Despatch module contains four interrelated bugs in the rack allocation and parcel packing
flow. Together they cause rack assignments to silently disappear after saving, packed-item
state in the UI to show incorrectly on reload, the "all items packed" check to never fire so
parcels are never promoted to PACKED status, and a latent index-base mismatch that can corrupt
which item a rack or dispatch action targets.

All four bugs stem from the same root pattern: Mongoose `Map` fields (`itemRacks`,
`itemStatuses`) are serialised to plain JavaScript objects when stored in MongoDB. When the
document is retrieved and the backend (or frontend) calls `.set()` or `.get()` on what it
assumes is a `Map`, the call silently no-ops or returns `undefined` — leaving data un-saved
or un-read. A fourth bug introduces a 0-based vs 1-based index ambiguity that can cause
rack and dispatch operations to target the wrong item index.

---

## Bug Analysis

### Current Behavior (Defect)

**Bug A — `itemRacks` Map not persisting after save**

1.1 WHEN a dispatch operator assigns a rack to an item via `PATCH /parcels/:parcelNo/rack`
    and `activeParcel.itemRacks` is a plain object (deserialized from MongoDB),
    THEN the system silently discards the rack assignment because `.set()` does not exist
    on a plain object, and the save completes without error but writes no rack data

1.2 WHEN a dispatch operator packs items via `PATCH /parcels/:parcelNo/pack`
    and `activeParcel.itemRacks` is a plain object,
    THEN the system silently discards all per-item rack assignments because `.set()` on a
    plain object is a no-op, even though the HTTP response reports success

**Bug B — Frontend `packedItems` state does not reflect server truth on load**

1.3 WHEN the DispatchParcels modal opens for a job whose parcels have server-side
    `itemStatuses` data and `p.itemStatuses instanceof Map` evaluates to `false`
    (because the API returns JSON plain objects),
    THEN the system initialises `packedItems` as empty, causing items already packed
    server-side to appear unpacked in the UI

1.4 WHEN the `useEffect` sync runs after a job refetch and `p.itemStatuses` is a plain object,
    THEN the system fails to mark previously-packed items as packed in the `packedItems` state,
    so the UI continues to show a stale, incorrect packed state

**Bug C — `allItemsPacked` check never evaluates to `true`**

1.5 WHEN the `/pack` route runs `activeParcel.itemStatuses.get(String(idx))` and
    `activeParcel.itemStatuses` is a plain object (not a Map),
    THEN the system returns `undefined` for every item because plain objects do not have a
    `.get()` method, so `allItemsPacked` is always `false` and `parcel.status` is never
    set to `'PACKED'`

1.6 WHEN `parcel.status` is never set to `'PACKED'` due to bug C,
    THEN the system never advances `job.jobStatus` to `'PACKED'`, regardless of how many
    items the operator has packed, leaving the job permanently in `'PENDING'` or `'PRINTED'`
    status in the dispatch dashboard

**Bug D — Item index base mismatch in auto-parcel creation and dispatch routes**

1.7 WHEN auto-parcel creation runs (`itemIndexes: Array.from({ length: job.totalItems }, (_, i) => i + 1)`)
    and produces 1-based item indexes (1…N),
    AND the `/items/:itemIndex/dispatch` route receives `itemIndex` from the URL,
    THEN the system may target the wrong item if the caller passes a 0-based index,
    because `targetParcel.itemIndexes.includes(itemIdx)` will fail to find item `0`
    in a 1-based array, resulting in a "Item not found in any parcel" error or,
    worse, silently operating on item N+1 if the URL param happens to match a different value

1.8 WHEN a parcel is auto-created with 1-based `itemIndexes` and a rack is assigned using
    a 0-based `itemIndex` from the URL,
    THEN `activeParcel.itemRacks.set('0', rack)` stores a rack under key `'0'` which does
    not correspond to any index in `itemIndexes`, making the rack assignment permanently
    unretrievable

---

### Expected Behavior (Correct)

**Bug A — `itemRacks` must persist reliably**

2.1 WHEN a dispatch operator assigns a rack to an item via `PATCH /parcels/:parcelNo/rack`,
    THEN the system SHALL persist the rack value in `parcel.itemRacks[String(itemIndex)]`
    regardless of whether Mongoose returns `itemRacks` as a `Map` instance or a plain object,
    and the subsequent `job.save()` SHALL write the updated value to MongoDB

2.2 WHEN a dispatch operator packs items via `PATCH /parcels/:parcelNo/pack`,
    THEN the system SHALL persist every per-item rack value in `parcel.itemRacks` and every
    per-item status in `parcel.itemStatuses` regardless of the runtime type of those fields
    after MongoDB round-trip deserialisation

**Bug B — Frontend packed state must match server truth on load and refetch**

2.3 WHEN the DispatchParcels modal opens (or a job refetch completes) and `p.itemStatuses`
    is a plain object returned from the JSON API,
    THEN the system SHALL correctly read all item status entries using
    `Object.entries(p.itemStatuses)` (or equivalent) and initialise `packedItems` so that
    every item already in `PACKED` or `DISPATCHED` state server-side is shown as packed in
    the UI

2.4 WHEN the `useEffect` job sync runs after any `onDispatched()` refetch,
    THEN the system SHALL update `packedItems`, `dispatchedItems`, and `itemRacks` state
    consistently from the server response without relying on `instanceof Map` checks that
    fail for plain objects

**Bug C — Parcel PACKED status must be set when all items are packed**

2.5 WHEN the `/pack` route finishes writing item statuses and checks whether all items are
    packed,
    THEN the system SHALL read `itemStatuses` safely regardless of whether it is a `Map`
    or plain object, and when every `itemIndex` in `parcel.itemIndexes` has a status of
    `'PACKED'` or `'DISPATCHED'`, the system SHALL set `parcel.status = 'PACKED'` and
    `parcel.packedAt = new Date()`

2.6 WHEN all parcels in a job reach `status === 'PACKED'` (or `'DISPATCHED'`),
    THEN the system SHALL set `job.jobStatus = 'PACKED'` in the same save operation

**Bug D — Item index base must be consistent across all routes**

2.7 WHEN auto-parcel creation produces `itemIndexes` using 1-based counting (1…N),
    THEN all route handlers that accept an `itemIndex` URL parameter (`/items/:itemIndex/dispatch`,
    `/parcels/:parcelNo/rack`, `/parcels/:parcelNo/pack`) SHALL interpret that parameter as
    1-based, and the system SHALL reject or correct any 0-based value that does not exist in
    `parcel.itemIndexes`

2.8 WHEN a rack is assigned or an item is dispatched,
    THEN the system SHALL store the rack or status under the exact `String(itemIndex)` key
    that matches the value in `parcel.itemIndexes`, so that retrieval by the same index
    always succeeds

---

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a dispatch operator assigns a rack to a parcel that has not yet been retrieved from
    MongoDB in the current request (i.e., the document is freshly queried with `.itemRacks`
    already a proper Mongoose `Map`),
    THEN the system SHALL CONTINUE TO accept `.set()` calls and persist rack data exactly
    as before

3.2 WHEN a parcel already has `status === 'PACKED'` or `status === 'DISPATCHED'` before the
    pack route is called,
    THEN the system SHALL CONTINUE TO return the existing packed/dispatched state without
    overwriting it or resetting item statuses

3.3 WHEN the `/parcels/:parcelNo/dispatch` route is called for a parcel with
    `deliveryType === 'WALK_IN'`,
    THEN the system SHALL CONTINUE TO allow dispatch without requiring a prior pack step

3.4 WHEN a non-admin user attempts to dispatch a parcel for a job where `paymentStatus` is
    neither `'PAID'` nor `'ADMIN_APPROVED'` and the customer is not a credit customer,
    THEN the system SHALL CONTINUE TO return a 403 error and refuse the dispatch

3.5 WHEN the legacy single-rack format (`{ rack: 'R1' }`) is sent to the `/pack` route
    instead of the items-array format,
    THEN the system SHALL CONTINUE TO apply the rack to all items in the parcel and mark
    them all as `PACKED`

3.6 WHEN `parcel.status` is already `'DISPATCHED'` and the pack route is called for that
    parcel,
    THEN the system SHALL CONTINUE TO include the dispatched parcel in the `allItemsPacked`
    check (counting `'DISPATCHED'` as a terminal state) and not regress the parcel status

3.7 WHEN the DispatchParcels modal displays a job whose parcels have no `itemStatuses` data
    (legacy jobs with only a top-level `parcel.status`),
    THEN the UI SHALL CONTINUE TO infer packed state from `parcel.status === 'DISPATCHED'`
    and show all items as packed for that parcel

3.8 WHEN the reorganize route (`PATCH /jobs/:jobId/reorganize`) is called,
    THEN the system SHALL CONTINUE TO re-evaluate `jobStatus` correctly based on the new
    parcel configuration without being affected by the Map/plain-object fix

3.9 WHEN the `Job.pre('save')` hook runs its `getStatusMap` helper,
    THEN the system SHALL CONTINUE TO compute `jobStatus` correctly for documents where
    `itemStatuses` is already stored as a `Map`, a Mongoose `Map` proxy, or a plain object
