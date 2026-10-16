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

const nebulae = [
  { wx: -350, wy: -180, r: 480, hue: 188, amp: 0.045, speed: 0.28 },
  { wx: 420, wy: 260, r: 370, hue: 275, amp: 0.032, speed: 0.19 },
  { wx: -120, wy: 420, r: 320, hue: 156, amp: 0.028, speed: 0.22 },
  { wx: 180, wy: -350, r: 260, hue: 310, amp: 0.022, speed: 0.35 },
];
export class Atmosphere {
  private gradients: {
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
    theme: string;
    bg: CanvasGradient;
    vignette: CanvasGradient;
  } | null = null;
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
    if (typeof document !== 'undefined' && document.hidden) return;
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
    for (let i = this.glitches.length - 1; i >= 0; i--)
      if (this.glitches[i].life >= 1) this.glitches.splice(i, 1);

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
    if (document.hidden) return;
    const theme = document.documentElement.dataset.theme || 'dark';
    if (
      !this.gradients ||
      this.gradients.ctx !== ctx ||
      this.gradients.width !== W ||
      this.gradients.height !== H ||
      this.gradients.theme !== theme
    ) {
      const style = getComputedStyle(document.documentElement);
      const bg = ctx.createLinearGradient(0, 0, W * 0.3, H);
      for (const [index, stop] of [0, 0.4, 0.7, 1].entries())
        bg.addColorStop(stop, style.getPropertyValue('--atmosphere-base-' + index).trim());
      const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.18, W / 2, H / 2, H * 0.9);
      vignette.addColorStop(0, 'transparent');
      vignette.addColorStop(1, style.getPropertyValue('--atmosphere-vignette').trim());
      this.gradients = { ctx, width: W, height: H, theme, bg, vignette };
    }
    ctx.fillStyle = this.gradients.bg;
    ctx.fillRect(0, 0, W, H);

    // 2. Nebula clouds ───────────────────────────────────────────────────────
    this.drawNebulae(ctx, camera, W, H, t);

    // 3. Parallax stars ──────────────────────────────────────────────────────
    const alphaBefore = ctx.globalAlpha;
    for (const star of this.stars) {
      const twinkle = 0.55 + 0.45 * Math.sin(t * star.twinkleSpeed + star.twinklePhase);
      const alpha = star.brightness * twinkle;
      const sx = (star.sx * W - camera.x * star.parallax * W * 0.5 + W * 200) % W;
      const sy = (star.sy * H - camera.y * star.parallax * H * 0.5 + H * 200) % H;
      ctx.fillStyle = theme === 'light' ? '#594873' : star.color + '1)';
      ctx.globalAlpha = alphaBefore * alpha;
      ctx.fillRect(sx, sy, star.size, star.size);
    }

    ctx.globalAlpha = alphaBefore;
    // 4. World-space drifting particles ──────────────────────────────────────
    for (const p of this.particles) {
      const sx = (p.wx - camera.x) * camera.zoom + W / 2,
        sy = (p.wy - camera.y) * camera.zoom + H / 2;
      if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;
      const a = p.alpha * (0.45 + 0.55 * Math.sin(p.phase));
      const sz = p.size * camera.zoom;
      if (sz < 0.3) continue;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.5, sz), 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${p.hue},75%,${theme === 'light' ? 30 : 68}%)`;
      ctx.globalAlpha = alphaBefore * Math.max(0, a);
      ctx.fill();
    }

    ctx.globalAlpha = alphaBefore;
    // 5. Glitch scanlines ────────────────────────────────────────────────────
    for (const g of this.glitches) {
      const fade = 1 - g.life;
      const screenY = g.y * H;
      ctx.fillStyle = `hsla(${g.hue},80%,70%,${(g.alpha * fade).toFixed(3)})`;
      ctx.fillRect(0, screenY, W, g.h);
    }

    // 6. Subtle vignette ─────────────────────────────────────────────────────
    ctx.fillStyle = this.gradients.vignette;
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
    ctx.globalCompositeOperation =
      document.documentElement.dataset.theme === 'light' ? 'multiply' : 'screen';

    for (const n of nebulae) {
      const s = camera.worldToScreen(n.wx, n.wy, W, H);
      const screenR = n.r * camera.zoom;
      if (
        screenR < 1 ||
        s.x + screenR < 0 ||
        s.y + screenR < 0 ||
        s.x - screenR > W ||
        s.y - screenR > H
      )
        continue;
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
