"use client";
import { useEffect, useRef } from "react";

const CELL = 34;
const TRAIL_COLOR  = "rgba(120,160,255,";
const CURSOR_COLOR = "rgba(100,180,255,";

export default function TronCanvas() {
  const canvasRef = useRef(null);
  const mouseRef  = useRef({ x: -9999, y: -9999 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let animId;
    let trails      = [];
    let nextSpawn   = 0;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const onMove = (e) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("mousemove", onMove, { passive: true });

    function spawnTrail(now) {
      const cols = Math.ceil(canvas.width  / CELL) + 2;
      const rows = Math.ceil(canvas.height / CELL) + 2;
      const horiz = Math.random() > 0.5;
      const len   = 4 + Math.floor(Math.random() * 7);

      let col, row, dc = 0, dr = 0;
      if (horiz) {
        const fromLeft = Math.random() > 0.5;
        col = fromLeft ? -1 : cols;
        row = Math.floor(Math.random() * rows);
        dc  = fromLeft ? 1 : -1;
      } else {
        const fromTop = Math.random() > 0.5;
        col = Math.floor(Math.random() * cols);
        row = fromTop ? -1 : rows;
        dr  = fromTop ? 1 : -1;
      }

      trails.push({
        col, row, dc, dr,
        len,
        step:        0,
        lastStep:    now,
        stepMs:      45 + Math.floor(Math.random() * 35),
        maxAlpha:    0.32 + Math.random() * 0.18,
        cells:       [],
      });
    }

    function draw(now) {
      animId = requestAnimationFrame(draw);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // ── Cursor glow ─────────────────────────────────────────────────────────
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const cx = Math.floor(mx / CELL);
      const cy = Math.floor(my / CELL);
      if (mx > 0) {
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 2.4) continue;
            const alpha = (1 - dist / 2.4) * 0.10;
            const px = (cx + dx) * CELL;
            const py = (cy + dy) * CELL;
            ctx.save();
            ctx.shadowColor = CURSOR_COLOR + (alpha * 3) + ")";
            ctx.shadowBlur  = 14;
            ctx.fillStyle   = CURSOR_COLOR + alpha + ")";
            ctx.fillRect(px, py, CELL, CELL);
            ctx.restore();
          }
        }
      }

      // ── Spawn ────────────────────────────────────────────────────────────────
      if (now >= nextSpawn) {
        spawnTrail(now);
        nextSpawn = now + 800 + Math.random() * 1200;
      }

      // ── Update & draw trails ────────────────────────────────────────────────
      const FADE_IN  = 80;
      const FADE_OUT = 500;
      const alive    = [];

      for (const t of trails) {
        // Advance head
        if (t.step < t.len && now - t.lastStep >= t.stepMs) {
          t.cells.push({ col: t.col, row: t.row, born: now });
          t.col      += t.dc;
          t.row      += t.dr;
          t.step++;
          t.lastStep  = now;
        }

        // Draw cells
        let anyVisible = false;
        for (const c of t.cells) {
          const age      = now - c.born;
          const fadeIn   = Math.min(1, age / FADE_IN);
          const fadeOut  = Math.max(0, 1 - Math.max(0, age - FADE_OUT * 0.4) / (FADE_OUT * 0.6));
          const alpha    = fadeIn * fadeOut * t.maxAlpha;
          if (alpha < 0.004) continue;
          anyVisible = true;

          ctx.save();
          ctx.shadowColor = TRAIL_COLOR + (alpha * 2.5) + ")";
          ctx.shadowBlur  = 10;
          ctx.fillStyle   = TRAIL_COLOR + alpha + ")";
          ctx.fillRect(c.col * CELL, c.row * CELL, CELL, CELL);
          ctx.restore();
        }

        // Keep trail if still advancing or any cell still visible
        if (t.step < t.len || anyVisible) alive.push(t);
      }
      trails = alive;
    }

    animId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        top: 0, left: 0,
        width: "100%", height: "100%",
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}
