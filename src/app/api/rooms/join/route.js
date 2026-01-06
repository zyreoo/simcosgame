import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { roomId, playerName } = body;

    if (!roomId) {
      return NextResponse.json(
        { error: 'Room ID is required' },
        { status: 400 }
      );
    }

    const playerId = Math.random().toString(36).substring(2, 15);

    return NextResponse.json({
      roomId: roomId.toUpperCase(),
      playerId,
      playerName: playerName || `Player ${playerId.slice(0, 6)}`
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to join room' },
      { status: 500 }
    );
  }
}


