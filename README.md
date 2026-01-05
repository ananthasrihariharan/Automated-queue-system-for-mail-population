# Despatch and Tariff System

A comprehensive full-stack application for managing printing press operations, including job tracking, dispatch, tariffs, customer management, and more.

## Features

- **Job Management:** Create and track printing jobs (Prepress, etc.).
- **Dispatch:** Manage dispatch and tariffs.
- **Role-Based Access:** Admin, Prepress, Customer, Cashier, Dispatch roles.
- **Authentication:** Secure login with JWT.
- **Frontend:** Modern, responsive UI built with React and Tailwind CSS.

## Tech Stack

### Backend
- Node.js
- Express.js
- MongoDB (with Mongoose)
- JWT (JSON Web Tokens) for authentication
- Multer for file uploads

### Frontend
- React (Vite)
- TypeScript
- Tailwind CSS
- React Router DOM
- TanStack Query (React Query)

## Getting Started

### Prerequisites

- Node.js (v18+ recommended)
- MongoDB (running locally or a cloud instance like Atlas)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd despatch-system
    ```

2.  **Install Backend Dependencies:**
    ```bash
    npm install
    ```

3.  **Install Frontend Dependencies:**
    ```bash
    cd printing-press-frontend
    npm install
    ```

### Configuration

Create a `.env` file in the root directory and update it with your configuration:

```env
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key
# Add other environment variables as needed
```

### Running the Application

To run both the backend and frontend concurrently (development mode):

```bash
# From the root directory
npm run dev
```

- **Backend:** `http://localhost:5000`
- **Frontend:** `http://localhost:5173`

To run them separately:

- **Backend:** `npm start` (from root)
- **Frontend:** `cd printing-press-frontend && npm run dev`

## API Routes

- `/api/login` - User authentication
- `/api/prepress` - Prepress module routes
- `/api/customer` - Customer management
- `/api/dispatch` - Dispatch and tariff routes
- `/api/admin` - Admin routes
- `/api/cashier` - Cashier routes
