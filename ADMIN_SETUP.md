# Admin Account Setup

There are **two ways** to create an admin account:

## Method 1: Using the Setup Endpoint (Recommended)

Make a POST request to create the first admin (only works if no admin exists):

```bash
POST http://localhost:8000/api/setup/create-first-admin
Content-Type: application/json

{
  "name": "Admin User",
  "email": "admin@rcr.com",
  "password": "Admin@123"
}
```

**Or use curl:**
```bash
curl -X POST http://localhost:8000/api/setup/create-first-admin \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Admin User",
    "email": "admin@rcr.com",
    "password": "Admin@123"
  }'
```

## Method 2: Using the Script

Run the script from the backend directory:

```bash
cd backend
npm run create-admin
```

**Default credentials (if using script):**
- Email: `admin@rcr.com` (or set `ADMIN_EMAIL` in `.env`)
- Password: `Admin@123` (or set `ADMIN_PASSWORD` in `.env`)
- Name: `Admin User` (or set `ADMIN_NAME` in `.env`)

You can customize these in your `.env` file:
```
ADMIN_EMAIL=your-admin@email.com
ADMIN_PASSWORD=YourSecurePassword123
ADMIN_NAME=Your Admin Name
```

## After Creating Admin

1. Login with the admin credentials at `/login`
2. You'll have access to:
   - `/admin/users` - Manage all users
   - `/notifications` - Create notifications
   - `/attendance` - View all attendance
   - All educator features

## Important Notes

- ⚠️ **Change the default password after first login!**
- The setup endpoint only works if **no admin exists** in the database
- After the first admin is created, use `/api/admin/users` (requires admin login) to create more admins
- The script can be run multiple times but will skip if admin already exists

