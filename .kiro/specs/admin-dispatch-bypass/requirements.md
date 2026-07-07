# Requirements Document

## Introduction

This feature allows users with the ADMIN role to dispatch jobs without the payment requirement being enforced. Currently, all dispatch endpoints block dispatch unless the job has a `paymentStatus` of `PAID` or `ADMIN_APPROVED`, or the customer is a credit customer — even for admin users. The desired behaviour is that ADMIN users can proceed directly to dispatch regardless of payment status, while non-admin users (e.g. the DISPATCH role) continue to follow the existing payment flow. The job's `paymentStatus` field is not modified by this bypass; the admin is simply permitted to proceed. The frontend dispatch UI must also reflect this: admin users must not be blocked by the payment-required UI guards.

## Glossary

- **Dispatch_Server**: The Express/Node.js backend handling dispatch operations
- **Dispatch_UI**: The React/TypeScript frontend dispatch module (`DispatchDashboard.tsx`)
- **Admin_User**: A user whose `roles` array contains the value `"ADMIN"`, as populated on `req.user` by the auth middleware
- **Non_Admin_User**: A user whose `roles` array does not contain `"ADMIN"` (e.g. a user with only the `DISPATCH` role)
- **Payment_Check**: The server-side guard that returns HTTP 403 when `paymentStatus` is neither `PAID` nor `ADMIN_APPROVED` and the customer is not a credit customer
- **Payment_Guard**: The frontend-side check that blocks dispatch actions and shows "Payment required" messaging when `isApproved` is false and the customer is not a credit customer
- **Parcel_Dispatch**: The endpoint `PATCH /jobs/:jobId/parcels/:parcelNo/dispatch`
- **Item_Dispatch**: The endpoint `PATCH /jobs/:jobId/items/:itemIndex/dispatch`
- **Legacy_Dispatch**: The endpoint `POST /jobs/:jobId/dispatch`
- **Credit_Customer**: A customer whose `isCreditCustomer` flag is `true`; these customers bypass payment checks for all roles already

---

## Requirements

### Requirement 1: Admin Bypass on Parcel Dispatch Endpoint

**User Story:** As an admin user, I want to dispatch parcels without a prior payment step, so that I can resolve urgent or exceptional dispatch situations without needing to separately mark a job as paid.

#### Acceptance Criteria

1. WHEN an Admin_User calls Parcel_Dispatch and `job.paymentStatus` is neither `PAID` nor `ADMIN_APPROVED` and the customer is not a Credit_Customer, THE Dispatch_Server SHALL return HTTP 200, set the parcel `status` to `DISPATCHED`, and set `dispatchedBy` to `"ADMIN"` without returning HTTP 403.
2. WHEN a Non_Admin_User calls Parcel_Dispatch and `job.paymentStatus` is neither `PAID` nor `ADMIN_APPROVED` and the customer is not a Credit_Customer, THE Dispatch_Server SHALL return HTTP 403 with the message `"Payment pending. Mark job as paid or use Admin Approve before dispatching."`.
3. WHEN THE Dispatch_Server returns HTTP 200 for an Admin_User Parcel_Dispatch request, THE Dispatch_Server SHALL NOT modify `job.paymentStatus`.
4. WHEN an Admin_User calls Parcel_Dispatch and the customer is a Credit_Customer, THE Dispatch_Server SHALL return HTTP 200, set the parcel `status` to `DISPATCHED`, set `dispatchedBy` to `"ADMIN"`, and SHALL NOT modify `job.paymentStatus`.

---

### Requirement 2: Admin Bypass on Item Dispatch Endpoint

**User Story:** As an admin user, I want to dispatch individual items without a prior payment step, so that I can handle partial dispatch scenarios for unpaid jobs when operationally required.

#### Acceptance Criteria

1. WHEN an Admin_User calls Item_Dispatch and `job.paymentStatus` is neither `PAID` nor `ADMIN_APPROVED` and the customer is not a Credit_Customer, THE Dispatch_Server SHALL allow the item dispatch to proceed without returning HTTP 403.
2. WHEN a Non_Admin_User calls Item_Dispatch and `job.paymentStatus` is neither `PAID` nor `ADMIN_APPROVED` and the customer is not a Credit_Customer, THE Dispatch_Server SHALL return HTTP 403 with the message `"Payment pending. Mark job as paid or use Admin Approve before dispatching."`.
3. WHEN THE Dispatch_Server returns HTTP 200 for an Admin_User Item_Dispatch request, THE Dispatch_Server SHALL NOT modify `job.paymentStatus`, whether the outcome is `PARTIAL_DISPATCH` or `DISPATCHED`.
4. WHEN an Admin_User calls Item_Dispatch and the customer is a Credit_Customer, THE Dispatch_Server SHALL allow the item dispatch to proceed and SHALL NOT modify `job.paymentStatus`.

---

### Requirement 3: Admin Bypass on Legacy Dispatch Endpoint

**User Story:** As an admin user, I want to use the legacy single-parcel dispatch flow without a prior payment step, so that legacy workflows are not blocked for admin users.

#### Acceptance Criteria

1. WHEN a Non_Admin_User calls Legacy_Dispatch and `job.paymentStatus` is neither `PAID` nor `ADMIN_APPROVED` and the customer is not a Credit_Customer, THE Dispatch_Server SHALL return HTTP 403 with the message `"Payment not completed"`.
2. WHEN THE Dispatch_Server returns HTTP 200 for an Admin_User Legacy_Dispatch request, THE Dispatch_Server SHALL NOT modify `job.paymentStatus`.
3. IF the requesting user has the `ADMIN` role, THE Dispatch_Server SHALL grant access to Legacy_Dispatch (updating the current `authorize('DISPATCH')` guard to `authorize('DISPATCH', 'ADMIN')`).
4. WHEN an Admin_User calls Legacy_Dispatch, THE Dispatch_Server SHALL allow the dispatch to proceed regardless of `job.paymentStatus` and regardless of whether the customer is a Credit_Customer.

---

### Requirement 4: Admin Role Detection

**User Story:** As the system, I want a single, consistent way to detect whether the requesting user is an admin, so that the bypass logic is not duplicated inconsistently across endpoints.

#### Acceptance Criteria

1. THE Dispatch_Server SHALL determine Admin_User status by checking whether `req.user.roles` contains the exact case-sensitive string `"ADMIN"` (values such as `"admin"` or `"Admin"` SHALL NOT qualify).
2. WHEN `req.user.roles` is `null`, `undefined`, a missing property, or an empty array, THE Dispatch_Server SHALL treat the requesting user as a Non_Admin_User.
3. THE Dispatch_Server SHALL apply identical admin-detection logic across all three dispatch endpoints (Parcel_Dispatch, Item_Dispatch, Legacy_Dispatch), such that any given `req.user` object produces the same Admin_User or Non_Admin_User classification on all three endpoints, applying both the exact-match rule from Criterion 1 and the missing/empty-array rule from Criterion 2.

---

### Requirement 5: Frontend Payment Guard Bypass for Admin Users

**User Story:** As an admin user viewing the dispatch dashboard, I want dispatch buttons and actions to be available to me regardless of the job's payment status, so that I am not blocked by UI-level payment guards that don't apply to my role.

#### Acceptance Criteria

1. WHEN an Admin_User views a job in the Dispatch_UI, THE Dispatch_UI SHALL render all dispatch actions (parcel dispatch buttons, item dispatch buttons, and dispatch-all actions) in an enabled, interactive state regardless of `job.paymentStatus`.
2. WHEN a Non_Admin_User views a job in the Dispatch_UI and `isApproved` is false and the customer is not a Credit_Customer, THE Dispatch_UI SHALL render dispatch buttons in a disabled, non-interactive state and display a payment-required message to the user.
3. WHEN an Admin_User triggers a dispatch action in the Dispatch_UI and `job.paymentStatus` is neither `PAID` nor `ADMIN_APPROVED`, THE Dispatch_UI SHALL NOT display the alert `"Cannot dispatch: Payment or Credit Account required"`.
4. WHEN an Admin_User views a job in the Dispatch_UI, THE Dispatch_UI SHALL display the `job.paymentStatus` badge with the value returned by the server, without modification.
5. THE Dispatch_UI SHALL determine Admin_User status by checking whether the authenticated user's `roles` array contains the exact string `"ADMIN"`, using the same source of truth as the backend (Requirement 4).

---

### Requirement 6: No Unintended Side Effects on Other Dispatch Logic

**User Story:** As the system, I want the admin bypass to affect only the payment check, so that all other dispatch validations (pack requirements, parcel existence, job existence, role authorization) remain intact for admin users.

#### Acceptance Criteria

1. WHEN an Admin_User calls any dispatch endpoint, THE Dispatch_Server SHALL still enforce all non-payment validations: item index validation, job-not-found responses, and pack-before-dispatch requirements for non-walk-in deliveries. IF the packing preference is `SINGLE` and `job.parcels` is empty, THE Dispatch_Server SHALL auto-create the parcel; in all other cases where the parcel does not exist, THE Dispatch_Server SHALL return HTTP 404.
2. WHEN an Admin_User dispatches via Parcel_Dispatch or Item_Dispatch and the parcel status becomes `DISPATCHED`, THE Dispatch_Server SHALL set `parcel.dispatchedBy` to `"ADMIN"` on that parcel record. WHEN an Admin_User dispatches via Legacy_Dispatch and the request succeeds, THE Dispatch_Server SHALL set `job.dispatchedBy` to the Admin_User's `_id`.
3. WHEN a user without the `DISPATCH` or `ADMIN` role calls any dispatch endpoint, THE Dispatch_Server SHALL return HTTP 403.
