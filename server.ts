import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { Server } from "socket.io";
import { isRoomValid } from "./lib/rooms";
import {
  sanitizeNickname,
  sanitizeMessage,
  isValidRoomCodeFormat,
} from "./lib/sanitize";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.NODE_ENV === "production" ? "0.0.0.0" : "localhost";
const port = parseInt(process.env.PORT || "3000", 10);
const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Fixed set of 8 distinct colors for server auto-assignment
const ACCENT_COLOR_IDS = [
  "amber",
  "teal",
  "indigo",
  "emerald",
  "rose",
  "cyan",
  "violet",
  "orange",
];

// In-memory store for active users per room: roomCode -> Array<{ socketId: string, nickname: string, avatarId: number, colorId: string }>
interface RoomUser {
  socketId: string;
  nickname: string;
  avatarId: number;
  colorId: string;
}

const roomUsers = new Map<string, RoomUser[]>();

// In-memory store for message ownership verification: messageId -> socketId
const messageSenders = new Map<string, string>();

// Pending disconnect grace timers: key `${roomCode}:${nickname.toLowerCase()}` -> { timer: NodeJS.Timeout }
const pendingDisconnects = new Map<string, { timer: NodeJS.Timeout }>();

// Rate limiting map: socketId -> Array<timestamp_ms>
const socketMessageTimestamps = new Map<string, number[]>();

function getRoomUsersData(code: string): Array<{ nickname: string; avatarId: number; colorId: string }> {
  const users = roomUsers.get(code) || [];
  return users.map((u) => ({
    nickname: u.nickname,
    avatarId: u.avatarId ?? 0,
    colorId: u.colorId ?? "amber",
  }));
}

// Helper to auto-assign color unused by anyone in the room
function autoAssignColor(existingUsers: RoomUser[]): string {
  const usedColorIds = existingUsers.map((u) => u.colorId);
  const unused = ACCENT_COLOR_IDS.find((id) => !usedColorIds.includes(id));
  if (unused) return unused;
  return ACCENT_COLOR_IDS[existingUsers.length % ACCENT_COLOR_IDS.length];
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigin,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);

    // Join room handler with server auto-assigned color
    socket.on("join-room", ({ roomCode, nickname }) => {
      const code = roomCode ? roomCode.trim().toUpperCase() : "";
      const userNickname = sanitizeNickname(nickname);

      // 1. Server-side validation: format check & room validity check
      if (!isValidRoomCodeFormat(code) || !isRoomValid(code)) {
        console.log(`[Socket.io] Invalid room join attempt: "${code}" from socket ${socket.id}`);
        socket.emit("room-error", { message: "Room not found or expired" });
        return;
      }

      const pendingKey = `${code}:${userNickname.toLowerCase()}`;

      // 2. Check if this is a refreshing user reclaiming their spot within 5-second grace window
      if (pendingDisconnects.has(pendingKey)) {
        console.log(`[Socket.io Refresh Reconnect] User "${userNickname}" reconnected to room "${code}" within grace window.`);
        
        // Cancel the pending disconnect timer
        const pending = pendingDisconnects.get(pendingKey)!;
        clearTimeout(pending.timer);
        pendingDisconnects.delete(pendingKey);

        socket.join(code);

        // Update user's socket ID in roomUsers list
        const existing = roomUsers.get(code) || [];
        const userIdx = existing.findIndex((u) => u.nickname.toLowerCase() === userNickname.toLowerCase());
        let userColorId = "amber";

        if (userIdx !== -1) {
          existing[userIdx].socketId = socket.id;
          userColorId = existing[userIdx].colorId;
        } else {
          userColorId = autoAssignColor(existing);
          existing.push({ socketId: socket.id, nickname: userNickname, avatarId: 0, colorId: userColorId });
        }
        roomUsers.set(code, existing);

        // Send assigned identity back to client
        socket.emit("identity-assigned", { colorId: userColorId, avatarId: 0 });

        // Emit updated user list to room (do NOT broadcast user-joined to prevent chat spam)
        io.to(code).emit("room-users", { users: getRoomUsersData(code) });
        return;
      }

      // 3. Normal Join: Check if nickname is taken by an active member in this room
      const existing = roomUsers.get(code) || [];
      const isDuplicate = existing.some(
        (u) =>
          u.socketId !== socket.id &&
          u.nickname.toLowerCase() === userNickname.toLowerCase()
      );

      if (isDuplicate) {
        console.log(`[Socket.io] Duplicate nickname attempt: "${userNickname}" in room "${code}"`);
        socket.emit("nickname-taken", {
          message: "That name is already in use in this room, please choose another",
        });
        return;
      }

      socket.join(code);

      // Auto-assign unused color from fixed set of 8
      const userColorId = autoAssignColor(existing);

      // Add socket to roomUsers map
      const updated = existing.filter((u) => u.socketId !== socket.id);
      updated.push({
        socketId: socket.id,
        nickname: userNickname,
        avatarId: 0,
        colorId: userColorId,
      });
      roomUsers.set(code, updated);

      // Send assigned identity back to client
      socket.emit("identity-assigned", { colorId: userColorId, avatarId: 0 });

      // Broadcast to others in room
      socket.to(code).emit("user-joined", { nickname: userNickname });

      // Emit full updated user list
      io.to(code).emit("room-users", { users: getRoomUsersData(code) });

      console.log(`[Socket.io] User "${userNickname}" (Auto Color: ${userColorId}) joined room "${code}". Online: ${updated.length}`);
    });

    // Send message handler with Rate Limiting and Server Auto-Assigned Color
    socket.on("send-message", ({ roomCode, message, nickname, replyTo }) => {
      const code = roomCode ? roomCode.trim().toUpperCase() : "";

      // 1. Validate room code
      if (!isValidRoomCodeFormat(code) || !isRoomValid(code)) return;

      // 2. Rate limiting check (max 5 messages per 3 seconds per socket)
      const now = Date.now();
      const userTimestamps = (socketMessageTimestamps.get(socket.id) || []).filter(
        (ts) => now - ts < 3000
      );

      if (userTimestamps.length >= 5) {
        console.log(`[Socket.io Rate Limit] Socket ${socket.id} blocked for rapid messaging.`);
        socket.emit("rate-limit-error", {
          message: "You're sending messages too fast",
        });
        return;
      }

      userTimestamps.push(now);
      socketMessageTimestamps.set(socket.id, userTimestamps);

      // 3. Sanitize inputs
      const senderName = sanitizeNickname(nickname);
      const cleanMessage = sanitizeMessage(message);

      if (!cleanMessage) return;

      // Lookup sender's auto-assigned color from roomUsers store
      const activeUsers = roomUsers.get(code) || [];
      const userRecord = activeUsers.find((u) => u.socketId === socket.id);
      const userColorId = userRecord?.colorId || "amber";

      // Sanitize optional replyTo metadata
      let cleanReplyTo: { id: string; nickname: string; messageSnippet: string } | undefined = undefined;
      if (replyTo && replyTo.id && replyTo.nickname && replyTo.messageSnippet) {
        cleanReplyTo = {
          id: String(replyTo.id),
          nickname: sanitizeNickname(replyTo.nickname),
          messageSnippet: sanitizeMessage(replyTo.messageSnippet)?.slice(0, 80) || "",
        };
      }

      const messageId = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      
      // Store message ownership map
      messageSenders.set(messageId, socket.id);

      const messageData = {
        id: messageId,
        type: "chat",
        nickname: senderName,
        avatarId: 0,
        colorId: userColorId,
        message: cleanMessage,
        replyTo: cleanReplyTo,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      // Broadcast sanitized chat message with auto-assigned accent color
      io.to(code).emit("new-message", messageData);
      console.log(`[Socket.io] [Room ${code}] ${senderName} (${userColorId}): "${cleanMessage}"`);
    });

    // Delete message handler (individual message for everyone)
    socket.on("delete-message", ({ roomCode, messageId }) => {
      const code = roomCode ? roomCode.trim().toUpperCase() : "";

      if (!isValidRoomCodeFormat(code) || !isRoomValid(code) || !messageId) return;

      const originalSenderSocketId = messageSenders.get(messageId);
      
      // Security check: Verify sender socket ID matches original creator
      if (!originalSenderSocketId || originalSenderSocketId !== socket.id) {
        console.log(`[Socket.io Security Block] Unauthorized delete attempt for message "${messageId}" by socket ${socket.id}`);
        socket.emit("room-error", { message: "You can only delete your own messages" });
        return;
      }

      // Broadcast message deletion to everyone in the room
      io.to(code).emit("message-deleted", { messageId });
      console.log(`[Socket.io] [Room ${code}] Message "${messageId}" deleted by sender ${socket.id}`);
    });

    // Bulk Delete All My Messages (for everyone in room)
    socket.on("delete-all-my-messages", ({ roomCode }) => {
      const code = roomCode ? roomCode.trim().toUpperCase() : "";

      if (!isValidRoomCodeFormat(code) || !isRoomValid(code)) return;

      const deletedIds: string[] = [];
      for (const [msgId, senderSocketId] of messageSenders.entries()) {
        if (senderSocketId === socket.id) {
          deletedIds.push(msgId);
        }
      }

      if (deletedIds.length > 0) {
        io.to(code).emit("bulk-messages-deleted", { deletedIds });
        console.log(`[Socket.io] [Room ${code}] Bulk deleted ${deletedIds.length} messages sent by socket ${socket.id}`);
      }
    });

    // Disconnect handler with 5-second grace window
    socket.on("disconnect", () => {
      socketMessageTimestamps.delete(socket.id);

      for (const [code, users] of roomUsers.entries()) {
        const index = users.findIndex((u) => u.socketId === socket.id);
        if (index !== -1) {
          const leftUser = users[index];
          const pendingKey = `${code}:${leftUser.nickname.toLowerCase()}`;

          console.log(`[Socket.io Disconnect] Socket for "${leftUser.nickname}" disconnected. Starting 5s grace window...`);

          // 5-second grace window before emitting user-left
          const timer = setTimeout(() => {
            pendingDisconnects.delete(pendingKey);

            const activeUsers = roomUsers.get(code) || [];
            const idx = activeUsers.findIndex((u) => u.nickname.toLowerCase() === leftUser.nickname.toLowerCase());
            if (idx !== -1) {
              activeUsers.splice(idx, 1);
              if (activeUsers.length === 0) {
                roomUsers.delete(code);
              } else {
                roomUsers.set(code, activeUsers);
                io.to(code).emit("user-left", { nickname: leftUser.nickname });
                io.to(code).emit("room-users", { users: getRoomUsersData(code) });
              }
            }
            console.log(`[Socket.io Grace Expired] User "${leftUser.nickname}" left room "${code}". Online: ${activeUsers.length}`);
          }, 5000);

          pendingDisconnects.set(pendingKey, { timer });
          break;
        }
      }
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`> Tsu custom server ready on http://${hostname}:${port} (Environment: ${process.env.NODE_ENV || "development"})`);
  });
});
