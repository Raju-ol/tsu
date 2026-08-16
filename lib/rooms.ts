import { isValidRoomCodeFormat } from "./sanitize";

export interface Room {
  code: string;
  name?: string;
  createdAt: number;
  expiresAt: number;
}

// Persist the in-memory rooms store globally across all environments (dev & prod)
const globalForRooms = globalThis as unknown as {
  roomsMap: Map<string, Room> | undefined;
};

export const roomsMap = globalForRooms.roomsMap ?? new Map<string, Room>();
globalForRooms.roomsMap = roomsMap;

// Generate a random 6-character uppercase alphanumeric code
function generateCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Creates a new temporary room in memory with an optional room name label.
 * Expiration is set to 60 minutes from creation.
 */
export function createRoom(roomName?: string): Room {
  let code = generateCode();
  // Ensure uniqueness in case of random collision
  while (roomsMap.has(code)) {
    code = generateCode();
  }

  const now = Date.now();
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const cleanName = roomName ? roomName.trim() : undefined;

  const room: Room = {
    code,
    name: cleanName || undefined,
    createdAt: now,
    expiresAt: now + ONE_HOUR_MS,
  };

  roomsMap.set(code, room);
  console.log(`[Rooms Store] Room created: ${code} (${cleanName ? `Name: "${cleanName}"` : "No Name"}) (Total active in memory: ${roomsMap.size})`);
  return room;
}

/**
 * Get room data by code (case-insensitive & validated format).
 */
export function getRoom(code: string): Room | undefined {
  const cleanCode = code ? code.trim().toUpperCase() : "";
  if (!cleanCode || !isValidRoomCodeFormat(cleanCode)) return undefined;
  return roomsMap.get(cleanCode);
}

/**
 * Checks if a room exists and has not expired.
 */
export function isRoomValid(code: string): boolean {
  const cleanCode = code ? code.trim().toUpperCase() : "";
  if (!isValidRoomCodeFormat(cleanCode)) return false;
  const room = getRoom(cleanCode);
  if (!room) return false;
  return Date.now() < room.expiresAt;
}
