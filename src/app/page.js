"use client";

import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import styles from "./page.module.css";

function Die({ value, isRolling }) {
  const dots = [];
  const positions = {
    1: [[2, 2]],
    2: [[1, 1], [3, 3]],
    3: [[1, 1], [2, 2], [3, 3]],
    4: [[1, 1], [1, 3], [3, 1], [3, 3]],
    5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]],
    6: [[1, 1], [1, 2], [1, 3], [3, 1], [3, 2], [3, 3]],
  };

  const dotPositions = positions[value] || [];

  return (
    <div className={`${styles.die} ${isRolling ? styles.rolling : ""}`}>
      <div className={styles.dieFace}>
        {dotPositions.map((pos, index) => (
          <span
            key={index}
            className={styles.dot}
            style={{
              gridRow: pos[0],
              gridColumn: pos[1],
            }}
          />
        ))}
      </div>
    </div>
  );
}

function Resource({ name, value, icon, color, gain = 0 }) {
  return (
    <div className={styles.resource} style={{ borderColor: color }}>
      <div className={styles.resourceIcon} style={{ backgroundColor: color }}>
        {icon}
      </div>
      <div className={styles.resourceInfo}>
        <div className={styles.resourceName}>{name}</div>
        <div className={styles.resourceValue} style={{ color: color }}>
          {value.toLocaleString()}
        </div>
        {gain > 0 && (
          <div className={styles.resourceGain} style={{ color: color }}>
            +{gain}
          </div>
        )}
      </div>
    </div>
  );
}

function PlayerDisplay({ player, isCurrentPlayer, gameState }) {
  const playerState = gameState?.players[player.id] || {};
  
  return (
    <div className={`${styles.playerDisplay} ${isCurrentPlayer ? styles.currentPlayer : ""}`}>
      <div className={styles.playerHeader}>
        <h3>{player.name} {isCurrentPlayer && "(You)"}</h3>
        <div className={styles.pointsDisplay}>
          🏆 {playerState.points || 0} points
        </div>
      </div>
      {isCurrentPlayer && (
        <>
          <div className={styles.playerResources}>
            <Resource 
              name="Wood" 
              value={playerState.wood || 0} 
              icon="🪵" 
              color="#8B4513"
            />
            <Resource 
              name="Stone" 
              value={playerState.stone || 0} 
              icon="🪨" 
              color="#808080"
            />
            <Resource 
              name="Bricks" 
              value={playerState.bricks || 0} 
              icon="🧱" 
              color="#CD5C5C"
            />
          </div>
        </>
      )}
      {!isCurrentPlayer && (
        <div className={styles.hiddenInfo}>
          Resources hidden
        </div>
      )}
    </div>
  );
}

function Building({ building, onPurchase, wood, stone, bricks, isSelected, onSelect }) {
  const canAfford = wood >= building.cost.wood && stone >= building.cost.stone && bricks >= building.cost.bricks;
  
  return (
    <div 
      className={`${styles.shopItem} ${!canAfford ? styles.disabled : ""} ${isSelected ? styles.selectedBuilding : ""}`}
      onClick={() => canAfford && onSelect && onSelect(building)}
    >
      <div className={styles.shopItemHeader}>
        <span className={styles.shopItemIcon}>{building.icon}</span>
        <div className={styles.shopItemInfo}>
          <div className={styles.shopItemName}>{building.name}</div>
          <div className={styles.shopItemDesc}>{building.description}</div>
          <div className={styles.pointsBadge}>🏆 {building.points} points</div>
        </div>
      </div>
      <div className={styles.shopItemCost}>
        {building.cost.wood > 0 && (
          <span className={styles.costBadge} style={{ color: "#8B4513" }}>
            🪵 {building.cost.wood}
          </span>
        )}
        {building.cost.stone > 0 && (
          <span className={styles.costBadge} style={{ color: "#808080" }}>
            🪨 {building.cost.stone}
          </span>
        )}
        {building.cost.bricks > 0 && (
          <span className={styles.costBadge} style={{ color: "#CD5C5C" }}>
            🧱 {building.cost.bricks}
          </span>
        )}
      </div>
      {isSelected && (
        <div className={styles.placementHint}>
          Click on the map to place
        </div>
      )}
    </div>
  );
}

function MapGrid({ mapSize, buildings, onTileClick, onAttackClick, selectedBuilding, currentPlayerId, players, attackMode, myCastles }) {
  const tiles = [];
  
  // Helper to check if two tiles are neighbors
  const areNeighbors = (x1, y1, x2, y2) => {
    const dx = Math.abs(x1 - x2);
    const dy = Math.abs(y1 - y2);
    return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
  };
  
  for (let y = 0; y < mapSize; y++) {
    for (let x = 0; x < mapSize; x++) {
      const building = buildings.find(b => b.x === x && b.y === y);
      const player = building ? players.find(p => p.id === building.playerId) : null;
      const isCurrentPlayer = player && player.id === currentPlayerId;
      const isEnemyBuilding = building && !isCurrentPlayer;
      
      // Check if this enemy building is adjacent to any of my castles
      let isAttackable = false;
      if (attackMode && isEnemyBuilding && building.buildingId === 'castle') {
        isAttackable = myCastles.some(castle => 
          areNeighbors(castle.x, castle.y, x, y)
        );
      }
      
      tiles.push(
        <div
          key={`${x}-${y}`}
          className={`${styles.mapTile} ${building ? styles.hasBuilding : ""} ${selectedBuilding ? styles.canPlace : ""} ${isAttackable ? styles.attackable : ""}`}
          onClick={() => {
            if (attackMode && isAttackable && onAttackClick) {
              onAttackClick(x, y, building);
            } else if (!attackMode && onTileClick) {
              onTileClick(x, y);
            }
          }}
          title={
            attackMode && isAttackable
              ? `⚔️ Attack ${building.name} (${player?.name || 'Unknown'})`
              : attackMode && isEnemyBuilding && !isAttackable
              ? `Too far! Must be adjacent to your castle`
              : building 
              ? `${building.name} (${player?.name || 'Unknown'})` 
              : `Place at (${x}, ${y})`
          }
        >
          {building && (
            <div className={`${styles.mapBuilding} ${isCurrentPlayer ? styles.myBuilding : styles.opponentBuilding} ${building.buildingId === 'road' ? styles.roadBuilding : ''}`}>
              <span className={styles.buildingIcon}>{building.icon}</span>
            </div>
          )}
          {selectedBuilding && !building && !attackMode && (
            <div className={styles.placementPreview}>
              {selectedBuilding.icon}
            </div>
          )}
          {isAttackable && (
            <div className={styles.attackIndicator}>⚔️</div>
          )}
        </div>
      );
    }
  }
  
  return (
    <div className={styles.mapGrid}>
      {tiles}
    </div>
  );
}

export default function Home() {
  const [screen, setScreen] = useState("lobby"); // lobby, game
  const [roomId, setRoomId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [inputRoomId, setInputRoomId] = useState("");
  const [inputPlayerName, setInputPlayerName] = useState("");
  const [players, setPlayers] = useState([]);
  const [gameState, setGameState] = useState({ players: {}, activePlayerId: null });
  const [bonusMessage, setBonusMessage] = useState("");
  const [showBuildings, setShowBuildings] = useState(false);
  const [lastGains, setLastGains] = useState({ wood: 0, stone: 0, bricks: 0 });
  const [winner, setWinner] = useState(null);
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [mapBuildings, setMapBuildings] = useState([]);
  const [brightness, setBrightness] = useState(100);
  const [volume, setVolume] = useState(50);
  const [showSettings, setShowSettings] = useState(false);
  const [attackMode, setAttackMode] = useState(false);
  const [attackResult, setAttackResult] = useState(null);
  const [battleRolling, setBattleRolling] = useState(false);
  const [battleData, setBattleData] = useState(null);
  
  const socketRef = useRef(null);
  const WIN_POINTS = 200;
  const MAP_SIZE = 10;

  const buildings = [
    {
      id: "castle",
      name: "Castle",
      description: "Build your first castle anywhere",
      icon: "🏰",
      cost: { wood: 200, stone: 150, bricks: 100 },
      points: 30
    },
    {
      id: "road",
      name: "Road",
      description: "Requires a castle first",
      icon: "🛣️",
      cost: { wood: 50, stone: 30, bricks: 20 },
      points: 0
    }
  ];

  // Initialize Socket.io connection
  useEffect(() => {
    if (screen === "game" && roomId && playerId) {
      const socketUrl = typeof window !== 'undefined' 
        ? window.location.origin 
        : "http://localhost:3000";
      
      const socket = io(socketUrl, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5
      });

      socketRef.current = socket;

      socket.on("connect", () => {
        socket.emit("join-room", { roomId, playerId, playerName });
      });

      socket.on("reconnect", () => {
        socket.emit("join-room", { roomId, playerId, playerName });
      });

      socket.on("room-updated", ({ players, gameState }) => {
        setPlayers(players);
        setGameState(gameState);
        if (gameState.mapBuildings) {
          setMapBuildings(gameState.mapBuildings);
        }
      });

      socket.on("dice-rolled", ({ playerId: rolledPlayerId, gameState }) => {
        setGameState(gameState);
        setLastGains({ wood: 0, stone: 0, bricks: 0 });
        setTimeout(() => {
          setLastGains({ wood: 0, stone: 0, bricks: 0 });
        }, 2000);
      });

      socket.on("building-purchased", ({ playerId: purchasedPlayerId, gameState, points, buildingId, x, y }) => {
        setGameState(gameState);
        if (purchasedPlayerId === playerId) {
          if (buildingId === 'road') {
            setBonusMessage(`✅ Road built!`);
          } else {
            setBonusMessage(`✅ Castle constructed! +${points} points`);
          }
          setTimeout(() => setBonusMessage(""), 2000);
          setSelectedBuilding(null);
        }
      });

      socket.on("building-error", ({ message }) => {
        setBonusMessage(`❌ ${message}`);
        setTimeout(() => setBonusMessage(""), 3000);
      });

      socket.on("attack-error", ({ message }) => {
        setBonusMessage(`❌ ${message}`);
        setTimeout(() => setBonusMessage(""), 3000);
      });

      socket.on("map-updated", ({ buildings }) => {
        setMapBuildings(buildings);
      });

      socket.on("battle-started", ({ attackerId, defenderId, buildingId, x, y }) => {
        setBattleRolling(true);
        setBattleData({ attackerId, defenderId, buildingId, x, y });
        setAttackMode(false);
      });

      socket.on("attack-result", ({ attackerId, defenderId, attackerRolls, defenderRolls, attackerTotal, defenderTotal, attackerMax, defenderMax, winner, buildingDestroyed, pointsGained }) => {
        setBattleRolling(false);
        setAttackResult({
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
        setTimeout(() => {
          setAttackResult(null);
          setBattleData(null);
        }, 5000);
      });

      socket.on("player-won", ({ playerId: winnerId, playerName }) => {
        setWinner({ id: winnerId, name: playerName });
        if (winnerId === playerId) {
          setBonusMessage("🎉 You won! 🎉");
        } else {
          setBonusMessage(`🎉 ${playerName} won the game! 🎉`);
        }
      });

      socket.on("rolling-updated", ({ playerId: rollingPlayerId, isRolling, gameState }) => {
        setGameState(gameState);
      });

      return () => {
        socket.emit("leave-room", { roomId });
        socket.disconnect();
      };
    }
  }, [screen, roomId, playerId, playerName]);

  const createRoom = async () => {
    try {
      const requestBody = { playerName: inputPlayerName || undefined };
      
      const response = await fetch("/api/rooms/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });
      
      const data = await response.json();
      
      if (!data.error) {
        setRoomId(data.roomId);
        setPlayerId(data.playerId);
        setPlayerName(data.playerName);
        setScreen("game");
      }
    } catch {
      // swallow network errors in UI
    }
  };

  const joinRoom = async () => {
    if (!inputRoomId.trim()) {
      return;
    }
    
    try {
      const requestBody = { 
        roomId: inputRoomId.toUpperCase(),
        playerName: inputPlayerName || undefined 
      };
      const response = await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });
      const data = await response.json();
      
      if (!data.error) {
        setRoomId(data.roomId);
        setPlayerId(data.playerId);
        setPlayerName(data.playerName);
        setScreen("game");
      } else {
        alert(`Failed to join room: ${data.error}`);
      }
    } catch {
      alert("Failed to join room. Please check the room ID.");
    }
  };

  const rollDice = () => {
    const playerState = gameState.players[playerId];
    const isMyTurn = !gameState.activePlayerId || gameState.activePlayerId === playerId;

    if (!playerState) {
      return;
    }

    if (!isMyTurn) {
      setBonusMessage("Wait for your turn!");
      setTimeout(() => setBonusMessage(""), 1500);
      return;
    }

    if (playerState.isRolling) return;

    if (socketRef.current) {
      socketRef.current.emit("set-rolling", { roomId, playerId, isRolling: true });
      
      // Simulate rolling animation
      const rollInterval = setInterval(() => {
        socketRef.current.emit("set-rolling", { roomId, playerId, isRolling: true });
      }, 100);

      setTimeout(() => {
        clearInterval(rollInterval);
        socketRef.current.emit("roll-dice", { roomId, playerId });
      }, 1000);
    }
  };

  const selectBuilding = (building) => {
    setSelectedBuilding(building);
  };

  const placeBuilding = (x, y) => {
    if (!selectedBuilding || !socketRef.current) return;
    
    // Check if tile is already occupied
    if (mapBuildings.some(b => b.x === x && b.y === y)) {
      setBonusMessage("This tile is already occupied!");
      setTimeout(() => setBonusMessage(""), 1500);
      return;
    }

    // Check if player has castles (for roads) or if it's a subsequent castle
    const myCastles = mapBuildings.filter(b => b.playerId === playerId && b.buildingId === 'castle');
    const hasCastles = myCastles.length > 0;

    if (selectedBuilding.id === 'castle') {
      // First castle can be anywhere, subsequent ones need road connection
      socketRef.current.emit("purchase-building", { 
        roomId, 
        playerId, 
        buildingId: selectedBuilding.id,
        x,
        y,
        checkRoadConnection: hasCastles
      });
    } else if (selectedBuilding.id === 'road') {
      // Roads always need connection check
      socketRef.current.emit("purchase-building", { 
        roomId, 
        playerId, 
        buildingId: selectedBuilding.id,
        x,
        y,
        checkRoadConnection: true
      });
    }
  };

  const initiateAttack = (x, y, building) => {
    if (!socketRef.current || !isMyTurn || players.length < 3) return;
    
    const defender = players.find(p => p.id === building.playerId);
    if (!defender) return;

    socketRef.current.emit("initiate-attack", {
      roomId,
      attackerId: playerId,
      defenderId: building.playerId,
      buildingId: building.id,
      x,
      y
    });
  };

  const currentPlayerState = gameState.players[playerId] || {};
  const isMyTurn = !gameState.activePlayerId || gameState.activePlayerId === playerId;
  const activePlayer = players.find((p) => p.id === gameState.activePlayerId);
  const activePlayerState = activePlayer ? (gameState.players[activePlayer.id] || {}) : {};
  
  // Disable attack mode if not your turn
  useEffect(() => {
    if (!isMyTurn && attackMode) {
      setAttackMode(false);
    }
  }, [isMyTurn, attackMode]);

  if (screen === "lobby") {
  return (
      <div className={styles.page} style={{ filter: `brightness(${brightness}%)`, backgroundColor: '#0a0a1a', overflow: 'hidden' }}>
        <div className={styles.starsBackground}></div>
      <main className={styles.main}>
          <button 
            className={styles.settingsButton}
            onClick={() => setShowSettings(!showSettings)}
            title="Settings"
          >
            ⚙️
          </button>

          {showSettings && (
            <div className={styles.settingsPanel}>
              <h3>Settings</h3>
              <div className={styles.settingItem}>
                <label>Brightness: {brightness}%</label>
                <input
                  type="range"
                  min="50"
                  max="150"
                  value={brightness}
                  onChange={(e) => setBrightness(Number(e.target.value))}
                  className={styles.slider}
                />
              </div>
              <div className={styles.settingItem}>
                <label>Volume: {volume}%</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className={styles.slider}
                />
              </div>
              <button 
                className={styles.closeSettingsButton}
                onClick={() => setShowSettings(false)}
              >
                Close
              </button>
            </div>
          )}

          <div className={styles.lobbyContainer}>
            <h1 className={styles.lobbyTitle}>
              <span className={styles.titleWord}>Kingdom</span>
              <span className={styles.titleWord}>Builders</span>
            </h1>
            <p className={styles.lobbySubtitle}>🎲 Build • 🏰 Expand • ⚔️ Conquer</p>
            
            <div className={styles.lobbySection}>
              <h2 className={styles.sectionTitle}>
                <span className={styles.emoji}>✨</span> Create Room
              </h2>
              <input
                type="text"
                placeholder="What should we call you? 👤"
                value={inputPlayerName}
                onChange={(e) => setInputPlayerName(e.target.value)}
                className={styles.lobbyInput}
              />
              <button onClick={createRoom} className={styles.lobbyButton}>
                🚀 Let's Go!
              </button>
            </div>

            <div className={styles.lobbyDivider}>
              <span className={styles.dividerLine}></span>
              <span className={styles.dividerText}>or</span>
              <span className={styles.dividerLine}></span>
            </div>

            <div className={styles.lobbySection}>
              <h2 className={styles.sectionTitle}>
                <span className={styles.emoji}>🔗</span> Join Room
              </h2>
              <input
                type="text"
                placeholder="What should we call you? 👤"
                value={inputPlayerName}
                onChange={(e) => setInputPlayerName(e.target.value)}
                className={styles.lobbyInput}
              />
              <input
                type="text"
                placeholder="Enter room code 🎫"
                value={inputRoomId}
                onChange={(e) => setInputRoomId(e.target.value.toUpperCase())}
                className={styles.lobbyInput}
                maxLength={6}
              />
              <button onClick={joinRoom} className={styles.lobbyButton}>
                🎮 Join Game
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.gamePage} style={{ backgroundColor: '#0a0a1a', overflow: 'hidden' }}>
      <div className={styles.starsBackground}></div>
      
      {/* Top Bar */}
      <div className={styles.topBar}>
        <div className={styles.gameHeader}>
          <h1 className={styles.gameTitle}>Kingdom Builders</h1>
          <div className={styles.roomInfo}>
            <div 
              className={styles.roomId}
              onClick={() => {
                navigator.clipboard.writeText(roomId);
                setBonusMessage("✅ Room ID copied!");
                setTimeout(() => setBonusMessage(""), 2000);
              }}
              title="Click to copy"
            >
              🎫 {roomId}
            </div>
            <div className={styles.playerCount}>👥 {players.length}/4</div>
          </div>
        </div>

        {players.length < 3 && (
          <div className={styles.waitingMessage}>
            ⏳ Waiting for more players... ({players.length}/3 minimum)
          </div>
        )}

        {activePlayer && players.length >= 3 && (
          <div className={`${styles.turnIndicator} ${activePlayer.id === playerId ? styles.yourTurn : styles.otherTurn}`}>
            {activePlayer.id === playerId 
              ? <>✨ Your turn to roll! ✨</>
              : <>⏳ Waiting for {activePlayer.name}'s turn...</>}
          </div>
        )}
      </div>

      {/* Main Game Area */}
      <main className={styles.gameMain}>
        <div className={styles.gameGrid}>
          
          {/* Left Sidebar - Players */}
          <div className={styles.sidebar}>
            <div className={styles.sidebarSection}>
              <h3 className={styles.sidebarTitle}>👥 Players</h3>
              <div className={styles.playersList}>
                {players.map((player) => (
                  <PlayerDisplay
                    key={player.id}
                    player={player}
                    isCurrentPlayer={player.id === playerId}
                    gameState={gameState}
                  />
                ))}
              </div>
            </div>

            {bonusMessage && (
              <div className={styles.bonusMessage}>
                {bonusMessage}
              </div>
            )}

            {currentPlayerState.freeRolls > 0 && (
              <div className={styles.freeRollsBadge}>
                🎲 Free Rolls: {currentPlayerState.freeRolls}
              </div>
            )}
          </div>

          {/* Center - Dice & Actions */}
          <div className={styles.gameCenter}>
            <div className={styles.diceSection}>
              {activePlayer && (
                <>
                  <div className={styles.activePlayerLabel}>
                    {activePlayer.id === playerId ? "Your Dice" : `${activePlayer.name}'s Dice`}
                  </div>
                  <div className={styles.diceWrapper}>
                    <Die value={activePlayerState.die1 || 1} isRolling={activePlayerState.isRolling || false} />
                    <Die value={activePlayerState.die2 || 1} isRolling={activePlayerState.isRolling || false} />
                  </div>
                  
                  {!activePlayerState.isRolling && activePlayerState.die1 && activePlayerState.die2 && (
                    <div className={styles.sum}>
                      <span className={styles.sumLabel}>Total:</span>
                      <span className={styles.sumValue}>{(activePlayerState.die1 || 0) + (activePlayerState.die2 || 0)}</span>
                    </div>
                  )}
                </>
              )}

              <button
                className={styles.rollButton}
                onClick={rollDice}
                disabled={activePlayerState.isRolling || !socketRef.current || !isMyTurn || !!winner || players.length < 3}
              >
                {winner
                  ? "🏆 Game Over"
                  : players.length < 3
                  ? "⏳ Waiting for players..."
                  : activePlayerState.isRolling
                  ? "🎲 Rolling..."
                  : isMyTurn
                  ? "🎲 Roll Dice!"
                  : "⏸️ Wait for your turn"}
              </button>

              <div className={styles.resourceRules}>
                <div className={styles.ruleItem}>
                  <span className={styles.ruleDie}>🎲 Die 1</span>
                  <span className={styles.ruleArrow}>→</span>
                  <span className={styles.ruleResource} style={{ color: "#8B4513" }}>🪵 Wood</span>
                  <span className={styles.ruleMultiplier}>×{10 * (activePlayerState.woodMultiplier || 1)}</span>
                </div>
                <div className={styles.ruleItem}>
                  <span className={styles.ruleDie}>🎲 Die 2</span>
                  <span className={styles.ruleArrow}>→</span>
                  <span className={styles.ruleResource} style={{ color: "#808080" }}>🪨 Stone</span>
                  <span className={styles.ruleMultiplier}>×{5 * (activePlayerState.stoneMultiplier || 1)}</span>
                </div>
                <div className={styles.ruleItem}>
                  <span className={styles.ruleDie}>➕ Sum</span>
                  <span className={styles.ruleArrow}>→</span>
                  <span className={styles.ruleResource} style={{ color: "#CD5C5C" }}>🧱 Bricks</span>
                  <span className={styles.ruleMultiplier}>×{2 * (activePlayerState.bricksMultiplier || 1)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side - Map & Buildings */}
          <div className={styles.gameRight}>
            {winner && (
              <div className={styles.winnerBanner}>
                <h2>🎉 {winner.id === playerId ? "You Won!" : `${winner.name} Won!`} 🎉</h2>
                <p>First to reach {WIN_POINTS} points wins!</p>
              </div>
            )}

            <div className={styles.mapActions}>
              <button
                className={styles.buildButton}
                onClick={() => {
                  setShowBuildings(!showBuildings);
                  setAttackMode(false);
                  setSelectedBuilding(null);
                }}
                disabled={!!winner || players.length < 3 || !isMyTurn}
              >
                {showBuildings ? "🙈 Hide Buildings" : "🏗️ Build Kingdom"}
              </button>
              <button
                className={`${styles.attackButton} ${attackMode ? styles.attackModeActive : ""}`}
                onClick={() => {
                  setAttackMode(!attackMode);
                  setShowBuildings(false);
                  setSelectedBuilding(null);
                }}
                disabled={!!winner || players.length < 3 || !isMyTurn}
              >
                {attackMode ? "❌ Cancel Attack" : "⚔️ Attack"}
              </button>
            </div>

            {attackMode && (
              <div className={styles.attackModeHint}>
                ⚔️ Click on an enemy castle adjacent to your castle to attack! (You roll 3 dice, defender rolls 2)
              </div>
            )}

            {attackResult && (
              <div className={styles.attackResult}>
                <h3>⚔️ Battle Result</h3>
                <div className={styles.attackRolls}>
                  <div className={styles.attackRollSection}>
                    <div className={styles.rollLabel}>Attacker (3 dice)</div>
                    <div className={styles.rollValues}>
                      {attackResult.attackerRolls?.map((roll, i) => (
                        <span key={i} className={styles.rollDie}>{roll}</span>
                      ))}
                    </div>
                    <div className={styles.rollTotal}>
                      Sum: {attackResult.attackerTotal} | Max: {attackResult.attackerMax}
                    </div>
                  </div>
                  <div className={styles.attackRollSection}>
                    <div className={styles.rollLabel}>Defender (2 dice)</div>
                    <div className={styles.rollValues}>
                      {attackResult.defenderRolls?.map((roll, i) => (
                        <span key={i} className={styles.rollDie}>{roll}</span>
                      ))}
                    </div>
                    <div className={styles.rollTotal}>
                      Sum: {attackResult.defenderTotal} | Max: {attackResult.defenderMax}
                    </div>
                  </div>
                </div>
                <div className={styles.attackWinner}>
                  {attackResult.winner === playerId 
                    ? "🎉 You Won! " + (attackResult.buildingDestroyed ? `Building destroyed! +${attackResult.pointsGained} points` : "")
                    : attackResult.winner 
                    ? "💔 You Lost! Building defended."
                    : "🤝 Draw!"}
                </div>
              </div>
            )}

            <div className={styles.mapSection}>
              <h2 className={styles.mapTitle}>🗺️ Kingdom Map</h2>
              <MapGrid
                mapSize={MAP_SIZE}
                buildings={mapBuildings}
                onTileClick={placeBuilding}
                onAttackClick={initiateAttack}
                selectedBuilding={selectedBuilding}
                currentPlayerId={playerId}
                players={players}
                attackMode={attackMode}
                myCastles={mapBuildings.filter(b => b.playerId === playerId && b.buildingId === 'castle')}
              />
            </div>

            {showBuildings && !winner && (
              <div className={styles.buildingsPanel}>
                <h3 className={styles.buildingsTitle}>🏗️ Build Your Kingdom</h3>
                <p className={styles.placementHint}>
                  {selectedBuilding 
                    ? selectedBuilding.id === 'castle'
                      ? mapBuildings.filter(b => b.playerId === playerId && b.buildingId === 'castle').length > 0
                        ? `Selected: ${selectedBuilding.name} - Must be adjacent to a road (castles cannot be directly next to each other)`
                        : `Selected: ${selectedBuilding.name} - Build your first castle anywhere!`
                      : `Selected: ${selectedBuilding.name} - Must be adjacent to a castle or road`
                    : "Select a building, then click on the map to place it"}
                </p>
                <div className={styles.buildingsGrid}>
                  {buildings.map(building => (
                    <Building
                      key={building.id}
                      building={building}
                      onSelect={selectBuilding}
                      isSelected={selectedBuilding?.id === building.id}
                      wood={currentPlayerState.wood || 0}
                      stone={currentPlayerState.stone || 0}
                      bricks={currentPlayerState.bricks || 0}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

