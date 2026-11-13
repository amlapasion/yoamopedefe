/* YO AMO EL PEDEFE · Editor PDF avanzado · núcleo: utilidades, UI común, carga diferida, almacenamiento local
   (procede del editor PDF de FOTOPEA; todo el código vive en el espacio de nombres FP para no chocar con el resto de la web) */
(function () {
  'use strict';
  const FP = window.FP = { version: '1.8.0' };

  /* ---------- DOM ---------- */
  FP.$ = (s, r) => (r || document).querySelector(s);
  FP.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  FP.h = function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k]; if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    kids.flat(Infinity).forEach(c => { if (c == null || c === false) return; el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); });
    return el;
  };
  FP.esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  FP.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  FP.uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  FP.fmtBytes = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(2) + ' MB' : (n / 1073741824).toFixed(2) + ' GB';
  FP.sleep = (ms) => new Promise(r => setTimeout(r, ms));
  FP.tick = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  FP.baseName = (n) => (n || 'documento').replace(/\.[^.]+$/, '');

  /* ---------- Iconos (SVG trazado) ---------- */
  const P = {
    pdf: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8.5 15.5h1.2a1.3 1.3 0 0 0 0-2.6H8.5V18M13 12.9V18h1a2 2 0 0 0 2-2v-1.1a2 2 0 0 0-2-2z"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    save: '<path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8V3M7 21v-7h10v7"/>',
    home: '<path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-4"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h4"/>',
    zoomin: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M11 8v6M8 11h6"/>',
    zoomout: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11h6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    fit: '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/>',
    fitw: '<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>',
    full: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
    rotr: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    rotl: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    pointer: '<path d="m4 3 7 17 2.5-7.5L21 10z"/>',
    hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/>',
    text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
    textedit: '<path d="M4 7V5h10v2M9 5v12M7 17h4"/><path d="m14.5 19.5 6-6-2-2-6 6-.5 2.5z"/>',
    img: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    rect: '<rect x="4" y="5" width="16" height="14" rx="1"/>',
    circle: '<circle cx="12" cy="12" r="8"/>',
    line: '<path d="M5 19 19 5"/>',
    arrow: '<path d="M5 19 19 5M9 5h10v10"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    brush: '<path d="M9.06 11.9 17.5 3.4a2 2 0 0 1 2.8 2.8l-8.4 8.5"/><path d="M7 14a3 3 0 0 0-3 3c0 1.5-1 2.5-2 3 4 1 8-.5 8-3a3 3 0 0 0-3-3z"/>',
    pencil: '<path d="M4 20l1.5-5L16 4.5a2.1 2.1 0 0 1 3 3L8.5 18z"/><path d="m13 7 3 3"/>',
    eraser: '<path d="m7 21-4-4 11-11 7 7-8 8z"/><path d="M7 21h13M10 10l7 7"/>',
    highlight: '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
    underline: '<path d="M6 4v6a6 6 0 0 0 12 0V4M4 20h16"/>',
    strike: '<path d="M16 6a4 4 0 0 0-4-2c-2.5 0-4 1.3-4 3 0 4 8 3 8 7 0 1.8-1.7 3-4 3a4.5 4.5 0 0 1-4.3-2.5M4 12h16"/>',
    note: '<path d="M15 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z"/><path d="M15 21v-6h6"/>',
    comment: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    sign: '<path d="M3 17c3-1 4-9 6-9s-1 9 1 9 3-5 4-5 1 3 3 3 3-2 4-2"/><path d="M3 21h18"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    form: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h4M7 13h10M7 17h6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    checkbox: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="m8 12 3 3 5-6"/>',
    radio: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor"/>',
    dropdown: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="m14 11 2 2 2-2"/>',
    whiteout: '<rect x="4" y="6" width="16" height="12" rx="1" fill="currentColor" fill-opacity=".25"/><path d="M8 10h8M8 14h5"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    pages: '<rect x="7" y="3" width="13" height="16" rx="1"/><path d="M4 7v13a1 1 0 0 0 1 1h11"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.9M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    folderl: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    mask: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="4" fill="currentColor" fill-opacity=".4"/>',
    adjust: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>',
    fx: '<path d="M10 4H7a2 2 0 0 0-2 2v14M3 12h6M14 9l6 8M20 9l-6 8"/>',
    marquee: '<path d="M4 8V5a1 1 0 0 1 1-1h3M12 4h0M16 4h3a1 1 0 0 1 1 1v3M20 12v0M20 16v3a1 1 0 0 1-1 1h-3M12 20v0M8 20H5a1 1 0 0 1-1-1v-3M4 12v0" stroke-dasharray="2 3"/>',
    ellipse: '<ellipse cx="12" cy="12" rx="9" ry="7" stroke-dasharray="3 3"/>',
    lasso: '<path d="M7 18c-2-1-4-3-4-6 0-4 4-7 9-7s9 3 9 7-4 6-9 6c-1 0-2 0-3-.3"/><circle cx="7.5" cy="19" r="2"/>',
    polylasso: '<path d="M4 6l8-3 8 6-4 9-8-1z" stroke-dasharray="3 2"/>',
    wand: '<path d="m15 4 1.5 1.5M19 8l1 0M18 3v1M4 20 14 10M12 8l4 4"/>',
    crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14M18 22V8a2 2 0 0 0-2-2H2"/>',
    move: '<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>',
    bucket: '<path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2a2 2 0 0 0 2.8 0z"/><path d="M5 2l5 5M2 13h15M22 20a2 2 0 1 1-4 0c0-1.6 2-4 2-4s2 2.4 2 4z"/>',
    gradient: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 15 15 3M3 21 21 3M9 21 21 9" opacity=".6"/>',
    dropper: '<path d="m2 22 1-1h3l9-9M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3z"/>',
    stamp: '<path d="M5 22h14M19.3 14H4.7a1 1 0 0 0-1 1.2l.6 2.9a1 1 0 0 0 1 .9h13.4a1 1 0 0 0 1-.9l.6-2.9a1 1 0 0 0-1-1.2zM9 14V9a3 3 0 1 1 6 0v5"/>',
    heal: '<rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-45 12 12)"/><path d="M11 11h.01M13 13h.01M11 13h.01M13 11h.01"/>',
    blur: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
    sharpen: '<path d="M12 3 5 20h14z"/>',
    smudge: '<path d="M8 14V5a2 2 0 0 1 4 0v6M12 10V4a2 2 0 0 1 4 0v8M16 11a2 2 0 0 1 4 0v3a7 7 0 0 1-7 7h-1a7 7 0 0 1-5-2l-3-3a2 2 0 0 1 3-3l1 1"/>',
    shapes: '<rect x="3" y="11" width="9" height="9" rx="1"/><circle cx="16" cy="8" r="5"/>',
    flip: '<path d="M12 3v18M8 7 3 12l5 5zM16 7l5 5-5 5z"/>',
    flipv: '<path d="M3 12h18M7 8l5-5 5 5zM7 16l5 5 5-5z"/>',
    transform: '<rect x="5" y="5" width="14" height="14"/><rect x="3" y="3" width="4" height="4" fill="currentColor"/><rect x="17" y="3" width="4" height="4" fill="currentColor"/><rect x="3" y="17" width="4" height="4" fill="currentColor"/><rect x="17" y="17" width="4" height="4" fill="currentColor"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 3"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/>',
    compress: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    zip: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M11 5h1M11 8h1M11 11h1M10.5 14h2v3h-2z"/>',
    merge: '<path d="M8 6h5a4 4 0 0 1 4 4v10M8 6l3-3M8 6l3 3M17 20l-3-3M17 20l3-3"/>',
    split: '<path d="M12 3v6M12 9 6 15v6M12 9l6 6v6"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    chevd: '<path d="m6 9 6 6 6-6"/>', chevr: '<path d="m9 6 6 6-6 6"/>', chevl: '<path d="m15 6-6 6 6 6"/>', chevu: '<path d="m6 15 6-6 6 6"/>',
    watermark: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/><path d="M9 14a3 3 0 0 0 3 3"/>',
    hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
    header: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h8M8 17h8"/>',
    blank: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M12 9v6M9 12h6"/>',
    resize: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
    wand2: '<path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M15 9h0M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5"/>',
    frame: '<rect x="2" y="2" width="20" height="20" rx="1"/><rect x="6" y="6" width="12" height="12"/>',
    collage: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M12 3v18M3 12h9"/>',
    social: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
    group: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/><path d="M7 11v6h6M17 13V7h-6" stroke-dasharray="2 2"/>',
    merged: '<path d="m12 3 9 5-9 5-9-5z"/><path d="M12 13v8"/>',
    bg: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 15l5-5 4 4 3-3 6 6"/><path d="M8 3v18" stroke-dasharray="2 2"/>',
    text2: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
    swap: '<path d="M7 4 3 8l4 4M3 8h13M17 20l4-4-4-4M21 16H8"/>',
    pin: '<path d="M12 17v5M5 17h14l-2-4V5H7v8z"/>',
    ocr: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8 9h8M12 9v7"/>',
    meta: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M9 13h6M9 17h4M9 9h1"/>',
    repair: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
    extract: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4"/><path d="M14 3v5h5M17 13v8M14 18l3 3 3-3"/>',
    insert: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M12 11v6M9 14h6"/>',
    flatten: '<path d="M3 12h18M3 17h18M7 7l5-4 5 4"/>',
    color: '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.3" fill="currentColor"/><circle cx="12" cy="7.5" r="1.3" fill="currentColor"/><circle cx="16" cy="10" r="1.3" fill="currentColor"/>',
  };
  FP.icon = (name, cls) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'i' + (cls ? ' ' + cls : '')); s.innerHTML = P[name] || P.file; return s; };
  FP.iconHTML = (name, cls) => `<svg viewBox="0 0 24 24" class="i ${cls || ''}">${P[name] || P.file}</svg>`;

  /** Capa para diálogos, menús y avisos del editor (estilos aislados con la clase .fp) */
  FP.portal = () => { let p = document.getElementById('fp-portal'); if (!p) { p = FP.h('div', { id: 'fp-portal', class: 'fp' }); document.body.appendChild(p); FP.applyTheme && FP.applyTheme(); } return p; };
  /* ---------- Tooltips ---------- */
  let tipEl = null, tipT = 0;
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest && e.target.closest('.fp [data-tip]'); clearTimeout(tipT);
    if (!t) { if (tipEl) tipEl.remove(); tipEl = null; return; }
    tipT = setTimeout(() => {
      if (!document.body.contains(t)) return;
      if (tipEl) tipEl.remove();
      tipEl = FP.h('div', { class: 'tip', html: FP.esc(t.dataset.tip) + (t.dataset.key ? `<span class="kbd">${FP.esc(t.dataset.key)}</span>` : '') });
      FP.portal().appendChild(tipEl);
      const r = t.getBoundingClientRect(), tr = tipEl.getBoundingClientRect();
      let x = r.right + 8, y = r.top + r.height / 2 - tr.height / 2;
      if (x + tr.width > innerWidth - 4) { x = r.left + r.width / 2 - tr.width / 2; y = r.bottom + 6; }
      if (y + tr.height > innerHeight - 4) y = r.top - tr.height - 6;
      tipEl.style.left = FP.clamp(x, 4, innerWidth - tr.width - 4) + 'px'; tipEl.style.top = Math.max(4, y) + 'px';
    }, 450);
  });
  document.addEventListener('mousedown', () => { clearTimeout(tipT); if (tipEl) { tipEl.remove(); tipEl = null; } }, true);

  /* ---------- Toasts ---------- */
  FP.toast = (msg, type, ms) => {
    let box = FP.$('.toasts'); if (!box) { box = FP.h('div', { class: 'toasts' }); FP.portal().appendChild(box); }
    const t = FP.h('div', { class: 'toast ' + (type || '') }, msg); box.appendChild(t); while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => t.remove(), ms || (type === 'err' ? 7000 : 3500));
  };
  FP.error = (e, ctx) => {
    console.error(ctx || '', e);
    let m = (e && e.message) || String(e);
    if (/memory|allocation|Array buffer allocation|RangeError/i.test(m)) m = 'Memoria insuficiente en el navegador. Prueba con un archivo más pequeño, menor resolución, o cierra otras pestañas.';
    FP.toast((ctx ? ctx + ': ' : '') + m, 'err');
  };

  /* ---------- Modales ---------- */
  FP.modal = function (opts) {
    return new Promise((resolve) => {
      const ovl = FP.h('div', { class: 'ovl' });
      const body = FP.h('div', { class: 'modal-b' });
      if (typeof opts.body === 'string') body.innerHTML = opts.body; else if (opts.body) body.appendChild(opts.body);
      const foot = FP.h('div', { class: 'modal-f' });
      const close = (v) => { if (opts.onClose && opts.onClose(v) === false) return; ovl.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
      (opts.buttons || [{ label: 'Cerrar', value: null }]).forEach(b => {
        if (b === '-') { foot.appendChild(FP.h('div', { class: 'sp' })); return; }
        const btn = FP.h('button', { class: 'btn ' + (b.primary ? 'pri ' : '') + (b.danger ? 'danger' : ''), onclick: async () => { if (b.onClick) { const r = await b.onClick(); if (r === false) return; if (r !== undefined) return close(r); } close(b.value); } }, b.icon ? FP.icon(b.icon, 's') : null, b.label);
        foot.appendChild(btn);
      });
      const m = FP.h('div', { class: 'modal ' + (opts.size || '') },
        FP.h('div', { class: 'modal-h' }, opts.icon ? FP.icon(opts.icon) : null, opts.title || 'Editor PDF', FP.h('div', { class: 'sp' }), FP.h('button', { class: 'ibtn', 'data-tip': 'Cerrar', onclick: () => close(null) }, FP.icon('x'))),
        body, foot);
      ovl.appendChild(m);
      ovl.addEventListener('mousedown', (e) => { if (e.target === ovl && !opts.sticky) close(null); });
      const onKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); close(null); }
        else if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') { const pri = foot.querySelector('.btn.pri'); if (pri) { e.preventDefault(); pri.click(); } }
        e.stopPropagation();
      };
      document.addEventListener('keydown', onKey, true);
      FP.portal().appendChild(ovl);
      const first = body.querySelector('input,select,textarea'); if (first) setTimeout(() => first.focus(), 30);
      if (opts.onOpen) opts.onOpen({ body, close, ovl });
    });
  };
  FP.confirm = (msg, title, okLabel, danger) => FP.modal({ title: title || 'Confirmar', icon: 'info', body: FP.h('div', null, msg), buttons: [{ label: 'Cancelar', value: false }, { label: okLabel || 'Aceptar', value: true, primary: !danger, danger }] }).then(v => !!v);
  FP.alert = (msg, title) => FP.modal({ title: title || 'Editor PDF', icon: 'info', body: typeof msg === 'string' ? FP.h('div', { html: msg }) : msg, buttons: [{ label: 'Aceptar', value: true, primary: true }] });

  /** Formulario genérico. fields: [{key,label,type,value,options,min,max,step,placeholder,hint,show(values)}] */
  FP.buildForm = function (fields, onChange) {
    const wrap = FP.h('div'); const inputs = {};
    const values = () => { const v = {}; for (const k in inputs) { const i = inputs[k]; v[k] = i.type === 'checkbox' ? i.checked : (i.type === 'number' || i.type === 'range') ? parseFloat(i.value) : i._radio ? (i.querySelector('input:checked') || {}).value : i.value; } return v; };
    const rows = [];
    let gridRow = null;
    fields.forEach(f => {
      if (f.type === 'note') { const n = FP.h('div', { class: 'note ' + (f.kind || ''), html: f.html || FP.esc(f.text) }); wrap.appendChild(n); rows.push({ f, el: n }); return; }
      if (f.type === 'html') { const n = FP.h('div', { html: f.html }); wrap.appendChild(n); rows.push({ f, el: n }); return; }
      if (f.type === 'node') { wrap.appendChild(f.node); rows.push({ f, el: f.node }); return; }
      let inp;
      if (f.type === 'select') { inp = FP.h('select', null, f.options.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return FP.h('option', { value: v, selected: String(v) === String(f.value) }, l); })); }
      else if (f.type === 'textarea') inp = FP.h('textarea', { rows: f.rows || 4, placeholder: f.placeholder || '' }, f.value || '');
      else if (f.type === 'checkbox') inp = FP.h('input', { type: 'checkbox', checked: !!f.value });
      else if (f.type === 'radio') { inp = FP.h('div', { style: { display: 'flex', gap: '12px', flexWrap: 'wrap' } }, f.options.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return FP.h('label', { class: 'fp-row' }, FP.h('input', { type: 'radio', name: 'r_' + f.key, value: v, checked: String(v) === String(f.value) }), l); })); inp._radio = true; }
      else if (f.type === 'range') { inp = FP.h('input', { type: 'range', min: f.min, max: f.max, step: f.step || 1, value: f.value }); }
      else inp = FP.h('input', { type: f.type || 'text', value: f.value != null ? f.value : '', min: f.min, max: f.max, step: f.step, placeholder: f.placeholder || '' });
      inputs[f.key] = inp;
      let row;
      if (f.type === 'checkbox') row = FP.h('label', { class: 'fp-row', style: { marginBottom: '8px' } }, inp, f.label);
      else if (f.type === 'range') {
        const out = FP.h('span', { class: 'badge' }, String(f.value) + (f.unit || ''));
        inp.addEventListener('input', () => out.textContent = inp.value + (f.unit || ''));
        row = FP.h('div', { class: 'field' }, FP.h('span', { style: { display: 'flex', justifyContent: 'space-between' } }, f.label, out), inp);
      }
      else row = FP.h('div', { class: 'field' }, FP.h('span', null, f.label), inp, f.hint ? FP.h('small', { class: 'fp-muted' }, f.hint) : null);
      if (f.half) { if (!gridRow) { gridRow = FP.h('div', { class: 'grid2' }); wrap.appendChild(gridRow); } gridRow.appendChild(row); if (gridRow.children.length === 2) gridRow = null; }
      else { gridRow = null; wrap.appendChild(row); }
      rows.push({ f, el: row });
      const ev = () => { refresh(); onChange && onChange(values()); };
      inp.addEventListener('input', ev); inp.addEventListener('change', ev);
    });
    const refresh = () => { const v = values(); rows.forEach(r => { if (r.f.show) r.el.style.display = r.f.show(v) ? '' : 'none'; }); };
    refresh();
    return { el: wrap, values, inputs, refresh };
  };
  FP.dialog = async function (title, fields, opts) {
    opts = opts || {};
    const form = FP.buildForm(fields, opts.onChange);
    const r = await FP.modal({ title, icon: opts.icon, size: opts.size, body: form.el, onOpen: opts.onOpen ? (m) => opts.onOpen(m, form) : null, buttons: [{ label: 'Cancelar', value: null }, { label: opts.ok || 'Aceptar', primary: true, onClick: () => { if (opts.validate) { const err = opts.validate(form.values()); if (err) { FP.toast(err, 'warn'); return false; } } return form.values(); } }] });
    return r;
  };

  /* ---------- Progreso ---------- */
  FP.progress = function (title, cancellable) {
    const bar = FP.h('div'); const txt = FP.h('div', { class: 'small fp-muted' }, 'Preparando…');
    const st = { cancelled: false };
    const ovl = FP.h('div', { class: 'ovl', style: { zIndex: 1500 } }, FP.h('div', { class: 'modal' },
      FP.h('div', { class: 'modal-h' }, FP.icon('history'), title),
      FP.h('div', { class: 'modal-b' }, FP.h('div', { class: 'prog' }, bar), txt),
      cancellable ? FP.h('div', { class: 'modal-f' }, FP.h('button', { class: 'btn', onclick: () => { st.cancelled = true; txt.textContent = 'Cancelando…'; } }, 'Cancelar')) : null));
    FP.portal().appendChild(ovl);
    st.set = (p, t) => { if (p != null) bar.style.width = Math.round(FP.clamp(p, 0, 1) * 100) + '%'; if (t != null) txt.textContent = t; };
    st.close = () => ovl.remove();
    return st;
  };
  FP.busy = async function (title, fn) { const p = FP.progress(title); p.set(null, 'Procesando…'); try { await FP.tick(); return await fn(p); } finally { p.close(); } };

  /* ---------- Menús desplegables ---------- */
  let openDD = null;
  FP.closeMenus = () => { if (openDD) { openDD.forEach(d => d.remove()); openDD = null; } FP.$$('.mb-item.open').forEach(e => e.classList.remove('open')); };
  FP.menu = function (pos, items, level) {
    if (!level) FP.closeMenus();
    openDD = openDD || [];
    while (openDD.length > (level || 0)) openDD.pop().remove();
    const dd = FP.h('div', { class: 'dd' });
    items.forEach(it => {
      if (!it) return;
      if (it === '-') { dd.appendChild(FP.h('div', { class: 'hr' })); return; }
      if (it.header) { dd.appendChild(FP.h('div', { class: 'hd' }, it.header)); return; }
      const dis = typeof it.disabled === 'function' ? it.disabled() : it.disabled;
      const chk = typeof it.checked === 'function' ? it.checked() : it.checked;
      const el = FP.h('div', { class: 'it' + (dis ? ' dis' : '') }, it.icon ? FP.icon(it.icon, 's') : (chk != null ? FP.h('span', { style: { width: '15px' } }, chk ? '✓' : '') : FP.h('span', { style: { width: '15px' } })), it.label, it.sub ? FP.h('span', { class: 'sub' }, FP.icon('chevr', 's')) : it.key ? FP.h('span', { class: 'k' }, it.key) : null);
      if (it.tip) el.title = it.tip;
      if (it.sub) el.addEventListener('mouseenter', () => { const r = el.getBoundingClientRect(); FP.menu({ x: r.right - 2, y: r.top - 5 }, it.sub, (level || 0) + 1); });
      else {
        el.addEventListener('mouseenter', () => { while (openDD && openDD.length > (level || 0) + 1) openDD.pop().remove(); });
        el.addEventListener('click', (e) => { e.stopPropagation(); FP.closeMenus(); setTimeout(() => { try { const r = it.action && it.action(); if (r && r.catch) r.catch(err => FP.error(err, it.label)); } catch (err) { FP.error(err, it.label); } }, 0); });
      }
      dd.appendChild(el);
    });
    FP.portal().appendChild(dd); openDD.push(dd);
    const r = dd.getBoundingClientRect();
    let x = pos.x, y = pos.y;
    if (x + r.width > innerWidth - 4) x = level ? pos.x - r.width - (pos.w || 230) + 4 : innerWidth - r.width - 4;
    if (y + r.height > innerHeight - 4) y = Math.max(4, innerHeight - r.height - 4);
    dd.style.left = Math.max(4, x) + 'px'; dd.style.top = y + 'px';
    return dd;
  };
  document.addEventListener('mousedown', (e) => { if (openDD && !(e.target.closest && (e.target.closest('.dd') || e.target.closest('.mb-item')))) FP.closeMenus(); });
  FP.menubar = function (bar, menus) {
    Object.keys(menus).forEach(name => {
      const el = FP.h('div', { class: 'mb-item' }, name);
      const open = () => { FP.closeMenus(); el.classList.add('open'); const r = el.getBoundingClientRect(); FP.menu({ x: r.left, y: r.bottom + 2 }, typeof menus[name] === 'function' ? menus[name]() : menus[name]); el.classList.add('open'); };
      el.addEventListener('mousedown', (e) => { e.preventDefault(); if (el.classList.contains('open')) FP.closeMenus(); else open(); });
      el.addEventListener('mouseenter', () => { if (FP.$('.mb-item.open') && !el.classList.contains('open')) open(); });
      bar.appendChild(el);
    });
  };

  /* ---------- Carga diferida de bibliotecas ---------- */
  const loaded = {};
  FP.loadScript = (src) => loaded[src] || (loaded[src] = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.async = true; s.onload = () => res(); s.onerror = () => { delete loaded[src]; rej(new Error('No se pudo cargar ' + src + '. Comprueba tu conexión.')); };
    document.head.appendChild(s);
  }));
  FP.isFile = location.protocol === 'file:';
  FP.lib = {
    async pdfjs() {
      // PDF.js 6 propio del editor, con nombres globales aislados (FPpdfjsLib) para no interferir con el PDF.js 3 de las demás herramientas
      if (window.FPpdfjsLib && window.FPpdfjsLib.__ready) return window.FPpdfjsLib;
      if (FP.isFile) await FP.loadScript('vendor/pdfjs/pdf.worker.js'); // trabajador en hilo principal (file://)
      await FP.loadScript('vendor/pdfjs/pdf.js');
      const lib = window.FPpdfjsLib;
      if (!FP.isFile) lib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.mjs', location.href).href;
      lib.__ready = true; return lib;
    },
    pdfjsOpts() { const b = new URL('vendor/pdfjs/', location.href).href; return { cMapUrl: b + 'cmaps/', cMapPacked: true, standardFontDataUrl: b + 'standard_fonts/', wasmUrl: b + 'wasm/', isEvalSupported: false, enableXfa: false }; },
    async pdflib() { if (!window.PDFLib) await FP.loadScript('vendor/pdf-lib.min.js'); return window.PDFLib; },
    async crypt() { await FP.lib.pdflib(); await FP.loadScript('editor/pdfcrypt.js'); return window.PDFCrypt; },
    async jszip() { if (!window.JSZip) await FP.loadScript('vendor/jszip.min.js'); return window.JSZip; },
    async tesseract() { if (window.Tesseract && window.Tesseract.createWorker) return window.Tesseract; await FP.loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'); return window.Tesseract; },
    async tiff() { await FP.loadScript('editor/tiff.js'); return window.FPTiff; },
  };

  /* ---------- Archivos ---------- */
  FP.pickFiles = (accept, multiple) => new Promise((res) => {
    const i = FP.h('input', { type: 'file', accept: accept || '', multiple: !!multiple, style: { display: 'none' } });
    i.addEventListener('change', () => { res(Array.from(i.files || [])); i.remove(); });
    window.addEventListener('focus', () => setTimeout(() => { if (!i.files || !i.files.length) { res([]); i.remove(); } }, 800), { once: true });
    document.body.appendChild(i); i.click();
  });
  FP.download = (blob, name) => {
    const url = URL.createObjectURL(blob); const a = FP.h('a', { href: url, download: name, style: { display: 'none' } });
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
    FP.toast('Descargado: ' + name + ' (' + FP.fmtBytes(blob.size) + ')', 'ok');
  };
  FP.readBuf = (f) => f.arrayBuffer ? f.arrayBuffer() : new Response(f).arrayBuffer();
  /** Detección por firma (no por extensión) */
  FP.sniff = async function (file) {
    const b = new Uint8Array(await FP.readBuf(file.slice(0, 64)));
    const s = String.fromCharCode.apply(null, b.slice(0, 32));
    const name = (file.name || '').toLowerCase();
    if (s.indexOf('%PDF') >= 0 && s.indexOf('%PDF') < 20) return 'pdf';
    if (b[0] === 0x89 && s.slice(1, 4) === 'PNG') return 'png';
    if (b[0] === 0xFF && b[1] === 0xD8) return 'jpg';
    if (s.slice(0, 4) === 'GIF8') return 'gif';
    if (s.slice(0, 4) === 'RIFF' && s.slice(8, 12) === 'WEBP') return 'webp';
    if (s.slice(0, 2) === 'BM') return 'bmp';
    if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 42) || (b[0] === 0x4D && b[1] === 0x4D && b[3] === 42)) return 'tiff';
    if (s.slice(0, 4) === '\x00\x00\x01\x00') return 'ico';
    if (b[0] === 0x50 && b[1] === 0x4B) return name.endsWith('.fotopea') ? 'project' : (name.endsWith('.pedefe') || name.endsWith('.fpdf')) ? 'pdfproject' : 'zip';
    if (/^\s*(<\?xml|<svg|<!DOCTYPE svg)/i.test(s) || name.endsWith('.svg')) return 'svg';
    if (name.endsWith('.avif')) return 'avif';
    if (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.csv')) return 'txt';
    if (name.endsWith('.pdf')) return 'pdf';
    return 'unknown';
  };
  FP.IMG_TYPES = ['png', 'jpg', 'gif', 'webp', 'bmp', 'tiff', 'svg', 'ico', 'avif'];
  FP.LIMITS = { pdfWarn: 150 * 1048576, imgWarn: 60 * 1048576, maxPixels: 16384 * 16384, warnPixels: 8000 * 8000 };

  /** Decodifica una imagen a canvas */
  FP.loadImageFile = async function (file, opts) {
    const t = await FP.sniff(file);
    if (t === 'tiff') { const T = await FP.lib.tiff(); const pages = await T.decode(await FP.readBuf(file)); if (!pages.length) throw new Error('TIFF vacío o no compatible'); const c = pages[0].canvas; c._info = pages.length > 1 ? `TIFF con ${pages.length} páginas: se abre la primera.` : ''; return c; }
    if (t === 'svg') {
      const txt = await file.text();
      // Sanitizado: se rasteriza mediante <img>, que nunca ejecuta scripts del SVG.
      const doc = new DOMParser().parseFromString(txt, 'image/svg+xml'); const svg = doc.documentElement;
      if (!svg || svg.nodeName.toLowerCase() !== 'svg') throw new Error('SVG no válido');
      let w = parseFloat(svg.getAttribute('width')), hh = parseFloat(svg.getAttribute('height'));
      const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
      if (!(w > 0) || /%/.test(svg.getAttribute('width') || '')) w = vb[2] || 800;
      if (!(hh > 0) || /%/.test(svg.getAttribute('height') || '')) hh = vb[3] || w;
      const scale = (opts && opts.svgScale) || 1;
      svg.setAttribute('width', w * scale); svg.setAttribute('height', hh * scale);
      if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${w} ${hh}`);
      const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
      const img = await FP.blobToImage(blob); const c = FP.canvas(Math.round(w * scale), Math.round(hh * scale)); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c;
    }
    if (!FP.IMG_TYPES.includes(t)) throw new Error('Formato de imagen no reconocido');
    const img = await FP.blobToImage(file);
    if (img.naturalWidth * img.naturalHeight > FP.LIMITS.maxPixels) throw new Error('La imagen es demasiado grande para el navegador (' + img.naturalWidth + '×' + img.naturalHeight + ').');
    const c = FP.canvas(img.naturalWidth, img.naturalHeight); c.getContext('2d').drawImage(img, 0, 0);
    if (t === 'gif') c._info = 'GIF abierto como imagen estática (solo el primer fotograma).';
    return c;
  };
  FP.blobToImage = (blob) => new Promise((res, rej) => { const u = URL.createObjectURL(blob); const i = new Image(); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = () => { URL.revokeObjectURL(u); rej(new Error('No se pudo decodificar la imagen (archivo dañado o formato no compatible con este navegador).')); }; i.src = u; });
  FP.canvas = (w, hh) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(hh)); return c; };
  FP.toBlob = (c, type, q) => new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('No se pudo codificar la imagen (¿demasiado grande?)')), type, q));
  FP.thumbDataURL = (src, max) => { const s = Math.min(1, (max || 200) / Math.max(src.width, src.height)); const c = FP.canvas(src.width * s, src.height * s); const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', .7); };

  /* ---------- IndexedDB ---------- */
  let dbp = null;
  const openDB = () => dbp || (dbp = new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('IndexedDB no disponible'));
    const r = indexedDB.open('pedefe-editor', 1);
    r.onupgradeneeded = () => { const d = r.result; ['recent', 'autosave', 'kv', 'signatures'].forEach(n => { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: 'id' }); }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (store, mode, fn) => { const d = await openDB(); return new Promise((res, rej) => { const t = d.transaction(store, mode); const s = t.objectStore(store); const r = fn(s); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Abortado (¿sin espacio?)')); }); };
  FP.db = {
    put: (store, obj) => tx(store, 'readwrite', s => s.put(obj)).catch(e => { console.warn(e); }),
    get: (store, id) => tx(store, 'readonly', s => s.get(id)).catch(() => null),
    del: (store, id) => tx(store, 'readwrite', s => s.delete(id)).catch(() => null),
    all: (store) => tx(store, 'readonly', s => s.getAll()).catch(() => []),
    clear: (store) => tx(store, 'readwrite', s => s.clear()).catch(() => null),
  };
  /* ---------- Ajustes ---------- */
  const defaults = { theme: 'light', recents: true, recentsKeepFile: true, autosave: true };
  FP.settings = Object.assign({}, defaults);
  try { Object.assign(FP.settings, JSON.parse(localStorage.getItem('pedefe.editor.settings') || '{}')); } catch (e) { }
  FP.saveSettings = () => { try { localStorage.setItem('pedefe.editor.settings', JSON.stringify(FP.settings)); } catch (e) { } };
  FP.applyTheme = () => document.querySelectorAll('.fp').forEach(e => e.setAttribute('data-theme', FP.settings.theme));
  FP.toggleTheme = () => { FP.settings.theme = FP.settings.theme === 'dark' ? 'light' : 'dark'; FP.applyTheme(); FP.saveSettings(); };
  FP.applyTheme();

  /** Archivos recientes (solo en este navegador) */
  FP.addRecent = async function (file, kind, thumb) {
    if (!FP.settings.recents) return;
    const id = kind + ':' + file.name + ':' + file.size;
    const rec = { id, name: file.name, size: file.size, kind, date: Date.now(), thumb: thumb || null };
    if (FP.settings.recentsKeepFile && file.size < 80 * 1048576) rec.blob = file;
    await FP.db.put('recent', rec);
    const all = (await FP.db.all('recent')).sort((a, b) => b.date - a.date);
    for (const r of all.slice(12)) await FP.db.del('recent', r.id);
  };

  /* ---------- Navegación y protección de cambios ---------- */
  FP.dirty = {};
  FP.isDirty = () => Object.values(FP.dirty).some(Boolean);
  window.addEventListener('beforeunload', (e) => { if (FP.isDirty()) { e.preventDefault(); e.returnValue = ''; } });
  FP.views = {};
  FP.current = null;
  /* ---------- Integración en YO AMO EL PEDEFE: el editor se monta en #pdfed (pantalla completa bajo la cabecera) ---------- */
  FP.mount = function () {
    let root = document.getElementById('pdfed');
    if (!root) { root = FP.h('div', { id: 'pdfed', class: 'fp ed' }); document.body.appendChild(root); FP.applyTheme(); }
    return root;
  };
  FP.show = async function (name, arg) {
    if (name !== 'pdf') return FP.hideEditor();
    const root = FP.mount(); root.hidden = false; document.documentElement.classList.add('fp-open'); FP.current = 'pdf';
    if (FP.views.pdf && FP.views.pdf.show) await FP.views.pdf.show(root, arg);
  };
  FP.hideEditor = function () { const root = document.getElementById('pdfed'); if (root) root.hidden = true; document.documentElement.classList.remove('fp-open'); FP.closeMenus && FP.closeMenus(); FP.current = null; };
  FP.ensureEditor = async function () {
    if (!FP.views.pdf) { await FP.busy('Cargando editor PDF…', async () => { await FP.lib.pdflib(); await FP.loadScript('editor/pdf-ops.js'); await FP.loadScript('editor/pdf-editor.js'); }); }
  };
  /** Abrir archivos en el editor PDF (PDF, proyectos, imágenes y TXT para convertir) */
  FP.openFiles = async function (files) {
    files = Array.from(files || []); if (!files.length) return;
    const types = await Promise.all(files.map(f => FP.sniff(f)));
    const pdfs = files.filter((f, i) => types[i] === 'pdf'), imgs = files.filter((f, i) => FP.IMG_TYPES.includes(types[i]));
    const pproj = files.find((f, i) => types[i] === 'pdfproject');
    const bad = files.filter((f, i) => types[i] === 'unknown' || types[i] === 'zip' || types[i] === 'project');
    if (bad.length) FP.toast('Formato no compatible: ' + bad.map(f => f.name).join(', '), 'warn');
    for (const f of files) if (f.size > (pdfs.includes(f) ? FP.LIMITS.pdfWarn : FP.LIMITS.imgWarn)) FP.toast(`${f.name} es grande (${FP.fmtBytes(f.size)}). Puede tardar y consumir mucha memoria.`, 'warn', 6000);
    await FP.ensureEditor(); await FP.show('pdf');
    if (pproj) return FP.views.pdf.openProject(pproj);
    const txts = files.filter((f, i) => types[i] === 'txt');
    if (pdfs.length) await FP.views.pdf.openFiles(pdfs);
    if (imgs.length || txts.length) await FP.views.pdf.insertConverted(imgs.concat(txts), !pdfs.length);
  };
  FP.goHome = () => { if (typeof window.goHome === 'function') window.goHome(); else FP.hideEditor(); };

  /** Soltar archivos sobre el editor (solo cuando está visible: no interfiere con las demás herramientas) */
  document.addEventListener('dragover', (e) => { if (FP.current === 'pdf' && e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) e.preventDefault(); });
  document.addEventListener('drop', (e) => {
    if (FP.current !== 'pdf' || !e.dataTransfer || !e.dataTransfer.files.length) return;
    if (e.defaultPrevented) return; e.preventDefault();
    if (FP.views.pdf && FP.views.pdf.onDropFiles) FP.views.pdf.onDropFiles(e.dataTransfer.files, e); else FP.openFiles(e.dataTransfer.files);
  });

  /** Paneles redimensionables */
  FP.makeResizable = function (panel, key, min, max) {
    const r = FP.h('div', { class: 'resizer' }); panel.appendChild(r);
    const left = panel.classList.contains('left');
    try { const w = localStorage.getItem('pedefe.editor.w.' + key); if (w) panel.style.width = w + 'px'; } catch (e) { }
    r.addEventListener('pointerdown', (e) => {
      e.preventDefault(); r.setPointerCapture(e.pointerId); const sx = e.clientX, sw = panel.offsetWidth;
      const mv = (ev) => { const w = FP.clamp(sw + (left ? ev.clientX - sx : sx - ev.clientX), min || 160, max || 520); panel.style.width = w + 'px'; window.dispatchEvent(new Event('resize')); };
      const up = () => { r.removeEventListener('pointermove', mv); r.removeEventListener('pointerup', up); try { localStorage.setItem('pedefe.editor.w.' + key, panel.offsetWidth); } catch (e) { } };
      r.addEventListener('pointermove', mv); r.addEventListener('pointerup', up);
    });
  };
  FP.isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  FP.mod = (e) => FP.isMac ? e.metaKey : e.ctrlKey;
  FP.inField = (e) => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); };
})();
