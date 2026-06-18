# 🚀 NestJS Prisma Professional Template

This is a production-ready, highly scalable NestJS boilerplate designed with a "Proper Architecture" inspired by clean code principles, DDD, and the Repository Pattern.

## 🏗 Architecture Overview

The project follows a **Modular Design** ensuring each feature is isolated, testable, and maintainable.

### 📂 Folder Structure

- **`src/common`**: Global utilities, filters, interceptors, and base classes.
  - `filters/`: Global exception handling (standardized error responses via `ApiError`).
  - `interceptors/`: Success response transformation to a standard JSON format.
  - `repositories/`: **BaseRepository** providing generic CRUD operations for all services.
  - `config/`: Environment variable validation using `Joi` and professional `Winston` logger config.
- **`src/modules`**: Feature-specific logic.
  - `auth/`: Complete JWT system (Access & Refresh tokens) with rotation, RT hashing, and RBAC.
  - `users/`: User management with password hashing (Bcrypt).
  - `files/`: Secure file upload system with size and type validation.
  - `mail/`: Dynamic email service using `Handlebars` templates.
- **`src/prisma`**: Global Prisma service and configuration.
- **`test/`**: Professional End-to-End (E2E) test suite.

## 🛠 Core Features

### 1. Authentication & Authorization
- **Dual-Token System**: Secure Access and Refresh tokens with hashing in the database.
- **RBAC**: Role-Based Access Control using `@Roles()` decorator and `RolesGuard`.
- **Security**: Includes `passport-jwt` strategy for protected routes.

### 2. Professional Logging (Winston)
- **Console Logs**: Color-coded, readable logs for development.
- **File Logs**: Daily rotating log files (`error-*.log` and `combined-*.log`) stored in `logs/` directory for production debugging.

### 3. Mail System (Handlebars)
- **Templates**: Send professional HTML emails using `.hbs` templates (located in `src/modules/mail/templates`).
- **Integration**: Pre-configured for SMTP providers (like Mailtrap, SendGrid, etc.).

### 4. Robust File Upload
- **Validation**: Uses NestJS `ParseFilePipe` to restrict file types (images only) and maximum size (5MB).
- **Storage**: Configured with `multer` disk storage and unique filenames.

### 5. Standardized API Responses
- **Errors**: All errors follow a consistent structure: `{ "statusCode": 400, "message": "...", "error": "...", "timestamp": "..." }`.
- **Success**: All success responses are wrapped: `{ "success": true, "data": { ... }, "timestamp": "..." }`.

### 6. Database & Docker
- **Prisma 7**: Modern ORM with PostgreSQL support.
- **Seeding**: Initial Admin user creation via `npx prisma db seed`.
- **Docker**: Pre-configured `Dockerfile` and `docker-compose.yml` for instant environment setup.

## 🚀 Getting Started

### 1. Setup Environment
Copy `.env.example` to `.env` and update your settings.
```bash
PORT=8083
DATABASE_URL="postgresql://user:password@localhost:5433/dbname"
```

### 2. Run with Docker (Recommended)
```bash
docker-compose up -d --build
```

### 3. Database Sync & Seeding
```bash
npx prisma migrate dev --name init
npx prisma db seed
```

### 4. Run E2E Tests
```bash
npm run test:e2e
```

## 📖 API Documentation
Once running, explore the API at: `http://localhost:8083/api/v1/docs`

## 📄 License
UNLICENSED
