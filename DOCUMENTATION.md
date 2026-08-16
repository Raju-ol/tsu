# Tsu (formerly Temp Chat) — Full Technical & Product Documentation

## 1. Executive Summary & Vision

**Tsu** is a modern, privacy-first, ephemeral web application designed for disposable, instant group communications. Built with Next.js 16, React 19, Tailwind CSS v4, and Socket.io, Tsu requires **zero user registration, no email, no phone numbers, and no database storage**.

Rooms are created instantly in server memory and **auto-expire 60 minutes after creation**. Once expired or closed, all chat messages, participant identities, and room metadata disappear permanently.

---

## 2. Core Features & Capabilities

### 🏢 Room Management
- **Instant Creation:** Generate a unique, random 6-character uppercase alphanumeric room code (e.g. `MHKIYN`) with a single click.
- **Optional Room Name:** Room creators can set an optional custom Room Name (up to 30 characters, HTML-stripped) such as `"Study Group"` or `"Team Sync"`. If left blank, the app cleanly falls back to displaying the room code alone.
- **Direct Link Sharing:** Join rooms directly via URL `http://localhost:3000/r/[CODE]`.
- **60-Minute Expiration:** Rooms exist strictly in-memory and expire 60 minutes after creation.

### 💬 Real-Time Messaging & Interactions (Socket.io)
- **Instant Delivery:** Real-time bi-directional message broadcasting over Socket.io websockets.
- **Swipe-to-Reply (Mobile/Touch):** Swiping right on any message bubble (~40-60px) triggers an inline reply mode.
- **Quoted Replies:** Inline message quoting with author snippet; clicking a quoted reply smoothly scrolls to and highlights the original message.
- **Emoji Picker:** Integrated `emoji-picker-react` supporting both light and dark mode themes.
- **Rate Limiting Protection:** Limits rapid messaging (max 5 messages per 3 seconds per user) to prevent spam.
- **Character Count Indicator:** Live character counter for messages approaching the 1000-character limit.

### 🎨 Auto-Assigned Initial Avatars
- **Server Auto-Coloring:** When joining a room, the server automatically assigns each user a color from a fixed set of 8 distinct colors (`amber`, `teal`, `indigo`, `emerald`, `rose`, `cyan`, `violet`, `orange`), guaranteeing no two active participants in a room share the same color.
- **Initial-Letter Circles:** Users display their nickname's uppercase initial inside a solid, clean color circle avatar. No face icons or manual pickers required.

### 🗑️ Message Deletion Options
- **Delete for Everyone (Individual):** Users can delete their own messages for all room participants.
- **Delete All My Messages (Bulk):** One-click bulk deletion permanently wipes **all messages sent by the user for everyone** in the room.
- **Clear My View (Local Only):** Removes sent messages from the user's local screen view without affecting other participants.

### 🛡️ Privacy, Moderation & Blocking
- **User Blocking:** Block specific users to hide their messages for the remainder of the session.
- **Participant Filtering & Hiding:** Click any participant in the online list to view only their messages, or toggle visibility for specific users.
- **Report System:** Submit reports for harassment, spam, threats, or illegal content via a dedicated modal dialog (`POST /api/reports`).

---

## 3. Design System & Aesthetics

### 🟢 Single-Hue WhatsApp-Inspired Palette
The entire application operates on a single, disciplined UI accent hue system:
- **Light Mode Accent (`#128C7E`):** Medium teal-green used for primary action buttons, links, typewriter cursor, focus rings, and active badges.
- **Dark Mode Accent (`#25D366`):** High-contrast vibrant green with dark text (`#0B1210`) for primary buttons and accents against dark charcoal backgrounds (`#0F0F11`).
- **Zero Arbitrary Colors:** Orange and amber were completely removed from the UI chrome to maintain a cohesive brand feel.

### ✍️ Typography Scale
- **UI & Body Text:** `Inter` (via `next/font/google`).
- **System Labels, Room Codes & Typewriter Text:** `JetBrains Mono`.
- **Homepage Animation:** One-shot typewriter animation cycling through phrase variations (`"anyone."`, `"strangers."`, `"two people."`, `"5 minutes."`).

---

## 4. Technical Architecture

### 🏗️ Unified Custom Server (`server.ts`)
Tsu uses a custom Node.js server (`server.ts`) that executes Next.js request handling (`app.getRequestHandler()`) and Socket.io (`new Server(httpServer)`) in a **single unified process**:

```
                  ┌─────────────────────────────────────────┐
                  │          Custom Node.js Server          │
                  │               (server.ts)               │
                  └────────────────────┬────────────────────┘
                                       │
                   ┌───────────────────┴───────────────────┐
                   ▼                                       ▼
        ┌─────────────────────┐                 ┌─────────────────────┐
        │  Next.js App Router │                 │  Socket.io Server   │
        │  (HTTP / API Routes)│                 │    (WebSockets)     │
        └──────────┬──────────┘                 └──────────┬──────────┘
                   │                                       │
                   └───────────────────┬───────────────────┘
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │    globalThis.roomsMap (In-Memory)     │
                  └─────────────────────────────────────────┘
```

### 🧠 In-Memory Persistence (`lib/rooms.ts`)
To ensure memory state is preserved across Next.js route compilation and server re-evaluations in **both Development and Production environments**, the `roomsMap` singleton is explicitly attached to `globalThis`:

```ts
const globalForRooms = globalThis as unknown as {
  roomsMap: Map<string, Room> | undefined;
};

export const roomsMap = globalForRooms.roomsMap ?? new Map<string, Room>();
globalForRooms.roomsMap = roomsMap; // Unconditional persistence across all NODE_ENVs
```

---

## 5. API Reference & Socket.io Protocol

### HTTP Endpoints

#### `POST /api/rooms`
Creates a new temporary room.
- **Request Body:** `{ "name": "Study Group" }` (optional)
- **Response (201 Created):** `{ "code": "MHKIYN", "name": "Study Group" }`

#### `GET /api/rooms/[code]`
Validates whether a room exists and is not expired.
- **Response (200 OK):** `{ "valid": true, "code": "MHKIYN", "name": "Study Group", "expiresAt": 1786920010135 }`
- **Response (404 Not Found):** `{ "valid": false, "error": "Room not found or expired" }`

#### `POST /api/reports`
Submits a user or message moderation report.
- **Request Body:** `{ "roomCode": "MHKIYN", "reportedNickname": "Alex", "reason": "Spam", "messageText": "..." }`
- **Response (200 OK):** `{ "success": true }`

---

### Socket.io Events

| Event Name | Direction | Payload | Description |
| :--- | :--- | :--- | :--- |
| `join-room` | Client ➔ Server | `{ roomCode, nickname }` | Emitted when a user enters a room. |
| `identity-assigned` | Server ➔ Client | `{ colorId, avatarId }` | Returns server auto-assigned color. |
| `send-message` | Client ➔ Server | `{ roomCode, message, nickname, replyTo? }` | Sends a new chat message. |
| `new-message` | Server ➔ Client | `MessageItem` | Broadcasts new message to room. |
| `delete-message` | Client ➔ Server | `{ roomCode, messageId }` | Requests deletion of own message. |
| `message-deleted` | Server ➔ Client | `{ messageId }` | Notifies room to mark message deleted. |
| `delete-all-my-messages`| Client ➔ Server | `{ roomCode }` | Requests bulk deletion of all user messages. |
| `bulk-messages-deleted`| Server ➔ Client | `{ deletedIds: string[] }` | Notifies room of bulk message removal. |
| `user-joined` | Server ➔ Client | `{ nickname }` | System message when user joins. |
| `user-left` | Server ➔ Client | `{ nickname }` | System message when user leaves. |
| `room-users` | Server ➔ Client | `{ users: RoomUserData[] }` | Emits active participant list. |

---

## 6. Directory & File Structure

```
tsu/
├── app/
│   ├── api/
│   │   ├── reports/route.ts        # Moderation report submission API
│   │   └── rooms/
│   │       ├── route.ts            # POST /api/rooms (Room Creation)
│   │       └── [code]/route.ts     # GET /api/rooms/[code] (Validation)
│   ├── create/page.tsx             # Create Room page with optional Room Name
│   ├── join/page.tsx               # Join Room page (6-char code input)
│   ├── r/[code]/page.tsx           # Real-time chat room page (Workspace view)
│   ├── globals.css                 # Custom CSS, scrollbar & Tailwind setup
│   ├── layout.tsx                  # Root layout with metadata & fonts
│   └── page.tsx                    # Minimalist homepage with typewriter hero
├── components/
│   └── ThemeToggle.tsx             # Dark/Light theme toggle component
├── lib/
│   ├── avatars.ts                  # Server color assignment & initial helpers
│   ├── rooms.ts                    # In-memory global rooms store
│   ├── sanitize.ts                 # HTML sanitization & input trimmers
│   └── theme.tsx                   # Dark/Light theme provider context
├── public/
│   └── logo.png                    # Official Tsu logo mark
├── server.ts                       # Custom Node HTTP & Socket.io server
├── package.json                    # Dependencies (cross-env, tailwind, tsx, socket.io)
└── DOCUMENTATION.md                # Full system documentation
```

---

## 7. Build, Execution & Deployment Guide

### Local Development Mode
```bash
npm run dev
```
Launches `server.ts` with Next.js development HMR on `http://localhost:3000`.

### Production Build & Test
```bash
npm run build
npm start
```
- `npm run build` compiles Next.js pages and validates TypeScript.
- `npm start` executes `cross-env NODE_ENV=production tsx server.ts`.

### Render / Cloud Deployment Configuration
- **Build Command:** `npm run build`
- **Start Command:** `npm start`
- **Environment Variables:**
  - `NODE_ENV=production`
  - `PORT` (Dynamically assigned by Render, defaults to `3000`)
  - `ALLOWED_ORIGIN` (Production domain URL for Socket.io CORS)
- **Host Binding:** `0.0.0.0` in production mode to allow Render's reverse proxy to route external traffic.
