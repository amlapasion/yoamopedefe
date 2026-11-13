/* YO AMO EL PEDEFE · Editor PDF · códec TIFF (lectura: sin compresión, PackBits, LZW, Deflate; RGB/gris/paleta, 8/16 bits; escritura RGBA sin pérdida) */
(function () {
  'use strict';
  async function inflate(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Deflate no soportado en este navegador');
    const ds = new DecompressionStream('deflate'); const out = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer(); return new Uint8Array(out);
  }
  function lzw(input, expected) {
    const out = new Uint8Array(expected); let op = 0; let dict = []; let bitPos = 0, codeLen = 9;
    const reset = () => { dict = []; for (let i = 0; i < 256; i++) dict.push([i]); dict.push(null, null); codeLen = 9; };
    const read = () => { let v = 0; for (let i = 0; i < codeLen; i++) { const byte = input[(bitPos + i) >> 3]; v = (v << 1) | ((byte >> (7 - ((bitPos + i) & 7))) & 1); } bitPos += codeLen; return v; };
    reset(); let old = null;
    while ((bitPos + codeLen) <= input.length * 8 && op < expected) {
      const code = read(); if (code === 257) break;
      if (code === 256) { reset(); old = null; continue; }
      let entry;
      if (code < dict.length && dict[code]) entry = dict[code]; else if (old) entry = old.concat([old[0]]); else break;
      for (let i = 0; i < entry.length && op < expected; i++) out[op++] = entry[i];
      if (old) dict.push(old.concat([entry[0]]));
      old = entry;
      if (dict.length + 1 >= (1 << codeLen) && codeLen < 12) codeLen++;
    }
    return out;
  }
  function packbits(input, expected) { const out = new Uint8Array(expected); let i = 0, o = 0; while (i < input.length && o < expected) { let n = input[i++]; if (n > 127) n -= 256; if (n >= 0) { for (let k = 0; k <= n && o < expected; k++) out[o++] = input[i++]; } else if (n !== -128) { const v = input[i++]; for (let k = 0; k < 1 - n && o < expected; k++) out[o++] = v; } } return out; }

  async function decode(buf) {
    const b = new Uint8Array(buf); const dv = new DataView(buf); const le = b[0] === 0x49;
    const u16 = (o) => dv.getUint16(o, le), u32 = (o) => dv.getUint32(o, le);
    let ifd = u32(4); const pages = []; let guard = 0;
    while (ifd && guard++ < 64) {
      const n = u16(ifd); const tags = {};
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12; const tag = u16(e), type = u16(e + 2), cnt = u32(e + 4);
        const sz = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 }[type] || 1; const off = cnt * sz > 4 ? u32(e + 8) : e + 8;
        const vals = []; for (let k = 0; k < Math.min(cnt, 1 << 20); k++) { const p = off + k * sz; vals.push(type === 3 ? u16(p) : type === 4 ? u32(p) : type === 5 ? u32(p) / (u32(p + 4) || 1) : b[p]); }
        tags[tag] = vals;
      }
      pages.push(tags); ifd = u32(ifd + 2 + n * 12);
    }
    const out = [];
    for (const t of pages) {
      const W = t[256][0], H = t[257][0]; const bps = (t[258] || [1])[0]; const comp = (t[259] || [1])[0]; const photo = (t[262] || [2])[0]; const spp = (t[277] || [1])[0]; const pred = (t[317] || [1])[0];
      const planar = (t[284] || [1])[0]; if (planar !== 1) throw new Error('TIFF planar no compatible');
      if (![1, 8, 16].includes(bps)) throw new Error('TIFF de ' + bps + ' bits no compatible');
      const tiled = !!t[322]; const offs = tiled ? t[324] : t[273], cnts = tiled ? t[325] : t[279];
      const tw = tiled ? t[322][0] : W, th = tiled ? t[323][0] : ((t[278] || [H])[0]);
      const rowBytes = Math.ceil(tw * spp * bps / 8); const chunkBytes = rowBytes * th;
      const c = FP.canvas(W, H); const cx = c.getContext('2d'); const img = cx.createImageData(W, H); const px = img.data;
      const across = tiled ? Math.ceil(W / tw) : 1;
      for (let k = 0; k < offs.length; k++) {
        let raw = b.subarray(offs[k], offs[k] + cnts[k]); let data;
        if (comp === 1) data = raw; else if (comp === 32773) data = packbits(raw, chunkBytes); else if (comp === 5) data = lzw(raw, chunkBytes); else if (comp === 8 || comp === 32946) data = await inflate(raw);
        else if (comp === 7) { throw new Error('TIFF con compresión JPEG no compatible'); } else throw new Error('Compresión TIFF ' + comp + ' no compatible');
        if (pred === 2 && bps === 8) for (let y = 0; y < th; y++) for (let x = spp; x < rowBytes; x++) data[y * rowBytes + x] = (data[y * rowBytes + x] + data[y * rowBytes + x - spp]) & 255;
        const ox = tiled ? (k % across) * tw : 0, oy = tiled ? Math.floor(k / across) * th : k * th;
        for (let y = 0; y < th; y++) { const Y = oy + y; if (Y >= H) break; for (let x = 0; x < tw; x++) { const X = ox + x; if (X >= W) continue; const o = (Y * W + X) * 4;
          const get = (s) => { if (bps === 8) return data[y * rowBytes + x * spp + s]; if (bps === 16) { const p = y * rowBytes + (x * spp + s) * 2; return le ? data[p + 1] : data[p]; } const bit = x * spp + s; return ((data[y * rowBytes + (bit >> 3)] >> (7 - (bit & 7))) & 1) * 255; };
          if (photo === 2) { px[o] = get(0); px[o + 1] = get(1); px[o + 2] = get(2); px[o + 3] = spp > 3 ? get(3) : 255; }
          else if (photo === 3) { const cm = t[320]; const idx = bps === 8 ? data[y * rowBytes + x] : get(0) ? 1 : 0; const n = 1 << bps; px[o] = cm[idx] >> 8; px[o + 1] = cm[n + idx] >> 8; px[o + 2] = cm[2 * n + idx] >> 8; px[o + 3] = 255; }
          else if (photo === 5) { const C = get(0), M = get(1), Yy = get(2), K = get(3); px[o] = 255 - Math.min(255, C + K); px[o + 1] = 255 - Math.min(255, M + K); px[o + 2] = 255 - Math.min(255, Yy + K); px[o + 3] = 255; }
          else { let v = get(0); if (photo === 0) v = 255 - v; px[o] = px[o + 1] = px[o + 2] = v; px[o + 3] = spp > 1 ? get(1) : 255; }
        } }
      }
      cx.putImageData(img, 0, 0); out.push({ canvas: c, width: W, height: H });
    }
    return out;
  }
  /** Codifica RGBA sin compresión (o RGB si opaco). dpi opcional */
  function encode(canvas, dpi) {
    const W = canvas.width, H = canvas.height; const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    let opaque = true; for (let i = 3; i < d.length; i += 4) if (d[i] < 255) { opaque = false; break; }
    const spp = opaque ? 3 : 4; const dataLen = W * H * spp;
    const nTags = opaque ? 12 : 13; const ifdOff = 8; const ifdLen = 2 + nTags * 12 + 4; const bpsOff = ifdOff + ifdLen, resOff = bpsOff + 8, dataOff = resOff + 16;
    const buf = new ArrayBuffer(dataOff + dataLen); const dv = new DataView(buf); const b = new Uint8Array(buf);
    b[0] = b[1] = 0x49; dv.setUint16(2, 42, true); dv.setUint32(4, ifdOff, true);
    let p = ifdOff; dv.setUint16(p, nTags, true); p += 2;
    const tag = (id, type, cnt, val) => { dv.setUint16(p, id, true); dv.setUint16(p + 2, type, true); dv.setUint32(p + 4, cnt, true); if (type === 3 && cnt === 1) dv.setUint16(p + 8, val, true); else dv.setUint32(p + 8, val, true); p += 12; };
    tag(256, 4, 1, W); tag(257, 4, 1, H); tag(258, 3, spp, bpsOff); tag(259, 3, 1, 1); tag(262, 3, 1, 2); tag(273, 4, 1, dataOff); tag(277, 3, 1, spp); tag(278, 4, 1, H); tag(279, 4, 1, dataLen); tag(282, 5, 1, resOff); tag(283, 5, 1, resOff + 8); tag(296, 3, 1, 2);
    if (!opaque) tag(338, 3, 1, 2);
    dv.setUint32(p, 0, true);
    for (let i = 0; i < spp; i++) dv.setUint16(bpsOff + i * 2, 8, true);
    const r = Math.round(dpi || 72); dv.setUint32(resOff, r, true); dv.setUint32(resOff + 4, 1, true); dv.setUint32(resOff + 8, r, true); dv.setUint32(resOff + 12, 1, true);
    let o = dataOff; for (let i = 0; i < W * H; i++) { b[o++] = d[i * 4]; b[o++] = d[i * 4 + 1]; b[o++] = d[i * 4 + 2]; if (!opaque) b[o++] = d[i * 4 + 3]; }
    return new Blob([buf], { type: 'image/tiff' });
  }
  window.FPTiff = { decode, encode };
})();
