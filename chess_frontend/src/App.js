import React, { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import "./App.css";
import ChessBoard from "./components/ChessBoard";
import {
  createPlayer,
  enqueueMatchmaking,
  getTicket,
  getGameWithMoves,
  submitMove,
  getHistory
} from "./api";

// PUBLIC_INTERFACE
function App() {
  const [theme] = useState("light"); // style guide indicates light theme
  const [nickname, setNickname] = useState(localStorage.getItem("nickname") || "");
  const [player, setPlayer] = useState(() => {
    const raw = localStorage.getItem("player");
    return raw ? JSON.parse(raw) : null;
  });

  const [status, setStatus] = useState("idle"); // idle | queueing | playing
  const [error, setError] = useState("");

  const [ticket, setTicket] = useState(null);
  const [game, setGame] = useState(null);
  const [moves, setMoves] = useState([]);

  const [selected, setSelected] = useState(null);
  const [legalTargets, setLegalTargets] = useState([]);

  const [history, setHistory] = useState([]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const chess = useMemo(() => {
    const c = new Chess();
    if (game?.current_fen) {
      try {
        c.load(game.current_fen);
      } catch {
        // ignore, server fen should be valid
      }
    }
    return c;
  }, [game?.current_fen]);

  const myColor = useMemo(() => {
    if (!player || !game) return null;
    if (game.white_player_id === player.id) return "white";
    if (game.black_player_id === player.id) return "black";
    return null;
  }, [player, game]);

  const turn = useMemo(() => (game?.current_fen ? game.current_fen.split(" ")[1] : "w"), [game]);
  const isMyTurn = useMemo(() => {
    if (!myColor) return false;
    return (turn === "w" && myColor === "white") || (turn === "b" && myColor === "black");
  }, [turn, myColor]);

  async function refreshHistory(p) {
    const res = await getHistory(p.id, 10);
    setHistory(res.games);
  }

  async function handleCreatePlayer(e) {
    e.preventDefault();
    setError("");
    const nick = nickname.trim();
    if (nick.length < 2) {
      setError("Nickname must be at least 2 characters.");
      return;
    }
    try {
      const p = await createPlayer(nick);
      setPlayer(p);
      localStorage.setItem("nickname", nick);
      localStorage.setItem("player", JSON.stringify(p));
      await refreshHistory(p);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleFindMatch() {
    if (!player) return;
    setError("");
    setStatus("queueing");
    setTicket(null);
    setGame(null);
    setMoves([]);
    setSelected(null);
    setLegalTargets([]);

    try {
      const t = await enqueueMatchmaking(player.id);
      setTicket(t);
    } catch (err) {
      setError(err.message);
      setStatus("idle");
    }
  }

  useEffect(() => {
    if (!ticket || ticket.status !== "queued") return;
    let cancelled = false;

    async function poll() {
      try {
        const t = await getTicket(ticket.ticket_id);
        if (cancelled) return;
        setTicket(t);
        if (t.status === "matched" && t.game_id) {
          setStatus("playing");
        } else {
          setTimeout(poll, 1200);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err.message);
        setStatus("idle");
      }
    }

    const timer = setTimeout(poll, 800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ticket]);

  useEffect(() => {
    if (status !== "playing" || !ticket?.game_id) return;
    let cancelled = false;

    async function loadGame() {
      try {
        const g = await getGameWithMoves(ticket.game_id);
        if (cancelled) return;
        setGame(g);
        setMoves(g.moves || []);
      } catch (err) {
        if (cancelled) return;
        setError(err.message);
      }
    }

    loadGame();
    const interval = setInterval(loadGame, 1500); // simple polling
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [status, ticket?.game_id]);

  function resetSelection() {
    setSelected(null);
    setLegalTargets([]);
  }

  function squareToCoords(square) {
    return { file: square[0], rank: parseInt(square[1], 10) };
  }

  function buildUci(from, to, promotion = null) {
    return `${from}${to}${promotion || ""}`;
  }

  function computeTargets(fromSquare) {
    const targets = [];
    const ms = chess.moves({ square: fromSquare, verbose: true });
    for (const m of ms) targets.push(m.to);
    return targets;
  }

  async function onSquareClick(square) {
    setError("");
    if (!game || game.status !== "active") return;

    // If not my turn: allow selecting but no submit
    if (!selected) {
      setSelected(square);
      setLegalTargets(computeTargets(square));
      return;
    }

    // Click same square toggles off
    if (selected === square) {
      resetSelection();
      return;
    }

    // Attempt move if square is a target
    if (legalTargets.includes(square) && player) {
      if (!isMyTurn) {
        setError("Not your turn.");
        return;
      }

      // Handle promotion: if a pawn reaches last rank, default to queen
      let promotion = null;
      const from = selected;
      const to = square;
      const piece = chess.get(from);
      if (piece?.type === "p") {
        const { rank } = squareToCoords(to);
        if ((piece.color === "w" && rank === 8) || (piece.color === "b" && rank === 1)) {
          promotion = "q";
        }
      }

      const uci = buildUci(from, to, promotion);
      try {
        await submitMove(game.id, player.id, uci);
        resetSelection();
        // game state will refresh from polling; do an immediate refresh for snappier UX
        const g = await getGameWithMoves(game.id);
        setGame(g);
        setMoves(g.moves || []);
        if (g.status === "finished") {
          await refreshHistory(player);
        }
      } catch (err) {
        setError(err.message);
      }
      return;
    }

    // Otherwise select new origin
    setSelected(square);
    setLegalTargets(computeTargets(square));
  }

  function handleLogout() {
    localStorage.removeItem("nickname");
    localStorage.removeItem("player");
    setPlayer(null);
    setNickname("");
    setStatus("idle");
    setTicket(null);
    setGame(null);
    setMoves([]);
    resetSelection();
    setHistory([]);
  }

  const matchStatusText = useMemo(() => {
    if (!player) return "Create a nickname to start.";
    if (status === "idle") return "Ready to find an opponent.";
    if (status === "queueing") return "Searching for an opponent...";
    if (status === "playing") return game?.status === "finished" ? "Game finished." : "Game in progress.";
    return "";
  }, [player, status, game?.status]);

  return (
    <div className="App">
      <div className="app-shell">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">♟</div>
            <div className="brand-text">
              <div className="brand-title">Online Chess</div>
              <div className="brand-subtitle">Matchmaking • Validation • History</div>
            </div>
          </div>

          <div className="topbar-actions">
            {player ? (
              <>
                <div className="pill">
                  <span className="pill-label">Player</span>
                  <span className="pill-value">{player.nickname}</span>
                </div>
                <button className="btn btn-secondary" type="button" onClick={handleLogout}>
                  Logout
                </button>
              </>
            ) : null}
          </div>
        </header>

        <main className="main">
          <section className="board-card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Board</h2>
                <p className="card-subtitle">
                  {game ? (
                    <>
                      You are <strong>{myColor || "spectator"}</strong> • Turn:{" "}
                      <strong>{turn === "w" ? "white" : "black"}</strong>
                    </>
                  ) : (
                    "Start a match to play."
                  )}
                </p>
              </div>

              {game ? (
                <div className="status-badge">
                  {game.status === "active" ? "ACTIVE" : "FINISHED"}
                </div>
              ) : (
                <div className="status-badge status-muted">NO GAME</div>
              )}
            </div>

            <div className="board-wrap">
              <ChessBoard
                fen={game?.current_fen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"}
                orientation={myColor || "white"}
                selected={selected}
                legalTargets={legalTargets}
                onSquareClick={onSquareClick}
              />
            </div>

            <div className="board-footer">
              <div className="hint">
                {game?.status === "finished" ? (
                  <>
                    Result:{" "}
                    <strong>
                      {game.winner_color ? `${game.winner_color} wins` : "draw"}
                    </strong>
                  </>
                ) : (
                  <>
                    {isMyTurn ? "Your move." : "Waiting for opponent..."}
                  </>
                )}
              </div>
              {error ? <div className="error">{error}</div> : null}
            </div>
          </section>

          <aside className="sidebar">
            <section className="card">
              <div className="card-header">
                <h2 className="card-title">Match</h2>
                <p className="card-subtitle">{matchStatusText}</p>
              </div>

              {!player ? (
                <form className="form" onSubmit={handleCreatePlayer}>
                  <label className="label" htmlFor="nickname">Nickname</label>
                  <input
                    id="nickname"
                    className="input"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="e.g. queenGambit"
                    maxLength={24}
                  />
                  <button className="btn btn-primary btn-block" type="submit">
                    Create / Login
                  </button>
                </form>
              ) : (
                <div className="controls">
                  <button
                    className="btn btn-primary btn-block"
                    type="button"
                    onClick={handleFindMatch}
                    disabled={status === "queueing"}
                  >
                    {status === "queueing" ? "Finding opponent..." : "Find Match"}
                  </button>

                  {ticket ? (
                    <div className="kv">
                      <div className="kv-row">
                        <div className="kv-key">Ticket</div>
                        <div className="kv-val monospace">{ticket.ticket_id}</div>
                      </div>
                      <div className="kv-row">
                        <div className="kv-key">Status</div>
                        <div className="kv-val">{ticket.status}</div>
                      </div>
                      {ticket.game_id ? (
                        <div className="kv-row">
                          <div className="kv-key">Game</div>
                          <div className="kv-val monospace">{ticket.game_id}</div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
            </section>

            <section className="card">
              <div className="card-header">
                <h2 className="card-title">Moves</h2>
                <p className="card-subtitle">Server-validated SAN list</p>
              </div>

              <div className="moves">
                {moves.length === 0 ? (
                  <div className="muted">No moves yet.</div>
                ) : (
                  <ol className="moves-list">
                    {moves.map((m) => (
                      <li key={m.id} className="moves-item">
                        <span className="moves-num">{m.move_number}{m.color === "white" ? "." : "..."}</span>
                        <span className="moves-san">{m.san}</span>
                        <span className="moves-uci monospace">{m.uci}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <h2 className="card-title">Recent games</h2>
                <p className="card-subtitle">Your latest results</p>
              </div>
              <div className="history">
                {!player ? (
                  <div className="muted">Login to see history.</div>
                ) : history.length === 0 ? (
                  <div className="muted">No games yet.</div>
                ) : (
                  <ul className="history-list">
                    {history.map((g) => (
                      <li className="history-item" key={g.id}>
                        <div className="history-main">
                          <div className="history-id monospace">{g.id.slice(0, 8)}</div>
                          <div className={`history-status ${g.status === "finished" ? "done" : "live"}`}>
                            {g.status}
                          </div>
                        </div>
                        <div className="history-sub">
                          <span>You: {g.white_player_id === player.id ? "white" : "black"}</span>
                          <span>
                            Result:{" "}
                            {g.status !== "finished"
                              ? "—"
                              : g.winner_color
                                ? (g.winner_color === (g.white_player_id === player.id ? "white" : "black") ? "win" : "loss")
                                : "draw"}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </aside>
        </main>

        <footer className="footer">
          <span className="muted">Tip: click a piece square, then a highlighted target square to move.</span>
        </footer>
      </div>
    </div>
  );
}

export default App;
