// Sketchy "hand-drawn ink" rendering, RoughJS-style: jittered cubic beziers,
// every stroke drawn twice with different jitter so it reads as overdrawn ink.
// All jitter comes from a seeded rng passed in — sprites are pre-rendered once,
// so lines never boil unless we deliberately cycle wobble variants.
const Sketch = (() => {
  function jitteredSegment(ctx, x1, y1, x2, y2, rng, rough) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const damp = len < 60 ? 1 : len < 200 ? 0.7 : 0.4;
    const o = rough * damp;
    const j = () => (rng() * 2 - 1) * o;
    const d1 = 0.25 + rng() * 0.2, d2 = 0.6 + rng() * 0.2;
    ctx.moveTo(x1 + j(), y1 + j());
    ctx.bezierCurveTo(
      x1 + (x2 - x1) * d1 + j(), y1 + (y2 - y1) * d1 + j(),
      x1 + (x2 - x1) * d2 + j(), y1 + (y2 - y1) * d2 + j(),
      x2 + j(), y2 + j()
    );
  }

  function line(ctx, x1, y1, x2, y2, rng, opt) {
    const rough = (opt && opt.rough) || 1.6;
    const passes = (opt && opt.passes) || 2;
    ctx.beginPath();
    for (let p = 0; p < passes; p++) jitteredSegment(ctx, x1, y1, x2, y2, rng, rough * (p ? 0.6 : 1));
    ctx.stroke();
  }

  // stroke a polyline/polygon with sketchy segments
  function poly(ctx, pts, close, rng, opt) {
    const rough = (opt && opt.rough) || 1.6;
    ctx.beginPath();
    for (let p = 0; p < 2; p++) {
      const r = rough * (p ? 0.6 : 1);
      for (let i = 0; i < pts.length - 1; i++) {
        jitteredSegment(ctx, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], rng, r);
      }
      if (close) {
        jitteredSegment(ctx, pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1], rng, r);
      }
    }
    ctx.stroke();
  }

  // wobbly closed blob through points (fill and/or stroke) — smooth curve, jittered
  function blobPath(ctx, pts, rng, rough) {
    const n = pts.length;
    const q = pts.map(p => [p[0] + (rng() * 2 - 1) * rough, p[1] + (rng() * 2 - 1) * rough]);
    ctx.moveTo((q[0][0] + q[n - 1][0]) / 2, (q[0][1] + q[n - 1][1]) / 2);
    for (let i = 0; i < n; i++) {
      const a = q[i], b = q[(i + 1) % n];
      ctx.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    }
    ctx.closePath();
  }

  function blob(ctx, pts, rng, opt) {
    const rough = (opt && opt.rough) || 1.4;
    if (opt && opt.fill) {
      ctx.fillStyle = opt.fill;
      ctx.beginPath();
      blobPath(ctx, pts, rng, rough * 0.5);
      ctx.fill();
    }
    if (opt && opt.stroke) {
      ctx.strokeStyle = opt.stroke;
      ctx.lineWidth = opt.lineWidth || 2;
      for (let p = 0; p < 2; p++) {
        ctx.beginPath();
        blobPath(ctx, pts, rng, rough * (p ? 1 : 0.6));
        ctx.stroke();
      }
    }
  }

  function ellipsePts(cx, cy, rx, ry, n, rng, irregular) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const w = irregular ? 1 + (rng() * 2 - 1) * irregular : 1;
      pts.push([cx + Math.cos(a) * rx * w, cy + Math.sin(a) * ry * w]);
    }
    return pts;
  }

  function ellipse(ctx, cx, cy, rx, ry, rng, opt) {
    blob(ctx, ellipsePts(cx, cy, rx, ry, 10, rng, 0.06), rng, opt);
  }

  // scalloped cloud shape (tree canopies, bushes): bumps around an ellipse
  function cloudPath(ctx, cx, cy, rx, ry, bumps, rng, rough) {
    const pts = [];
    for (let i = 0; i < bumps; i++) {
      const a = (i / bumps) * Math.PI * 2;
      const w = 1 + (rng() * 2 - 1) * 0.1;
      pts.push([cx + Math.cos(a) * rx * w, cy + Math.sin(a) * ry * w]);
    }
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 0; i < bumps; i++) {
      const a = pts[i], b = pts[(i + 1) % bumps];
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const dx = mx - cx, dy = my - cy;
      const d = Math.hypot(dx, dy) || 1;
      const push = 0.28 + rng() * 0.12;
      const cxp = mx + (dx / d) * rx * push + (rng() * 2 - 1) * rough;
      const cyp = my + (dy / d) * ry * push + (rng() * 2 - 1) * rough;
      ctx.quadraticCurveTo(cxp, cyp, b[0], b[1]);
    }
    ctx.closePath();
  }

  function cloud(ctx, cx, cy, rx, ry, bumps, rng, opt) {
    const rough = (opt && opt.rough) || 2;
    if (opt && opt.fill) {
      ctx.fillStyle = opt.fill;
      ctx.beginPath();
      cloudPath(ctx, cx, cy, rx, ry, bumps, rng, rough * 0.5);
      ctx.fill();
    }
    if (opt && opt.stroke) {
      ctx.strokeStyle = opt.stroke;
      ctx.lineWidth = opt.lineWidth || 2.2;
      for (let p = 0; p < 2; p++) {
        ctx.beginPath();
        cloudPath(ctx, cx, cy, rx, ry, bumps, rng, rough * (p ? 1 : 0.5));
        ctx.stroke();
      }
    }
  }

  // short interior squiggle arcs (leaf clumps inside canopies)
  function squiggle(ctx, x, y, r, rng) {
    ctx.beginPath();
    const a0 = rng() * Math.PI * 2;
    ctx.arc(x, y, r, a0, a0 + Math.PI * (0.5 + rng() * 0.5));
    ctx.stroke();
  }

  return { line, poly, blob, ellipse, ellipsePts, cloud, squiggle };
})();
