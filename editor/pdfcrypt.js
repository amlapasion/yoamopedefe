/* YO AMO EL PEDEFE · Editor PDF · pdfcrypt.js
 * Cifrado y descifrado real de PDF (Standard Security Handler) sobre pdf-lib.
 *  - Descifrado: RC4 40/128 (R2/R3), AES-128 (R4) y AES-256 (R5/R6), con contraseña de usuario o de propietario.
 *  - Cifrado: AES-256 (V5/R6), el estándar actual (PDF 2.0 / Acrobat X+).
 * Requiere: PDFLib (pdf-lib) y WebCrypto (crypto.subtle).
 */
(function (root) {
  'use strict';
  const L = () => root.PDFLib;
  const subtle = () => (root.crypto || globalThis.crypto).subtle;
  const rnd = (n) => { const a = new Uint8Array(n); (root.crypto || globalThis.crypto).getRandomValues(a); return a; };
  const PAD = new Uint8Array([0x28,0xBF,0x4E,0x5E,0x4E,0x75,0x8A,0x41,0x64,0x00,0x4E,0x56,0xFF,0xFA,0x01,0x08,0x2E,0x2E,0x00,0xB6,0xD0,0x68,0x3E,0x80,0x2F,0x0C,0xA9,0xFE,0x64,0x53,0x69,0x7A]);

  function concat(...arrs) { let n = 0; arrs.forEach(a => n += a.length); const o = new Uint8Array(n); let p = 0; arrs.forEach(a => { o.set(a, p); p += a.length; }); return o; }
  function eq(a, b, n) { n = n || Math.min(a.length, b.length); for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false; return true; }
  const utf8 = (s) => new TextEncoder().encode(s || '');
  function latin1(s) { const o = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i) & 255; return o; }

  /* ---------- MD5 ---------- */
  function md5(data) {
    const K = new Int32Array(64), S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
    for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
    const len = data.length, nb = ((len + 8) >>> 6) + 1, buf = new Uint8Array(nb * 64);
    buf.set(data); buf[len] = 0x80; const bits = len * 8;
    buf[nb * 64 - 8] = bits & 255; buf[nb * 64 - 7] = (bits >>> 8) & 255; buf[nb * 64 - 6] = (bits >>> 16) & 255; buf[nb * 64 - 5] = (bits >>> 24) & 255;
    buf[nb * 64 - 4] = Math.floor(len / 536870912) & 255;
    let a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476; const M = new Int32Array(16);
    for (let o = 0; o < buf.length; o += 64) {
      for (let j = 0; j < 16; j++) M[j] = buf[o + j * 4] | (buf[o + j * 4 + 1] << 8) | (buf[o + j * 4 + 2] << 16) | (buf[o + j * 4 + 3] << 24);
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; } else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; } else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        F = (F + A + K[i] + M[g]) | 0; A = D; D = C; C = B; B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) | 0;
      }
      a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
    }
    const out = new Uint8Array(16);
    [a0, b0, c0, d0].forEach((v, i) => { out[i * 4] = v & 255; out[i * 4 + 1] = (v >>> 8) & 255; out[i * 4 + 2] = (v >>> 16) & 255; out[i * 4 + 3] = (v >>> 24) & 255; });
    return out;
  }
  /* ---------- RC4 ---------- */
  function rc4(key, data) {
    const s = new Uint8Array(256); for (let i = 0; i < 256; i++) s[i] = i;
    for (let i = 0, j = 0; i < 256; i++) { j = (j + s[i] + key[i % key.length]) & 255; const t = s[i]; s[i] = s[j]; s[j] = t; }
    const out = new Uint8Array(data.length);
    for (let k = 0, i = 0, j = 0; k < data.length; k++) { i = (i + 1) & 255; j = (j + s[i]) & 255; const t = s[i]; s[i] = s[j]; s[j] = t; out[k] = data[k] ^ s[(s[i] + s[j]) & 255]; }
    return out;
  }
  /* ---------- AES via WebCrypto ---------- */
  async function aesKey(raw) { return subtle().importKey('raw', raw, { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']); }
  async function aesCbcEnc(key, iv, data, pad) { // pad=false → data múltiplo de 16, sin relleno
    const k = await aesKey(key); const r = new Uint8Array(await subtle().encrypt({ name: 'AES-CBC', iv }, k, data));
    return pad ? r : r.slice(0, data.length);
  }
  async function aesCbcDecNoPad(key, iv, data) {
    const k = await aesKey(key); const last = data.slice(data.length - 16);
    const extra = (await aesCbcEnc(key, last, new Uint8Array(16).fill(16), false));
    return new Uint8Array(await subtle().decrypt({ name: 'AES-CBC', iv }, k, concat(data, extra)));
  }
  async function aesDecPadded(key, data) { // IV en los 16 primeros bytes
    if (data.length < 32 || data.length % 16) { if (data.length === 16) return new Uint8Array(0); }
    const k = await aesKey(key);
    try { return new Uint8Array(await subtle().decrypt({ name: 'AES-CBC', iv: data.slice(0, 16) }, k, data.slice(16))); }
    catch (e) { // relleno inválido: devolver sin quitar relleno
      return aesCbcDecNoPad(key, data.slice(0, 16), data.slice(16, 16 + Math.floor((data.length - 16) / 16) * 16));
    }
  }
  async function aesEncPadded(key, data) { const iv = rnd(16); return concat(iv, await aesCbcEnc(key, iv, data, true)); }
  const sha = async (alg, d) => new Uint8Array(await subtle().digest(alg, d));

  /* ---------- Hash 2.B (R6) ---------- */
  async function hash2B(pw, salt, udata, rev) {
    let K = await sha('SHA-256', concat(pw, salt, udata));
    if (rev === 5) return K;
    let i = 0, E;
    while (true) {
      const K1 = concat(pw, K, udata); const rep = new Uint8Array(K1.length * 64); for (let j = 0; j < 64; j++) rep.set(K1, j * K1.length);
      E = await aesCbcEnc(K.slice(0, 16), K.slice(16, 32), rep, false);
      let m = 0; for (let j = 0; j < 16; j++) m += E[j]; m %= 3;
      K = await sha(m === 0 ? 'SHA-256' : m === 1 ? 'SHA-384' : 'SHA-512', E);
      i++;
      if (i >= 64 && E[E.length - 1] <= i - 32) break;
    }
    return K.slice(0, 32);
  }
  const pw127 = (p) => utf8((p || '').normalize ? (p || '').normalize('NFKC') : p).slice(0, 127);

  /* ---------- utilidades pdf-lib ---------- */
  function strBytes(o) { const { PDFHexString, PDFString } = L(); if (o instanceof PDFHexString || o instanceof PDFString) return o.asBytes(); return null; }
  function getEncryptInfo(ctx) {
    const { PDFDict, PDFName, PDFArray, PDFNumber, PDFBool } = L();
    const encRef = ctx.trailerInfo.Encrypt; if (!encRef) return null;
    const enc = ctx.lookup(encRef, PDFDict);
    const g = (n) => enc.lookup(PDFName.of(n));
    const num = (n, d) => { const v = g(n); return v instanceof PDFNumber ? v.asNumber() : d; };
    const filter = g('Filter'); if (filter && filter.asString && filter.asString() !== '/Standard') throw new Error('Este PDF usa un sistema de cifrado no estándar (' + filter.asString() + ') que no se puede abrir en el navegador.');
    const info = { V: num('V', 0), R: num('R', 2), Length: num('Length', 40), P: num('P', 0), O: strBytes(g('O')), U: strBytes(g('U')), OE: strBytes(g('OE')), UE: strBytes(g('UE')), encRef, encryptMetadata: true, cfm: 'V2' };
    const em = g('EncryptMetadata'); if (em instanceof PDFBool && em.asBoolean() === false) info.encryptMetadata = false;
    if (info.V >= 4) {
      const cf = g('CF'); const stmf = g('StmF'); let cfm = 'None';
      if (cf instanceof PDFDict && stmf) { const sub = cf.lookup(stmf); if (sub instanceof PDFDict) { const c = sub.lookup(PDFName.of('CFM')); if (c) cfm = c.asString().slice(1); const ln = sub.lookup(PDFName.of('Length')); if (ln instanceof PDFNumber && info.V === 4) info.Length = ln.asNumber() <= 32 ? ln.asNumber() * 8 : ln.asNumber(); } }
      if (stmf && stmf.asString && stmf.asString() === '/Identity') cfm = 'None';
      info.cfm = cfm;
    }
    const id = ctx.trailerInfo.ID; let id0 = new Uint8Array(0);
    if (id) { const arr = ctx.lookup(id); if (arr instanceof PDFArray) id0 = strBytes(arr.lookup(0)) || id0; }
    info.ID0 = id0;
    return info;
  }

  async function computeKey(info, password) {
    const R = info.R;
    if (R >= 5) {
      const p = pw127(password); const U = info.U, O = info.O;
      // propietario
      if (eq(await hash2B(p, O.slice(32, 40), U.slice(0, 48), R), O.slice(0, 32), 32)) {
        const ik = await hash2B(p, O.slice(40, 48), U.slice(0, 48), R); return { key: await aesCbcDecNoPad(ik, new Uint8Array(16), info.OE.slice(0, 32)), owner: true };
      }
      if (eq(await hash2B(p, U.slice(32, 40), new Uint8Array(0), R), U.slice(0, 32), 32)) {
        const ik = await hash2B(p, U.slice(40, 48), new Uint8Array(0), R); return { key: await aesCbcDecNoPad(ik, new Uint8Array(16), info.UE.slice(0, 32)), owner: false };
      }
      return null;
    }
    const n = R === 2 ? 5 : Math.floor(info.Length / 8);
    const padPw = (pwb) => concat(pwb.slice(0, 32), PAD.slice(0, 32 - Math.min(32, pwb.length)));
    const userKey = (pwb) => {
      const P = info.P; const pb = new Uint8Array([P & 255, (P >> 8) & 255, (P >> 16) & 255, (P >> 24) & 255]);
      let h = md5(concat(padPw(pwb), info.O.slice(0, 32), pb, info.ID0, (R >= 4 && !info.encryptMetadata) ? new Uint8Array([255, 255, 255, 255]) : new Uint8Array(0)));
      if (R >= 3) for (let i = 0; i < 50; i++) h = md5(h.slice(0, n));
      return h.slice(0, n);
    };
    const checkUser = (key) => {
      if (R === 2) return eq(rc4(key, PAD), info.U, 32);
      let x = rc4(key, md5(concat(PAD, info.ID0)));
      for (let i = 1; i <= 19; i++) x = rc4(key.map(b => b ^ i), x);
      return eq(x, info.U, 16);
    };
    const pwb = latin1(password || '');
    let k = userKey(pwb); if (checkUser(k)) return { key: k, owner: false };
    // contraseña de propietario
    let h = md5(padPw(pwb)); if (R >= 3) for (let i = 0; i < 50; i++) h = md5(h); const ok = h.slice(0, n);
    let up = info.O.slice(0, 32);
    if (R === 2) up = rc4(ok, up); else for (let i = 19; i >= 0; i--) up = rc4(ok.map(b => b ^ i), up);
    k = userKey(up); if (checkUser(k)) return { key: k, owner: true };
    return null;
  }

  function objKey(info, fileKey, num, gen) {
    if (info.R >= 5) return fileKey;
    const aes = info.cfm === 'AESV2';
    const h = md5(concat(fileKey, new Uint8Array([num & 255, (num >> 8) & 255, (num >> 16) & 255, gen & 255, (gen >> 8) & 255]), aes ? new Uint8Array([0x73, 0x41, 0x6C, 0x54]) : new Uint8Array(0)));
    return h.slice(0, Math.min(fileKey.length + 5, 16));
  }
  async function decBytes(info, key, data) {
    if (info.cfm === 'None') return data;
    if (info.R >= 5 || info.cfm === 'AESV2' || info.cfm === 'AESV3') return aesDecPadded(key, data);
    return rc4(key, data);
  }

  /* Recorre un objeto y sustituye cadenas aplicando fn (async) */
  async function mapStrings(obj, fn) {
    const { PDFDict, PDFArray, PDFHexString, PDFString, PDFRawStream } = L();
    if (obj instanceof PDFHexString || obj instanceof PDFString) return PDFHexString.of(toHex(await fn(obj.asBytes())));
    if (obj instanceof PDFArray) { for (let i = 0; i < obj.size(); i++) { const v = obj.get(i); const nv = await mapStrings(v, fn); if (nv !== v) obj.set(i, nv); } return obj; }
    if (obj instanceof PDFDict) { for (const [k, v] of obj.entries()) { const nv = await mapStrings(v, fn); if (nv !== v) obj.set(k, nv); } return obj; }
    if (obj && obj.dict instanceof PDFDict) { await mapStrings(obj.dict, fn); return obj; }
    return obj;
  }
  function toHex(b) { let s = ''; for (let i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16); return s; }

  /** ¿Está cifrado? (sin cargar todo) */
  async function isEncrypted(bytes) {
    const { PDFParser, PDFContext } = L();
    try { const ctx = await parseRaw(bytes, null); return !!ctx.trailerInfo.Encrypt; } catch (e) { return false; }
  }
  async function parseRaw(bytes, hook) {
    const { PDFParser, PDFObjectStreamParser } = L();
    const orig = PDFObjectStreamParser.forStream; const origHdr = PDFParser.prototype.parseIndirectObjectHeader;
    let lastRef = null; const fromObjStm = new Set();
    PDFParser.prototype.parseIndirectObjectHeader = function () { lastRef = origHdr.call(this); return lastRef; };
    const pending = [];
    PDFObjectStreamParser.forStream = function (stream, tick) {
      if (!hook) return orig.call(this, stream, tick);
      pending.push({ stream, ref: lastRef });
      return { parseIntoContext: async () => { } };
    };
    let ctx;
    try {
      const parser = PDFParser.forBytesWithOptions(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), 100000, false, false);
      ctx = await parser.parseDocument();
    } finally { PDFObjectStreamParser.forStream = orig; PDFParser.prototype.parseIndirectObjectHeader = origHdr; }
    for (const { stream, ref } of pending) {
      try {
        stream.contents = await hook(stream, ref);
        const before = new Set(ctx.enumerateIndirectObjects().map(([r]) => r.tag));
        await orig.call(PDFObjectStreamParser, stream, false).parseIntoContext();
        ctx.enumerateIndirectObjects().forEach(([r]) => { if (!before.has(r.tag)) fromObjStm.add(r.tag); });
      } catch (e) { console.warn('ObjStm', e); }
    }
    ctx.__fromObjStm = fromObjStm; return ctx;
  }

  /**
   * Descifra un PDF y devuelve bytes sin cifrar. Lanza 'PASSWORD' si la contraseña no es válida.
   */
  async function decrypt(bytes, password) {
    const { PDFDocument, PDFRawStream, PDFName } = L();
    const pre = await parseRaw(bytes, null);
    const info = getEncryptInfo(pre); if (!info) return bytes;
    const res = await computeKey(info, password);
    if (!res) { const e = new Error('Contraseña incorrecta'); e.code = 'PASSWORD'; throw e; }
    const fk = res.key;
    const ctx = await parseRaw(bytes, async (stream, ref) => decBytes(info, objKey(info, fk, ref.objectNumber, ref.generationNumber), stream.contents));
    const encTag = info.encRef.tag;
    for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
      if (ref.tag === encTag || ctx.__fromObjStm.has(ref.tag)) continue;
      const k = objKey(info, fk, ref.objectNumber, ref.generationNumber);
      if (obj instanceof PDFRawStream) {
        const type = obj.dict.lookup(PDFName.of('Type')); const tn = type && type.asString ? type.asString() : '';
        if (tn === '/XRef') continue;
        if (!(tn === '/Metadata' && !info.encryptMetadata)) obj.contents = await decBytes(info, k, obj.contents);
        await mapStrings(obj.dict, (b) => decBytes(info, k, b));
      } else await mapStrings(obj, (b) => decBytes(info, k, b));
    }
    delete ctx.trailerInfo.Encrypt; ctx.delete(info.encRef);
    const doc = await PDFDocument.load(await saveContext(ctx), { updateMetadata: false });
    return { bytes: await doc.save({ useObjectStreams: true }), owner: res.owner, info };
  }
  async function saveContext(ctx) {
    const { PDFWriter } = L();
    return PDFWriter.forContext(ctx, 50).serializeToBuffer();
  }

  /** Permisos → valor P */
  function permsToP(p) {
    let P = 0xFFFFF0C0; // bits 7-8 y 13-32 a 1; bits 1-2 a 0
    if (p.print !== false) P |= 1 << 2; if (p.modify !== false) P |= 1 << 3; if (p.copy !== false) P |= 1 << 4; if (p.annotate !== false) P |= 1 << 5;
    if (p.fillForms !== false) P |= 1 << 8; if (p.accessibility !== false) P |= 1 << 9; if (p.assemble !== false) P |= 1 << 10; if (p.printHigh !== false && p.print !== false) P |= 1 << 11;
    return P | 0;
  }
  function permsFromP(P) {
    const b = (n) => !!(P & (1 << (n - 1)));
    return { print: b(3), modify: b(4), copy: b(5), annotate: b(6), fillForms: b(9), accessibility: b(10), assemble: b(11), printHigh: b(12) };
  }

  /**
   * Cifra con AES-256 (R6). opts: {userPassword, ownerPassword, permissions}
   */
  async function encrypt(bytes, opts) {
    const { PDFDocument, PDFRawStream, PDFName, PDFHexString, PDFNumber, PDFBool, PDFDict } = L();
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const ctx = doc.context;
    const user = pw127(opts.userPassword || ''), owner = pw127(opts.ownerPassword || opts.userPassword || toHex(rnd(16)));
    const fk = rnd(32); const P = permsToP(opts.permissions || {});
    const uvs = rnd(8), uks = rnd(8);
    const U = concat(await hash2B(user, uvs, new Uint8Array(0), 6), uvs, uks);
    const UE = await aesCbcEnc(await hash2B(user, uks, new Uint8Array(0), 6), new Uint8Array(16), fk, false);
    const ovs = rnd(8), oks = rnd(8);
    const O = concat(await hash2B(owner, ovs, U, 6), ovs, oks);
    const OE = await aesCbcEnc(await hash2B(owner, oks, U, 6), new Uint8Array(16), fk, false);
    const permsBlock = new Uint8Array([P & 255, (P >> 8) & 255, (P >> 16) & 255, (P >> 24) & 255, 255, 255, 255, 255, 0x54, 0x61, 0x64, 0x62, ...rnd(4)]);
    const Perms = await aesCbcEnc(fk, new Uint8Array(16), permsBlock, false);
    // cifrar objetos
    for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
      if (obj instanceof PDFRawStream) {
        const type = obj.dict.lookup(PDFName.of('Type')); const tn = type && type.asString ? type.asString() : '';
        if (tn === '/XRef') continue;
        const enc = await aesEncPadded(fk, obj.contents);
        await mapStrings(obj.dict, (b) => aesEncPadded(fk, b));
        obj.dict.set(PDFName.of('Length'), PDFNumber.of(enc.length));
        ctx.assign(ref, PDFRawStream.of(obj.dict, enc));
      } else if (obj && (obj.constructor.name !== 'PDFRef')) {
        if (obj.asBytes || obj instanceof L().PDFArray || obj instanceof PDFDict) { const nv = await mapStrings(obj, (b) => aesEncPadded(fk, b)); if (nv !== obj) ctx.assign(ref, nv); }
      }
    }
    const H = (b) => PDFHexString.of(toHex(b));
    const encDict = ctx.obj({
      Filter: 'Standard', V: 5, R: 6, Length: 256, P: P,
      CF: { StdCF: { AuthEvent: 'DocOpen', CFM: 'AESV3', Length: 32 } }, StmF: 'StdCF', StrF: 'StdCF',
    });
    encDict.set(PDFName.of('O'), H(O)); encDict.set(PDFName.of('U'), H(U)); encDict.set(PDFName.of('OE'), H(OE)); encDict.set(PDFName.of('UE'), H(UE)); encDict.set(PDFName.of('Perms'), H(Perms));
    encDict.set(PDFName.of('EncryptMetadata'), PDFBool.True);
    const encRef = ctx.register(encDict);
    ctx.trailerInfo.Encrypt = encRef;
    const id = toHex(rnd(16)); ctx.trailerInfo.ID = ctx.obj([PDFHexString.of(id), PDFHexString.of(id)]);
    return saveContext(ctx);
  }

  /** Lee info de cifrado sin contraseña */
  async function inspect(bytes) {
    try { const ctx = await parseRaw(bytes, null); const info = getEncryptInfo(ctx); if (!info) return null;
      let needsPw = true; try { needsPw = !(await computeKey(info, '')); } catch (e) { }
      return { R: info.R, V: info.V, method: info.R >= 5 ? 'AES-256' : info.cfm === 'AESV2' ? 'AES-128' : 'RC4 ' + (info.R === 2 ? 40 : info.Length) + ' bits', needsPassword: needsPw, permissions: permsFromP(info.P) };
    } catch (e) { return null; }
  }

  root.PDFCrypt = { decrypt, encrypt, inspect, isEncrypted, md5, rc4 };
})(typeof window !== 'undefined' ? window : globalThis);
