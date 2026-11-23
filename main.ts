// news-image-20261122 v17 — "Sunday 22 November 2026" full-day edition.
// Pure Node 22 stdlib only. No network, no Date, no random.
// Self-contained TrueType parser + glyph rasterizer + PNG encoder.
// Fonts loaded script-relative from ./fonts/ (Playfair Display + Barlow Condensed).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";

const __dir = dirname(fileURLToPath(import.meta.url));
const W = 1024, H = 1024;
const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "entry.png");

// ---------------- CRC32 + PNG ----------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePNG(rgb, w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------- Canvas ----------------
const px = Buffer.alloc(W * H * 3);
function rgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
const CREAM = rgb("#F6EED8"), INK = rgb("#141210"), NAVY = rgb("#101E33"),
  RED = rgb("#C8102E"), REDDK = rgb("#9E0B22"), GOLD = rgb("#D9A441"),
  WHITE = rgb("#FFFFFF"), GREY = rgb("#6B6558"), LGREY = rgb("#8A8474"),
  SKY = rgb("#BFD9E8"), SEABLUE = rgb("#2E5E7E"), SAND = rgb("#E3C98F"),
  GREEN = rgb("#3E7A4E"), ORANGE = rgb("#E86A1C"), YELLOW = rgb("#F2C230"),
  BROWN = rgb("#7A5230"), DARKBROWN = rgb("#4A2F1D"), OLIVE = rgb("#6B7A3A"),
  TEAL = rgb("#2F7A7A"), STEEL = rgb("#5B7A8C"), PINK = rgb("#D98A8A"),
  DARKNAVY = rgb("#0A1424"), LIGHTSKY = rgb("#D7E6EE"), CREAM2 = rgb("#EFE3C4");
function fillAll(c) { for (let i = 0; i < W * H; i++) { px[i * 3] = c[0]; px[i * 3 + 1] = c[1]; px[i * 3 + 2] = c[2]; } }
function setPx(x, y, c) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
}
function blendPx(x, y, c, a) { // a 0..255
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  if (a >= 255) { setPx(x, y, c); return; }
  const i = (y * W + x) * 3, ia = 255 - a;
  px[i] = (c[0] * a + px[i] * ia) / 255 | 0;
  px[i + 1] = (c[1] * a + px[i + 1] * ia) / 255 | 0;
  px[i + 2] = (c[2] * a + px[i + 2] * ia) / 255 | 0;
}
function rect(x, y, w, h, c) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(W, x + w), y1 = Math.min(H, y + h);
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) setPx(xx, yy, c);
}
function hline(x0, x1, y, c) { rect(Math.min(x0, x1), y, Math.abs(x1 - x0) + 1, 1, c); }
function vline(x, y0, y1, c) { rect(x, Math.min(y0, y1), 1, Math.abs(y1 - y0) + 1, c); }
function strokeRect(x, y, w, h, c, t = 1) {
  rect(x, y, w, t, c); rect(x, y + h - t, w, t, c); rect(x, y, t, h, c); rect(x + w - t, y, t, h, c);
}
function circle(cx, cy, r, c) {
  cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
  for (let y = -r; y <= r; y++) {
    const hw = Math.floor(Math.sqrt(r * r - y * y));
    for (let x = -hw; x <= hw; x++) setPx(cx + x, cy + y, c);
  }
}
function ellipse(cx, cy, rx, ry, c) {
  for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
    const t = 1 - (y * y) / (ry * ry); if (t < 0) continue;
    const hw = Math.floor(rx * Math.sqrt(t));
    for (let x = -hw; x <= hw; x++) setPx(Math.round(cx) + x, Math.round(cy) + y, c);
  }
}
// thick line as polygon
function thickLine(x0, y0, x1, y1, t, c) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len * t / 2, ny = dx / len * t / 2;
  poly([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]], c);
}
function line(x0, y0, x1, y1, c) { // 1px Bresenham
  let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    setPx(x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
// scanline polygon fill (even-odd), points [[x,y],...]
function poly(pts, c) {
  if (pts.length < 3) return;
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  minY = Math.max(0, Math.floor(minY)); maxY = Math.min(H - 1, Math.ceil(maxY));
  for (let y = minY; y <= maxY; y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k])), x1 = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let x = x0; x <= x1; x++) setPx(x, y, c);
    }
  }
}
function ring(cx, cy, r, c, t = 2) { // circle outline
  for (let a = 0; a < 360; a += 2) {
    const rad = a * Math.PI / 180;
    for (let k = 0; k < t; k++) setPx(Math.round(cx + (r - k) * Math.cos(rad)), Math.round(cy + (r - k) * Math.sin(rad)), c);
  }
}
function star(cx, cy, r, c, points = 5) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45, a = -Math.PI / 2 + i * Math.PI / points;
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  poly(pts, c);
}

// ---------------- TrueType font ----------------
function u16(b, o) { return b.readUInt16BE(o); }
function i16(b, o) { return b.readInt16BE(o); }
function u32(b, o) { return b.readUInt32BE(o); }
function tag(b, o) { return b.toString("ascii", o, o + 4); }

class Font {
  constructor(path) {
    const b = readFileSync(path);
    this.buf = b;
    const numTables = u16(b, 4);
    this.tables = {};
    for (let i = 0; i < numTables; i++) {
      const o = 12 + i * 16;
      this.tables[tag(b, o)] = { off: u32(b, o + 8), len: u32(b, o + 12) };
    }
    const head = this.tables.head.off;
    this.upm = u16(b, head + 18);
    this.indexToLocFormat = i16(b, head + 50);
    const maxp = this.tables.maxp.off;
    this.numGlyphs = u16(b, maxp + 4);
    const hhea = this.tables.hhea.off;
    this.numHMetrics = u16(b, hhea + 34);
    const hmtx = this.tables.hmtx.off;
    this.adv = new Uint16Array(this.numGlyphs);
    for (let g = 0; g < this.numGlyphs; g++) {
      this.adv[g] = g < this.numHMetrics ? u16(b, hmtx + g * 4) : this.adv[this.numHMetrics - 1];
    }
    const loca = this.tables.loca.off, glyf = this.tables.glyf.off;
    this.loca = new Uint32Array(this.numGlyphs + 1);
    if (this.indexToLocFormat === 0) {
      for (let g = 0; g <= this.numGlyphs; g++) this.loca[g] = u16(b, loca + g * 2) * 2;
    } else {
      for (let g = 0; g <= this.numGlyphs; g++) this.loca[g] = u32(b, loca + g * 4);
    }
    this.glyfOff = glyf;
    // cmap: prefer format 12, else format 4
    this.cmap = new Map();
    const cmap = this.tables.cmap.off;
    const nSub = u16(b, cmap + 2);
    let f4 = -1, f12 = -1;
    for (let i = 0; i < nSub; i++) {
      const so = cmap + 4 + i * 8;
      const subOff = cmap + u32(b, so + 4);
      const fmt = u16(b, subOff);
      if (fmt === 12) f12 = subOff; else if (fmt === 4 && f4 < 0) f4 = subOff;
    }
    if (f12 >= 0) {
      const n = u32(b, f12 + 12);
      for (let i = 0; i < n && i < 100000; i++) {
        const o = f12 + 16 + i * 12;
        const s = u32(b, o), e = u32(b, o + 4), g = u32(b, o + 8);
        if (e - s > 0x110000) continue;
        for (let cp = s; cp <= e; cp++) this.cmap.set(cp, g + (cp - s));
      }
    } else if (f4 >= 0) {
      const segCount = u16(b, f4 + 6) / 2;
      const endOff = f4 + 14, startOff = endOff + segCount * 2 + 2, deltaOff = startOff + segCount * 2, roOff = deltaOff + segCount * 2;
      for (let s = 0; s < segCount; s++) {
        const end = u16(b, endOff + s * 2), start = u16(b, startOff + s * 2);
        const delta = i16(b, deltaOff + s * 2), ro = u16(b, roOff + s * 2);
        for (let cp = start; cp <= end && cp !== 0xffff; cp++) {
          let g;
          if (ro === 0) g = (cp + delta) & 0xffff;
          else {
            const gi = roOff + s * 2 + ro + (cp - start) * 2;
            g = u16(b, gi); if (g !== 0) g = (g + delta) & 0xffff;
          }
          this.cmap.set(cp, g);
        }
      }
    }
    // kern format 0
    this.kern = new Map();
    if (this.tables.kern) {
      const k = this.tables.kern.off;
      const nT = u16(b, k + 2);
      for (let t = 0; t < nT; t++) {
        const to = k + 4 + t * 0; // subtables are sequential; walk by length
        break;
      }
      // walk subtables by length field
      let o = k + 4;
      for (let t = 0; t < nT; t++) {
        const len = u16(b, o + 2), coverage = u16(b, o + 4);
        if ((coverage & 0xff) === 0 && (coverage >> 8) === 0) {
          const nPairs = u16(b, o + 6);
          for (let p = 0; p < nPairs; p++) {
            const po = o + 14 + p * 6;
            this.kern.set(u16(b, po) * 65536 + u16(b, po + 2), i16(b, po + 4));
          }
        }
        o += len;
      }
    }
    this.cache = new Map();
  }
  glyphIndex(cp) { return this.cmap.get(cp) || 0; }
  // outline -> array of contours, each contour = array of [x,y] points (already flattened, on-curve only)
  outline(gid) {
    const b = this.buf;
    const o0 = this.glyfOff + this.loca[gid], o1 = this.glyfOff + this.loca[gid + 1];
    if (o1 <= o0) return [];
    const nCont = i16(b, o0);
    if (nCont < 0) { // composite
      let p = o0 + 10;
      const out = [];
      for (;;) {
        const flags = u16(b, p); const comp = u16(b, p + 2); p += 4;
        let dx = 0, dy = 0;
        if (flags & 1) { dx = i16(b, p); dy = i16(b, p + 2); p += 4; }
        else { dx = b[p]; dy = b[p + 1]; p += 2; if (flags & 2) { /* args are points, ignore */ } }
        let sx = 1, sy = 1, m01 = 0, m10 = 0;
        if (flags & 8) { sx = i16(b, p) / 16384; sy = sx; p += 2; }
        else if (flags & 0x40) { sx = i16(b, p) / 16384; sy = i16(b, p + 2) / 16384; p += 4; }
        else if (flags & 0x80) { sx = i16(b, p) / 16384; m01 = i16(b, p + 2) / 16384; m10 = i16(b, p + 4) / 16384; sy = i16(b, p + 6) / 16384; p += 8; }
        const sub = this.outline(comp);
        for (const ct of sub) out.push(ct.map(([x, y]) => [x * sx + y * m10 + dx, x * m01 + y * sy + dy]));
        if (!(flags & 0x20)) break;
      }
      return out;
    }
    const endPts = [];
    for (let i = 0; i < nCont; i++) endPts.push(u16(b, o0 + 10 + i * 2));
    const insLen = u16(b, o0 + 10 + nCont * 2);
    let p = o0 + 10 + nCont * 2 + 2 + insLen;
    const nPts = endPts.length ? endPts[nCont - 1] + 1 : 0;
    const flags = [];
    for (let i = 0; i < nPts;) {
      const f = b[p++];
      flags.push(f);
      if (f & 8) { const rep = b[p++]; for (let r = 0; r < rep; r++) flags.push(f); i += rep + 1; }
      else i++;
    }
    const xs = [], ys = [];
    let x = 0;
    for (let i = 0; i < nPts; i++) {
      const f = flags[i];
      if (f & 2) { const d = b[p++]; x += (f & 16) ? d : -d; }
      else if (!(f & 16)) { x += i16(b, p); p += 2; }
      xs.push(x);
    }
    let y = 0;
    for (let i = 0; i < nPts; i++) {
      const f = flags[i];
      if (f & 4) { const d = b[p++]; y += (f & 32) ? d : -d; }
      else if (!(f & 32)) { y += i16(b, p); p += 2; }
      ys.push(y);
    }
    // build contours with quadratic flattening
    const contours = [];
    let start = 0;
    for (let c = 0; c < nCont; c++) {
      const end = endPts[c];
      const pts = [];
      for (let i = start; i <= end; i++) pts.push({ x: xs[i], y: ys[i], on: !!(flags[i] & 1) });
      contours.push(flattenContour(pts));
      start = end + 1;
    }
    return contours;
  }
  // rasterize glyph at pixel size -> {w,h,bmp:Uint8Array alpha, ox, oy} ; ox,oy = top-left offset in px (bitmap covers from ox..)
  raster(gid, size) {
    const key = gid + "|" + size;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const SS = 3;
    const scale = size / this.upm;
    const contours = this.outline(gid);
    // bounds in px
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const ct of contours) for (const [x, y] of ct) {
      minX = Math.min(minX, x * scale); maxX = Math.max(maxX, x * scale);
      minY = Math.min(minY, y * scale); maxY = Math.max(maxY, y * scale);
    }
    let res;
    if (!isFinite(minX)) { res = { w: 0, h: 0, bmp: new Uint8Array(0), ox: 0, oy: 0 }; }
    else {
      const ox = Math.floor(minX), oy = Math.floor(minY);
      const w = Math.max(1, Math.ceil(maxX) - ox + 1), h = Math.max(1, Math.ceil(maxY) - oy + 1);
      const topY = oy + h; // glyph-space y of bitmap top (y up)
      const sw = w * SS, sh = h * SS;
      const cov = new Uint8Array(sw * sh);
      // flatten contours to segments in supersampled space (y flipped: bitmap row 0 = glyph top)
      const segs = [];
      for (const ct of contours) {
        for (let i = 0; i < ct.length; i++) {
          const a = ct[i], b2 = ct[(i + 1) % ct.length];
          segs.push([(a[0] * scale - ox) * SS, (topY - a[1] * scale) * SS, (b2[0] * scale - ox) * SS, (topY - b2[1] * scale) * SS]);
        }
      }
      // scanline nonzero fill at SS resolution
      for (let sy = 0; sy < sh; sy++) {
        const y = sy + 0.5;
        const ints = [];
        for (const [x0, y0, x1, y1] of segs) {
          if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
            ints.push({ x: x0 + (y - y0) * (x1 - x0) / (y1 - y0), dir: y1 > y0 ? 1 : -1 });
          }
        }
        ints.sort((a, b2) => a.x - b2.x);
        let wn = 0;
        for (let k = 0; k + 1 < ints.length; k++) {
          wn += ints[k].dir;
          if (wn !== 0) {
            const x0 = Math.max(0, Math.ceil(ints[k].x)), x1 = Math.min(sw, Math.floor(ints[k + 1].x));
            for (let sx = x0; sx < x1; sx++) cov[sy * sw + sx] = 1;
          }
        }
      }
      // downsample
      const bmp = new Uint8Array(w * h);
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
        let s = 0;
        for (let a = 0; a < SS; a++) for (let bb = 0; bb < SS; bb++) s += cov[(yy * SS + a) * sw + xx * SS + bb];
        bmp[yy * w + xx] = Math.round(s * 255 / (SS * SS));
      }
      res = { w, h, bmp, ox, oy: -oy - h }; // oy: bitmap top in glyph space (y up); draw at baselineY + oy
    }
    this.cache.set(key, res);
    return res;
  }
  widthOf(str, size) {
    const scale = size / this.upm;
    let w = 0, prev = -1;
    for (const ch of str) {
      const gid = this.glyphIndex(ch.codePointAt(0));
      if (prev >= 0) w += (this.kern.get(prev * 65536 + gid) || 0) * scale;
      w += this.adv[gid] * scale;
      prev = gid;
    }
    return w;
  }
}
function flattenContour(pts) {
  // pts: {x,y,on}; produce on-curve-only polyline with quadratics subdivided
  const n = pts.length;
  if (n === 0) return [];
  const out = [];
  // find a starting on-curve point
  let si = 0;
  while (si < n && !pts[si].on) si++;
  if (si === n) { // all off-curve: implied on-curve midpoints
    for (let i = 0; i < n; i++) {
      const a = pts[i], b2 = pts[(i + 1) % n];
      out.push([(a.x + b2.x) / 2, (a.y + b2.y) / 2]);
      // quadratic from midpoint to next midpoint via b2
      const c = pts[(i + 2) % n];
      const m2 = [(b2.x + c.x) / 2, (b2.y + c.y) / 2];
      subdivide(out, out[out.length - 1], [b2.x, b2.y], m2);
    }
    return out;
  }
  let cur = [pts[si].x, pts[si].y];
  out.push(cur);
  // linear walk over the cyclic point list, closed by repeating the start point:
  // index-based while loops can skip the start index forever (parity jumps), so walk a fixed sequence.
  const seq = [];
  for (let k = 0; k < n; k++) seq.push(pts[(si + k) % n]);
  seq.push(pts[si]);
  let j = 1;
  while (j < seq.length) {
    const p = seq[j];
    if (p.on) { out.push([p.x, p.y]); cur = [p.x, p.y]; j++; }
    else {
      const nxt = seq[j + 1];
      const end = nxt.on ? [nxt.x, nxt.y] : [(p.x + nxt.x) / 2, (p.y + nxt.y) / 2];
      subdivide(out, cur, [p.x, p.y], end);
      cur = end;
      j += nxt.on ? 2 : 1;
    }
  }
  return out;
}
function subdivide(out, p0, p1, p2) {
  const steps = 8;
  for (let s = 1; s <= steps; s++) {
    const t = s / steps, u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
              u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
  }
}

const F = {
  playBlack: new Font(join(__dir, "fonts", "PlayfairDisplay-Black.ttf")),
  playBold: new Font(join(__dir, "fonts", "PlayfairDisplay-Bold.ttf")),
  playXB: new Font(join(__dir, "fonts", "PlayfairDisplay-ExtraBold.ttf")),
  barReg: new Font(join(__dir, "fonts", "BarlowCondensed-Regular.ttf")),
  barMed: new Font(join(__dir, "fonts", "BarlowCondensed-Medium.ttf")),
  barSemi: new Font(join(__dir, "fonts", "BarlowCondensed-SemiBold.ttf")),
  barBold: new Font(join(__dir, "fonts", "BarlowCondensed-Bold.ttf")),
};
const FALLBACK = { serif: F.playBold, sans: F.barReg };

function drawText(font, size, x, y, str, color, align = "left") {
  // y = baseline
  let w = font.widthOf(str, size);
  let sx = x;
  if (align === "center") sx = x - w / 2;
  else if (align === "right") sx = x - w;
  const scale = size / font.upm;
  let pen = sx, prev = -1;
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    const gid = font.glyphIndex(cp);
    if (prev >= 0) pen += (font.kern.get(prev * 65536 + gid) || 0) * scale;
    const g = font.raster(gid, size);
    if (g.w > 0) {
      const gx = Math.round(pen + g.ox), gy = Math.round(y + g.oy);
      for (let yy = 0; yy < g.h; yy++) for (let xx = 0; xx < g.w; xx++) {
        const a = g.bmp[yy * g.w + xx];
        if (a) blendPx(gx + xx, gy + yy, color, a);
      }
    }
    pen += font.adv[gid] * scale;
    prev = gid;
  }
  return w;
}
function wrapText(font, size, str, maxW) {
  const words = str.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const wd of words) {
    const t = cur ? cur + " " + wd : wd;
    if (font.widthOf(t, size) <= maxW || !cur) cur = t;
    else { lines.push(cur); cur = wd; }
  }
  if (cur) lines.push(cur);
  return lines;
}
function drawLines(font, size, x, y, lines, color, lh, align = "left") {
  let yy = y;
  for (const ln of lines) { drawText(font, size, x, yy, ln, color, align); yy += lh; }
  return yy;
}

// ---------------- Content ----------------
const LEADS = [
  { n: 1, kicker: "ANTALYA, TÜRKIYE — CLIMATE", head: "COP31 collapses with no deal", chip: "NO DEAL", chipBg: RED, chipFg: WHITE,
    body: "After 2 days of overtime, the summit ends Sunday with no deal. The EU + ~130 nations reject a text that drops fossil fuels; COP31 president Kurum admits no consensus. The longest COP in history; the biggest setback since COP15 in 2009." },
  { n: 2, kicker: "DYMER, UKRAINE — WAR", head: "Strike on Dymer block kills at least 10", chip: "CONFIRMED", chipBg: GREEN, chipFg: WHITE,
    body: "A drone hits a five-storey apartment block ~45 km north of Kyiv in the early hours of Sunday; the building partly collapses. A boy of 7 is pulled alive after 14 hours; a woman of 79 is rescued; 11 people were unaccounted for." },
  { n: 3, kicker: "MANAMA, BAHRAIN — IRAN", head: "Iran claims two US radars hit; US denies damage", chip: "CLAIM", chipBg: GOLD, chipFg: INK,
    body: "The IRGC claims a missile and drone operation destroyed two US Patriot radars at Al-Riffa and Awali. The US says no damage to US personnel or facilities. Bahrain: air defences intercept several targets; a fire at a civilian industrial site; 2 hurt." },
];
const GRID = [
  { n: 4, kicker: "GULF OF FINLAND — SEA", head: "Russian cargo ship Sparta II still ablaze", chip: "STILL ABLAZE", chipBg: RED, chipFg: WHITE,
    body: "Sanctioned ship linked to Russia\u2019s defence ministry, hit by a suspected Ukrainian drone; fire raged overnight." },
  { n: 5, kicker: "PERU — EARTHQUAKE", head: "Magnitude 6.8 quake shakes Peru\u2019s Andes", chip: "M 6.8", chipBg: GREEN, chipFg: WHITE,
    body: "Tremors send Lima residents fleeing early; reports cite no damage or casualties." },
  { n: 6, kicker: "JERUSALEM — POLITICS", head: "Eisenkot asked to form Israel\u2019s government", chip: "MANDATE", chipBg: GREEN, chipFg: WHITE,
    body: "President Herzog passes over Netanyahu; mandate ceremony on Sunday." },
  { n: 7, kicker: "UKRAINE — WAR", head: "Missiles hit Zelenskyy\u2019s hometown, 2 dead", chip: "2 DEAD", chipBg: RED, chipFg: WHITE,
    body: "Kryvyi Rih: 60 hurt, a hospital and 25 blocks hit." },
  { n: 8, kicker: "MEXICO — CARTELS", head: "11 killed after cartel boss is captured", chip: "11 KILLED", chipBg: RED, chipFg: WHITE,
    body: "\u201CEl Chapo Isidro\u201D Meza Flores is arrested in Sinaloa." },
  { n: 9, kicker: "HONG KONG — ELECTION", head: "Hong Kong votes fill all 723 seats", chip: "723 SEATS", chipBg: RED, chipFg: WHITE,
    body: "723 seats from 856 candidates, 31 subsectors; record 98.79% turnout; 5,640 voters." },
  { n: 10, kicker: "HORMUZ — SEA", head: "Two tankers hit and set ablaze near Hormuz", chip: "2 TANKERS", chipBg: RED, chipFg: WHITE,
    body: "UKMTO: two tankers hit by unknown projectiles near Khasab, Oman; fires aboard; no casualties." },
  { n: 11, kicker: "HORMUZ — AIR", head: "Iran claims 20th US MQ-1 drone downed", chip: "CLAIM", chipBg: WHITE, chipFg: INK,
    body: "IRGC claims a US MQ-1 downed east of Hormuz, the 20th of the war and 4th in 24 hours. Unverified." },
  { n: 12, kicker: "BRUSSELS — TRADE", head: "EU and Indonesia sign landmark trade deal", chip: "98.5%", chipBg: WHITE, chipFg: RED,
    body: "Signed Saturday in Brussels after ~10 years of talks; removes 98.5% of tariffs; EU exporters save ~\u20AC600m a year." },
  { n: 13, kicker: "LAS VEGAS — FORMULA 1", head: "Verstappen wins the Las Vegas Grand Prix", chip: "35 LEAD CHANGES", chipBg: RED, chipFg: WHITE,
    body: "Third win in four years; 35 lead changes; beats Antonelli and Russell; Ferraris collide." },
];
const WIRES_LEFT = [
  "Somalia orders UAE envoy to leave \u2014 Mogadishu recalls its ambassador too.",
  "Four nations press Israel on Gaza aid \u2014 Australia, Canada, Italy, UK cite flood suffering.",
  "US \u2014 COURTS: Court backs $7.25bn Roundup settlement.",
  "RUGBY: England thrash the All Blacks 37-12.",
  "FOOTBALL: Arsenal held 2-2; Leeds stun Chelsea 4-1.",
  "Estonia: to close its Russia border; Moscow cries \u201CIron Curtain\u201D.",
  "France: police jailed for racist violence, a landmark ruling.",
  "France: 6th straight Saturday of cost-of-living protests.",
  "US: Trump warns of a \u201Ctremendous tax\u201D on AI centres abroad.",
  "US: man convicted of starting the deadly 2025 Palisades fire.",
  "US: State Dept details $12bn of Venezuelan oil revenue.",
  "US: Trump ousts cyber director after outage criticism.",
];
const WIRES_RIGHT = [
  "Ebola: the death toll passes 5,700, containment goes on.",
  "Myanmar: France seeks UN action on the genocide ruling.",
  "India-China: commanders meet on the Arunachal frontier.",
  "Japan: forces to train live-fire at Indian facilities, a first.",
  "India: Air India extends Jeddah suspension to 24 Nov.",
  "India: ICMR signs off 100 health technology transfers.",
  "Cricket: Rahul\u2019s century headlines India\u2019s Test in NZ.",
  "Cricket: Cummins wins unanimous backing as Australia captain.",
  "Switzerland: 4,000-year-old bronze ring found in melting ice.",
  "Australia: bystanders pull a driver from a burning car, Canberra.",
  "Football: PSG win 3-2 at Nice; Doue hurt badly.",
];
const DATE_CHECK_BODY = "DATE CHECK \u2014 FULL-DAY EDITION: wires through the end of Sunday 22 November 2026. Left out as Saturday 21 November news: the Kyiv bridge strikes, the Shenzhen summit and India\u2019s Nitish Setu opening \u2014 and the Lviv strike (Friday 20 Nov). Now included (22 November): COP31\u2019s collapse, the Dymer strike, Iran\u2019s Bahrain radar claim, Hong Kong\u2019s vote count, the Hormuz tanker fires, the MQ-1 claim. COP31\u2019s vote is no longer pending \u2014 the summit ended with no deal.";
const FOOTER_SRC = "Sources: Reuters \u00B7 CNN \u00B7 AP \u00B7 Xinhua \u00B7 China Daily \u00B7 UKMTO \u00B7 IRIB \u00B7 Al Jazeera \u00B7 CBS \u00B7 European Commission \u00B7 Finnish Border Guard \u00B7 France 24 \u00B7 F1 \u00B7 Kyiv regional officials \u00B7 SES \u00B7 Bahrain.";
const FOOTER_CERT = "CERTAINTY: REPORTED \u2014 carried by the day\u2019s wires \u00B7 CLAIM \u2014 one side\u2019s claim, labelled as such. Scenes are drawn illustrations, not photographs. All 36 stories happened or were first reported on Sunday 22 November 2026 (UTC).";

// ---------------- Card furniture ----------------
function chip(x, y, w, h, text, bg, fg, size = 9.5) {
  const tw = F.barBold.widthOf(text, size) + 10;
  const cx = x + w - 4 - tw;
  rect(cx, y + 3, tw, h, bg);
  drawText(F.barBold, size, cx + tw / 2, y + 3 + h - 3.5, text, fg, "center");
}
function badge(x, y, n) {
  circle(x + 11, y + 11, 11, RED);
  ring(x + 11, y + 11, 11, WHITE, 1);
  drawText(F.barBold, 13, x + 11, y + 16, String(n), WHITE, "center");
}
function starDots(x, y, w, h, n, seed) {
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const sx = x + 4 + (s % 1000) / 1000 * (w - 8);
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const sy = y + 3 + (s % 1000) / 1000 * (h * 0.45);
    circle(sx, sy, 0.8, WHITE);
  }
}

// ---------------- Illustrations ----------------
// COP31 — rich: night hall, globe, 2 rows of delegates, name plates, mics, podium, NO DEAL banner
function illoCOP31(x, y, w, h) {
  rect(x, y, w, h, DARKNAVY);
  starDots(x, y, w, h, 14, 7);
  // warm wall lamps
  circle(x + 22, y + 10, 7, rgb("#8A6A2A")); circle(x + 22, y + 10, 4, YELLOW);
  circle(x + w - 22, y + 10, 7, rgb("#8A6A2A")); circle(x + w - 22, y + 10, 4, YELLOW);
  // globe (left)
  circle(x + 52, y + 30, 17, GREEN);
  ellipse(x + 46, y + 26, 8, 5, rgb("#2E5E3A")); ellipse(x + 58, y + 35, 7, 4, rgb("#2E5E3A"));
  ring(x + 52, y + 30, 17, GOLD, 1);
  rect(x + 48, y + 46, 8, 6, BROWN);
  // back row delegates (5)
  const backCols = [rgb("#C65A3A"), rgb("#3A6AC6"), rgb("#7A3AC6"), rgb("#3A8A5A"), rgb("#C6A03A")];
  for (let i = 0; i < 5; i++) {
    const cx = x + 96 + i * 34;
    poly([[cx - 11, y + 34], [cx + 11, y + 34], [cx + 8, y + 20], [cx - 8, y + 20]], backCols[i]);
    circle(cx, y + 14, 6, rgb("#E8C39A"));
    rect(cx - 1, y + 8, 2, 2, INK);
  }
  // front row delegates (6) behind table
  const frontCols = [rgb("#8A3A3A"), rgb("#2E5E7E"), rgb("#6B7A3A"), rgb("#A05A2E"), rgb("#4A3A6A"), rgb("#2E6A4A")];
  for (let i = 0; i < 6; i++) {
    const cx = x + 88 + i * 30;
    poly([[cx - 12, y + 56], [cx + 12, y + 56], [cx + 9, y + 40], [cx - 9, y + 40]], frontCols[i]);
    circle(cx, y + 34, 6.5, rgb("#D9A06A"));
    // mic
    line(cx + 8, y + 52, cx + 12, y + 42, INK); circle(cx + 12, y + 41, 1.6, INK);
  }
  // long table + name plates
  rect(x, y + 56, w, 14, BROWN);
  rect(x, y + 56, w, 2, DARKBROWN);
  for (let i = 0; i < 6; i++) rect(x + 86 + i * 30, y + 58, 16, 6, WHITE);
  // podium right + plain red drape (chip above already says NO DEAL)
  rect(x + w - 46, y + 34, 34, 36, DARKBROWN);
  rect(x + w - 50, y + 30, 42, 6, BROWN);
  rect(x + w - 48, y + 18, 38, 12, RED);
  // clock on wall
  circle(x + w - 78, y + 12, 7, WHITE); ring(x + w - 78, y + 12, 7, INK, 1);
  line(x + w - 78, y + 12, x + w - 78, y + 7, INK); line(x + w - 78, y + 12, x + w - 74, y + 12, INK);
}
// Dymer night
function illoDymer(x, y, w, h) {
  rect(x, y, w, h, DARKNAVY);
  starDots(x, y, w, h, 12, 21);
  // apartment block left (5 floors, lit windows)
  rect(x + 18, y + 12, 92, 58, rgb("#2A2A33"));
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
    const lit = (r * 5 + c) % 3 !== 0;
    rect(x + 24 + c * 17, y + 17 + r * 13, 11, 8, lit ? YELLOW : rgb("#15151C"));
  }
  // collapsed right part + rubble
  poly([[x + 110, y + 30], [x + 150, y + 30], [x + 150, y + 70], [x + 110, y + 70]], rgb("#3A3A44"));
  poly([[x + 110, y + 30], [x + 128, y + 44], [x + 110, y + 48]], rgb("#55555F"));
  poly([[x + 118, y + 70], [x + 138, y + 58], [x + 158, y + 70]], rgb("#5A4632"));
  poly([[x + 160, y + 70], [x + 178, y + 60], [x + 196, y + 70]], rgb("#6A5238"));
  // second block right
  rect(x + 210, y + 26, 70, 44, rgb("#33333D"));
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++)
    rect(x + 216 + c * 16, y + 31 + r * 13, 10, 7, (r + c) % 2 ? YELLOW : rgb("#15151C"));
  // drone silhouette + red ladder
  ellipse(x + 250, y + 12, 10, 3, INK); line(x + 240, y + 12, x + 260, y + 12, INK);
  circle(x + 238, y + 12, 1.5, RED); circle(x + 262, y + 12, 1.5, RED);
  thickLine(x + 150, y + 68, x + 168, y + 30, 3, RED);
  line(x + 154, y + 58, x + 162, y + 58, RED); line(x + 157, y + 48, x + 165, y + 48, RED);
  // small fire glow
  circle(x + 128, y + 62, 5, ORANGE); circle(x + 128, y + 62, 2.5, YELLOW);
}
// Bahrain radar
function illoBahrain(x, y, w, h) {
  rect(x, y, w, h, DARKNAVY);
  starDots(x, y, w, h, 12, 33);
  const dish = (cx, cy) => {
    ellipse(cx, cy, 30, 9, rgb("#C8CCD2"));
    ellipse(cx, cy - 1, 24, 6, rgb("#9AA0A8"));
    thickLine(cx, cy + 4, cx - 4, cy + 26, 4, rgb("#8A9098"));
    rect(cx - 14, cy + 26, 28, 6, rgb("#6A7078"));
  };
  dish(x + 78, y + 30); dish(x + 228, y + 30);
  // straight beams
  thickLine(x + 78, y + 26, x + 150, y + 8, 2, YELLOW);
  thickLine(x + 228, y + 26, x + 292, y + 10, 2, YELLOW);
  // explosion between dishes
  star(x + 152, y + 22, 13, ORANGE); circle(x + 152, y + 22, 6, YELLOW);
  star(x + 296, y + 24, 9, ORANGE); circle(x + 296, y + 24, 4, YELLOW);
  // ground
  rect(x, y + 62, w, 8, rgb("#1A2233"));
  // small fire on ground
  poly([[x + 168, y + 62], [x + 174, y + 50], [x + 180, y + 62]], ORANGE);
  poly([[x + 171, y + 62], [x + 174, y + 55], [x + 177, y + 62]], YELLOW);
}
// Sparta II
function illoSparta(x, y, w, h) {
  rect(x, y, w, h, LIGHTSKY);
  rect(x, y + 34, w, h - 34, SEABLUE);
  rect(x, y + 34, w, 2, WHITE);
  // ship
  poly([[x + 14, y + 30], [x + 170, y + 30], [x + 160, y + 48], [x + 24, y + 48]], INK);
  rect(x + 30, y + 18, 20, 12, RED); rect(x + 52, y + 18, 20, 12, rgb("#2E6AC6"));
  rect(x + 74, y + 18, 20, 12, YELLOW); rect(x + 96, y + 18, 20, 12, rgb("#3E7A4E"));
  rect(x + 130, y + 14, 22, 16, WHITE); rect(x + 134, y + 18, 14, 4, rgb("#2E6AC6"));
  // flames + smoke
  poly([[x + 40, y + 30], [x + 48, y + 12], [x + 56, y + 30]], ORANGE);
  poly([[x + 46, y + 30], [x + 50, y + 20], [x + 54, y + 30]], YELLOW);
  poly([[x + 100, y + 30], [x + 108, y + 14], [x + 116, y + 30]], ORANGE);
  circle(x + 52, y + 8, 7, rgb("#8A8A8A")); circle(x + 60, y + 4, 6, rgb("#AAAAAA"));
  circle(x + 112, y + 10, 6, rgb("#8A8A8A"));
  // waves
  line(x + 6, y + 50, x + 40, y + 50, WHITE); line(x + 120, y + 51, x + 160, y + 51, WHITE);
}
// Peru
function illoPeru(x, y, w, h) {
  rect(x, y, w, h, LIGHTSKY);
  circle(x + 168, y + 10, 7, YELLOW);
  poly([[x + 6, y + 54], [x + 70, y + 8], [x + 120, y + 54]], BROWN);
  poly([[x + 62, y + 15], [x + 70, y + 8], [x + 78, y + 15]], WHITE);
  poly([[x + 90, y + 54], [x + 150, y + 18], [x + 186, y + 54]], rgb("#6A4A2A"));
  poly([[x + 144, y + 23], [x + 150, y + 18], [x + 156, y + 23]], WHITE);
  rect(x, y + 44, w, 10, SAND);
  // cracked ground
  thickLine(x + 8, y + 46, x + 40, y + 50, 2, INK); thickLine(x + 40, y + 50, x + 60, y + 45, 2, INK);
  thickLine(x + 60, y + 45, x + 100, y + 51, 2, INK); thickLine(x + 100, y + 51, x + 140, y + 46, 2, INK);
  // tilted building
  poly([[x + 150, y + 30], [x + 172, y + 26], [x + 176, y + 44], [x + 154, y + 44]], rgb("#8A8A8A"));
  rect(x + 158, y + 32, 5, 5, YELLOW); rect(x + 166, y + 31, 5, 5, YELLOW);
  // thick red seismograph
  const sy = y + 38;
  thickLine(x + 4, sy, x + 26, sy, 2, RED); thickLine(x + 26, sy, x + 34, sy - 8, 2, RED);
  thickLine(x + 34, sy - 8, x + 42, sy + 7, 2, RED); thickLine(x + 42, sy + 7, x + 50, sy - 6, 2, RED);
  thickLine(x + 50, sy - 6, x + 58, sy + 5, 2, RED); thickLine(x + 58, sy + 5, x + 66, sy, 2, RED);
}
// Jerusalem
function illoJerusalem(x, y, w, h) {
  rect(x, y, w, h, rgb("#F2DFB8"));
  // gold dome
  rect(x + 78, y + 26, 40, 20, rgb("#E8D9A8"));
  ellipse(x + 98, y + 26, 22, 14, GOLD);
  line(x + 98, y + 6, x + 98, y + 12, GOLD); circle(x + 98, y + 6, 2, GOLD);
  // columns + wall
  rect(x + 8, y + 34, w - 16, 12, rgb("#D9C49A"));
  for (let i = 0; i < 5; i++) rect(x + 16 + i * 36, y + 22, 8, 24, WHITE);
  rect(x, y + 46, w, 8, rgb("#C9B48A"));
  // flag
  rect(x + 150, y + 8, 34, 20, WHITE);
  rect(x + 150, y + 8, 34, 4, rgb("#2E5EC6")); rect(x + 150, y + 24, 34, 4, rgb("#2E5EC6"));
  star(x + 167, y + 18, 5, rgb("#2E5EC6"), 6);
  line(x + 148, y + 8, x + 148, y + 46, INK);
  // cypress
  poly([[x + 40, y + 46], [x + 46, y + 22], [x + 52, y + 46]], GREEN);
}
// Kryvyi Rih
function illoKryvyi(x, y, w, h) {
  rect(x, y, w, h, rgb("#C9D4DC"));
  // damaged building
  poly([[x + 14, y + 46], [x + 14, y + 16], [x + 40, y + 10], [x + 52, y + 18], [x + 66, y + 12], [x + 66, y + 46]], rgb("#5A5A60"));
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) rect(x + 20 + c * 15, y + 22 + r * 9, 8, 5, YELLOW);
  poly([[x + 66, y + 46], [x + 84, y + 36], [x + 100, y + 46]], rgb("#7A6A58"));
  // missile + flame
  thickLine(x + 120, y + 8, x + 150, y + 30, 4, rgb("#3A3A40"));
  poly([[x + 148, y + 28], [x + 158, y + 22], [x + 156, y + 34]], ORANGE);
  circle(x + 118, y + 7, 4, ORANGE);
  // smoke
  circle(x + 88, y + 14, 8, rgb("#9AA0A8")); circle(x + 100, y + 8, 7, rgb("#B0B6BC"));
  // ambulance
  rect(x + 118, y + 34, 56, 14, WHITE); rect(x + 168, y + 38, 16, 10, WHITE);
  rect(x + 136, y + 30, 10, 4, RED); rect(x + 139, y + 27, 4, 10, RED);
  circle(x + 130, y + 48, 4, INK); circle(x + 160, y + 48, 4, INK); circle(x + 178, y + 48, 4, INK);
  circle(x + 140, y + 30, 2.5, rgb("#2E6AC6")); circle(x + 148, y + 30, 2.5, RED);
}
// Mexico
function illoMexico(x, y, w, h) {
  rect(x, y, w, h, rgb("#F2D9A0"));
  circle(x + 168, y + 10, 8, ORANGE);
  poly([[x + 4, y + 54], [x + 60, y + 26], [x + 110, y + 54]], rgb("#C9A05E"));
  poly([[x + 100, y + 54], [x + 160, y + 30], [x + 190, y + 54]], rgb("#B8904E"));
  // cactus
  rect(x + 14, y + 30, 6, 24, GREEN); rect(x + 8, y + 38, 6, 8, GREEN); rect(x + 20, y + 42, 6, 8, GREEN);
  // big handcuffs
  ring(x + 82, y + 30, 13, rgb("#8A9098"), 5); ring(x + 118, y + 30, 13, rgb("#8A9098"), 5);
  thickLine(x + 94, y + 26, x + 106, y + 26, 3, rgb("#6A7078"));
  circle(x + 82, y + 30, 3, INK); circle(x + 118, y + 30, 3, INK);
  // pickup
  rect(x + 128, y + 38, 56, 12, rgb("#2E4A6A")); rect(x + 148, y + 28, 26, 12, rgb("#2E4A6A"));
  rect(x + 152, y + 30, 10, 8, LIGHTSKY); rect(x + 164, y + 30, 8, 8, LIGHTSKY);
  circle(x + 140, y + 50, 5, INK); circle(x + 170, y + 50, 5, INK);
  // figure with raised hands
  circle(x + 62, y + 22, 5, rgb("#D9A06A"));
  poly([[x + 57, y + 28], [x + 67, y + 28], [x + 66, y + 46], [x + 58, y + 46]], rgb("#3A6AC6"));
  line(x + 58, y + 30, x + 52, y + 18, rgb("#D9A06A")); line(x + 66, y + 30, x + 72, y + 18, rgb("#D9A06A"));
}
// Hong Kong
function illoHK(x, y, w, h) {
  rect(x, y, w, h, rgb("#2A2A4A"));
  // skyline
  const towers = [[8, 30, 20], [32, 22, 24], [60, 34, 18], [82, 20, 26], [112, 28, 22], [138, 24, 20], [162, 32, 22]];
  for (const [tx, tw, th] of towers) {
    rect(x + tx, y + 54 - th, tw, th, rgb("#1A1A30"));
    for (let r = 0; r < Math.floor(th / 8); r++) for (let c = 0; c < Math.floor(tw / 7); c++)
      if ((r * 3 + c) % 2 === 0) rect(x + tx + 3 + c * 7, y + 54 - th + 4 + r * 8, 3, 4, YELLOW);
  }
  // red ballot box + check
  rect(x + 118, y + 26, 34, 20, RED); rect(x + 126, y + 22, 18, 5, INK);
  thickLine(x + 124, y + 36, x + 131, y + 42, 3, WHITE); thickLine(x + 131, y + 42, x + 146, y + 28, 3, WHITE);
  // neon sign dots
  circle(x + 30, y + 12, 2, rgb("#FF5A7A")); circle(x + 40, y + 12, 2, rgb("#5AD9E8")); circle(x + 50, y + 12, 2, YELLOW);
}
// Hormuz tankers
function illoHormuz(x, y, w, h) {
  rect(x, y, w, h, LIGHTSKY);
  rect(x, y + 32, w, h - 32, SEABLUE);
  const tanker = (tx, ty, s) => {
    poly([[x + tx, y + ty], [x + tx + 78 * s, y + ty], [x + tx + 70 * s, y + ty + 12], [x + tx + 6 * s, y + ty + 12]], rgb("#3A2A22"));
    rect(x + tx + 8, y + ty - 10, 16, 10, WHITE); rect(x + tx + 30, y + ty - 6, 30, 6, rgb("#8A9098"));
    circle(x + tx + 58, y + ty - 4, 3, RED);
  };
  tanker(10, 26, 1); tanker(104, 34, 0.9);
  // flames + smoke
  poly([[x + 30, y + 26], [x + 38, y + 10], [x + 46, y + 26]], ORANGE);
  poly([[x + 36, y + 26], [x + 39, y + 17], [x + 42, y + 26]], YELLOW);
  poly([[x + 128, y + 34], [x + 135, y + 20], [x + 142, y + 34]], ORANGE);
  circle(x + 40, y + 6, 7, rgb("#8A8A8A")); circle(x + 50, y + 3, 5, rgb("#AAAAAA"));
  circle(x + 136, y + 16, 6, rgb("#8A8A8A"));
  line(x + 8, y + 48, x + 40, y + 48, WHITE); line(x + 120, y + 50, x + 170, y + 50, WHITE);
}
// MQ-1 falling drone
function illoMQ1(x, y, w, h) {
  rect(x, y, w, h, rgb("#A8C4D8"));
  // smoke trail diagonal
  circle(x + 30, y + 10, 6, rgb("#8A8A8A")); circle(x + 48, y + 18, 8, rgb("#9AA0A8"));
  circle(x + 66, y + 26, 9, rgb("#AAAAAA")); circle(x + 84, y + 32, 8, rgb("#B0B6BC"));
  // falling drone tilted
  poly([[x + 96, y + 30], [x + 150, y + 40], [x + 146, y + 46], [x + 94, y + 38]], rgb("#3A3A40"));
  poly([[x + 118, y + 32], [x + 128, y + 22], [x + 134, y + 32]], rgb("#55555F"));
  poly([[x + 112, y + 38], [x + 106, y + 48], [x + 118, y + 40]], rgb("#55555F"));
  circle(x + 150, y + 43, 3, RED);
  // explosion below
  star(x + 130, y + 48, 10, ORANGE); circle(x + 130, y + 48, 5, YELLOW);
  // ground hint
  rect(x, y + 50, w, 4, rgb("#6A7A5A"));
}
// Brussels
function illoBrussels(x, y, w, h) {
  rect(x, y, w, h, rgb("#D7E6EE"));
  // EU building
  rect(x + 10, y + 14, 110, 34, rgb("#2E4A8A"));
  for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++)
    rect(x + 16 + c * 11, y + 19 + r * 10, 6, 6, YELLOW);
  // stars circle
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6 - Math.PI / 2;
    star(x + 148, y + 30, 2.5, YELLOW, 5);
    circle(x + 148 + 13 * Math.cos(a), y + 30 + 13 * Math.sin(a), 1.6, YELLOW);
  }
  circle(x + 148, y + 30, 3, rgb("#2E4A8A"));
  // document + red seal
  rect(x + 128, y + 30, 52, 20, WHITE); strokeRect(x + 128, y + 30, 52, 20, INK, 1);
  line(x + 132, y + 36, x + 166, y + 36, INK); line(x + 132, y + 41, x + 166, y + 41, INK); line(x + 132, y + 46, x + 154, y + 46, INK);
  circle(x + 172, y + 44, 8, RED); ring(x + 172, y + 44, 8, WHITE, 1);
  drawText(F.barBold, 7, x + 172, y + 46.5, "EU", WHITE, "center");
  rect(x, y + 48, w, 6, rgb("#8A9AA8"));
}
// Las Vegas F1
function illoVegas(x, y, w, h) {
  rect(x, y, w, h, DARKNAVY);
  // neon skyline
  const tw2 = [[6, 26, 18, rgb("#FF5A7A")], [28, 18, 22, rgb("#5AD9E8")], [54, 30, 16, YELLOW], [74, 20, 24, rgb("#7A5AD9")], [102, 28, 18, rgb("#5AD95A")], [124, 22, 20, rgb("#FF8A3A")], [148, 30, 18, rgb("#FF5AD9")], [170, 24, 16, rgb("#5AD9E8")]];
  for (const [tx, ty, th, cc] of tw2) { rect(x + tx, y + 54 - th, 16, th, rgb("#1E1E3A")); rect(x + tx, y + 54 - th, 16, 3, cc); }
  // checkered flag (left of the chip zone)
  rect(x + 78, y + 6, 28, 16, WHITE);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) if ((r + c) % 2 === 0) rect(x + 78 + c * 4, y + 6 + r * 4, 4, 4, INK);
  line(x + 78, y + 6, x + 78, y + 30, WHITE);
  // red F1 car
  poly([[x + 30, y + 44], [x + 46, y + 36], [x + 110, y + 36], [x + 138, y + 42], [x + 140, y + 46], [x + 30, y + 46]], RED);
  rect(x + 60, y + 30, 26, 8, RED); rect(x + 64, y + 32, 18, 5, LIGHTSKY);
  rect(x + 132, y + 30, 6, 12, INK); // rear wing
  rect(x + 30, y + 32, 8, 6, INK); // front wing
  circle(x + 52, y + 47, 6, INK); circle(x + 52, y + 47, 2.5, rgb("#8A8A8A"));
  circle(x + 118, y + 47, 6, INK); circle(x + 118, y + 47, 2.5, rgb("#8A8A8A"));
  // speed lines
  line(x + 8, y + 40, x + 24, y + 40, YELLOW); line(x + 12, y + 44, x + 26, y + 44, WHITE);
  rect(x, y + 50, w, 4, rgb("#3A3A4A"));
}
const ILLO_GRID = [illoSparta, illoPeru, illoJerusalem, illoKryvyi, illoMexico, illoHK, illoHormuz, illoMQ1, illoBrussels, illoVegas];
const ILLO_LEAD = [illoCOP31, illoDymer, illoBahrain];

// ---------------- Dotted world map ----------------
// [lat, [[lon0,lon1],...]] — coarse land mask, 4-degree lat rows
const LAND = [
  [78, [[-115, -85], [-58, -22], [8, 22], [95, 112]]],
  [74, [[-125, -95], [-58, -20], [35, 48], [100, 118], [155, 172]]],
  [70, [[-165, -140], [-130, -65], [-52, -20], [40, 52], [70, 180]]],
  [66, [[-165, -140], [-135, -90], [-85, -60], [5, 32], [40, 180]]],
  [62, [[-168, -140], [-135, -85], [-65, -55], [-22, -14], [5, 32], [40, 180]]],
  [58, [[-155, -140], [-130, -55], [-45, -32], [-5, 2], [5, 32], [40, 62], [140, 162]]],
  [54, [[-130, -65], [-5, 2], [0, 32], [32, 62], [62, 92], [140, 146]]],
  [50, [[-125, -65], [-10, 32], [32, 62], [62, 92], [135, 142]]],
  [46, [[-125, -65], [-5, 32], [32, 46], [46, 76], [76, 136], [130, 142]]],
  [42, [[-125, -65], [-10, 32], [25, 46], [46, 62], [62, 136], [130, 142]]],
  [38, [[-125, -65], [-10, 10], [15, 32], [25, 46], [46, 62], [62, 122], [126, 130], [130, 142]]],
  [34, [[-125, -65], [-10, 36], [36, 62], [62, 92], [92, 122], [130, 140]]],
  [30, [[-125, -80], [-10, 36], [36, 62], [62, 92], [92, 122]]],
  [26, [[-115, -80], [-15, 36], [36, 62], [62, 92], [92, 110]]],
  [22, [[-110, -85], [-15, 36], [40, 60], [68, 92], [95, 110]]],
  [18, [[-100, -85], [-15, 36], [40, 56], [75, 80], [95, 110]]],
  [14, [[-95, -80], [-15, 40], [40, 56], [75, 80], [95, 106]]],
  [10, [[-90, -75], [-15, 50], [75, 80], [95, 106]]],
  [6, [[-80, -55], [-10, 45], [95, 106]]],
  [2, [[-80, -50], [-10, 40], [95, 106], [110, 120]]],
  [-2, [[-80, -35], [-10, 40], [105, 115], [130, 146]]],
  [-6, [[-80, -35], [-10, 40], [105, 115], [130, 148]]],
  [-10, [[-75, -35], [-10, 40], [110, 120], [130, 148]]],
  [-14, [[-75, -35], [-10, 40], [130, 148], [142, 143]]],
  [-18, [[-70, -40], [-10, 40], [44, 50], [130, 150]]],
  [-22, [[-70, -40], [-10, 35], [44, 50], [130, 150]]],
  [-26, [[-70, -40], [-15, 35], [130, 150]]],
  [-30, [[-70, -40], [-15, 33], [130, 150]]],
  [-34, [[-70, -40], [-18, 28], [145, 150], [172, 178]]],
  [-38, [[-70, -40], [167, 178]]],
  [-42, [[-70, -40], [167, 175]]],
  [-46, [[-70, -40], [167, 172]]],
  [-50, [[-70, -65]]],
  [-54, [[-70, -65]]],
];
// pins: [lon, lat, dx, dy] display offset in px (leader line from true point)
const PINS = [
  [30.7, 36.9, -4, 8],     // 1 Antalya
  [30.3, 50.8, -6, -10],   // 2 Dymer
  [50.6, 26.2, 6, 10],     // 3 Bahrain
  [25.0, 59.8, -14, -8],   // 4 Gulf of Finland
  [-77.0, -12.0, 0, 0],    // 5 Peru
  [35.2, 31.8, 13, 11],    // 6 Jerusalem
  [33.4, 47.9, 12, -10],   // 7 Kryvyi Rih
  [-107.0, 25.0, 0, 0],    // 8 Sinaloa
  [114.2, 22.3, 0, 0],     // 9 Hong Kong
  [56.5, 26.5, 10, -10],   // 10 Hormuz
  [57.5, 25.5, 16, 4],     // 11 Hormuz MQ-1
  [4.35, 50.85, 0, 0],     // 12 Brussels
  [45.3, 2.0, 8, 13],      // 13 Mogadishu
  [34.5, 31.5, -28, 19],   // 14 Gaza
  [-115.1, 36.2, 0, 0],    // 15 Las Vegas
];
const MAP_LEGEND = "1 ANTALYA \u00B7 2 DYMER \u00B7 3 BAHRAIN \u00B7 4 GULF OF FINLAND \u00B7 5 PERU \u00B7 6 JERUSALEM \u00B7 7 KRYVYI RIH \u00B7 8 SINALOA \u00B7 9 HONG KONG \u00B7 10 HORMUZ \u00B7 11 HORMUZ (MQ-1) \u00B7 12 BRUSSELS \u00B7 13 MOGADISHU \u00B7 14 GAZA \u00B7 15 LAS VEGAS";
function drawMap(x, y, w, h) {
  // panel title handled by caller; here: dots + pins inside (x,y,w,h)
  const dotC = rgb("#33475E");
  const latTop = 78, latBot = -58;
  for (const [lat, ivs] of LAND) {
    const py = y + (latTop - lat) / (latTop - latBot) * h;
    for (let lon = -178.5; lon < 180; lon += 3) {
      for (const [a, b] of ivs) {
        if (lon >= a && lon <= b) { circle(x + (lon + 180) / 360 * w, py, 1.3, dotC); break; }
      }
    }
  }
  const proj = (lon, lat) => [x + (lon + 180) / 360 * w, y + (latTop - lat) / (latTop - latBot) * h];
  for (let i = 0; i < PINS.length; i++) {
    const [lon, lat, dx, dy] = PINS[i];
    const [tx, ty] = proj(lon, lat);
    const cx = tx + dx, cy = ty + dy;
    if (dx !== 0 || dy !== 0) {
      circle(tx, ty, 2, RED);
      line(Math.round(tx), Math.round(ty), Math.round(cx), Math.round(cy), GREY);
    }
    circle(cx, cy, 6.5, RED);
    ring(cx, cy, 6.5, WHITE, 1);
    drawText(F.barBold, 9, cx, cy + 3.2, String(i + 1), WHITE, "center");
  }
}

// ---------------- Layout ----------------
fillAll(CREAM);
const MX = 16, RX = 1008, CW = 992;

// top navy bar
rect(0, 0, W, 23, NAVY);
drawText(F.barSemi, 13, MX, 17, "THE WORLD IN ONE DAY \u2014 FULL-DAY EDITION", WHITE);
drawText(F.barSemi, 13, RX, 17, "36 STORIES \u2013 7 REGIONS \u2013 SUNDAY 22 NOVEMBER 2026", WHITE, "right");

// masthead
drawText(F.playBlack, 46, 512, 68, "Sunday 22 November 2026", INK, "center");
hline(MX, RX, 78, RED);
drawText(F.barSemi, 15.5, 512, 92, "186 drones over Ukraine overnight \u2014 COP31 ends with no deal \u2014 Iran\u2019s radar claim meets Bahrain\u2019s denial", RED, "center");
hline(MX, RX, 99, RED);

// stats strip: 6 numbers
const STATS = [
  ["186", "drones at Ukraine overnight"], ["10", "Dymer dead, at least"], ["2", "US radars claimed hit"],
  ["723", "Hong Kong seats filled"], ["98.5%", "tariffs removed, EU\u2013Indonesia"], ["$7.25bn", "Roundup settlement"],
];
for (let i = 0; i < 6; i++) {
  const cx = MX + CW * (i + 0.5) / 6;
  drawText(F.playBold, 30, cx, 128, STATS[i][0], RED, "center");
  drawText(F.barReg, 11, cx, 144, STATS[i][1], INK, "center");
  if (i > 0) vline(MX + CW * i / 6, 106, 146, LGREY);
}

// timeline bar
rect(0, 150, W, 20, NAVY);
drawText(F.barBold, 12, 24, 164.5, "THE DAY IN UTC", RED, "left");
drawText(F.barReg, 12.5, 569, 164.5, "03:00 COP31 objections due \u00B7 05:30 Verstappen wins Vegas \u00B7 06:00 COP31 plenary (no deal) \u00B7 MORNING Dymer strike \u00B7 EVENING Hong Kong results \u00B7 NIGHT COP31 collapses", WHITE, "center");

// leads
const LEAD_X = [16, 351, 686], LEAD_W = 321;
for (let i = 0; i < 3; i++) {
  const L = LEADS[i], x = LEAD_X[i];
  ILLO_LEAD[i](x, 173, LEAD_W, 68);
  chip(x, 173, LEAD_W, 13, L.chip, L.chipBg, L.chipFg, 9.5);
  badge(x, 173, L.n);
  drawText(F.barSemi, 12.5, x, 256, L.kicker, RED);
  const hl = wrapText(F.playBold, 19.5, L.head, LEAD_W);
  drawLines(F.playBold, 19.5, x, 277, hl.slice(0, 2), INK, 21);
  const bl = wrapText(F.barReg, 12.5, L.body, LEAD_W);
  drawLines(F.barReg, 12.5, x, 312, bl.slice(0, 4), INK, 14);
}

// grid rows
const COL_X = [16, 216, 416, 616, 816], COL_W = 192;
function gridRow(items, illoY) {
  for (let i = 0; i < 5; i++) {
    const G = items[i], x = COL_X[i];
    ILLO_GRID[G.n - 4](x, illoY, COL_W, 52);
    chip(x, illoY, COL_W, 12, G.chip, G.chipBg, G.chipFg, 8.5);
    badge(x, illoY, G.n);
    drawText(F.barSemi, 10.5, x, illoY + 65, G.kicker, RED);
    const hl = wrapText(F.playBold, 13, G.head, COL_W);
    drawLines(F.playBold, 13, x, illoY + 80, hl.slice(0, 2), INK, 15);
    const bl = wrapText(F.barReg, 11, G.body, COL_W);
    drawLines(F.barReg, 11, x, illoY + 108, bl.slice(0, 3), INK, 12.5);
  }
}
gridRow(GRID.slice(0, 5), 363);
gridRow(GRID.slice(5, 10), 504);

// ALSO IN — 2 columns; right column (26-36) left edge = card 11 left edge (x=416)
hline(MX, RX, 646, RED);
drawText(F.barBold, 13, MX, 662, "ALSO IN SUNDAY\u2019S FULL-DAY WIRES \u2014 23 MORE STORIES", RED);
{
  let y = 678;
  for (let i = 0; i < 12; i++) {
    const nL = 14 + i, nR = 26 + i;
    const numW = F.barBold.widthOf(String(nL) + "  ", 10);
    const lLines = wrapText(F.barReg, 10, WIRES_LEFT[i], 384 - numW);
    const rLines = nR <= 36 ? wrapText(F.barReg, 10, WIRES_RIGHT[i], 592 - F.barBold.widthOf(String(nR) + "  ", 10)) : [];
    const rows = Math.max(lLines.length, rLines.length);
    for (let k = 0; k < rows; k++) {
      const by = y + k * 10.5 + 9;
      if (k < lLines.length) {
        drawText(F.barBold, 10, MX, by, String(nL), RED);
        drawText(F.barReg, 10, MX + numW, by, lLines[k], INK);
      }
      if (k < rLines.length) {
        const numWR = F.barBold.widthOf(String(nR) + "  ", 10);
        drawText(F.barBold, 10, 416, by, String(nR), RED);
        drawText(F.barReg, 10, 416 + numWR, by, rLines[k], INK);
      }
    }
    y += rows * 10.5;
  }
  var alsoEnd = y;
}
console.error("ALSO IN ends at y=" + alsoEnd.toFixed(1));

// bottom row: map (left) + DATE CHECK (right), same height
const BOT_Y = Math.ceil(alsoEnd) + 4, BOT_H = 950 - BOT_Y;
console.error("Bottom row y=" + BOT_Y + " h=" + BOT_H);
// map panel
drawText(F.barBold, 13, MX, BOT_Y + 14, "WHERE IT HAPPENED", RED);
drawText(F.barReg, 10, 616, BOT_Y + 14, "pins = story numbers", GREY, "right");
drawMap(24, BOT_Y + 20, 584, BOT_H - 40);
drawText(F.barReg, 9, MX, 944, MAP_LEGEND, INK);
// DATE CHECK panel
strokeRect(624, BOT_Y, 384, BOT_H, RED, 2);
drawText(F.barBold, 13, 636, BOT_Y + 16, "DATE CHECK", RED);
{
  const tw = F.barBold.widthOf("FULL-DAY EDITION", 9) + 10;
  rect(1008 - 12 - tw, BOT_Y + 6, tw, 14, RED);
  drawText(F.barBold, 9, 1008 - 12 - tw / 2, BOT_Y + 16.5, "FULL-DAY EDITION", WHITE, "center");
}
{
  const dcLines = wrapText(F.barReg, 11.5, DATE_CHECK_BODY, 360);
  drawLines(F.barReg, 11.5, 636, BOT_Y + 34, dcLines, INK, 14);
  console.error("DATE CHECK lines=" + dcLines.length);
}

// footer
drawText(F.barReg, 10, MX, 962, FOOTER_SRC, INK);
{
  const cs = F.barReg.widthOf(FOOTER_CERT, 10) <= CW ? 10 : 9.5;
  drawText(F.barReg, cs, MX, 976, FOOTER_CERT, INK);
}
// bottom navy bar
rect(0, 984, W, 40, NAVY);
drawText(F.barSemi, 13, MX, 1010, "THE WORLD IN ONE DAY", WHITE);
drawText(F.barSemi, 13, RX, 1010, "SUNDAY 22 NOVEMBER 2026 \u00B7 ONE PAGE", WHITE, "right");

writeFileSync(outPath, encodePNG(px, W, H));
console.error("wrote " + outPath);
