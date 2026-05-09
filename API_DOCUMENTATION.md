# API Documentation - Despatch System

This document outlines the API endpoints for the Despatch System backend.

## Base URL
The base URL for all API endpoints is `http://<server-ip>:<port>/api`.
By default, the port is `3001`.

---

## Authentication

### Login
Authenticates a user (Staff or Customer) and returns a JWT.

- **URL:** `/login`
- **Method:** `POST`
- **Auth required:** No
- **Body:**
  ```json
  {
    "phone": "string",
    "password": "string"
  }
  ```
- **Success Response:**
  - **Code:** 200
  - **Content:**
    ```json
    {
      "token": "string",
      "user": {
        "id": "string",
        "name": "string",
        "roles": ["string"]
      }
    }
    ```

---

## Admin Endpoints
Endpoints restricted to users with the `ADMIN` role. Mounted at `/api/admin`.

### Job Management

#### Get Jobs
List jobs with filtering and pagination.

- **URL:** `/admin/jobs`
- **Method:** `GET`
- **Query Params:**
  - `page`: Page number (default: 1)
  - `limit`: Jobs per page (default: 50)
  - `date`: Specific date filter (YYYY-MM-DD)
- **Success Response:** 200 OK

#### Approve Unpaid Dispatch
- **URL:** `/admin/jobs/:jobId/approve-dispatch`
- **Method:** `PATCH`
- **Body:** `{ "note": "string" }`

### Employee Management

#### List Employees
- **URL:** `/admin/users`
- **Method:** `GET`

#### Create Employee
- **URL:** `/admin/users`
- **Method:** `POST`
- **Body:**
  ```json
  {
    "name": "string",
    "phone": "string",
    "roles": ["ADMIN", "PREPRESS", "DISPATCH", "CASHIER"],
    "password": "string"
  }
  ```

#### Update Employee
- **URL:** `/admin/users/:id`
- **Method:** `PATCH`

#### Delete Employee
- **URL:** `/admin/users/:id`
- **Method:** `DELETE`

### Customer Management

#### List Customers
- **URL:** `/admin/customers`
- **Method:** `GET`

#### Update Customer
- **URL:** `/admin/customers/:id`
- **Method:** `PATCH`

#### Delete Customer
- **URL:** `/admin/customers/:id`
- **Method:** `DELETE`

---

## Admin Queue Management
Endpoints for managing the design/prepress queue. Mounted at `/api/admin/queue`.

### Queue Control

#### Get Full Queue
- **URL:** `/admin/queue/jobs`
- **Method:** `GET`
- **Query Params:** `status`, `assignedTo`, `search`, `date`, `page`, `limit`

#### Set Job Priority
- **URL:** `/admin/queue/jobs/:id/priority`
- **Method:** `PATCH`
- **Body:** `{ "priorityScore": number, "dueBy": "ISO-Date" }`

#### Pin Job to Staff
- **URL:** `/admin/queue/jobs/:id/pin`
- **Method:** `PATCH`
- **Body:** `{ "staffId": "string" }`

#### Reassign Job
- **URL:** `/admin/queue/jobs/:id/reassign`
- **Method:** `PATCH`
- **Body:** `{ "toStaffId": "string", "notes": "string", "forceMode": boolean }`

#### Bulk Delete
- **URL:** `/admin/queue/jobs/bulk-delete`
- **Method:** `POST`
- **Body:** `{ "jobIds": ["string"] }`

#### Queue Analytics
- **URL:** `/admin/queue/stats`
- **Method:** `GET`

---

## Prepress Endpoints
Endpoints for Prepress staff to create and manage jobs. Mounted at `/api/prepress`.

### Job Creation

#### Create Job
Create a new job with screenshots. Supports `multipart/form-data`.

- **URL:** `/prepress/jobs`
- **Method:** `POST`
- **Body:**
  - `jobId`: string
  - `customerName`: string
  - `customerPhone`: string
  - `totalItems`: number
  - `screenshots`: files (array)
  - `packingPreference`: "SINGLE" | "MULTIPLE"

#### Get My Jobs
- **URL:** `/prepress/jobs`
- **Method:** `GET`

#### Search Customers
- **URL:** `/prepress/customers/search`
- **Method:** `GET`
- **Query Params:** `name`

---

## Staff Queue Interaction
Endpoints for staff to participate in the automated queue. Mounted at `/api/queue`.

### Session Management

#### Start Session
- **URL:** `/queue/start-session`
- **Method:** `POST`

#### End Session
- **URL:** `/queue/end-session`
- **Method:** `POST`

#### Heartbeat
Maintains session activity status.
- **URL:** `/queue/heartbeat`
- **Method:** `POST`

### Job Workflow

#### Get Current Job
- **URL:** `/queue/current-job`
- **Method:** `GET`

#### Complete Job
- **URL:** `/queue/complete-job/:id`
- **Method:** `POST`

#### Pause Job
- **URL:** `/queue/jobs/:id/pause`
- **Method:** `POST`

---

## Dispatch Endpoints
Endpoints for Dispatch staff to manage packing and shipping. Mounted at `/api/dispatch`.

### Packing & Delivery

#### Get Dispatch Queue
- **URL:** `/dispatch/jobs`
- **Method:** `GET`
- **Query Params:** `status` (active/history), `search`, `date`

#### Pack Parcel
Assigns a rack location to a parcel.
- **URL:** `/dispatch/jobs/:jobId/parcels/:parcelNo/pack`
- **Method:** `PATCH`
- **Body:** `{ "rack": "string" }`

#### Dispatch Parcel
- **URL:** `/dispatch/jobs/:jobId/parcels/:parcelNo/dispatch`
- **Method:** `PATCH`

#### Request Admin Approval
For dispatching unpaid jobs.
- **URL:** `/dispatch/jobs/:jobId/request-approval`
- **Method:** `PATCH`

---

## Cashier Endpoints
Endpoints for Cashier staff to handle payments. Mounted at `/api/cashier`.

#### Mark Paid
- **URL:** `/cashier/jobs/:jobId/payment`
- **Method:** `PATCH`

---

## Customer Endpoints
Endpoints for customers to track their jobs and confirm packing. Mounted at `/api/customer`.

#### Get My Jobs
- **URL:** `/customer/jobs`
- **Method:** `GET`

#### Confirm Packing
- **URL:** `/customer/jobs/:jobId/packing`
- **Method:** `POST`
- **Body:**
  ```json
  {
    "packingPreference": "SINGLE" | "MULTIPLE",
    "parcels": []
  }
  ```

---

## Internal API
Secured with `x-api-key`. Mounted at `/api/internal`.

#### Sync Walk-in Job
Used by the Customer Upload microservice to push jobs to the main system.
- **URL:** `/internal/sync-walkin-job`
- **Method:** `POST`

---

## Socket.io Events

### Client to Server
- `join:staff` (staffId): Joins a room to receive targeted job assignments.
- `join:admin` (adminId): Joins the admin monitoring room.
- `chat:send` ({ toId, message }): Sends a message.

### Server to Client
- `chat:received`: New message received.
- `job:assigned`: A new job has been pushed to the staff member.
- `queue:updated`: General queue status update for admins.
