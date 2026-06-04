"use client";
import { useEffect, useRef } from "react";

// CELL matches globals.css background-size: 80px 80px
const CELL  = 80;
const COLOR = "rgba(140,180,255,";

export default function TronCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let animId;
    let trails    = [];
    let nextSpawn = 0;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    function spawnTrail(now) {
      const cols   = Math.ceil(canvas.width  / CELL) + 1;
      const rows   = Math.ceil(canvas.height / CELL) + 1;
      const horiz  = Math.random() > 0.5;
      const len    = 4 + Math.floor(Math.random() * 5); // 4-8 cells

      let col, row, dc = 0, dr = 0;
      if (horiz) {
        const fromLeft = Math.random() > 0.5;
        col = fromLeft ? 0 : cols;
        row = Math.floor(Math.random() * rows);
        dc  = fromLeft ? 1 : -1;
      } else {
        const fromTop = Math.random() > 0.5;
        col = Math.floor(Math.random() * cols);
        row = fromTop ? 0 : rows;
        dr  = fromTop ? 1 : -1;
      }

      trails.push({
        col, row, dc, dr, len,
        step:     0,
        lastStep: now,
        stepMs:   55 + Math.floor(Math.random() * 45),
        maxAlpha: 0.60 + Math.random() * 0.25,
        cells:    [],
      });
    }

    function draw(now) {
      animId = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (now >= nextSpawn) {
        spawnTrail(now);
        nextSpawn = now + 900 + Math.random() * 900;
      }

      const FADE_IN   = 55;
      const FADE_LIFE = 1100;
      const alive     = [];

      for (const t of trails) {
        // Advance head one cell per stepMs
        if (t.step < t.len && now - t.lastStep >= t.stepMs) {
          t.cells.push({ col: t.col, row: t.row, born: now });
          t.col     += t.dc;
          t.row     += t.dr;
          t.step++;
          t.lastStep = now;
        }

        let anyVisible = false;
        for (const c of t.cells) {
          const age     = now - c.born;
          const fadeIn  = Math.min(1, age / FADE_IN);
          const fadeOut = Math.max(0, 1 - Math.max(0, age - FADE_LIFE * 0.52) / (FADE_LIFE * 0.48));
          const alpha   = fadeIn * fadeOut * t.maxAlpha;
          if (alpha < 0.005) continue;
          anyVisible = true;

          // Endpoints of this grid-line segment
          const x1 = c.col * CELL;
          const y1 = c.row * CELL;
          const x2 = t.dc !== 0 ? (c.col + 1) * CELL : x1;
          const y2 = t.dr !== 0 ? (c.row + 1) * CELL : y1;

          // Wide outer glow
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = COLOR + alpha * 0.5 + ")";
          ctx.lineWidth   = 4;
          ctx.lineCap     = "round";
          ctx.shadowColor = COLOR + Math.min(1, alpha * 6) + ")";
          ctx.shadowBlur  = 22;
          ctx.stroke();
          ctx.restore();

          // Crisp bright core
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = COLOR + alpha + ")";
          ctx.lineWidth   = 1.5;
          ctx.lineCap     = "round";
          ctx.shadowColor = COLOR + Math.min(1, alpha * 4) + ")";
          ctx.shadowBlur  = 8;
          ctx.stroke();
          ctx.restore();
        }

        if (t.step < t.len || anyVisible) alive.push(t);
      }
      trails = alive;
    }

    animId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
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
