# 📚 Tagstash

A modern, full-stack tag-based bookmarking web application built with React, Express, and PostgreSQL. Organize your favorite links with custom tags, user authentication, and persistent storage.

## Features

- 🔐 **User Authentication**: Secure login and registration with JWT
- 👥 **Membership Tiers**: Free users can save up to 50 bookmarks, paid users are unlimited
- 🛡️ **Super Admin Controls**: Configurable super admin can manage user tiers and roles
- 🏷️ **Tag-Based Organization**: Organize bookmarks with multiple tags
- 💾 **PostgreSQL Database**: Persistent storage for users and bookmarks
- 🎨 **Modern UI**: Clean and responsive interface
- ⚡ **Fast**: Built with Vite for lightning-fast development
- 🌙 **Dark Mode**: Supports light and dark color schemes
- 📱 **Responsive**: Works great on desktop and mobile devices

## Technology Stack

### Frontend
- **React 18** - UI library
- **Vite** - Build tool and dev server
- **Axios** - HTTP client
- **Context API** - State management

### Backend
- **Node.js** - Runtime
- **Express** - Web framework
- **PostgreSQL** - Database
- **bcryptjs** - Password hashing
- **jsonwebtoken** - JWT authentication

## Getting Started

### Prerequisites

- Node.js (version 16 or higher)
- PostgreSQL 18 (or compatible version)
- npm or yarn

### Installation

1. **Navigate to the project directory**:
```bash
cd c:\Projects\Tagstash
```

2. **Install dependencies** (already done):
```bash
npm install
```

3. **Configure environment variables**:
   - The `.env` file is already configured
   - Update `DB_PASSWORD` in `.env` if needed
   - Change `JWT_SECRET` for production
   - Optional: set `SUPER_ADMIN_EMAIL` (defaults to `jd@orboro.net`)
   - Optional: set `BILLING_WEBHOOK_SECRET` to validate billing webhook calls

4. **Database setup** (already done):
```bash
npm run setup:db
```

### Running the Application

**Option 1: Run frontend and backend separately**

Terminal 1 (Backend):
```bash
npm run server
```

Terminal 2 (Frontend):
```bash
npm run dev
```

**Option 2: Run both together**
```bash
npm run dev:all
```

The application will be available at:
- **Frontend (this PC)**: http://localhost:3000
- **Frontend (LAN)**: http://<PC-NAME>:3000 or http://<LAN-IP>:3000
- **Backend API (LAN)**: http://<PC-NAME>:5000/api or http://<LAN-IP>:5000/api

### LAN Access Notes

- Dev servers bind to `0.0.0.0` so other devices on your network can connect.
- Frontend API calls default to relative `/api` (proxied by Vite to `http://127.0.0.1:5000` in dev).
- Optional: set `VITE_API_URL` in `.env` (for example `http://Ark-Prime:5000/api`) to bypass the proxy.

## Usage

1. **Create an Account**: Click "Sign Up" and register with username, email, and password
2. **Login**: Enter your credentials to access your bookmarks
3. **Add Bookmarks**: Click "+ Add Bookmark" to save a new link with title, URL, tags, and description
4. **Manage Tags**: Add comma-separated tags to organize your bookmarks
5. **Delete Bookmarks**: Click the × button on any bookmark card to remove it

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (requires auth)

### Admin (Super Admin only)
- `GET /api/auth/admin/users` - List all user accounts with bookmark counts
- `PATCH /api/auth/admin/users/:id` - Update a user's `membershipTier` (`free`/`paid`) and role (`user`/`super_admin`)

### Billing (Placeholders for future provider integration)
- `POST /api/billing/webhook` - Webhook receiver that upgrades/downgrades membership based on event type
- `POST /api/billing/checkout-session` - Placeholder for provider checkout session creation (returns 501)
- `POST /api/billing/portal-session` - Placeholder for provider billing portal creation (returns 501)

### Bookmarks
- `GET /api/bookmarks` - Get all user's bookmarks
- `GET /api/bookmarks/:id` - Get single bookmark
- `POST /api/bookmarks` - Create new bookmark
- `PUT /api/bookmarks/:id` - Update bookmark
- `DELETE /api/bookmarks/:id` - Delete bookmark
- `GET /api/bookmarks/tags/all` - Get all user's tags with counts

## Project Structure

```
tagstash/
├── public/              # Static assets
├── server/              # Backend code
│   ├── db.js           # Database connection
│   ├── server.js       # Express server
│   ├── schema.sql      # Database schema
│   ├── setup.js        # Database setup script
│   ├── middleware/     # Auth middleware
│   └── routes/         # API routes
│       ├── auth.js     # Authentication endpoints
│       └── bookmarks.js # Bookmark endpoints
├── src/                # Frontend code
│   ├── api/            # API client
│   ├── components/     # React components
│   ├── context/        # React context (auth)
│   ├── App.jsx         # Main app component
│   └── main.jsx        # Entry point
├── .env                # Environment variables (DO NOT COMMIT)
├── package.json        # Dependencies and scripts
└── vite.config.js      # Vite configuration
```

## Available Scripts

- `npm run dev` - Start frontend development server
- `npm run server` - Start backend server with auto-reload
- `npm run dev:all` - Run both frontend and backend concurrently
- `npm run setup:db` - Initialize database schema
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Database Schema

- **users** - User accounts (id, username, email, password_hash, membership_tier, role)
- **bookmarks** - Saved bookmarks (id, user_id, title, url, description)
- **tags** - Tag names (id, name)
- **bookmark_tags** - Many-to-many relationship between bookmarks and tags

## Security Notes

- Passwords are hashed using bcryptjs before storage
- JWT tokens expire after 7 days
- All bookmark endpoints require authentication
- CORS is enabled for local development

## Roadmap

### Upcoming Features
- [ ] Search and filter bookmarks by title, URL, or tags
- [ ] Tag management UI (rename, merge, delete unused tags)
- [ ] Export bookmarks (JSON, CSV, HTML)
- [ ] Import bookmarks from browsers
- [ ] Bookmark collections/folders
- [ ] Shared bookmarks between users
- [ ] Browser extension
- [ ] Bookmark thumbnail previews
- [ ] Keyboard shortcuts

## Contributing

This is a personal project, but suggestions and feedback are welcome!

## License

This project is licensed under the **Tagstash Non-Commercial License (TNCL) v1.0**. See the [LICENSE](./LICENSE) file for details.

The software may be used for personal and educational purposes only. Commercial use requires explicit written permission. For commercial licensing inquiries, contact: jd@orboro.net

## Author

Created with ❤️ for better bookmark management
