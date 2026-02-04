/**
 * Minimal API client for the chess backend.
 */

const API_BASE = process.env.REACT_APP_API_BASE || process.env.REACT_APP_BACKEND_URL || "http://localhost:3001";

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    const message = (data && data.detail) ? data.detail : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

// PUBLIC_INTERFACE
export async function createPlayer(nickname) {
  /** Create or fetch a player by nickname. */
  return apiFetch("/players", { method: "POST", body: JSON.stringify({ nickname }) });
}

// PUBLIC_INTERFACE
export async function enqueueMatchmaking(playerId) {
  /** Enqueue player for matchmaking and get a ticket. */
  return apiFetch("/matchmaking/enqueue", { method: "POST", body: JSON.stringify({ player_id: playerId }) });
}

// PUBLIC_INTERFACE
export async function getTicket(ticketId) {
  /** Poll matchmaking ticket status. */
  return apiFetch(`/matchmaking/tickets/${ticketId}`);
}

// PUBLIC_INTERFACE
export async function getGame(gameId) {
  /** Fetch game state. */
  return apiFetch(`/games/${gameId}`);
}

// PUBLIC_INTERFACE
export async function getGameWithMoves(gameId) {
  /** Fetch game state + moves list. */
  return apiFetch(`/games/${gameId}/with-moves`);
}

// PUBLIC_INTERFACE
export async function submitMove(gameId, playerId, uci) {
  /** Submit a move for validation and persistence. */
  return apiFetch(`/games/${gameId}/moves`, { method: "POST", body: JSON.stringify({ player_id: playerId, uci }) });
}

// PUBLIC_INTERFACE
export async function getHistory(playerId, limit = 20) {
  /** Fetch recent games for player. */
  return apiFetch(`/players/${playerId}/history?limit=${encodeURIComponent(limit)}`);
}
