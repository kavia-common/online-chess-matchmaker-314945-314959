import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "./App";

// Mock the API layer used by App.
jest.mock("./api", () => ({
  createPlayer: jest.fn(),
  enqueueMatchmaking: jest.fn(),
  getTicket: jest.fn(),
  getGameWithMoves: jest.fn(),
  submitMove: jest.fn(),
  getHistory: jest.fn()
}));

const api = require("./api");

function startingFen(turn = "w") {
  return `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR ${turn} KQkq - 0 1`;
}

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

test("nickname validation: too short shows error and does not call API", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/Nickname/i), "a");
  await user.click(screen.getByRole("button", { name: /Create \/ Login/i }));

  expect(await screen.findByText(/Nickname must be at least 2 characters/i)).toBeInTheDocument();
  expect(api.createPlayer).not.toHaveBeenCalled();
});

test("create/login stores player and loads history", async () => {
  const user = userEvent.setup();

  api.createPlayer.mockResolvedValue({
    id: "p1",
    nickname: "alpha",
    created_at: "2026-01-01T00:00:00Z"
  });
  api.getHistory.mockResolvedValue({ games: [] });

  render(<App />);

  await user.clear(screen.getByLabelText(/Nickname/i));
  await user.type(screen.getByLabelText(/Nickname/i), "alpha");
  await user.click(screen.getByRole("button", { name: /Create \/ Login/i }));

  await waitFor(() => expect(api.createPlayer).toHaveBeenCalledWith("alpha"));
  await waitFor(() => expect(api.getHistory).toHaveBeenCalledWith("p1", 10));

  // UI should show player pill and logout
  expect(await screen.findByText("alpha")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Logout/i })).toBeInTheDocument();

  // Local storage should be updated
  expect(localStorage.getItem("nickname")).toBe("alpha");
  expect(JSON.parse(localStorage.getItem("player"))).toMatchObject({ id: "p1", nickname: "alpha" });
});

test("find match: enqueue -> matched ticket -> game loads and status shows ACTIVE", async () => {
  const user = userEvent.setup();

  // create/login mocks
  api.createPlayer.mockResolvedValue({
    id: "p1",
    nickname: "alpha",
    created_at: "2026-01-01T00:00:00Z"
  });
  api.getHistory.mockResolvedValue({ games: [] });

  // matchmaking mocks
  api.enqueueMatchmaking.mockResolvedValue({
    ticket_id: "t1",
    status: "queued",
    game_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  });

  api.getTicket.mockResolvedValue({
    ticket_id: "t1",
    status: "matched",
    game_id: "g1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:01Z"
  });

  api.getGameWithMoves.mockResolvedValue({
    id: "g1",
    white_player_id: "p1",
    black_player_id: "p2",
    status: "active",
    winner_color: null,
    current_fen: startingFen("w"),
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:01Z",
    ended_at: null,
    moves: []
  });

  jest.useFakeTimers();

  render(<App />);

  // Login
  await user.type(screen.getByLabelText(/Nickname/i), "alpha");
  await user.click(screen.getByRole("button", { name: /Create \/ Login/i }));
  expect(await screen.findByText("alpha")).toBeInTheDocument();

  // Find match
  await user.click(screen.getByRole("button", { name: /Find Match/i }));
  await waitFor(() => expect(api.enqueueMatchmaking).toHaveBeenCalledWith("p1"));

  // Polling uses timers: advance past initial 800ms and then allow promises to resolve.
  await waitFor(() => {
    jest.advanceTimersByTime(900);
  });

  await waitFor(() => expect(api.getTicket).toHaveBeenCalledWith("t1"));

  // After matched, game should load
  await waitFor(() => expect(api.getGameWithMoves).toHaveBeenCalledWith("g1"));

  // UI should show active game badge
  expect(await screen.findByText(/ACTIVE/i)).toBeInTheDocument();

  jest.useRealTimers();
});
