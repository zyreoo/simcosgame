const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = process.env.PORT || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Store rooms in memory (in production, use Redis or a database)
const rooms = new Map();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    const parsedUrl = parse(req.url, true);
    await handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true
    },
    path: '/socket.io/',
    transports: ['websocket', 'polling']
  });

  io.on('connection', (socket) => {
    // client connected

    // Join room
    socket.on('join-room', ({ roomId, playerId, playerName }) => {
      if (!roomId || !playerId) {
        return;
      }

      socket.join(roomId);
      
      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          id: roomId,
          players: [],
          gameState: {
            players: {},
            activePlayerId: null,
            winner: null,
            mapBuildings: []
          }
        });
      }

      const room = rooms.get(roomId);
      
      // Color palette for players
      const playerColors = [
        { primary: '#4A90E2', secondary: '#2E5C8A', name: 'Blue' },
        { primary: '#E24A4A', secondary: '#8A2E2E', name: 'Red' },
        { primary: '#4AE24A', secondary: '#2E8A2E', name: 'Green' },
        { primary: '#E2E24A', secondary: '#8A8A2E', name: 'Yellow' }
      ];
      
      // Check if player already exists
      const existingPlayerIndex = room.players.findIndex(p => p.id === playerId);
      let playerColor = null;
      
      if (existingPlayerIndex >= 0) {
        // Player exists, keep their color
        playerColor = room.players[existingPlayerIndex].color;
      } else {
        // New player, assign color based on position
        const colorIndex = room.players.length % playerColors.length;
        playerColor = playerColors[colorIndex];
      }
      
      const player = {
        id: playerId,
        name: playerName || `Player ${playerId.slice(0, 6)}`,
        socketId: socket.id,
        color: playerColor || playerColors[0]
      };

      if (existingPlayerIndex >= 0) {
        room.players[existingPlayerIndex] = player;
      } else {
        room.players.push(player);
      }

      // Initialize player game state if not exists
      if (!room.gameState.players[playerId]) {
        room.gameState.players[playerId] = {
          die1: 1,
          die2: 1,
          isRolling: false,
          wood: 1000,
          stone: 1000,
          bricks: 1000,
          woodMultiplier: 1,
          stoneMultiplier: 1,
          bricksMultiplier: 1,
          freeRolls: 0,
          minRoll: 1,
          points: 0,
          hasAttacked: false
        };
      }

      // If no active player yet, set this player as the first to play
      if (!room.gameState.activePlayerId) {
        room.gameState.activePlayerId = playerId;
      }

      // Notify all players in room
      io.to(roomId).emit('room-updated', {
        players: room.players,
        gameState: room.gameState
      });

      // Send initial map state
      io.to(roomId).emit('map-updated', {
        buildings: room.gameState.mapBuildings || []
      });

    });

    // Handle dice roll
    socket.on('roll-dice', ({ roomId, playerId }) => {
      const room = rooms.get(roomId);
      if (!room || !room.gameState.players[playerId]) return;
      if (room.gameState.winner) return; // Game already ended

      // Enforce turn order
      if (room.gameState.activePlayerId && room.gameState.activePlayerId !== playerId) {
        return;
      }

      const playerState = room.gameState.players[playerId];
      
      // Generate dice values
      let die1 = Math.floor(Math.random() * 6) + 1;
      let die2 = Math.floor(Math.random() * 6) + 1;

      // Apply minimum roll
      if (playerState.minRoll > 1) {
        die1 = Math.max(die1, playerState.minRoll);
        die2 = Math.max(die2, playerState.minRoll);
      }

      // Calculate gains
      let woodGain = die1 * 10 * playerState.woodMultiplier;
      let stoneGain = die2 * 5 * playerState.stoneMultiplier;
      let bricksGain = (die1 + die2) * 2 * playerState.bricksMultiplier;
      let bonusMultiplier = 1;

      // Special combinations
      if (die1 === die2) {
        bonusMultiplier = die1 === 6 ? 3 : 2;
      } else if (die1 + die2 >= 10) {
        bonusMultiplier = 1.5;
      } else if (die1 + die2 <= 4) {
        bonusMultiplier = 0.8;
      }

      woodGain = Math.floor(woodGain * bonusMultiplier);
      stoneGain = Math.floor(stoneGain * bonusMultiplier);
      bricksGain = Math.floor(bricksGain * bonusMultiplier);

      // Update player state
      playerState.die1 = die1;
      playerState.die2 = die2;
      playerState.isRolling = false;
      playerState.wood += woodGain;
      playerState.stone = Math.min(playerState.stone + stoneGain, 100);
      playerState.bricks = Math.min(playerState.bricks + bricksGain, 100);

      // Use free roll if available
      if (playerState.freeRolls > 0) {
        playerState.freeRolls--;
      }

      // Advance turn to next player in room
      const playersInRoom = room.players;
      if (playersInRoom && playersInRoom.length > 0) {
        const currentIndex = playersInRoom.findIndex((p) => p.id === playerId);
        const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % playersInRoom.length : 0;
        const nextPlayerId = playersInRoom[nextIndex].id;
        room.gameState.activePlayerId = nextPlayerId;
      }

      // Broadcast to all players in room
      io.to(roomId).emit('dice-rolled', {
        playerId,
        gameState: room.gameState
      });
    });

    // Helper function to check if two tiles are neighbors
    const areNeighbors = (x1, y1, x2, y2) => {
      const dx = Math.abs(x1 - x2);
      const dy = Math.abs(y1 - y2);
      return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
    };

    // Helper function to check road/castle connectivity
    const hasRoadConnection = (playerId, targetX, targetY, mapBuildings) => {
      const playerCastles = mapBuildings.filter(b => b.playerId === playerId && b.buildingId === 'castle');
      const playerRoads = mapBuildings.filter(b => b.playerId === playerId && b.buildingId === 'road');
      
      // Check if target is adjacent to any road or castle
      const allPlayerBuildings = [...playerCastles, ...playerRoads];
      return allPlayerBuildings.some(b => areNeighbors(b.x, b.y, targetX, targetY));
    };

    // Handle building purchase
    socket.on('purchase-building', ({ roomId, playerId, buildingId, x, y, checkRoadConnection }) => {
      const room = rooms.get(roomId);
      if (!room || !room.gameState.players[playerId]) return;
      if (room.gameState.winner) return; // Game already ended

      // Validate coordinates
      if (x === undefined || y === undefined || x < 0 || y < 0 || x >= 10 || y >= 10) {
        return;
      }

      // Check if tile is already occupied
      if (room.gameState.mapBuildings.some(b => b.x === x && b.y === y)) {
        return;
      }

      const playerState = room.gameState.players[playerId];
      
      // Buildings configuration (same as frontend)
      const buildings = {
        castle: { cost: { wood: 200, stone: 150, bricks: 100 }, points: 30, icon: '🏰', name: 'Castle' },
        road: { cost: { wood: 50, stone: 30, bricks: 20 }, points: 0, icon: '🛣️', name: 'Road' }
      };

      const building = buildings[buildingId];
      if (!building) return;

      // For roads, check if player has at least one castle
      if (buildingId === 'road') {
        const playerCastles = room.gameState.mapBuildings.filter(
          b => b.playerId === playerId && b.buildingId === 'castle'
        );
        if (playerCastles.length === 0) {
          io.to(socket.id).emit('building-error', {
            message: 'You need to build a castle first before building roads!'
          });
          return;
        }
        
        // Roads must be adjacent to a castle or another road
        if (!hasRoadConnection(playerId, x, y, room.gameState.mapBuildings)) {
          io.to(socket.id).emit('building-error', {
            message: 'Road must be adjacent to a castle or another road!'
          });
          return;
        }
      }
      
      // Castles can be built anywhere (no requirement for first one)
      // Subsequent castles must be adjacent to roads (not directly to other castles)
      if (buildingId === 'castle') {
        const playerCastles = room.gameState.mapBuildings.filter(
          b => b.playerId === playerId && b.buildingId === 'castle'
        );
        
        // Check if trying to build directly adjacent to another castle (not allowed)
        const isAdjacentToCastle = playerCastles.some(castle => 
          areNeighbors(castle.x, castle.y, x, y)
        );
        
        if (isAdjacentToCastle) {
          io.to(socket.id).emit('building-error', {
            message: 'Castles cannot be directly adjacent! Build a road between them first.'
          });
          return;
        }
        
        // If player already has castles, new ones must be adjacent to roads
        if (playerCastles.length > 0 && checkRoadConnection) {
          const playerRoads = room.gameState.mapBuildings.filter(
            b => b.playerId === playerId && b.buildingId === 'road'
          );
          // Check if adjacent to a road
          const isAdjacentToRoad = playerRoads.some(road => 
            areNeighbors(road.x, road.y, x, y)
          );
          
          if (!isAdjacentToRoad) {
            io.to(socket.id).emit('building-error', {
              message: 'Castle must be adjacent to a road! Castles cannot be directly next to each other.'
            });
            return;
          }
        }
      }

      // Check if can afford
      if (playerState.wood >= building.cost.wood &&
          playerState.stone >= building.cost.stone &&
          playerState.bricks >= building.cost.bricks) {
        
        // Deduct costs
        playerState.wood -= building.cost.wood;
        playerState.stone = Math.max(0, playerState.stone - building.cost.stone);
        playerState.bricks = Math.max(0, playerState.bricks - building.cost.bricks);

        // Add points
        playerState.points = (playerState.points || 0) + building.points;

        // Add building to map
        room.gameState.mapBuildings.push({
          id: `${playerId}-${Date.now()}`,
          playerId,
          buildingId,
          x,
          y,
          icon: building.icon,
          name: building.name
        });

        // Check win condition (200 points)
        const WIN_POINTS = 200;
        if (playerState.points >= WIN_POINTS && !room.gameState.winner) {
          room.gameState.winner = playerId;
          const winnerPlayer = room.players.find(p => p.id === playerId);
          
          // Broadcast win
          io.to(roomId).emit('player-won', {
            playerId,
            playerName: winnerPlayer?.name || 'Unknown'
          });
        }

        // Broadcast updates
        io.to(roomId).emit('building-purchased', {
          playerId,
          buildingId,
          points: building.points,
          x,
          y,
          gameState: room.gameState
        });

        io.to(roomId).emit('map-updated', {
          buildings: room.gameState.mapBuildings
        });
      }
    });

    // Handle attack
    socket.on('initiate-attack', ({ roomId, attackerId, defenderId, buildingId, x, y }) => {
      const room = rooms.get(roomId);
      if (!room || !room.gameState.players[attackerId] || !room.gameState.players[defenderId]) return;
      if (room.gameState.winner) return;
      if (room.gameState.activePlayerId !== attackerId) return; // Must be attacker's turn

      const attackerState = room.gameState.players[attackerId];
      
      // Check if player has already attacked this turn
      if (attackerState.hasAttacked) {
        io.to(socket.id).emit('attack-error', {
          message: 'You can only attack once per turn!'
        });
        return;
      }

      // Find the building
      const buildingIndex = room.gameState.mapBuildings.findIndex(b => b.id === buildingId && b.x === x && b.y === y);
      if (buildingIndex === -1) return;
      const building = room.gameState.mapBuildings[buildingIndex];
      
      // Verify it's an enemy building and a castle
      if (building.playerId === attackerId) return;
      if (building.buildingId !== 'castle') return; // Can only attack castles

      // Check if attacker has a castle adjacent to the target
      const attackerCastles = room.gameState.mapBuildings.filter(
        b => b.playerId === attackerId && b.buildingId === 'castle'
      );
      
      const isAdjacent = attackerCastles.some(castle => 
        areNeighbors(castle.x, castle.y, x, y)
      );
      
      if (!isAdjacent) {
        io.to(socket.id).emit('attack-error', {
          message: 'You can only attack castles adjacent to your own castle!'
        });
        return;
      }

      // Mark that attacker has used their attack
      attackerState.hasAttacked = true;

      // Broadcast battle start with rolling animation
      io.to(roomId).emit('battle-started', {
        attackerId,
        defenderId,
        buildingId,
        x,
        y
      });

      // Simulate dice rolling animation (wait 2 seconds)
      setTimeout(() => {
        // Roll dice: Attacker 3 dice, Defender 2 dice
        const attackerRolls = [
          Math.floor(Math.random() * 6) + 1,
          Math.floor(Math.random() * 6) + 1,
          Math.floor(Math.random() * 6) + 1
        ];
        const defenderRolls = [
          Math.floor(Math.random() * 6) + 1,
          Math.floor(Math.random() * 6) + 1
        ];

      // Calculate totals and max
      const attackerTotal = attackerRolls.reduce((a, b) => a + b, 0);
      const defenderTotal = defenderRolls.reduce((a, b) => a + b, 0);
      const attackerMax = Math.max(...attackerRolls);
      const defenderMax = Math.max(...defenderRolls);

      // Determine winner: Compare sum first, then max if tied
      let winner = null;
      if (attackerTotal > defenderTotal) {
        winner = attackerId;
      } else if (defenderTotal > attackerTotal) {
        winner = defenderId;
      } else {
        // Tie - use max die
        if (attackerMax > defenderMax) {
          winner = attackerId;
        } else if (defenderMax > attackerMax) {
          winner = defenderId;
        }
        // If still tied, defender wins (defense advantage)
        if (!winner) {
          winner = defenderId;
        }
      }

      let buildingDestroyed = false;
      let pointsGained = 0;

      if (winner === attackerId) {
        // Attacker wins - destroy building and gain points
        const buildingConfig = {
          castle: { points: 30 }
        };
        
        const buildingData = buildingConfig[building.buildingId] || { points: 30 };
        pointsGained = buildingData.points;
        
        // Remove building from map
        room.gameState.mapBuildings.splice(buildingIndex, 1);
        
        // Deduct points from defender
        const defenderState = room.gameState.players[defenderId];
        defenderState.points = Math.max(0, (defenderState.points || 0) - pointsGained);
        
        // Add points to attacker
        const attackerState = room.gameState.players[attackerId];
        attackerState.points = (attackerState.points || 0) + pointsGained;
        
        buildingDestroyed = true;

        // Check win condition
        const WIN_POINTS = 200;
        if (attackerState.points >= WIN_POINTS && !room.gameState.winner) {
          room.gameState.winner = attackerId;
          const winnerPlayer = room.players.find(p => p.id === attackerId);
          io.to(roomId).emit('player-won', {
            playerId: attackerId,
            playerName: winnerPlayer?.name || 'Unknown'
          });
        }
      }

      // Broadcast attack result
      io.to(roomId).emit('attack-result', {
        attackerId,
        defenderId,
        attackerRolls,
        defenderRolls,
        attackerTotal,
        defenderTotal,
        attackerMax,
        defenderMax,
        winner,
        buildingDestroyed,
        pointsGained
      });

      // Update map if building destroyed
      if (buildingDestroyed) {
        io.to(roomId).emit('map-updated', {
          buildings: room.gameState.mapBuildings
        });
      }

      // Broadcast game state update
      io.to(roomId).emit('room-updated', {
        players: room.players,
        gameState: room.gameState
      });
      }, 2000); // 2 second delay for rolling animation
    });

    // Handle rolling state
    socket.on('set-rolling', ({ roomId, playerId, isRolling }) => {
      const room = rooms.get(roomId);
      if (!room || !room.gameState.players[playerId]) return;

      room.gameState.players[playerId].isRolling = isRolling;
      io.to(roomId).emit('rolling-updated', {
        playerId,
        isRolling,
        gameState: room.gameState
      });
    });

    // Leave room
    socket.on('leave-room', ({ roomId }) => {
      socket.leave(roomId);
    });

    // Disconnect
    socket.on('disconnect', () => {});

    socket.on('error', () => {});
  });

  httpServer
    .listen(port, () => {
      // server ready
    });
});

