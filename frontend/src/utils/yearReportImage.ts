import { LocalAirport, LocalFlight } from '../db/db';
import { MONTH_NAMES, YearReport } from './analytics';

/**
 * Draws the year summary as a share card. Drawn by hand rather than captured from the page:
 * screenshots of the live layout overlapped text, and a fixed card looks the same on every device.
 */

const WIDTH = 1080;
const PAD = 72;
const INNER = WIDTH - PAD * 2;
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const COLORS = {
  text: '#F1F5F9',
  muted: '#94A3B8',
  accent: '#38BDF8',
  up: '#34D399',
  down: '#FB7185',
  tile: 'rgba(255, 255, 255, 0.05)',
  border: 'rgba(255, 255, 255, 0.09)',
  route: 'rgba(56, 189, 248, 0.55)',
};

interface Highlight {
  label: string;
  value: string;
  hint?: string;
}

export interface YearImageInput {
  report: YearReport;
  flights: LocalFlight[];
  airports: LocalAirport[];
  formatDuration: (minutes: number) => string;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  roundRect(ctx, x, y, w, h, 28);
  ctx.fillStyle = COLORS.tile;
  ctx.fill();
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** Cuts the text with an ellipsis so it never runs into the next column */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, color = COLORS.muted) {
  ctx.font = `600 22px ${SANS}`;
  ctx.fillStyle = color;
  ctx.fillText(fit(ctx, text.toUpperCase(), maxWidth), x, y);
}

function highlightsOf({ report, formatDuration }: YearImageInput): Highlight[] {
  const items: Highlight[] = [];
  if (report.longestFlight) {
    items.push({
      label: 'Самый длинный рейс',
      value: `${report.longestFlight.depIcao}–${report.longestFlight.arrIcao}`,
      hint: `${formatDuration(report.longestFlight.totalTimeMinutes)} · ${report.longestFlight.date.split('-').reverse().join('.')}`,
    });
  }
  if (report.topRoute) {
    items.push({ label: 'Чаще всего', value: `${report.topRoute.dep} ↔ ${report.topRoute.arr}`, hint: `рейсов: ${report.topRoute.count}` });
  }
  if (report.busiestMonth) {
    const month = MONTH_NAMES[report.busiestMonth.month];
    items.push({ label: 'Самый плотный месяц', value: month[0].toUpperCase() + month.slice(1), hint: formatDuration(report.busiestMonth.minutes) });
  }
  items.push({
    label: 'Аэродромов',
    value: `${report.airports.length}, новых ${report.newAirports.length}`,
    hint: report.newAirports.slice(0, 5).join(', ') || undefined,
  });
  if (report.types.length > 0) {
    items.push({ label: 'Типы ВС', value: report.types.map((t) => t.type).join(', '), hint: formatDuration(report.types[0].minutes) + ` на ${report.types[0].type}` });
  }
  if (report.busiestWeekday) items.push({ label: 'Любимый день', value: report.busiestWeekday[0].toUpperCase() + report.busiestWeekday.slice(1) });
  return items;
}

type Route = [LocalAirport, LocalAirport];

/** Distinct routes of the year whose airfields have coordinates */
function routesOf(input: YearImageInput): Route[] {
  const byCode = new Map<string, LocalAirport>();
  input.airports.forEach((airport) => {
    byCode.set(airport.icao.toUpperCase(), airport);
    if (airport.iata) byCode.set(airport.iata.toUpperCase(), airport);
  });

  const pairs = new Map<string, Route>();
  input.flights.forEach((flight) => {
    const dep = byCode.get((flight.depIcao || '').toUpperCase());
    const arr = byCode.get((flight.arrIcao || '').toUpperCase());
    if (!dep || !arr || dep === arr) return;
    const key = [dep.icao, arr.icao].sort().join('-');
    if (!pairs.has(key)) pairs.set(key, [dep, arr]);
  });
  return [...pairs.values()];
}

/** Routes as gently bowed lines on an equirectangular projection fitted to the box */
function drawRoutes(ctx: CanvasRenderingContext2D, routes: Route[], x: number, y: number, w: number, h: number) {
  const points = [...new Set(routes.flat())];
  // Routes across the antimeridian stay together when western longitudes move east of 180
  const spansDateline = Math.max(...points.map((p) => p.longitude)) - Math.min(...points.map((p) => p.longitude)) > 180;
  const lonOf = (p: LocalAirport) => (spansDateline && p.longitude < 0 ? p.longitude + 360 : p.longitude);
  const lats = points.map((p) => p.latitude);
  const lons = points.map(lonOf);
  const scaleX = Math.cos((((Math.max(...lats) + Math.min(...lats)) / 2) * Math.PI) / 180);
  const spanX = Math.max((Math.max(...lons) - Math.min(...lons)) * scaleX, 1);
  const spanY = Math.max(Math.max(...lats) - Math.min(...lats), 1);
  const margin = 36;
  const scale = Math.min((w - margin * 2) / spanX, (h - margin * 2) / spanY);
  const offsetX = x + (w - spanX * scale) / 2;
  const offsetY = y + (h - spanY * scale) / 2;
  const project = (p: LocalAirport): [number, number] => [
    offsetX + (lonOf(p) - Math.min(...lons)) * scaleX * scale,
    offsetY + (Math.max(...lats) - p.latitude) * scale,
  ];

  ctx.save();
  roundRect(ctx, x, y, w, h, 28);
  ctx.clip();
  ctx.lineCap = 'round';
  ctx.strokeStyle = COLORS.route;
  ctx.lineWidth = 3;
  routes.forEach(([a, b]) => {
    const [x1, y1] = project(a);
    const [x2, y2] = project(b);
    // A slight bow reads as a flight path rather than a chart line
    const bend = Math.hypot(x2 - x1, y2 - y1) * 0.12;
    const angle = Math.atan2(y2 - y1, x2 - x1) - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo((x1 + x2) / 2 + Math.cos(angle) * bend, (y1 + y2) / 2 + Math.sin(angle) * bend, x2, y2);
    ctx.stroke();
  });
  points.forEach((point) => {
    const [px, py] = project(point);
    ctx.beginPath();
    ctx.arc(px, py, 9, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.text;
    ctx.fill();
  });
  ctx.restore();
}

export function drawYearReportImage(input: YearImageInput): HTMLCanvasElement {
  const { report, formatDuration } = input;
  const highlights = highlightsOf(input);
  const rows = Math.ceil(highlights.length / 2);
  const mapHeight = 300;
  const routes = routesOf(input);
  const hasRoutes = routes.length > 0;
  const height = 620 + (hasRoutes ? mapHeight + 40 : 0) + rows * 150 + 120;

  const canvas = document.createElement('canvas');
  const ratio = 2;
  canvas.width = WIDTH * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');
  ctx.scale(ratio, ratio);
  ctx.textBaseline = 'alphabetic';

  // Background: deep navy with two soft glows
  const background = ctx.createLinearGradient(0, 0, WIDTH, height);
  background.addColorStop(0, '#0A101C');
  background.addColorStop(1, '#0D1A2E');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, height);
  [
    [WIDTH - 120, 80, 520, 'rgba(56, 189, 248, 0.20)'],
    [80, height - 80, 560, 'rgba(129, 140, 248, 0.16)'],
  ].forEach(([gx, gy, radius, color]) => {
    const glow = ctx.createRadialGradient(gx as number, gy as number, 0, gx as number, gy as number, radius as number);
    glow.addColorStop(0, color as string);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WIDTH, height);
  });

  // Header
  label(ctx, 'OpenLogBook', PAD, 120, INNER / 2);
  ctx.font = `800 26px ${SANS}`;
  ctx.fillStyle = COLORS.accent;
  ctx.textAlign = 'right';
  ctx.fillText(`ИТОГИ ${report.year}`, WIDTH - PAD, 120);
  ctx.textAlign = 'left';

  // Hero: block time of the year
  label(ctx, `Налёт за ${report.year} год`, PAD, 230, INNER);
  ctx.font = `800 148px ${MONO}`;
  ctx.fillStyle = COLORS.text;
  ctx.fillText(fit(ctx, formatDuration(report.totals.minutes), INNER), PAD - 4, 380);

  const change = report.previous && report.previous.minutes > 0
    ? Math.round(((report.totals.minutes - report.previous.minutes) / report.previous.minutes) * 100)
    : null;
  if (change !== null) {
    const text = `${change >= 0 ? '+' : ''}${change}% к ${report.year - 1} году`;
    ctx.font = `700 26px ${SANS}`;
    const pillWidth = ctx.measureText(text).width + 40;
    roundRect(ctx, PAD, 412, pillWidth, 48, 24);
    ctx.fillStyle = change >= 0 ? 'rgba(52, 211, 153, 0.14)' : 'rgba(251, 113, 133, 0.14)';
    ctx.fill();
    ctx.fillStyle = change >= 0 ? COLORS.up : COLORS.down;
    ctx.fillText(text, PAD + 20, 445);
  }

  // Three stat tiles
  const tileGap = 24;
  const tileWidth = (INNER - tileGap * 2) / 3;
  [
    ['Рейсов', String(report.totals.flights)],
    ['Ночью', formatDuration(report.totals.nightMinutes)],
    ['Посадок', String(report.totals.landings)],
  ].forEach(([name, value], index) => {
    const tx = PAD + index * (tileWidth + tileGap);
    panel(ctx, tx, 490, tileWidth, 130);
    label(ctx, name, tx + 28, 538, tileWidth - 56);
    ctx.font = `800 50px ${MONO}`;
    ctx.fillStyle = COLORS.text;
    ctx.fillText(fit(ctx, value, tileWidth - 56), tx + 28, 596);
  });

  let cursor = 660;
  if (hasRoutes) {
    panel(ctx, PAD, cursor, INNER, mapHeight);
    drawRoutes(ctx, routes, PAD, cursor + 56, INNER, mapHeight - 56);
    label(ctx, 'Маршруты года', PAD + 28, cursor + 46, INNER - 56);
    cursor += mapHeight + 40;
  }

  // Highlights, two per row
  const cardGap = 24;
  const cardWidth = (INNER - cardGap) / 2;
  highlights.forEach((item, index) => {
    const cx = PAD + (index % 2) * (cardWidth + cardGap);
    const cy = cursor + Math.floor(index / 2) * 150;
    panel(ctx, cx, cy, cardWidth, 126);
    label(ctx, item.label, cx + 28, cy + 42, cardWidth - 56);
    ctx.font = `700 34px ${SANS}`;
    ctx.fillStyle = COLORS.text;
    ctx.fillText(fit(ctx, item.value, cardWidth - 56), cx + 28, cy + 84);
    if (item.hint) {
      ctx.font = `500 22px ${SANS}`;
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(fit(ctx, item.hint, cardWidth - 56), cx + 28, cy + 112);
    }
  });
  cursor += rows * 150;

  // Footer with the covered dates
  if (report.firstDate && report.lastDate) {
    const short = (date: string) => date.split('-').reverse().slice(0, 2).join('.');
    label(ctx, `${short(report.firstDate)} — ${short(report.lastDate)}.${report.year}`, PAD, cursor + 50, INNER / 2);
  }
  ctx.font = `600 22px ${SANS}`;
  ctx.fillStyle = COLORS.muted;
  ctx.textAlign = 'right';
  ctx.fillText('Лётная книжка OpenLogBook', WIDTH - PAD, cursor + 50);
  ctx.textAlign = 'left';

  return canvas;
}
