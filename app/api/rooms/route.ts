import { NextResponse } from "next/server";
import { createRoom } from "@/lib/rooms";
import { sanitizeRoomName } from "@/lib/sanitize";

export async function POST(req: Request) {
  try {
    let bodyName: string | undefined = undefined;
    try {
      const body = await req.json();
      bodyName = body?.name;
    } catch {
      // Body may be empty if no payload sent
    }

    const cleanName = sanitizeRoomName(bodyName);
    const room = createRoom(cleanName);

    return NextResponse.json(
      { code: room.code, name: room.name },
      { status: 201 }
    );
  } catch (error) {
    console.error("[API Error /api/rooms]:", error);
    return NextResponse.json(
      { error: "Failed to create room" },
      { status: 500 }
    );
  }
}
