import { NextResponse } from "next/server";
import { isRoomValid, getRoom } from "@/lib/rooms";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const cleanCode = code ? code.trim().toUpperCase() : "";

    if (!cleanCode || !isRoomValid(cleanCode)) {
      return NextResponse.json(
        { valid: false, error: "Room not found or expired" },
        { status: 404 }
      );
    }

    const room = getRoom(cleanCode);
    return NextResponse.json({
      valid: true,
      code: room?.code,
      name: room?.name,
      expiresAt: room?.expiresAt,
    });
  } catch (error) {
    console.error("[API Error /api/rooms/[code]]:", error);
    return NextResponse.json(
      { valid: false, error: "Failed to validate room" },
      { status: 500 }
    );
  }
}
