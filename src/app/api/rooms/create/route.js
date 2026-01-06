import { NextResponse } from 'next/server';

// Generate a random room ID
function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { playerName } = body;

    const roomId = generateRoomId();
    const playerId = Math.random().toString(36).substring(2, 15);

    return NextResponse.json({
      roomId,
      playerId,
      playerName: playerName || `Player ${playerId.slice(0, 6)}`
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create room' },
      { status: 500 }
    );
  }
}


