/**
 * Photographic Composition Guides Engine for KuroLight
 *
 * Implements standard and advanced classical composition overlays:
 * - Rule of Thirds (3×3 grid with sweet-spot intersection points)
 * - Golden Ratio / Phi Grid (1 : 0.618 : 1 harmonious sections)
 * - Golden Spiral / Fibonacci (logarithmic progression with 4 orientations)
 * - Diagonal Method (Edwin Westhoff 45° corner diagonals)
 * - Golden Triangles / Harmonic Armature (perpendicular right triangles)
 * - Center Cross / Crosshairs (symmetry, perspective, and centered framing)
 * - Alignment Grid (uniform leveling grid for horizons and architecture)
 */

export type GuideLineType =
  | 'none'
  | 'thirds'
  | 'phi'
  | 'golden-spiral'
  | 'diagonal'
  | 'golden-triangles'
  | 'center-cross'
  | 'grid';

export interface GuideOption {
  id: GuideLineType;
  label: string;
  shortLabel: string;
  description: string;
  hasOrientation: boolean;
}

export const GUIDE_OPTIONS: GuideOption[] = [
  {
    id: 'none',
    label: 'No Guides',
    shortLabel: 'None',
    description: 'Clean viewport without composition lines',
    hasOrientation: false,
  },
  {
    id: 'thirds',
    label: 'Rule of Thirds',
    shortLabel: 'Thirds',
    description: 'Classic 3×3 grid dividing frame into thirds with focal intersections',
    hasOrientation: false,
  },
  {
    id: 'phi',
    label: 'Golden Ratio (Phi)',
    shortLabel: 'Phi Grid',
    description: 'Phi grid with 1 : 0.618 : 1 proportion focusing tighter on the center',
    hasOrientation: false,
  },
  {
    id: 'golden-spiral',
    label: 'Golden Spiral',
    shortLabel: 'Fibonacci',
    description: 'Logarithmic Fibonacci spiral drawing viewer focus into key detail',
    hasOrientation: true,
  },
  {
    id: 'diagonal',
    label: 'Diagonal Method',
    shortLabel: 'Diagonal',
    description: 'Edwin Westhoff 45° diagonal harmonic lines from corners',
    hasOrientation: false,
  },
  {
    id: 'golden-triangles',
    label: 'Golden Triangles',
    shortLabel: 'Triangles',
    description: 'Dynamic symmetry with diagonal and perpendicular 90° lines',
    hasOrientation: true,
  },
  {
    id: 'center-cross',
    label: 'Center & Crosshairs',
    shortLabel: 'Center',
    description: 'Crosshair reticle and concentric target for symmetric compositions',
    hasOrientation: false,
  },
  {
    id: 'grid',
    label: 'Alignment Grid',
    shortLabel: 'Grid',
    description: 'Uniform leveling grid for horizon and architectural vertical alignment',
    hasOrientation: false,
  },
];

export const GUIDE_ORDER: GuideLineType[] = [
  'none',
  'thirds',
  'phi',
  'golden-spiral',
  'diagonal',
  'golden-triangles',
  'center-cross',
  'grid',
];

export function getNextGuideType(current: GuideLineType, reverse = false): GuideLineType {
  const index = GUIDE_ORDER.indexOf(current);
  if (index === -1) return 'thirds';
  const delta = reverse ? -1 : 1;
  const nextIndex = (index + delta + GUIDE_ORDER.length) % GUIDE_ORDER.length;
  return GUIDE_ORDER[nextIndex];
}

export function getNextOrientation(current: number): number {
  return (current + 1) % 4;
}

export interface DrawGuideOptions {
  lineColor?: string;
  shadowColor?: string;
  accentColor?: string;
  lineWidth?: number;
  showPoints?: boolean;
}

const PHI = (Math.sqrt(5) - 1) / 2; // ≈ 0.61803398875
const INV_PHI = 1 - PHI; // ≈ 0.38196601125

/**
 * Draws composition guide lines on an HTML5 2D Canvas context.
 *
 * @param ctx Target CanvasRenderingContext2D
 * @param rect Bounding box { x, y, w, h } where lines should be rendered
 * @param guideType Type of guide line overlay
 * @param orientation 0..3 for orientable overlays (spiral, triangles)
 * @param options Styling options for line width and colors
 */
export function drawCompositionGuide(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; w: number; h: number },
  guideType: GuideLineType,
  orientation: number = 0,
  options: DrawGuideOptions = {}
): void {
  if (guideType === 'none') return;
  const { x, y, w, h } = rect;
  if (w <= 4 || h <= 4) return;

  const lineColor = options.lineColor ?? 'rgba(255, 255, 255, 0.42)';
  const shadowColor = options.shadowColor ?? 'rgba(0, 0, 0, 0.35)';
  const accentColor = options.accentColor ?? 'rgba(255, 255, 255, 0.75)';
  const lineWidth = options.lineWidth ?? 1;

  ctx.save();
  ctx.lineWidth = lineWidth;

  // Helper to draw a line with subtle shadow for visibility on both light and dark photos
  const drawLine = (x1: number, y1: number, x2: number, y2: number, dashed = false) => {
    // Drop shadow
    ctx.strokeStyle = shadowColor;
    ctx.lineWidth = lineWidth + 1;
    ctx.beginPath();
    if (dashed) ctx.setLineDash([4, 4]);
    else ctx.setLineDash([]);
    ctx.moveTo(x1 + 0.5, y1 + 0.5);
    ctx.lineTo(x2 + 0.5, y2 + 0.5);
    ctx.stroke();

    // Main line
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  const drawPoint = (px: number, py: number) => {
    ctx.setLineDash([]);
    // Outer dark ring
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
    ctx.stroke();

    // Inner bright point
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.arc(px, py, 2, 0, Math.PI * 2);
    ctx.fill();
  };

  switch (guideType) {
    case 'thirds': {
      const xs = [x + w * (1 / 3), x + w * (2 / 3)];
      const ys = [y + h * (1 / 3), y + h * (2 / 3)];

      // Vertical lines
      xs.forEach((px) => drawLine(px, y, px, y + h, true));
      // Horizontal lines
      ys.forEach((py) => drawLine(x, py, x + w, py, true));

      // Sweet-spot intersection points
      xs.forEach((px) => {
        ys.forEach((py) => drawPoint(px, py));
      });
      break;
    }

    case 'phi': {
      const xs = [x + w * INV_PHI, x + w * PHI];
      const ys = [y + h * INV_PHI, y + h * PHI];

      // Vertical lines
      xs.forEach((px) => drawLine(px, y, px, y + h, true));
      // Horizontal lines
      ys.forEach((py) => drawLine(x, py, x + w, py, true));

      // Golden ratio intersection points
      xs.forEach((px) => {
        ys.forEach((py) => drawPoint(px, py));
      });
      break;
    }

    case 'golden-spiral': {
      ctx.save();
      // Apply orientation transform
      // 0: top-left, 1: top-right, 2: bottom-right, 3: bottom-left
      ctx.translate(x, y);
      if (orientation === 1) {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      } else if (orientation === 2) {
        ctx.translate(w, h);
        ctx.scale(-1, -1);
      } else if (orientation === 3) {
        ctx.translate(0, h);
        ctx.scale(1, -1);
      }

      let rx = 0;
      let ry = 0;
      let rw = w;
      let rh = h;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);

      const arcs: Array<{
        cx: number;
        cy: number;
        rx: number;
        ry: number;
        startAngle: number;
        endAngle: number;
      }> = [];

      // 8 Fibonacci subdivision steps
      for (let i = 0; i < 8; i++) {
        if (rw <= 2 || rh <= 2) break;
        const mod = i % 4;

        if (mod === 0) {
          const sw = rw * PHI;
          // Boundary line
          ctx.beginPath();
          ctx.moveTo(rx + sw, ry);
          ctx.lineTo(rx + sw, ry + rh);
          ctx.stroke();

          arcs.push({
            cx: rx + sw,
            cy: ry + rh,
            rx: sw,
            ry: rh,
            startAngle: Math.PI,
            endAngle: 1.5 * Math.PI,
          });
          rx += sw;
          rw -= sw;
        } else if (mod === 1) {
          const sh = rh * PHI;
          ctx.beginPath();
          ctx.moveTo(rx, ry + sh);
          ctx.lineTo(rx + rw, ry + sh);
          ctx.stroke();

          arcs.push({
            cx: rx,
            cy: ry + sh,
            rx: rw,
            ry: sh,
            startAngle: 1.5 * Math.PI,
            endAngle: 2 * Math.PI,
          });
          ry += sh;
          rh -= sh;
        } else if (mod === 2) {
          const sw = rw * PHI;
          ctx.beginPath();
          ctx.moveTo(rx + rw - sw, ry);
          ctx.lineTo(rx + rw - sw, ry + rh);
          ctx.stroke();

          arcs.push({
            cx: rx + rw - sw,
            cy: ry,
            rx: sw,
            ry: rh,
            startAngle: 0,
            endAngle: 0.5 * Math.PI,
          });
          rw -= sw;
        } else if (mod === 3) {
          const sh = rh * PHI;
          ctx.beginPath();
          ctx.moveTo(rx, ry + rh - sh);
          ctx.lineTo(rx + rw, ry + rh - sh);
          ctx.stroke();

          arcs.push({
            cx: rx + rw,
            cy: ry + rh - sh,
            rx: rw,
            ry: sh,
            startAngle: 0.5 * Math.PI,
            endAngle: Math.PI,
          });
          rh -= sh;
        }
      }

      // Draw the golden spiral curve continuously
      ctx.setLineDash([]);
      // Dark under-stroke
      ctx.strokeStyle = shadowColor;
      ctx.lineWidth = lineWidth + 1.5;
      ctx.beginPath();
      arcs.forEach((arc) => {
        ctx.ellipse(arc.cx, arc.cy, arc.rx, arc.ry, 0, arc.startAngle, arc.endAngle, false);
      });
      ctx.stroke();

      // Bright main curve
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = lineWidth + 0.5;
      ctx.beginPath();
      arcs.forEach((arc) => {
        ctx.ellipse(arc.cx, arc.cy, arc.rx, arc.ry, 0, arc.startAngle, arc.endAngle, false);
      });
      ctx.stroke();

      ctx.restore();
      break;
    }

    case 'diagonal': {
      // 1. Two primary corner-to-corner diagonals
      drawLine(x, y, x + w, y + h, false);
      drawLine(x + w, y, x, y + h, false);

      // 2. Edwin Westhoff's 45° corner diagonal harmonics
      const d = Math.min(w, h);
      if (Math.abs(w - h) > 2) {
        drawLine(x, y, x + d, y + d, true);
        drawLine(x + w, y, x + w - d, y + d, true);
        drawLine(x, y + h, x + d, y + h - d, true);
        drawLine(x + w, y + h, x + w - d, y + h - d, true);
      }
      break;
    }

    case 'golden-triangles': {
      // Harmonic armature triangles
      // Primary diagonal from one corner to opposite corner
      // Perpendicular 90° lines from the remaining two corners
      const projectPerpendicular = (
        x0: number,
        y0: number,
        x1: number,
        y1: number,
        x2: number,
        y2: number
      ) => {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return { px: x1, py: y1 };
        const t = ((x0 - x1) * dx + (y0 - y1) * dy) / lenSq;
        return { px: x1 + t * dx, py: y1 + t * dy };
      };

      const drawTriangleArmature = (reverse = false) => {
        const x1 = x;
        const y1 = reverse ? y : y + h;
        const x2 = x + w;
        const y2 = reverse ? y + h : y;

        // Diagonal
        drawLine(x1, y1, x2, y2, false);

        // Corner A
        const cAx = x;
        const cAy = reverse ? y + h : y;
        const pA = projectPerpendicular(cAx, cAy, x1, y1, x2, y2);
        drawLine(cAx, cAy, pA.px, pA.py, true);
        drawPoint(pA.px, pA.py);

        // Corner B
        const cBx = x + w;
        const cBy = reverse ? y : y + h;
        const pB = projectPerpendicular(cBx, cBy, x1, y1, x2, y2);
        drawLine(cBx, cBy, pB.px, pB.py, true);
        drawPoint(pB.px, pB.py);
      };

      if (orientation === 0) {
        drawTriangleArmature(false);
      } else if (orientation === 1) {
        drawTriangleArmature(true);
      } else if (orientation === 2) {
        // Full bilateral Harmonic Armature (both directions)
        drawTriangleArmature(false);
        drawTriangleArmature(true);
      } else {
        // Mirrored diagonal
        drawTriangleArmature(true);
      }
      break;
    }

    case 'center-cross': {
      const midX = x + w / 2;
      const midY = y + h / 2;

      // Full crosshairs
      drawLine(midX, y, midX, y + h, true);
      drawLine(x, midY, x + w, midY, true);

      // Concentric center target rings
      const minDim = Math.min(w, h);
      const r1 = minDim * 0.08;
      const r2 = minDim * 0.22;

      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = lineWidth;

      ctx.beginPath();
      ctx.arc(midX, midY, r1, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(midX, midY, r2, 0, Math.PI * 2);
      ctx.stroke();

      // Precision center point
      drawPoint(midX, midY);
      break;
    }

    case 'grid': {
      // Uniform leveling and architecture grid
      // Compute responsive step size
      const divisions = 8;
      const stepX = w / divisions;
      const stepY = h / divisions;

      for (let i = 1; i < divisions; i++) {
        const gx = x + i * stepX;
        drawLine(gx, y, gx, y + h, true);
      }
      for (let j = 1; j < divisions; j++) {
        const gy = y + j * stepY;
        drawLine(x, gy, x + w, gy, true);
      }
      break;
    }
  }

  ctx.restore();
}
