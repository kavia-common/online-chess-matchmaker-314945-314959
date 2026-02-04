import React, { useMemo } from "react";

/**
 * Lightweight chessboard renderer based on FEN.
 * Uses Unicode pieces and click-to-move selection.
 */

// PUBLIC_INTERFACE
export default function ChessBoard({ fen, orientation = "white", selected, legalTargets = [], onSquareClick }) {
  /** Render a chessboard from FEN and support square clicks. */
  const board = useMemo(() => {
    const [piecePlacement] = fen.split(" ");
    const ranks = piecePlacement.split("/");
    const squares = [];
    for (let r = 0; r < 8; r += 1) {
      const row = [];
      let file = 0;
      for (const ch of ranks[r]) {
        if (/\d/.test(ch)) {
          const empty = parseInt(ch, 10);
          for (let i = 0; i < empty; i += 1) {
            row.push(null);
            file += 1;
          }
        } else {
          row.push(ch);
          file += 1;
        }
      }
      squares.push(row);
    }
    return squares; // rank 8 to 1
  }, [fen]);

  const files = orientation === "white" ? ["a","b","c","d","e","f","g","h"] : ["h","g","f","e","d","c","b","a"];
  const ranks = orientation === "white" ? [8,7,6,5,4,3,2,1] : [1,2,3,4,5,6,7,8];

  function pieceToUnicode(p) {
    const map = {
      p: "♟", r: "♜", n: "♞", b: "♝", q: "♛", k: "♚",
      P: "♙", R: "♖", N: "♘", B: "♗", Q: "♕", K: "♔"
    };
    return map[p] || "";
  }

  return (
    <div className="chessboard" role="grid" aria-label="Chess board">
      {ranks.map((rank, rIdx) => (
        <div className="chessboard-row" role="row" key={rank}>
          {files.map((file, fIdx) => {
            const square = `${file}${rank}`;
            const boardR = orientation === "white" ? rIdx : 7 - rIdx;
            const boardF = orientation === "white" ? fIdx : 7 - fIdx;

            const piece = board[boardR]?.[boardF] ?? null;
            const isDark = (rIdx + fIdx) % 2 === 1;
            const isSelected = selected === square;
            const isTarget = legalTargets.includes(square);

            return (
              <button
                type="button"
                key={square}
                className={[
                  "square",
                  isDark ? "square-dark" : "square-light",
                  isSelected ? "square-selected" : "",
                  isTarget ? "square-target" : ""
                ].join(" ")}
                onClick={() => onSquareClick(square)}
                role="gridcell"
                aria-label={`Square ${square}${piece ? ` piece ${piece}` : ""}`}
              >
                <span className="piece">{pieceToUnicode(piece)}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
