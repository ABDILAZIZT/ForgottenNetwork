import { Camera } from './Camera';

/**
 * Atmosphere — floor796-inspired living background.
 * Features:
 *  - Deep-space gradient base
 *  - Multi-layer parallax stars with twinkle
 *  - Drifting cosmic nebula clouds
 *  - World-space floating particles
 *  - Occasional glitch scanline pulses
 *  - Smooth vignette
 */

interface Star {
  sx: number; // normalised 0–1 screen-seed
  sy: number;
  size: number;
  brightness: number;
  twinklePhase: number;
  twinkleSpeed: number;
  parallax: number;
  color: string; // warm / cool / white
}

interface Particle {
  wx: number;
  wy: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  hue: number;
  phase: number;
}

interface GlitchPulse {
  y: number; // screen y start
  h: number; // height in px
  alpha: number;
  life: number; // 0→1
  hue: number;
}

export class Atmosphere {
  private stars: Star[] = [];
  private particles: Particle[] = [];
  private glitches: GlitchPulse[] = [];

  private readonly NUM_STARS = 260;
  private readonly NUM_PARTICLES = 55;

  private glitchTimer = 0;
  private glitchInterval = 6 + Math.random() * 8; // seconds between glitch bursts

  constructor() {
    this.buildStars();
    this.buildParticles();
  }

  // ─── Construction ────────────────────────────────────────────────────────

  private buildStars() {
    const colors = ['rgba(200,220,255,', 'rgba(255,220,180,', 'rgba(180,230,255,'];
    for (let i = 0; i < this.NUM_STARS; i++) {
      const layer = Math.random() < 0.55 ? 0 : Math.random() < 0.7 ? 1 : 2;
      this.stars.push({
        sx: Math.random(),
        sy: Math.random(),
        size: layer === 0 ? 1 : layer === 1 ? 1.4 : 2,
        brightness: 0.08 + Math.random() * 0.55,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.25 + Math.random() * 1.4,
        parallax: [0.008, 0.022, 0.048][layer],
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  private buildParticles() {
    for (let i = 0; i < this.NUM_PARTICLES; i++) {
      this.particles.push({
        wx: (Math.random() - 0.5) * 5000,
        wy: (Math.random() - 0.5) * 5000,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        size: 0.8 + Math.random() * 3.2,
        alpha: 0.04 + Math.random() * 0.22,
        hue: Math.random() < 0.5 ? 168 + Math.random() * 20 : 265 + Math.random() * 25,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  // ─── Update ──────────────────────────────────────────────────────────────

  update(dt: number) {
    // Drift particles
    const BOUNDS = 3000;
    for (const p of this.particles) {
      p.wx += p.vx * dt * 60;
      p.wy += p.vy * dt * 60;
      p.phase += dt * 0.45;
      if (p.wx > BOUNDS) p.wx -= BOUNDS * 2;
      if (p.wx < -BOUNDS) p.wx += BOUNDS * 2;
      if (p.wy > BOUNDS) p.wy -= BOUNDS * 2;
      if (p.wy < -BOUNDS) p.wy += BOUNDS * 2;
    }

    // Age glitch pulses
    for (const g of this.glitches) {
      g.life += dt * 3;
    }
    this.glitches = this.glitches.filter((g) => g.life < 1);

    // Spawn new glitch bursts
    this.glitchTimer += dt;
    if (this.glitchTimer >= this.glitchInterval) {
      this.glitchTimer = 0;
      this.glitchInterval = 6 + Math.random() * 10;
      const count = 1 + Math.floor(Math.random() * 4);
      for (let i = 0; i < count; i++) {
        this.glitches.push({
          y: Math.random(), // normalised screen Y
          h: 1 + Math.random() * 4, // px height
          alpha: 0.06 + Math.random() * 0.18,
          life: 0,
          hue: Math.random() < 0.6 ? 168 : 280,
        });
      }
    }
  }

  public glitch(intensity = 1) {
    const count = Math.floor((3 + Math.random() * 5) * intensity);
    for (let i = 0; i < count; i++) {
      this.glitches.push({
        y: Math.random(),
        h: 2 + Math.random() * 8,
        alpha: 0.1 + Math.random() * 0.3,
        life: 0,
        hue: Math.random() < 0.5 ? 168 : 280,
      });
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  render(ctx: CanvasRenderingContext2D, camera: Camera, W: number, H: number, t: number) {
    // 1. Deep-space gradient ─────────────────────────────────────────────────
    const bg = ctx.createLinearGradient(0, 0, W * 0.3, H);
    bg.addColorStop(0, '#02050a');
    bg.addColorStop(0.4, '#030810');
    bg.addColorStop(0.7, '#020a08');
    bg.addColorStop(1, '#04060e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 2. Nebula clouds ───────────────────────────────────────────────────────
    this.drawNebulae(ctx, camera, W, H, t);

    // 3. Parallax stars ──────────────────────────────────────────────────────
    for (const star of this.stars) {
      const twinkle = 0.55 + 0.45 * Math.sin(t * star.twinkleSpeed + star.twinklePhase);
      const alpha = star.brightness * twinkle;
      const sx = (star.sx * W - camera.x * star.parallax * W * 0.5 + W * 200) % W;
      const sy = (star.sy * H - camera.y * star.parallax * H * 0.5 + H * 200) % H;
      ctx.fillStyle = `${star.color}${alpha.toFixed(3)})`;
      ctx.fillRect(sx, sy, star.size, star.size);
    }

    // 4. World-space drifting particles ──────────────────────────────────────
    for (const p of this.particles) {
      const s = camera.worldToScreen(p.wx, p.wy, W, H);
      if (s.x < -20 || s.x > W + 20 || s.y < -20 || s.y > H + 20) continue;
      const a = p.alpha * (0.45 + 0.55 * Math.sin(p.phase));
      const sz = p.size * camera.zoom;
      if (sz < 0.3) continue;
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(0.5, sz), 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue},75%,68%,${a.toFixed(3)})`;
      ctx.fill();
    }

    // 5. Glitch scanlines ────────────────────────────────────────────────────
    for (const g of this.glitches) {
      const fade = 1 - g.life;
      const screenY = g.y * H;
      ctx.fillStyle = `hsla(${g.hue},80%,70%,${(g.alpha * fade).toFixed(3)})`;
      ctx.fillRect(0, screenY, W, g.h);
    }

    // 6. Subtle vignette ─────────────────────────────────────────────────────
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.18, W / 2, H / 2, H * 0.9);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.62)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }

  private drawNebulae(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    W: number,
    H: number,
    t: number,
  ) {
    const saved = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'screen';

    const nebulae = [
      { wx: -350, wy: -180, r: 480, hue: 188, amp: 0.045, speed: 0.28 },
      { wx: 420, wy: 260, r: 370, hue: 275, amp: 0.032, speed: 0.19 },
      { wx: -120, wy: 420, r: 320, hue: 156, amp: 0.028, speed: 0.22 },
      { wx: 180, wy: -350, r: 260, hue: 310, amp: 0.022, speed: 0.35 },
    ];

    for (const n of nebulae) {
      const s = camera.worldToScreen(n.wx, n.wy, W, H);
      const screenR = n.r * camera.zoom;
      if (screenR < 1) continue;
      const pulse = 0.55 + 0.45 * Math.sin(t * n.speed + n.hue * 0.02);
      const alpha = n.amp * pulse;

      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, screenR);
      g.addColorStop(0, `hsla(${n.hue},55%,58%,${alpha.toFixed(3)})`);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.globalCompositeOperation = saved;
  }
}
