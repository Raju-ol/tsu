import { NextResponse } from "next/server";
import { isValidRoomCodeFormat } from "@/lib/sanitize";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { roomCode, reportedNickname, reason, messageText, timestamp } = body;

    if (!roomCode || !isValidRoomCodeFormat(roomCode)) {
      return NextResponse.json(
        { error: "Invalid room code" },
        { status: 400 }
      );
    }

    if (!reportedNickname || !reason) {
      return NextResponse.json(
        { error: "Reported nickname and reason are required" },
        { status: 400 }
      );
    }

    // Log the report details to the server console
    console.log("========================================");
    console.log("[USER REPORT SUBMITTED]");
    console.log(`Room Code         : ${roomCode.toUpperCase()}`);
    console.log(`Reported Nickname : ${reportedNickname}`);
    console.log(`Reason            : ${reason}`);
    console.log(`Message Content   : ${messageText ? `"${messageText}"` : "(No specific message)"}`);
    console.log(`Timestamp         : ${timestamp || new Date().toISOString()}`);
    console.log("========================================");

    return NextResponse.json(
      { success: true, message: "Report submitted successfully" },
      { status: 201 }
    );
  } catch (error) {
    console.error("[API Error /api/reports]:", error);
    return NextResponse.json(
      { error: "Failed to process report" },
      { status: 500 }
    );
  }
}
