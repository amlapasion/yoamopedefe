/* YO AMO EL PEDEFE · Editor PDF · operaciones PDF: carga, exportación, conversión, páginas, compresión, OCR */
(function () {
  'use strict';
  const PO = FP.PDFOps = {};
  const L = () => window.PDFLib;

  /* ---------- utilidades ---------- */
  PO.hexToRgb = (hex) => { const { rgb } = L(); hex = (hex || '#000000').replace('#', ''); if (hex.length === 3) hex = hex.split('').map(c => c + c).join(''); const n = parseInt(hex, 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
  PO.FONTS = {
    Helvetica: ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'],
    Times: ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'],
    Courier: ['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique'],
  };
  PO.CSSFONT = { Helvetica: 'Helvetica, Arial, "Liberation Sans", sans-serif', Times: '"Times New Roman", Times, "Liberation Serif", serif', Courier: '"Courier New", Courier, "Liberation Mono", monospace' };
  PO.BASELINE = { Helvetica: 0.947, Times: 0.938, Courier: 0.867 };
  PO.fontName = (fam, b, i) => (PO.FONTS[fam] || PO.FONTS.Helvetica)[(b ? 1 : 0) + (i ? 2 : 0)];
  PO.parseRange = function (str, n) { // "1-3,5,8-" → [0,1,2,4,7..n-1]
    str = String(str || '').trim(); if (!str || /^(todas|all|\*)$/i.test(str)) return [...Array(n).keys()];
    const out = []; str.split(/[,;\s]+/).forEach(part => {
      if (!part) return; const m = part.match(/^(\d*)\s*-\s*(\d*)$/);
      if (m) { const a = m[1] ? +m[1] : 1, b = m[2] ? +m[2] : n; for (let i = Math.max(1, a); i <= Math.min(n, b); i++) out.push(i - 1); }
      else if (/^\d+$/.test(part)) { const v = +part; if (v >= 1 && v <= n) out.push(v - 1); }
      else if (/^impares|odd$/i.test(part)) { for (let i = 0; i < n; i += 2) out.push(i); }
      else if (/^pares|even$/i.test(part)) { for (let i = 1; i < n; i += 2) out.push(i); }
    });
    return out;
  };
  PO.safeText = function (font, text) { // sustituye caracteres no codificables en WinAnsi
    if (!font.__cs) font.__cs = new Set(font.getCharacterSet ? font.getCharacterSet() : []);
    let out = ''; for (const ch of String(text)) { const cp = ch.codePointAt(0); out += (cp === 10 || cp === 13 || font.__cs.has(cp)) ? ch : (ch === '’' || ch === '‘' ? "'" : ch === '“' || ch === '”' ? '"' : '?'); }
    return out;
  };

  /* ---------- carga ---------- */
  /** Carga bytes PDF; si está cifrado pide contraseña y lo descifra de verdad */
  PO.prepareBytes = async function (bytes, name) {
    const Crypt = await FP.lib.crypt();
    const info = await Crypt.inspect(bytes);
    if (!info) return { bytes, enc: null };
    let pw = '';
    if (info.needsPassword) {
      for (let tries = 0; tries < 5; tries++) {
        const v = await FP.dialog('PDF protegido: ' + name, [
          { type: 'note', html: `Este documento está cifrado (${info.method}). Introduce la contraseña de apertura o la de propietario.` },
          { key: 'pw', type: 'password', label: 'Contraseña', value: '' }], { icon: 'lock', ok: 'Abrir' });
        if (!v) throw new Error('Apertura cancelada');
        try { const r = await Crypt.decrypt(bytes, v.pw); return { bytes: r.bytes, enc: Object.assign(info, { owner: r.owner, password: v.pw }) }; }
        catch (e) { if (e.code === 'PASSWORD') { FP.toast('Contraseña incorrecta', 'err'); continue; } throw e; }
      }
      throw new Error('Demasiados intentos');
    }
    const restricted = Object.values(info.permissions).some(v => !v);
    if (restricted) {
      const ok = await FP.confirm(FP.h('div', null, FP.h('p', null, `Este PDF tiene restricciones de uso definidas por su autor (${info.method}).`),
        FP.h('div', { class: 'note warn' }, 'Para editarlo hay que eliminar esas restricciones. Hazlo solo si eres el autor o tienes autorización para modificar el documento.')), 'Documento con restricciones', 'Tengo autorización, continuar');
      if (!ok) throw new Error('Apertura cancelada');
    }
    const r = await Crypt.decrypt(bytes, pw);
    return { bytes: r.bytes, enc: Object.assign(info, { owner: r.owner }) };
  };

  PO.openPdfjs = async function (bytes) {
    const lib = await FP.lib.pdfjs();
    const task = lib.getDocument(Object.assign({ data: bytes.slice(0) }, FP.lib.pdfjsOpts()));
    const doc = await task.promise; doc.__task = task; return doc;
  };
  PO.closePdf = (d) => { try { if (d.__task) d.__task.destroy(); else if (d.destroy) d.destroy(); } catch (e) { } };
  /** Documento pdf-lib de solo lectura (cache) */
  PO.libDoc = async function (src) {
    if (src.lib) return src.lib;
    await FP.lib.pdflib();
    try { src.lib = await L().PDFDocument.load(src.bytes, { updateMetadata: false, throwOnInvalidObject: false }); }
    catch (e) { src.libError = e; throw new Error('pdf-lib no puede leer «' + src.name + '» (' + e.message + '). Usa Documento › Reparar.'); }
    return src.lib;
  };
  PO.freshLib = async (bytes) => { await FP.lib.pdflib(); return L().PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: false }); };
  PO.blankPdf = async function (w, hh, n) { await FP.lib.pdflib(); const d = await L().PDFDocument.create(); for (let i = 0; i < (n || 1); i++) d.addPage([w, hh]); return d.save(); };

  /* ---------- conversión a PDF ---------- */
  PO.PAGE_SIZES = { A4: [595.28, 841.89], A3: [841.89, 1190.55], A5: [419.53, 595.28], Carta: [612, 792], Legal: [612, 1008] };
  PO.imagesToPdfBytes = async function (files, opts, prog) {
    await FP.lib.pdflib(); const { PDFDocument } = L();
    const doc = await PDFDocument.create();
    for (let i = 0; i < files.length; i++) {
      const f = files[i]; prog && prog.set(i / files.length, 'Imagen ' + (i + 1) + ' de ' + files.length + ': ' + f.name);
      const t = await FP.sniff(f); let img;
      if (t === 'txt') { const tb = await PO.textToPdfBytes(await f.text(), opts); const td = await PDFDocument.load(tb); const cp = await doc.copyPages(td, td.getPageIndices()); cp.forEach(p => doc.addPage(p)); continue; }
      if (t === 'jpg') { try { img = await doc.embedJpg(new Uint8Array(await FP.readBuf(f))); } catch (e) { img = null; } }
      else if (t === 'png') { try { img = await doc.embedPng(new Uint8Array(await FP.readBuf(f))); } catch (e) { img = null; } }
      if (!img) { const c = await FP.loadImageFile(f, { svgScale: 2 }); const b = await FP.toBlob(c, 'image/png'); img = await doc.embedPng(new Uint8Array(await b.arrayBuffer())); }
      const dpi = opts.dpi || 96; const iw = img.width * 72 / dpi, ih = img.height * 72 / dpi;
      let pw, ph;
      if (opts.size === 'image') { pw = iw + 2 * opts.margin; ph = ih + 2 * opts.margin; }
      else { [pw, ph] = PO.PAGE_SIZES[opts.size] || PO.PAGE_SIZES.A4; const land = opts.orient === 'land' || (opts.orient === 'auto' && iw > ih); if (land) [pw, ph] = [ph, pw]; }
      const page = doc.addPage([pw, ph]);
      const aw = pw - 2 * opts.margin, ah = ph - 2 * opts.margin;
      let s = opts.size === 'image' ? 1 : (opts.fit === 'fill' ? Math.max(aw / iw, ah / ih) : Math.min(aw / iw, ah / ih));
      if (opts.fit === 'noscale') s = Math.min(1, s);
      const dw = iw * s, dh = ih * s;
      page.drawImage(img, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
      await FP.tick();
    }
    return doc.save({ useObjectStreams: true });
  };
  PO.textToPdfBytes = async function (text, opts) {
    await FP.lib.pdflib(); const { PDFDocument, StandardFonts, rgb } = L();
    const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica);
    const [pw, ph] = PO.PAGE_SIZES.A4; const m = 56, size = 11, lh = size * 1.35, maxW = pw - 2 * m;
    const lines = [];
    PO.safeText(font, text.replace(/\t/g, '    ')).split(/\r?\n/).forEach(par => {
      if (!par) { lines.push(''); return; }
      let cur = ''; par.split(/(\s+)/).forEach(w => { const t = cur + w; if (font.widthOfTextAtSize(t, size) > maxW && cur) { lines.push(cur.trimEnd()); cur = w.trimStart(); } else cur = t; });
      while (font.widthOfTextAtSize(cur, size) > maxW) { let k = cur.length; while (k > 1 && font.widthOfTextAtSize(cur.slice(0, k), size) > maxW) k--; lines.push(cur.slice(0, k)); cur = cur.slice(k); }
      lines.push(cur);
    });
    let page = null, y = 0;
    lines.forEach(l => { if (!page || y < m) { page = doc.addPage([pw, ph]); y = ph - m - size; } page.drawText(l, { x: m, y, size, font, color: rgb(0, 0, 0) }); y -= lh; });
    if (!page) doc.addPage([pw, ph]);
    return doc.save();
  };

  /* ---------- exportación ---------- */
  function boxFrame(vp, x, y, w, hh) { // devuelve ancla (abajo-izquierda en pantalla) en coordenadas PDF y rotación
    const p = vp.convertToPdfPoint(x, y + hh); return { x: p[0], y: p[1], rot: vp.rotation % 360 };
  }
  function rectPdf(vp, x, y, w, hh) { const a = vp.convertToPdfPoint(x, y), b = vp.convertToPdfPoint(x + w, y + hh); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; }

  PO.drawObject = async function (ctx, page, vp, o) {
    const { degrees, LineCapStyle, BlendMode } = L(); const col = PO.hexToRgb;
    const op = o.opacity != null ? o.opacity : 1;
    switch (o.type) {
      case 'text': {
        const font = await ctx.font(PO.fontName(o.font, o.bold, o.italic));
        const lines = String(o.text || '').split('\n'); const lh = o.size * 1.2; const base = PO.BASELINE[o.font] || .94;
        if (o.bg) { const f = boxFrame(vp, o.x, o.y, o.w, o.h); page.drawRectangle({ x: f.x, y: f.y, width: o.w, height: o.h, color: col(o.bg), rotate: degrees(f.rot), opacity: op }); }
        lines.forEach((ln, i) => {
          const t = PO.safeText(font, ln); const tw = font.widthOfTextAtSize(t, o.size);
          let dx = 0; if (o.align === 'center') dx = (o.w - tw) / 2; else if (o.align === 'right') dx = o.w - tw;
          const yy = o.y + i * lh + o.size * base;
          const p = vp.convertToPdfPoint(o.x + dx, yy);
          if (t) page.drawText(t, { x: p[0], y: p[1], size: o.size, font, color: col(o.color), opacity: op, rotate: degrees(vp.rotation % 360) });
          if (o.underline && t) { const a = vp.convertToPdfPoint(o.x + dx, yy + o.size * .12), b = vp.convertToPdfPoint(o.x + dx + tw, yy + o.size * .12); page.drawLine({ start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] }, thickness: Math.max(.5, o.size / 16), color: col(o.color), opacity: op }); }
        });
        break;
      }
      case 'rect': case 'whiteout': {
        const f = boxFrame(vp, o.x, o.y, o.w, o.h); const fill = o.type === 'whiteout' ? (o.fill || '#ffffff') : o.fill;
        const args = { x: f.x, y: f.y, width: o.w, height: o.h, rotate: degrees(f.rot) };
        if (fill) { args.color = col(fill); args.opacity = o.type === 'whiteout' ? 1 : (o.fillOpacity != null ? o.fillOpacity : op); }
        if (o.type === 'rect' && o.sw > 0) { args.borderColor = col(o.stroke); args.borderWidth = o.sw; args.borderOpacity = op; }
        page.drawRectangle(args); break;
      }
      case 'ellipse': {
        const c = vp.convertToPdfPoint(o.x + o.w / 2, o.y + o.h / 2); const sw = (vp.rotation % 180) !== 0;
        const args = { x: c[0], y: c[1], xScale: (sw ? o.h : o.w) / 2, yScale: (sw ? o.w : o.h) / 2 };
        if (o.fill) { args.color = col(o.fill); args.opacity = o.fillOpacity != null ? o.fillOpacity : op; }
        if (o.sw > 0) { args.borderColor = col(o.stroke); args.borderWidth = o.sw; args.borderOpacity = op; }
        page.drawEllipse(args); break;
      }
      case 'line': {
        const a = vp.convertToPdfPoint(o.x1, o.y1), b = vp.convertToPdfPoint(o.x2, o.y2);
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), hl = Math.max(8, o.sw * 4);
        const shorten = (p, dir) => [p[0] + Math.cos(ang) * dir * hl * .8, p[1] + Math.sin(ang) * dir * hl * .8];
        const s = o.arrowStart ? shorten(a, 1) : a, e = o.arrowEnd ? shorten(b, -1) : b;
        page.drawLine({ start: { x: s[0], y: s[1] }, end: { x: e[0], y: e[1] }, thickness: o.sw, color: col(o.stroke), opacity: op, lineCap: LineCapStyle.Round, dashArray: o.dash ? [o.sw * 3, o.sw * 2] : undefined });
        const head = (p, an) => { const p1 = [p[0] - hl * Math.cos(an - .45), p[1] - hl * Math.sin(an - .45)], p2 = [p[0] - hl * Math.cos(an + .45), p[1] - hl * Math.sin(an + .45)]; page.drawSvgPath(`M ${p[0]} ${-p[1]} L ${p1[0]} ${-p1[1]} L ${p2[0]} ${-p2[1]} Z`, { x: 0, y: 0, color: col(o.stroke), opacity: op }); };
        if (o.arrowEnd) head(b, ang); if (o.arrowStart) head(a, ang + Math.PI);
        break;
      }
      case 'ink': {
        if (!o.points || o.points.length < 2) break;
        let d = ''; o.points.forEach((pt, i) => { const p = vp.convertToPdfPoint(pt[0], pt[1]); d += (i ? ' L ' : 'M ') + p[0].toFixed(2) + ' ' + (-p[1]).toFixed(2); });
        page.drawSvgPath(d, { x: 0, y: 0, borderColor: col(o.stroke), borderWidth: o.sw, borderOpacity: op, borderLineCap: LineCapStyle.Round });
        break;
      }
      case 'image': {
        const img = await ctx.image(o.asset); const f = boxFrame(vp, o.x, o.y, o.w, o.h);
        page.drawImage(img, { x: f.x, y: f.y, width: o.w, height: o.h, rotate: degrees(f.rot), opacity: op }); break;
      }
      case 'markup': {
        (o.rects || []).forEach(r => {
          if (o.kind === 'highlight') { const f = boxFrame(vp, r.x, r.y, r.w, r.h); page.drawRectangle({ x: f.x, y: f.y, width: r.w, height: r.h, rotate: degrees(f.rot), color: col(o.color), opacity: o.opacity != null ? o.opacity : .4, blendMode: BlendMode.Multiply }); }
          else { const yy = o.kind === 'underline' ? r.y + r.h - Math.max(1, r.h * .06) : r.y + r.h * .55; const a = vp.convertToPdfPoint(r.x, yy), b = vp.convertToPdfPoint(r.x + r.w, yy); page.drawLine({ start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] }, thickness: Math.max(.8, r.h * .07), color: col(o.color), opacity: op }); }
        });
        break;
      }
    }
  };

  PO.stampText = (s, n, total, name) => String(s.text || '').replace(/\{n\}/g, n).replace(/\{total\}/g, total).replace(/\{fecha\}/g, new Date().toLocaleDateString('es-ES')).replace(/\{nombre\}/g, name || '');
  /** Calcula caja de un sello en coordenadas de vista final (w,h de la página vista) */
  PO.stampLayout = function (s, W, H, txtW, txtH) {
    const m = s.margin != null ? s.margin : 28; let x, y;
    const pos = s.pos || 'bc';
    const col = pos[1], row = pos[0];
    if (pos === 'cc') { x = (W - txtW) / 2; y = (H - txtH) / 2; }
    else { x = col === 'l' ? m : col === 'r' ? W - m - txtW : (W - txtW) / 2; y = row === 't' ? m : row === 'b' ? H - m - txtH : (H - txtH) / 2; }
    return { x, y };
  };
  PO.stampApplies = (s, i, n) => { if (!s.pages || s.pages === 'all') return i >= (s.from || 1) - 1; return PO.parseRange(s.pages, n).includes(i); };

  /** Exporta el documento final. opts: {pageIds, flattenForms, flattenAnnots, noSecurity} */
  PO.exportBytes = async function (E, opts, prog) {
    opts = opts || {}; await FP.lib.pdflib();
    const { PDFDocument, degrees, PDFName, PDFString, PDFHexString, StandardFonts } = L();
    const S = E.S; const order = opts.pageIds ? S.pages.filter(p => opts.pageIds.includes(p.id)) : S.pages;
    if (!order.length) throw new Error('No hay páginas que exportar');
    const srcOf = (id) => S.sources.find(s => s.id === id);
    const first = srcOf(order[0].src);
    prog && prog.set(.02, 'Preparando documento…');
    let doc, usedBase = false;
    try { doc = await PDFDocument.load(first.bytes, { updateMetadata: false, throwOnInvalidObject: false }); usedBase = true; }
    catch (e) { doc = await PDFDocument.create(); }
    // valores de formulario existentes
    const fv = S.formValues || {};
    if (usedBase && Object.keys(fv).length) {
      try {
        const form = doc.getForm();
        for (const key in fv) {
          const [sid, ...rest] = key.split(':'); if (sid !== first.id) continue; const name = rest.join(':');
          const f = form.getFieldMaybe ? form.getFieldMaybe(name) : form.getField(name); if (!f) continue; const v = fv[key];
          const tn = f.constructor.name;
          try {
            if (f.setText) f.setText(String(v)); else if (f.check) { v ? f.check() : f.uncheck(); }
            else if (f.select && v != null && v !== '') f.select(v); else if (f.clear && (v === '' || v == null)) f.clear();
          } catch (e) { console.warn('campo', name, tn, e); }
        }
        const helv = await doc.embedFont(StandardFonts.Helvetica); try { form.updateFieldAppearances(helv); } catch (e) { console.warn(e); }
      } catch (e) { console.warn('formulario', e); }
    }
    const basePages = usedBase ? doc.getPages() : [];
    if (usedBase) for (let i = doc.getPageCount() - 1; i >= 0; i--) doc.removePage(i);
    // páginas a copiar
    const used = new Set(), plan = [];
    order.forEach(p => { if (usedBase && p.src === first.id && !used.has(p.idx) && basePages[p.idx]) { used.add(p.idx); plan.push({ p, base: basePages[p.idx] }); } else plan.push({ p }); });
    const needs = {}; plan.forEach(it => { if (!it.base) (needs[it.p.src] = needs[it.p.src] || []).push(it); });
    let k = 0;
    for (const sid in needs) {
      const src = srcOf(sid); let sd = null;
      try { sd = await PO.libDoc(src); } catch (e) { sd = null; }
      if (sd) { const copied = await doc.copyPages(sd, needs[sid].map(it => it.p.idx)); needs[sid].forEach((it, j) => it.base = copied[j]); }
      else { // no legible por pdf-lib: rasterizar
        for (const it of needs[sid]) { it.base = await PO.rasterPageInto(doc, src, it.p.idx, 200); }
      }
      prog && prog.set(.05 + .15 * (++k / Object.keys(needs).length), 'Copiando páginas…');
    }
    plan.forEach(it => doc.addPage(it.base));
    // limpiar campos huérfanos
    if (usedBase) { try { const pageRefs = new Set(doc.getPages().map(pg => pg.ref.tag)); const form = doc.getForm(); form.getFields().forEach(f => { const ws = f.acroField.getWidgets(); const alive = ws.some(w => { const pr = w.P(); return pr && pageRefs.has(pr.tag); }); if (!alive && ws.some(w => w.P())) { try { form.removeField(f); } catch (e) { } } }); } catch (e) { } }

    // recursos
    const fontCache = {}, imgCache = {};
    const ctx = {
      font: async (n) => fontCache[n] || (fontCache[n] = await doc.embedFont(StandardFonts[Object.keys(StandardFonts).find(k => StandardFonts[k] === n)] || n)),
      image: async (id) => { if (imgCache[id]) return imgCache[id]; const a = S.assets[id]; imgCache[id] = a.type === 'jpg' ? await doc.embedJpg(a.bytes) : await doc.embedPng(a.bytes); return imgCache[id]; },
    };
    const outPages = doc.getPages(); const total = outPages.length;
    let form = null; const getForm = () => form || (form = doc.getForm());
    const radioGroups = {};
    for (let i = 0; i < plan.length; i++) {
      const p = plan[i].p, pg = outPages[i]; const src = srcOf(p.src);
      prog && prog.set(.2 + .6 * (i / plan.length), 'Página ' + (i + 1) + ' de ' + plan.length);
      const jsPage = await E.jsPage(src, p.idx);
      const vp = jsPage.getViewport({ scale: 1 }); // rotación original
      const R = (p.origRot + p.rot) % 360; pg.setRotation(degrees(R));
      const vpF = jsPage.getViewport({ scale: 1, rotation: R });
      for (const o of p.objs) {
        if (['note', 'link', 'field'].includes(o.type)) continue;
        try { await PO.drawObject(ctx, pg, vp, o); } catch (e) { console.warn('objeto', o, e); }
      }
      // sellos
      for (const s of (S.stamps || [])) {
        if (!PO.stampApplies(s, i, total)) continue;
        try { await PO.drawStamp(ctx, pg, vpF, s, i + 1, total, S.name); } catch (e) { console.warn('sello', e); }
      }
      // capa OCR invisible
      if (p.ocr && p.ocr.words && opts.ocrLayer !== false) {
        const font = await ctx.font('Helvetica'); const vpO = jsPage.getViewport({ scale: 1, rotation: (p.origRot + p.ocr.r) % 360 });
        p.ocr.words.forEach(w => {
          const t = PO.safeText(font, w.text); if (!t.trim()) return;
          const wd = font.widthOfTextAtSize(t, 1); const size = Math.max(1, Math.min(w.h * 1.15, wd > 0 ? w.w / wd : w.h));
          const pt = vpO.convertToPdfPoint(w.x, w.y + w.h * .82);
          pg.drawText(t, { x: pt[0], y: pt[1], size, font, opacity: 0, rotate: degrees(vpO.rotation % 360) });
        });
      }
      // anotaciones reales: notas y enlaces
      for (const o of p.objs) {
        if (o.type === 'note') {
          const r = rectPdf(vp, o.x, o.y, 22, 22); const c = PO.hexToRgb(o.color || '#ffd84d');
          const annot = doc.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: r, Name: 'Comment', Open: false, F: 4, C: [c.red, c.green, c.blue], T: PDFHexString.fromText(o.author || 'YO AMO EL PEDEFE'), Contents: PDFHexString.fromText(o.text || ''), M: PDFString.fromDate(new Date()) });
          pg.node.addAnnot(doc.context.register(annot));
        } else if (o.type === 'link') {
          const r = rectPdf(vp, o.x, o.y, o.w, o.h); let a;
          if (o.page != null && o.page !== '') { const ti = FP.clamp(parseInt(o.page, 10) - 1, 0, total - 1); a = doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: r, Border: [0, 0, 0], F: 4, Dest: [outPages[ti].ref, 'XYZ', null, null, null] }); }
          else a = doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: r, Border: [0, 0, 0], F: 4, A: { Type: 'Action', S: 'URI', URI: PDFString.of(o.url || '') } });
          pg.node.addAnnot(doc.context.register(a));
        } else if (o.type === 'field') {
          try { await PO.addField(doc, getForm(), pg, vp, o, radioGroups, ctx); } catch (e) { console.warn('campo', e); FP.toast('No se pudo crear el campo «' + o.name + '»: ' + e.message, 'warn'); }
        }
      }
    }
    if (form) { try { form.updateFieldAppearances(await ctx.font('Helvetica')); } catch (e) { } }
    prog && prog.set(.85, 'Finalizando…');
    if (opts.flattenForms) { try { doc.getForm().flatten(); } catch (e) { console.warn(e); FP.toast('No se pudieron aplanar todos los campos: ' + e.message, 'warn'); } }
    if (opts.flattenAnnots) PO.flattenAnnotations(doc);
    PO.cleanAnnots(doc);
    // metadatos
    const m = S.meta;
    if (m && m.strip) PO.stripMeta(doc);
    else {
      if (m) { doc.setTitle(m.title || ''); doc.setAuthor(m.author || ''); doc.setSubject(m.subject || ''); doc.setKeywords((m.keywords || '').split(',').map(s => s.trim()).filter(Boolean)); doc.setCreator(m.creator || ''); doc.setProducer(m.producer || 'YO AMO EL PEDEFE'); }
      doc.setModificationDate(new Date());
    }
    PO.gc(doc);
    let out = await doc.save({ useObjectStreams: true });
    if (S.security && !opts.noSecurity) { prog && prog.set(.93, 'Cifrando (AES‑256)…'); out = await (await FP.lib.crypt()).encrypt(out, S.security); }
    prog && prog.set(1, 'Listo');
    return out;
  };

  PO.drawStamp = async function (ctx, pg, vpF, s, n, total, name) {
    const { degrees } = L(); const W = vpF.width, H = vpF.height;
    if (s.type === 'watermark' && s.asset) {
      const img = await ctx.image(s.asset); const sc = (s.scale || 50) / 100; const w = W * sc, hh = w * img.height / img.width;
      const cx = W / 2, cy = H / 2; const rot = (s.rotation || 0) * Math.PI / 180;
      // esquina inferior izquierda de la imagen rotada alrededor del centro (en pantalla)
      const bx = cx - (w / 2) * Math.cos(rot) + (hh / 2) * Math.sin(rot), by = cy + (w / 2) * Math.sin(rot) + (hh / 2) * Math.cos(rot);
      const p = vpF.convertToPdfPoint(bx, by);
      pg.drawImage(img, { x: p[0], y: p[1], width: w, height: hh, opacity: s.opacity != null ? s.opacity : .3, rotate: degrees((vpF.rotation % 360) + (s.rotation || 0)) });
      return;
    }
    const font = await ctx.font(PO.fontName(s.font || 'Helvetica', s.bold, s.italic));
    const txt = PO.safeText(font, PO.stampText(s, n + (s.start || 1) - 1 - ((s.from || 1) - 1), total, name));
    const size = s.size || 11; const tw = font.widthOfTextAtSize(txt, size), th = size * 1.2;
    const col = PO.hexToRgb(s.color || '#000000'); const op = s.opacity != null ? s.opacity : 1;
    if (s.type === 'watermark') {
      const rot = (s.rotation || 0) * Math.PI / 180; const cx = W / 2, cy = H / 2;
      const bx = cx - (tw / 2) * Math.cos(rot) + (size * .35) * Math.sin(rot), by = cy + (tw / 2) * Math.sin(rot) + (size * .35) * Math.cos(rot);
      const p = vpF.convertToPdfPoint(bx, by);
      pg.drawText(txt, { x: p[0], y: p[1], size, font, color: col, opacity: op, rotate: degrees((vpF.rotation % 360) + (s.rotation || 0)) });
      return;
    }
    const pos = PO.stampLayout(s, W, H, tw, th);
    const p = vpF.convertToPdfPoint(pos.x, pos.y + size * (PO.BASELINE[s.font || 'Helvetica'] || .94));
    pg.drawText(txt, { x: p[0], y: p[1], size, font, color: col, opacity: op, rotate: degrees(vpF.rotation % 360) });
  };

  PO.addField = async function (doc, form, pg, vp, o, radioGroups, ctx) {
    const { degrees, rgb } = L();
    const f = boxFrame(vp, o.x, o.y, o.w, o.h);
    const app = { x: f.x, y: f.y, width: o.w, height: o.h, borderColor: rgb(.45, .45, .5), borderWidth: 1, backgroundColor: rgb(1, 1, 1) };
    if (f.rot) app.rotate = degrees(f.rot);
    const uniq = (n) => { let name = (n || 'campo').replace(/[.\s]/g, '_'), k = 1; const ex = (x) => { try { return !!form.getField(x); } catch (e) { return false; } }; let nm = name; while (ex(nm)) nm = name + '_' + (++k); return nm; };
    if (o.ftype === 'text') { const tf = form.createTextField(uniq(o.name)); if (o.multiline) tf.enableMultiline(); if (o.value) tf.setText(String(o.value)); tf.addToPage(pg, Object.assign(app, { font: await ctx.font('Helvetica') })); if (o.fontSize) tf.setFontSize(o.fontSize); }
    else if (o.ftype === 'checkbox') { const cb = form.createCheckBox(uniq(o.name)); cb.addToPage(pg, app); if (o.value) cb.check(); }
    else if (o.ftype === 'radio') {
      const gname = o.group || 'grupo'; let g = radioGroups[gname];
      if (!g) { g = radioGroups[gname] = form.createRadioGroup(uniq(gname)); }
      g.addOptionToPage(o.name || ('opcion' + Object.keys(radioGroups).length), pg, app);
      if (o.value) try { g.select(o.name); } catch (e) { }
    }
    else if (o.ftype === 'dropdown') { const dd = form.createDropdown(uniq(o.name)); const opts = (o.options || []).filter(Boolean); if (opts.length) dd.addOptions(opts); if (o.value && opts.includes(o.value)) dd.select(o.value); dd.addToPage(pg, Object.assign(app, { font: await ctx.font('Helvetica') })); }
  };

  /** Aplanado vectorial real de anotaciones con apariencia (/AP /N) */
  PO.flattenAnnotations = function (doc) {
    const { PDFName, PDFArray, PDFDict, PDFNumber, pushGraphicsState, popGraphicsState, concatTransformationMatrix, drawObject, PDFRef } = L();
    let n = 0;
    doc.getPages().forEach(pg => {
      const annots = pg.node.Annots(); if (!annots) return; const keep = [];
      for (let i = 0; i < annots.size(); i++) {
        const ref = annots.get(i); const a = doc.context.lookup(ref); if (!(a instanceof PDFDict)) continue;
        const st = a.lookup(PDFName.of('Subtype')); const sub = st ? st.asString() : '';
        const flags = a.lookup(PDFName.of('F')); const fl = flags instanceof PDFNumber ? flags.asNumber() : 0;
        if (sub === '/Link' || sub === '/Popup' || (fl & 2)) { if (sub === '/Link') keep.push(ref); continue; }
        const ap = a.lookup(PDFName.of('AP')); let nAp = ap instanceof PDFDict ? ap.get(PDFName.of('N')) : null;
        if (nAp) { const nd = doc.context.lookup(nAp); if (nd instanceof PDFDict && !(nd.dict)) { const as = a.lookup(PDFName.of('AS')); nAp = as ? nd.get(as) : null; } }
        const rect = a.lookup(PDFName.of('Rect'));
        if (!nAp || !(nAp instanceof PDFRef) || !(rect instanceof PDFArray)) { if (sub !== '/Widget') keep.push(ref); continue; }
        const st2 = doc.context.lookup(nAp); const bbox = st2.dict.lookup(PDFName.of('BBox')); const mtx = st2.dict.lookup(PDFName.of('Matrix'));
        const r = rect.asArray().map(x => x.asNumber()); const rx0 = Math.min(r[0], r[2]), ry0 = Math.min(r[1], r[3]), rx1 = Math.max(r[0], r[2]), ry1 = Math.max(r[1], r[3]);
        const b = bbox ? bbox.asArray().map(x => x.asNumber()) : [0, 0, rx1 - rx0, ry1 - ry0];
        const M = mtx ? mtx.asArray().map(x => x.asNumber()) : [1, 0, 0, 1, 0, 0];
        const pts = [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]].map(([x, y]) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]]);
        const bx0 = Math.min(...pts.map(p => p[0])), by0 = Math.min(...pts.map(p => p[1])), bx1 = Math.max(...pts.map(p => p[0])), by1 = Math.max(...pts.map(p => p[1]));
        const sx = (rx1 - rx0) / ((bx1 - bx0) || 1), sy = (ry1 - ry0) / ((by1 - by0) || 1);
        const name = pg.node.newXObject('FlatAP', nAp);
        pg.pushOperators(pushGraphicsState(), concatTransformationMatrix(sx, 0, 0, sy, rx0 - sx * bx0, ry0 - sy * by0), drawObject(name), popGraphicsState());
        n++;
      }
      pg.node.set(PDFName.of('Annots'), doc.context.obj(keep));
    });
    try { doc.catalog.delete(PDFName.of('AcroForm')); } catch (e) { }
    return n;
  };
  /** Quita de /Annots referencias a objetos inexistentes (p. ej. tras aplanar) */
  PO.cleanAnnots = function (doc) {
    const { PDFName, PDFRef } = L();
    doc.getPages().forEach(pg => { const a = pg.node.Annots(); if (!a) return; const keep = []; for (let i = 0; i < a.size(); i++) { const r = a.get(i); if (!(r instanceof PDFRef) || doc.context.lookup(r)) keep.push(r); } if (keep.length !== a.size()) pg.node.set(PDFName.of('Annots'), doc.context.obj(keep)); });
  };
  PO.stripMeta = function (doc) {
    const { PDFName } = L();
    try { const info = doc.getInfoDict(); info.keys().forEach(k => info.delete(k)); } catch (e) { }
    doc.catalog.delete(PDFName.of('Metadata'));
    doc.getPages().forEach(p => { try { p.node.delete(PDFName.of('Metadata')); p.node.delete(PDFName.of('PieceInfo')); } catch (e) { } });
    doc.catalog.delete(PDFName.of('PieceInfo'));
  };
  /** Elimina objetos no referenciados */
  PO.gc = function (doc) {
    const { PDFRef, PDFDict, PDFArray } = L(); const ctx = doc.context; const seen = new Set();
    const stack = []; const t = ctx.trailerInfo; [t.Root, t.Info, t.Encrypt].forEach(x => x && stack.push(x));
    const visit = (o) => {
      if (!o) return;
      if (o instanceof PDFRef) { if (seen.has(o.tag)) return; seen.add(o.tag); stack.push(ctx.lookup(o)); return; }
      if (o instanceof PDFArray) { for (let i = 0; i < o.size(); i++) visit(o.get(i)); return; }
      if (o instanceof PDFDict) { for (const [, v] of o.entries()) visit(v); return; }
      if (o.dict instanceof PDFDict) visit(o.dict);
    };
    while (stack.length) { const o = stack.pop(); if (o instanceof PDFRef) visit(o); else visit(o); }
    let removed = 0;
    ctx.enumerateIndirectObjects().forEach(([ref]) => { if (!seen.has(ref.tag)) { ctx.delete(ref); removed++; } });
    return removed;
  };

  /** Rasteriza una página de un origen y la añade al doc (respaldo para PDF ilegibles por pdf-lib) */
  PO.rasterPageInto = async function (doc, src, idx, dpi, quality) {
    const jp = await src.pdfjs.getPage(idx + 1); const vp1 = jp.getViewport({ scale: 1 }); const vp = jp.getViewport({ scale: (dpi || 150) / 72 });
    const c = FP.canvas(vp.width, vp.height); const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
    await jp.render({ canvasContext: cx, canvas: c, viewport: vp, annotationMode: (await FP.lib.pdfjs()).AnnotationMode.ENABLE }).promise;
    const b = await FP.toBlob(c, 'image/jpeg', quality || .85); const img = await doc.embedJpg(new Uint8Array(await b.arrayBuffer()));
    const page = doc.addPage([vp1.width, vp1.height]); page.drawImage(img, { x: 0, y: 0, width: vp1.width, height: vp1.height });
    doc.removePage(doc.getPageCount() - 1); // se reinsertará en orden
    c.width = c.height = 0;
    return page;
  };

  /* ---------- PDF → imágenes ---------- */
  PO.renderBytesToImages = async function (bytes, opts, prog) {
    const lib = await FP.lib.pdfjs(); const pdf = await PO.openPdfjs(bytes);
    const idxs = opts.indices || [...Array(pdf.numPages).keys()]; const out = [];
    const mime = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[opts.format];
    for (let k = 0; k < idxs.length; k++) {
      if (prog && prog.cancelled) throw new Error('Cancelado');
      prog && prog.set(k / idxs.length, 'Renderizando página ' + (idxs[k] + 1) + '…');
      const pg = await pdf.getPage(idxs[k] + 1); const vp = pg.getViewport({ scale: opts.dpi / 72 });
      if (vp.width * vp.height > FP.LIMITS.maxPixels / 2) throw new Error('Resolución demasiado alta para la página ' + (idxs[k] + 1));
      const c = FP.canvas(vp.width, vp.height); const cx = c.getContext('2d');
      if (opts.format !== 'png' || !opts.transparent) { cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height); }
      await pg.render({ canvasContext: cx, canvas: c, viewport: vp, background: opts.transparent ? 'rgba(0,0,0,0)' : undefined, annotationMode: lib.AnnotationMode.ENABLE_FORMS }).promise;
      const blob = await FP.toBlob(c, mime, opts.quality);
      out.push({ name: (opts.base || 'pagina') + '-' + String(idxs[k] + 1).padStart(String(pdf.numPages).length, '0') + '.' + opts.format, blob });
      c.width = c.height = 0; pg.cleanup();
    }
    PO.closePdf(pdf);
    return out;
  };
  PO.zipBlobs = async function (items, prog) { const JSZip = await FP.lib.jszip(); const z = new JSZip(); items.forEach(it => z.file(it.name, it.blob)); return z.generateAsync({ type: 'blob', compression: 'STORE' }, (m) => prog && prog.set(m.percent / 100, 'Creando ZIP…')); };

  /* ---------- compresión ---------- */
  PO.compress = async function (bytes, o, prog) {
    const { PDFDocument, PDFName, PDFRawStream, PDFNumber, PDFArray, decodePDFRawStream } = L();
    if (o.mode === 'raster') {
      const pdf = await PO.openPdfjs(bytes); const doc = await PDFDocument.create();
      for (let i = 0; i < pdf.numPages; i++) {
        if (prog && prog.cancelled) throw new Error('Cancelado');
        prog && prog.set(i / pdf.numPages, 'Rasterizando página ' + (i + 1) + ' de ' + pdf.numPages);
        const pg = await pdf.getPage(i + 1); const v1 = pg.getViewport({ scale: 1 }); const vp = pg.getViewport({ scale: o.dpi / 72 });
        const c = FP.canvas(vp.width, vp.height); const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
        await pg.render({ canvasContext: cx, canvas: c, viewport: vp }).promise;
        if (o.gray) { const id = cx.getImageData(0, 0, c.width, c.height), d = id.data; for (let j = 0; j < d.length; j += 4) { const y = d[j] * .299 + d[j + 1] * .587 + d[j + 2] * .114; d[j] = d[j + 1] = d[j + 2] = y; } cx.putImageData(id, 0, 0); }
        const b = await FP.toBlob(c, 'image/jpeg', o.quality); const img = await doc.embedJpg(new Uint8Array(await b.arrayBuffer()));
        doc.addPage([v1.width, v1.height]).drawImage(img, { x: 0, y: 0, width: v1.width, height: v1.height }); c.width = c.height = 0;
      }
      PO.closePdf(pdf); return doc.save({ useObjectStreams: true });
    }
    const doc = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: false });
    let changed = 0, saved = 0;
    if (o.mode === 'images') {
      const objs = doc.context.enumerateIndirectObjects().filter(([, ob]) => ob instanceof PDFRawStream && ob.dict.lookup(PDFName.of('Subtype')) === PDFName.of('Image'));
      for (let k = 0; k < objs.length; k++) {
        if (prog && prog.cancelled) throw new Error('Cancelado');
        const [ref, st] = objs[k]; prog && prog.set(k / objs.length, 'Optimizando imagen ' + (k + 1) + ' de ' + objs.length);
        try {
          const d = st.dict; const W = d.lookup(PDFName.of('Width')).asNumber(), H = d.lookup(PDFName.of('Height')).asNumber();
          if (W * H < 4096 || d.lookup(PDFName.of('ImageMask'))) continue;
          const bpc = d.lookup(PDFName.of('BitsPerComponent')); if (!bpc || bpc.asNumber() !== 8) continue;
          if (d.lookup(PDFName.of('Decode'))) continue;
          const smv = d.lookup(PDFName.of('SMask')); // la máscara se conserva aparte
          const r = await PO.decodeImageStream(doc, st); if (!r || r.ext === 'jp2') continue;
          let cs = d.lookup(PDFName.of('ColorSpace')); if (cs === PDFName.of('DeviceCMYK')) continue;
          let canvas;
          if (r.ext === 'jpg') { const img = await FP.blobToImage(r.blob); canvas = FP.canvas(img.naturalWidth, img.naturalHeight); canvas.getContext('2d').drawImage(img, 0, 0); }
          else { if (d.lookup(PDFName.of('ColorSpace')) instanceof PDFArray && d.lookup(PDFName.of('ColorSpace')).get(0) === PDFName.of('Indexed')) { r.canvas.width = 0; continue; } canvas = r.canvas; }
          let cw = canvas.width, ch = canvas.height; const sc = Math.min(1, o.maxDim / Math.max(cw, ch));
          if (sc < 1) { const c2 = FP.canvas(cw * sc, ch * sc); const x2 = c2.getContext('2d'); x2.imageSmoothingQuality = 'high'; x2.drawImage(canvas, 0, 0, c2.width, c2.height); canvas.width = 0; canvas = c2; }
          const blob = await FP.toBlob(canvas, 'image/jpeg', o.quality); const nb = new Uint8Array(await blob.arrayBuffer());
          if (nb.length < st.contents.length * .9) {
            d.set(PDFName.of('Width'), PDFNumber.of(canvas.width)); d.set(PDFName.of('Height'), PDFNumber.of(canvas.height));
            d.set(PDFName.of('Filter'), PDFName.of('DCTDecode')); d.delete(PDFName.of('DecodeParms')); d.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
            d.set(PDFName.of('Length'), PDFNumber.of(nb.length));
            saved += st.contents.length - nb.length; doc.context.assign(ref, PDFRawStream.of(d, nb)); changed++;
          }
          canvas.width = 0;
        } catch (e) { console.warn('imagen', e); }
        if (k % 5 === 0) await FP.tick();
      }
    }
    if (o.strip) PO.stripMeta(doc);
    PO.gc(doc);
    const out = await doc.save({ useObjectStreams: true });
    out.__changed = changed; return out;
  };

  /* ---------- texto ---------- */
  PO.pageTextItems = async function (jsPage) {
    const lib = await FP.lib.pdfjs(); const tc = await jsPage.getTextContent(); const vp = jsPage.getViewport({ scale: 1 });
    return tc.items.filter(it => it.str !== undefined).map(it => {
      const tx = lib.Util.transform(vp.transform, it.transform); const fh = Math.hypot(tx[2], tx[3]); const ang = Math.atan2(tx[1], tx[0]);
      const w = it.width * (vp.scale || 1); const x0 = tx[4], y0 = tx[5];
      const pts = [[x0, y0], [x0 + Math.cos(ang) * w, y0 + Math.sin(ang) * w], [x0 + Math.sin(ang) * fh, y0 - Math.cos(ang) * fh], [x0 + Math.cos(ang) * w + Math.sin(ang) * fh, y0 + Math.sin(ang) * w - Math.cos(ang) * fh]];
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      const style = tc.styles[it.fontName] || {}; const fam = /mono|courier/i.test(style.fontFamily || '') ? 'Courier' : /serif/i.test(style.fontFamily || '') && !/sans/i.test(style.fontFamily || '') ? 'Times' : 'Helvetica';
      return { str: it.str, x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), fh, ang, fam, eol: it.hasEOL, fontName: it.fontName };
    });
  };
  PO.extractText = async function (E, prog) {
    const parts = [];
    for (let i = 0; i < E.S.pages.length; i++) {
      prog && prog.set(i / E.S.pages.length, 'Página ' + (i + 1));
      const p = E.S.pages[i]; const jp = await E.jsPage(E.src(p.src), p.idx); const tc = await jp.getTextContent();
      let t = ''; tc.items.forEach(it => { t += it.str + (it.hasEOL ? '\n' : ''); });
      if (!t.trim() && p.ocr) t = p.ocr.text || '';
      parts.push('=== Página ' + (i + 1) + ' ===\n' + t.trim());
    }
    return parts.join('\n\n');
  };

  /* ---------- imágenes del PDF ---------- */
  function getObj(jp, id) { return new Promise((res) => { const store = id.startsWith('g_') ? jp.commonObjs : jp.objs; try { store.get(id, (o) => res(o)); } catch (e) { try { res(store.get(id)); } catch (e2) { res(null); } } setTimeout(() => res(null), 4000); }); }
  PO.imageToCanvas = function (o) {
    if (!o) return null;
    if (o.bitmap) { const c = FP.canvas(o.bitmap.width, o.bitmap.height); c.getContext('2d').drawImage(o.bitmap, 0, 0); return c; }
    if (o.data && o.width) {
      const c = FP.canvas(o.width, o.height); const cx = c.getContext('2d'); const id = cx.createImageData(o.width, o.height); const d = id.data, s = o.data; const n = o.width * o.height;
      if (o.kind === 3) d.set(s.subarray(0, n * 4));
      else if (o.kind === 2) for (let i = 0, j = 0; i < n; i++) { d[i * 4] = s[j++]; d[i * 4 + 1] = s[j++]; d[i * 4 + 2] = s[j++]; d[i * 4 + 3] = 255; }
      else if (o.kind === 1) { const rb = (o.width + 7) >> 3; for (let y = 0; y < o.height; y++) for (let x = 0; x < o.width; x++) { const bit = (s[y * rb + (x >> 3)] >> (7 - (x & 7))) & 1; const v = bit ? 255 : 0; const i = (y * o.width + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } }
      cx.putImageData(id, 0, 0); return c;
    }
    return null;
  };
  /** Detecta imágenes dibujadas en la página: devuelve cajas en coordenadas base */
  PO.detectImages = async function (jp) {
    const lib = await FP.lib.pdfjs(); const OPS = lib.OPS; const ol = await jp.getOperatorList(); const vp = jp.getViewport({ scale: 1 });
    const res = []; let ctm = [1, 0, 0, 1, 0, 0]; const stack = [];
    const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
    for (let i = 0; i < ol.fnArray.length; i++) {
      const fn = ol.fnArray[i], a = ol.argsArray[i];
      if (fn === OPS.save) stack.push(ctm.slice()); else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.transform) ctm = mul(ctm, a);
      else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm.slice()); if (a && a[0]) ctm = mul(ctm, a[0]); }
      else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || ctm;
      else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageXObjectRepeat) {
        const id = typeof a[0] === 'string' ? a[0] : null;
        const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => vp.convertToViewportPoint(ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]));
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
        res.push({ id, inline: !id, x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), pw: a[1], ph: a[2] });
      }
    }
    return res.filter(r => r.w > 2 && r.h > 2);
  };
  PO.getImageCanvas = async (jp, id) => PO.imageToCanvas(await getObj(jp, id));
  /** Decodifica un XObject de imagen con pdf-lib. Devuelve {ext, blob} o null */
  PO.decodeImageStream = async function (doc, st) {
    const { PDFName, PDFArray, PDFRawStream, PDFNumber, decodePDFRawStream } = L();
    const d = st.dict; const num = (k) => { const v = d.lookup(PDFName.of(k)); return v instanceof PDFNumber ? v.asNumber() : null; };
    let filters = d.lookup(PDFName.of('Filter')); filters = !filters ? [] : filters instanceof PDFArray ? filters.asArray().map(x => x.asString()) : [filters.asString()];
    const last = filters[filters.length - 1];
    let bytes = st.contents;
    const pre = (last === '/DCTDecode' || last === '/JPXDecode') ? filters.slice(0, -1) : filters;
    if (pre.length) {
      const dd = d.clone(); dd.set(PDFName.of('Filter'), doc.context.obj(pre.map(f => PDFName.of(f.slice(1))))); const dp = d.lookup(PDFName.of('DecodeParms')); if (dp instanceof PDFArray) dd.set(PDFName.of('DecodeParms'), doc.context.obj(dp.asArray().slice(0, pre.length)));
      bytes = decodePDFRawStream(PDFRawStream.of(dd, st.contents)).decode();
    }
    if (last === '/DCTDecode') return { ext: 'jpg', blob: new Blob([bytes], { type: 'image/jpeg' }), jpeg: bytes };
    if (last === '/JPXDecode') return { ext: 'jp2', blob: new Blob([bytes], { type: 'image/jp2' }) };
    if (filters.some(f => !['/FlateDecode', '/LZWDecode', '/ASCII85Decode', '/ASCIIHexDecode', '/RunLengthDecode'].includes(f))) return null;
    const dp = d.lookup(PDFName.of('DecodeParms')); if (dp && dp.lookup) { const pr = dp.lookup(PDFName.of('Predictor')); if (pr && pr.asNumber() > 1) return null; }
    const W = num('Width'), H = num('Height'), bpc = num('BitsPerComponent') || 8; if (!W || !H) return null;
    let cs = d.lookup(PDFName.of('ColorSpace')); let n = 0, pal = null;
    const csN = (c) => { if (c === PDFName.of('DeviceRGB') || c === PDFName.of('CalRGB')) return 3; if (c === PDFName.of('DeviceGray') || c === PDFName.of('CalGray')) return 1; if (c === PDFName.of('DeviceCMYK')) return 4; if (c instanceof PDFArray) { const k = c.get(0); if (k === PDFName.of('ICCBased')) { const icc = doc.context.lookup(c.get(1)); const nn = icc && icc.dict.lookup(PDFName.of('N')); return nn ? nn.asNumber() : 3; } if (k === PDFName.of('CalRGB')) return 3; if (k === PDFName.of('CalGray')) return 1; } return 0; };
    if (d.lookup(PDFName.of('ImageMask'))) { n = 1; }
    else if (cs instanceof PDFArray && cs.get(0) === PDFName.of('Indexed')) { const base = csN(doc.context.lookup(cs.get(1)) || cs.get(1)); const lk = doc.context.lookup(cs.get(3)); const lb = lk && lk.asBytes ? lk.asBytes() : lk && lk.contents ? decodePDFRawStream(lk).decode() : null; if (!lb || base !== 3) return null; pal = lb; n = 1; }
    else n = csN(cs);
    if (!n || n === 2) return null;
    const c = FP.canvas(W, H); const cx = c.getContext('2d'); const id = cx.createImageData(W, H); const px = id.data;
    const rowBytes = Math.ceil(W * n * bpc / 8); const get = (row, i) => { if (bpc === 8) return bytes[row * rowBytes + i]; const bit = i * bpc; const b = bytes[row * rowBytes + (bit >> 3)]; return ((b >> (8 - bpc - (bit & 7))) & ((1 << bpc) - 1)) * (pal ? 1 : 255 / ((1 << bpc) - 1)); };
    if (bytes.length < rowBytes * H) return null;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4; const i = x * n;
      if (pal) { const k = get(y, i) * 3; px[o] = pal[k]; px[o + 1] = pal[k + 1]; px[o + 2] = pal[k + 2]; }
      else if (n === 1) { let v = get(y, i); if (d.lookup(PDFName.of('ImageMask'))) v = v ? 255 : 0; px[o] = px[o + 1] = px[o + 2] = v; }
      else if (n === 3) { px[o] = get(y, i); px[o + 1] = get(y, i + 1); px[o + 2] = get(y, i + 2); }
      else { const C = get(y, i) / 255, M = get(y, i + 1) / 255, Y = get(y, i + 2) / 255, K = get(y, i + 3) / 255; px[o] = 255 * (1 - C) * (1 - K); px[o + 1] = 255 * (1 - M) * (1 - K); px[o + 2] = 255 * (1 - Y) * (1 - K); }
      px[o + 3] = 255;
    }
    // máscara suave
    const sm = d.lookup(PDFName.of('SMask'));
    if (sm && sm.dict) { try { const r = await PO.decodeImageStream(doc, sm); if (r && r.canvas && r.canvas.width === W && r.canvas.height === H) { const md = r.canvas.getContext('2d').getImageData(0, 0, W, H).data; for (let k = 0; k < W * H; k++) px[k * 4 + 3] = md[k * 4]; } } catch (e) { } }
    cx.putImageData(id, 0, 0);
    return { ext: 'png', canvas: c, get blob() { return null; } };
  };
  PO.imageResult = async (r) => r.canvas ? FP.toBlob(r.canvas, 'image/png') : r.blob;
  /** Extrae todas las imágenes del documento final sin recomprimir cuando es posible (JPEG tal cual) */
  PO.extractImages = async function (E, prog) {
    const { PDFDocument, PDFName, PDFRawStream } = L();
    prog && prog.set(.05, 'Generando documento…');
    const doc = await PDFDocument.load(await PO.exportBytes(E, { noSecurity: true }), { updateMetadata: false });
    const smasks = new Set(); const imgs = [];
    doc.context.enumerateIndirectObjects().forEach(([ref, o]) => { if (o instanceof PDFRawStream && o.dict.lookup(PDFName.of('Subtype')) === PDFName.of('Image')) { imgs.push([ref, o]); const sm = o.dict.get(PDFName.of('SMask')); if (sm) smasks.add(sm.tag); const mk = o.dict.get(PDFName.of('Mask')); if (mk && mk.tag) smasks.add(mk.tag); } });
    const items = []; let k = 0, skipped = 0;
    for (const [ref, o] of imgs) {
      if (prog && prog.cancelled) throw new Error('Cancelado');
      if (smasks.has(ref.tag)) continue; prog && prog.set(.1 + .9 * (k / imgs.length), 'Imagen ' + (k + 1));
      try { const r = await PO.decodeImageStream(doc, o); if (!r) { skipped++; continue; } const b = await PO.imageResult(r); items.push({ name: 'imagen_' + String(++k).padStart(3, '0') + '.' + r.ext, blob: b }); if (r.canvas) r.canvas.width = 0; }
      catch (e) { console.warn(e); skipped++; }
    }
    items.skipped = skipped; return items;
  };
  /** Localiza el XObject de imagen de una página por sus dimensiones en píxeles */
  PO.findPageImage = async function (E, p, im) {
    const { PDFName, PDFDict } = L(); const sd = await PO.libDoc(E.src(p.src)); const pg = sd.getPage(p.idx);
    const res = pg.node.Resources(); const xo = res && res.lookup(PDFName.of('XObject')); const out = [];
    if (xo instanceof PDFDict) for (const [k, v] of xo.entries()) { const o = sd.context.lookup(v); if (o && o.dict && o.dict.lookup(PDFName.of('Subtype')) === PDFName.of('Image')) { const w = o.dict.lookup(PDFName.of('Width')).asNumber(), hh = o.dict.lookup(PDFName.of('Height')).asNumber(); if (w === im.pw && hh === im.ph) out.push({ name: k, stream: o, doc: sd }); } }
    return out;
  };
  PO.extractOneImage = async function (E, p, im) {
    const c = await PO.findPageImage(E, p, im);
    if (c.length) { const r = await PO.decodeImageStream(c[0].doc, c[0].stream); if (r) return { blob: await PO.imageResult(r), ext: r.ext }; }
    const cv = im.id ? await PO.getImageCanvas(await E.jsPage(E.src(p.src), p.idx), im.id) : null; if (cv && cv.width > 1) return { blob: await FP.toBlob(cv, 'image/png'), ext: 'png' };
    return null;
  };
  /** Sustitución / eliminación REAL de una imagen en el contenido original (crea un origen derivado) */
  PO.replaceImageReal = async function (E, p, im, newFile) {
    const { PDFDocument, PDFName, PDFDict, PDFRawStream, PDFNumber } = L();
    const src = E.src(p.src); const sd = await PO.libDoc(src);
    const nd = await PDFDocument.create(); const [cp] = await nd.copyPages(sd, [p.idx]); nd.addPage(cp);
    const res = cp.node.Resources(); const xo = res && res.lookup(PDFName.of('XObject'));
    if (!(xo instanceof PDFDict)) throw new Error('No se encontró el recurso de imagen en la página (puede estar dentro de un formulario XObject).');
    const cands = [];
    for (const [k, v] of xo.entries()) { const o = nd.context.lookup(v); if (o && o.dict && o.dict.lookup(PDFName.of('Subtype')) === PDFName.of('Image')) { const w = o.dict.lookup(PDFName.of('Width')).asNumber(), hh = o.dict.lookup(PDFName.of('Height')).asNumber(); if (w === im.pw && hh === im.ph) cands.push(k); } }
    if (cands.length !== 1) throw new Error(cands.length ? 'Hay varias imágenes idénticas en tamaño; no se puede identificar de forma segura.' : 'La imagen está anidada o es en línea; usa «Cubrir» o «Superponer».');
    let newRef;
    if (newFile) {
      const t = await FP.sniff(newFile); let emb;
      if (t === 'jpg') emb = await nd.embedJpg(new Uint8Array(await FP.readBuf(newFile)));
      else { const c = await FP.loadImageFile(newFile); emb = await nd.embedPng(new Uint8Array(await (await FP.toBlob(c, 'image/png')).arrayBuffer())); }
      newRef = emb.ref;
    } else { // imagen 1×1 totalmente transparente
      const c = FP.canvas(1, 1); const emb = await nd.embedPng(new Uint8Array(await (await FP.toBlob(c, 'image/png')).arrayBuffer())); newRef = emb.ref;
    }
    xo.set(cands[0], newRef);
    return nd.save();
  };

  /* ---------- páginas: recorte y tamaño ---------- */
  PO.cropPageBytes = async function (E, p, m) { // m en coordenadas base
    const { PDFDocument } = L(); const src = E.src(p.src); const sd = await PO.libDoc(src); const jp = await E.jsPage(src, p.idx); const vp = jp.getViewport({ scale: 1 });
    const nd = await PDFDocument.create(); const [cp] = await nd.copyPages(sd, [p.idx]); nd.addPage(cp);
    const r = rectPdf(vp, m.l, m.t, vp.width - m.l - m.r, vp.height - m.t - m.b);
    cp.setCropBox(r[0], r[1], r[2] - r[0], r[3] - r[1]);
    return nd.save();
  };
  PO.resizePageBytes = async function (E, p, PW, PH, mode) {
    const { PDFDocument, degrees } = L(); const src = E.src(p.src); const sd = await PO.libDoc(src); const jp = await E.jsPage(src, p.idx);
    const nd = await PDFDocument.create(); const [cp] = await nd.copyPages(sd, [p.idx]);
    const v = jp.view; const emb = await nd.embedPage(cp, { left: v[0], bottom: v[1], right: v[2], top: v[3] });
    const w0 = v[2] - v[0], h0 = v[3] - v[1]; const T = (p.origRot + p.rot) % 360; const dw = T % 180 ? h0 : w0, dh = T % 180 ? w0 : h0;
    let s = mode === 'stretch' ? null : mode === 'none' ? 1 : Math.min(PW / dw, PH / dh);
    const page = nd.addPage([PW, PH]);
    const sx = s || PW / dw, sy = s || PH / dh; const ox = (PW - sx * dw) / 2, oy = (PH - sy * dh) / 2;
    let ax = ox, ay = oy; const xs = T % 180 ? sy : sx, ys = T % 180 ? sx : sy;
    if (T === 90) { ax = ox; ay = oy + sy * dh; } else if (T === 180) { ax = ox + sx * dw; ay = oy + sy * dh; } else if (T === 270) { ax = ox + sx * dw; ay = oy; }
    page.drawPage(emb, { x: ax, y: ay, xScale: xs, yScale: ys, rotate: degrees(-T) });
    return { bytes: await nd.save(), sx, sy, ox, oy, dw, dh, T };
  };

  /* ---------- OCR ---------- */
  PO.ocrPages = async function (E, pages, langs, dpi, prog) {
    const T = await FP.lib.tesseract();
    prog.set(0, 'Descargando modelo de idioma (solo la primera vez)…');
    const worker = await T.createWorker(langs.join('+'), 1, { logger: (m) => { if (m.status && m.progress != null && prog.__cur != null) prog.set((prog.__cur + m.progress) / pages.length, `Página ${prog.__cur + 1} de ${pages.length}: ${m.status === 'recognizing text' ? 'reconociendo texto' : m.status}`); } });
    const results = [];
    try {
      for (let k = 0; k < pages.length; k++) {
        if (prog.cancelled) break; prog.__cur = k;
        const p = pages[k]; const jp = await E.jsPage(E.src(p.src), p.idx); const R = (p.origRot + p.rot) % 360;
        const vp = jp.getViewport({ scale: dpi / 72, rotation: R });
        const c = FP.canvas(vp.width, vp.height); const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
        await jp.render({ canvasContext: cx, canvas: c, viewport: vp }).promise;
        const { data } = await worker.recognize(c);
        const sc = 72 / dpi; const words = [];
        (data.words || []).forEach(w => { if (w.confidence < 20 || !w.text.trim()) return; const b = w.bbox; words.push({ text: w.text, x: b.x0 * sc, y: b.y0 * sc, w: (b.x1 - b.x0) * sc, h: (b.y1 - b.y0) * sc, conf: w.confidence }); });
        results.push({ page: p, ocr: { r: p.rot, words, text: data.text, conf: data.confidence } });
        c.width = c.height = 0;
      }
    } finally { await worker.terminate(); }
    return results;
  };

  /* ---------- reparar ---------- */
  PO.repair = async function (bytes, prog) {
    const { PDFDocument } = L();
    try {
      prog && prog.set(.2, 'Reconstruyendo estructura con pdf-lib…');
      const d = await PDFDocument.load(bytes, { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false });
      const nd = await PDFDocument.create(); const cp = await nd.copyPages(d, d.getPageIndices()); cp.forEach(p => nd.addPage(p));
      if (!nd.getPageCount()) throw new Error('sin páginas');
      const out = await nd.save({ useObjectStreams: true }); await PO.openPdfjs(out); return { bytes: out, method: 'estructura reconstruida (vectorial)' };
    } catch (e) {
      console.warn('reparación vectorial falló', e);
      prog && prog.set(.4, 'Rasterizando con PDF.js (modo tolerante)…');
      const pdf = await PO.openPdfjs(bytes); const nd = await PDFDocument.create();
      for (let i = 0; i < pdf.numPages; i++) {
        try { const fake = { pdfjs: pdf }; const pg = await PO.rasterPageInto(nd, fake, i, 150, .85); nd.addPage(pg); } catch (e2) { console.warn('página irrecuperable', i + 1); }
        prog && prog.set(.4 + .6 * i / pdf.numPages);
      }
      if (!nd.getPageCount()) throw new Error('No se pudo recuperar ninguna página');
      return { bytes: await nd.save(), method: 'páginas rasterizadas (el texto deja de ser seleccionable)' };
    }
  };
})();
