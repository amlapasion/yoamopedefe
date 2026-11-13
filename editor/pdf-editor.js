/* YO AMO EL PEDEFE · Editor PDF avanzado (interfaz, visor, herramientas, objetos) */
(function () {
  'use strict';
  const { h, icon } = FP; const PO = FP.PDFOps;
  const PX = 96 / 72; // px por punto al 100 %
  const E = window.PDFE = { S: null, hist: [], redo: [], tool: 'select', selId: null, selPages: new Set(), pending: null, jsCache: {}, textCache: {}, imgCache: {}, find: { q: '', hits: [], cur: -1 }, mode: 'view' };
  const D = E.defaults = { font: 'Helvetica', size: 14, color: '#1a1a1a', bold: false, italic: false, underline: false, align: 'left', stroke: '#e0312b', fill: '', sw: 2, opacity: 1, hl: '#ffe14d', ink: '#1d4ed8', inkW: 2.5 };
  const el = E.el = {};

  /* ======================= Estado ======================= */
  E.src = (id) => E.S.sources.find(s => s.id === id);
  E.page = (id) => E.S.pages.find(p => p.id === id);
  E.curPage = () => E.S && E.S.pages[E.S.cur || 0];
  E.jsPage = async (src, idx) => { const k = src.id + ':' + idx; return E.jsCache[k] || (E.jsCache[k] = src.pdfjs.getPage(idx + 1)); };
  E.findObj = (id) => { for (const p of E.S.pages) { const o = p.objs.find(x => x.id === id); if (o) return { p, o }; } return null; };
  E.dims = (p) => { const r = (p.origRot + p.rot) % 360; return (p.rot % 180) ? { W: p.h, H: p.w, R: r } : { W: p.w, H: p.h, R: r }; };

  async function addSource(bytes, name, enc) {
    const pdfjs = await PO.openPdfjs(bytes);
    const src = { id: FP.uid(), name, bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), pdfjs, enc: enc || null, n: pdfjs.numPages };
    E.S.sources.push(src); return src;
  }
  async function pagesFromSource(src, indices) {
    const out = [];
    for (const i of (indices || [...Array(src.n).keys()])) {
      const jp = await E.jsPage(src, i); const vp = jp.getViewport({ scale: 1 });
      out.push({ id: FP.uid(), src: src.id, idx: i, rot: 0, origRot: jp.rotate || 0, w: vp.width, h: vp.height, objs: [], ocr: null });
    }
    return out;
  }
  function freshState(name) { return { name: name || 'documento.pdf', sources: [], pages: [], assets: {}, stamps: [], meta: null, security: null, formValues: {}, zoom: 1, cur: 0 }; }

  /* ======================= Historial ======================= */
  const snap = () => JSON.stringify({ pages: E.S.pages, stamps: E.S.stamps, meta: E.S.meta, formValues: E.S.formValues, security: E.S.security });
  E.push = function (label) {
    if (!E.S) return; E.hist.push({ label, s: snap() }); if (E.hist.length > 80) E.hist.shift(); E.redo = []; E.changed();
  };
  E.changed = function () { FP.dirty.pdf = true; updateUndoBtns(); scheduleAutosave(); };
  function restore(s) {
    const o = JSON.parse(s); Object.assign(E.S, o);
    if (E.S.cur >= E.S.pages.length) E.S.cur = Math.max(0, E.S.pages.length - 1);
    if (E.selId && !E.findObj(E.selId)) E.selId = null;
    E.selPages = new Set([...E.selPages].filter(id => E.page(id)));
    E.layout(); E.renderSide(); E.renderProps();
  }
  E.undo = () => { if (!E.hist.length) return; const h0 = E.hist.pop(); E.redo.push({ label: h0.label, s: snap() }); restore(h0.s); FP.toast('Deshecho: ' + h0.label); E.changed(); };
  E.redoFn = () => { if (!E.redo.length) return; const r = E.redo.pop(); E.hist.push({ label: r.label, s: snap() }); restore(r.s); FP.toast('Rehecho: ' + r.label); E.changed(); };
  function updateUndoBtns() { if (el.undoB) { el.undoB.disabled = !E.hist.length; el.redoB.disabled = !E.redo.length; } }

  /* ======================= Construcción de la interfaz ======================= */
  const TOOLS = [
    ['select', 'pointer', 'Seleccionar y mover objetos', 'V'], ['hand', 'hand', 'Mano (desplazar)', 'H'], '-',
    ['text', 'text', 'Añadir texto', 'T'], ['edittext', 'textedit', 'Editar texto existente (sustitución visual)', 'E'], ['image', 'img', 'Añadir imagen', 'I'], ['pdfimg', 'scan', 'Imágenes del PDF: extraer, sustituir o eliminar', 'G'], '-',
    ['rect', 'rect', 'Rectángulo', 'R'], ['ellipse', 'circle', 'Elipse / círculo', 'O'], ['line', 'line', 'Línea', 'L'], ['arrow', 'arrow', 'Flecha', 'A'], ['ink', 'pen', 'Dibujo a mano alzada', 'P'], ['whiteout', 'whiteout', 'Tapar (corrector blanco)', 'W'], '-',
    ['highlight', 'highlight', 'Resaltar texto', 'U'], ['underline', 'underline', 'Subrayar texto'], ['strike', 'strike', 'Tachar texto'], ['note', 'note', 'Nota adhesiva (comentario)', 'N'], ['link', 'link', 'Enlace', 'K'], '-',
    ['sign', 'sign', 'Firma (visual)', 'S'], ['f_text', 'form', 'Campo de texto'], ['f_checkbox', 'checkbox', 'Casilla de verificación'], ['f_radio', 'radio', 'Botón de opción'], ['f_dropdown', 'dropdown', 'Lista desplegable'],
  ];
  function build(root) {
    root.innerHTML = '';
    el.root = root;
    el.menubar = h('div', { class: 'menubar' }, h('button', { class: 'btn sm fp-ghost fp-home', 'data-tip': 'Volver a todas las herramientas', onclick: () => FP.goHome() }, icon('chevl', 's'), h('span', { class: 'mark' }, '♥'), 'Editor PDF'));
    FP.menubar(el.menubar, menus());
    el.docname = h('div', { class: 'docname' });
    el.undoB = h('button', { class: 'ibtn', 'data-tip': 'Deshacer', 'data-key': 'Ctrl+Z', onclick: E.undo }, icon('undo'));
    el.redoB = h('button', { class: 'ibtn', 'data-tip': 'Rehacer', 'data-key': 'Ctrl+Y', onclick: E.redoFn }, icon('redo'));
    el.menubar.append(h('div', { class: 'sp' }), el.docname, el.undoB, el.redoB,
      h('button', { class: 'btn sm pri', style: { marginLeft: '6px' }, onclick: () => E.saveDialog() }, icon('download', 's'), 'Guardar PDF'),
      h('button', { class: 'ibtn', 'data-tip': 'Tema claro/oscuro', onclick: FP.toggleTheme }, icon('sun')));
    el.optbar = h('div', { class: 'optbar' });
    el.toolbar = h('div', { class: 'toolbar' });
    TOOLS.forEach(t => {
      if (t === '-') { el.toolbar.appendChild(h('div', { class: 'tsep' })); return; }
      const b = h('button', { class: 'ibtn', 'data-tip': t[2], 'data-key': t[3] || '', 'data-tool': t[0], onclick: () => E.setTool(t[0]) }, icon(t[1]));
      el.toolbar.appendChild(b);
    });
    // panel izquierdo
    el.left = h('div', { class: 'side left' });
    el.ltabs = h('div', { class: 'tabs' });
    el.lbody = h('div', { class: 'pnl-b' });
    el.left.append(el.ltabs, el.lbody);
    FP.makeResizable(el.left, 'pdfleft', 150, 420);
    el.left.style.width = el.left.style.width || '190px';
    // trabajo
    el.work = h('div', { class: 'work' });
    // panel derecho
    el.right = h('div', { class: 'side' });
    el.rtabs = h('div', { class: 'tabs' }); el.rbody = h('div', { class: 'pnl-b' });
    el.right.append(el.rtabs, el.rbody); FP.makeResizable(el.right, 'pdfright', 220, 480);
    el.status = h('div', { class: 'statusbar' });
    root.append(el.menubar, el.optbar, h('div', { class: 'edbody' }, el.toolbar, el.left, el.work, el.right), el.status);
    el.work.addEventListener('scroll', onScroll, { passive: true });
    el.work.addEventListener('wheel', (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); E.setZoom(E.S.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e); } }, { passive: false });
    el.work.addEventListener('pointerdown', (e) => { if (e.target === el.work || e.target.classList.contains('pages')) { E.select(null); } });
    E.leftTab = 'pages'; E.rightTab = 'props';
    renderEmpty();
  }
  function renderEmpty() {
    el.work.innerHTML = '';
    const dz = h('div', { class: 'fp-drop', style: { margin: '60px auto', maxWidth: '560px' } }, icon('pdf'), h('h3', null, 'Abre un PDF para empezar'),
      h('div', { class: 'fp-muted' }, 'Arrastra un PDF aquí, o crea un documento en blanco. También puedes soltar imágenes para convertirlas a PDF.'),
      h('div', { style: { marginTop: '14px', display: 'flex', gap: '8px', justifyContent: 'center' } },
        h('button', { class: 'btn pri', onclick: () => E.openDialog() }, icon('folder', 's'), 'Abrir PDF'),
        h('button', { class: 'btn', onclick: () => E.newBlank() }, icon('plus', 's'), 'PDF en blanco'),
        h('button', { class: 'btn', onclick: async () => { const f = await FP.pickFiles('.pedefe,.fpdf'); if (f[0]) E.openProject(f[0]); } }, icon('save', 's'), 'Abrir proyecto')));
    const extra = h('div', { style: { maxWidth: '760px', margin: '0 auto 40px', padding: '0 16px' } });
    el.work.append(dz, extra); renderLocal(extra); el.lbody.innerHTML = ''; el.rbody.innerHTML = ''; el.ltabs.innerHTML = ''; el.rtabs.innerHTML = ''; el.optbar.innerHTML = '';
    el.docname.textContent = ''; el.status.textContent = 'Sin documento';
    FP.$$('[data-tool]', el.toolbar).forEach(b => b.disabled = true);
  }

  /** Trabajo recuperable y archivos recientes (guardados solo en este navegador) */
  async function renderLocal(box) {
    box.innerHTML = '';
    const auto = await FP.db.get('autosave', 'pdf');
    if (auto) box.appendChild(h('div', { class: 'note warn', style: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } }, h('span', { style: { flex: 1 } }, 'Hay un trabajo sin guardar de «' + auto.name + '» (' + new Date(auto.date).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) + ').'),
      h('button', { class: 'btn sm pri', onclick: () => E.restoreAutosave(auto) }, 'Recuperar'), h('button', { class: 'btn sm', onclick: async () => { await FP.db.del('autosave', 'pdf'); renderLocal(box); } }, 'Descartar')));
    const head = h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', margin: '18px 0 8px' } }, h('b', { style: { flex: 1 } }, 'Recientes en este navegador'),
      h('button', { class: 'btn sm fp-ghost', onclick: privacyDialog }, icon('shield', 's'), 'Privacidad'), h('button', { class: 'btn sm fp-ghost', onclick: async () => { await clearLocal(); renderLocal(box); } }, icon('trash', 's'), 'Borrar datos locales'));
    box.appendChild(head);
    if (!FP.settings.recents) return box.appendChild(h('div', { class: 'fp-muted small' }, 'El historial de archivos recientes está desactivado.'));
    const all = (await FP.db.all('recent')).sort((a, b) => b.date - a.date);
    if (!all.length) return box.appendChild(h('div', { class: 'fp-muted small' }, 'Aún no has abierto documentos en el editor.'));
    const grid = h('div', { class: 'recent' });
    all.forEach(r => {
      const el2 = h('div', { class: 'rc', 'data-tip': r.blob ? 'Abrir' : 'El archivo no se guardó: vuelve a seleccionarlo' }, h('div', { class: 'fp-th', style: r.thumb ? { backgroundImage: `url(${r.thumb})` } : null }, r.thumb ? null : icon('pdf')),
        h('div', { class: 'nm' }, r.name), h('div', { class: 'dt' }, new Date(r.date).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) + ' · ' + FP.fmtBytes(r.size)),
        h('button', { class: 'x', 'data-tip': 'Quitar de recientes', onclick: async (e) => { e.stopPropagation(); await FP.db.del('recent', r.id); renderLocal(box); } }, icon('x', 's')));
      el2.addEventListener('click', async () => { if (r.blob) FP.openFiles([new File([r.blob], r.name, { type: 'application/pdf' })]).catch(e => FP.error(e)); else { const fs = await FP.pickFiles('.pdf'); if (fs.length) FP.openFiles(fs); } });
      grid.appendChild(el2);
    });
    box.appendChild(grid);
  }
  async function privacyDialog() {
    const v = await FP.dialog('Privacidad y almacenamiento local', [
      { type: 'note', html: 'El editor procesa tus documentos <b>en tu navegador</b>; no se envían a ningún servidor. Solo el OCR descarga sus modelos de idioma la primera vez (no se envía ningún documento).' },
      { key: 'recents', type: 'checkbox', label: 'Recordar documentos recientes en este navegador', value: FP.settings.recents },
      { key: 'recentsKeepFile', type: 'checkbox', label: 'Guardar una copia local para reabrirlos con un clic (máx. 80 MB por archivo)', value: FP.settings.recentsKeepFile },
      { key: 'autosave', type: 'checkbox', label: 'Autoguardado local (recuperación tras un cierre inesperado)', value: FP.settings.autosave },
      { type: 'note', kind: 'warn', text: 'En ordenadores compartidos desactiva estas opciones y pulsa «Borrar datos locales».' }], { icon: 'shield' });
    if (!v) return; Object.assign(FP.settings, v); FP.saveSettings();
    if (!v.recentsKeepFile) { for (const r of await FP.db.all('recent')) { delete r.blob; await FP.db.put('recent', r); } }
    if (!v.autosave) await FP.db.clear('autosave');
    if (!E.S) renderEmpty();
  }
  async function clearLocal() {
    if (!await FP.confirm('Se borrarán los documentos recientes, el autoguardado y las firmas guardadas del editor en este navegador.', 'Borrar datos locales', 'Borrar', true)) return;
    for (const st of ['recent', 'autosave', 'signatures']) await FP.db.clear(st); FP.toast('Datos locales borrados', 'ok');
  }

  /* ======================= Menús ======================= */
  function menus() {
    const need = () => !E.S || !E.S.pages.length;
    return {
      Archivo: () => [
        { label: 'Abrir PDF…', icon: 'folder', key: 'Ctrl+O', action: () => E.openDialog() },
        { label: 'Nuevo PDF en blanco…', icon: 'plus', action: () => E.newBlank() },
        { label: 'Abrir proyecto (.pedefe)…', icon: 'folder', action: async () => { const f = await FP.pickFiles('.pedefe,.fpdf'); if (f[0]) E.openProject(f[0]); } },
        '-',
        { label: 'Guardar PDF…', icon: 'download', key: 'Ctrl+S', disabled: need, action: () => E.saveDialog() },
        { label: 'Guardar proyecto editable (.pedefe)', icon: 'save', key: 'Ctrl+Mayús+S', disabled: need, action: () => E.saveProject() },
        { label: 'Exportar páginas seleccionadas…', icon: 'extract', disabled: need, action: () => E.exportSelected() },
        { label: 'Exportar como imágenes (JPG/PNG/WEBP)…', icon: 'image', disabled: need, action: () => E.toImagesDialog() },
        { label: 'Exportar texto (TXT)', icon: 'text', disabled: need, action: () => E.extractTextDialog() },
        { label: 'Extraer imágenes (ZIP)', icon: 'zip', disabled: need, action: () => E.extractImages() },
        '-',
        { label: 'Exportar página actual como imagen PNG…', icon: 'image', disabled: need, action: () => E.pageToImage() },
        { label: 'Cerrar documento', icon: 'x', disabled: need, action: () => E.close() },
        { label: 'Volver al inicio', icon: 'home', action: () => FP.goHome() },
      ],
      Edición: () => [
        { label: 'Deshacer', icon: 'undo', key: 'Ctrl+Z', disabled: () => !E.hist.length, action: E.undo },
        { label: 'Rehacer', icon: 'redo', key: 'Ctrl+Y', disabled: () => !E.redo.length, action: E.redoFn },
        { label: 'Historial…', icon: 'history', disabled: need, action: historyDialog },
        '-',
        { label: 'Copiar objeto', icon: 'copy', key: 'Ctrl+C', disabled: () => !E.selId, action: () => E.copyObj() },
        { label: 'Pegar objeto', key: 'Ctrl+V', disabled: () => !E.clip, action: () => E.pasteObj() },
        { label: 'Duplicar objeto', key: 'Ctrl+D', disabled: () => !E.selId, action: () => E.duplicateObj() },
        { label: 'Eliminar objeto', icon: 'trash', key: 'Supr', disabled: () => !E.selId, action: () => E.deleteObj() },
        '-',
        { label: 'Buscar texto…', icon: 'search', key: 'Ctrl+F', disabled: need, action: () => E.showLeft('find') },
      ],
      Ver: () => [
        { label: 'Acercar', icon: 'zoomin', key: 'Ctrl++', disabled: need, action: () => E.setZoom(E.S.zoom * 1.25) },
        { label: 'Alejar', icon: 'zoomout', key: 'Ctrl+-', disabled: need, action: () => E.setZoom(E.S.zoom / 1.25) },
        { label: 'Tamaño real (100 %)', key: 'Ctrl+1', disabled: need, action: () => E.setZoom(1) },
        { label: 'Ajustar a la página', icon: 'fit', key: 'Ctrl+0', disabled: need, action: () => E.fit('page') },
        { label: 'Ajustar al ancho', icon: 'fitw', key: 'Ctrl+2', disabled: need, action: () => E.fit('width') },
        '-',
        { label: 'Organizar páginas (cuadrícula)', icon: 'grid', checked: () => E.mode === 'organize', disabled: need, action: () => E.setMode(E.mode === 'organize' ? 'view' : 'organize') },
        { label: 'Pantalla completa', icon: 'full', key: 'F11', action: () => E.fullscreen() },
        { label: 'Tema claro / oscuro', icon: 'sun', action: FP.toggleTheme },
      ],
      Insertar: () => [
        { label: 'Texto', icon: 'text', action: () => E.setTool('text') },
        { label: 'Imagen…', icon: 'img', action: () => E.setTool('image') },
        { label: 'Firma…', icon: 'sign', action: () => E.setTool('sign') },
        { label: 'Formas', icon: 'shapes', sub: [{ label: 'Rectángulo', icon: 'rect', action: () => E.setTool('rect') }, { label: 'Elipse', icon: 'circle', action: () => E.setTool('ellipse') }, { label: 'Línea', icon: 'line', action: () => E.setTool('line') }, { label: 'Flecha', icon: 'arrow', action: () => E.setTool('arrow') }, { label: 'Mano alzada', icon: 'pen', action: () => E.setTool('ink') }] },
        { label: 'Nota adhesiva', icon: 'note', action: () => E.setTool('note') },
        { label: 'Enlace', icon: 'link', action: () => E.setTool('link') },
        { label: 'Campo de formulario', icon: 'form', sub: [{ label: 'Texto', action: () => E.setTool('f_text') }, { label: 'Casilla', action: () => E.setTool('f_checkbox') }, { label: 'Botón de opción', action: () => E.setTool('f_radio') }, { label: 'Lista desplegable', action: () => E.setTool('f_dropdown') }] },
        '-',
        { label: 'Marca de agua…', icon: 'watermark', disabled: need, action: () => E.stampDialog({ type: 'watermark' }) },
        { label: 'Numeración de páginas…', icon: 'hash', disabled: need, action: () => E.stampDialog({ type: 'pagenum' }) },
        { label: 'Encabezado…', icon: 'header', disabled: need, action: () => E.stampDialog({ type: 'header' }) },
        { label: 'Pie de página…', icon: 'header', disabled: need, action: () => E.stampDialog({ type: 'footer' }) },
      ],
      Páginas: () => [
        { label: 'Insertar página en blanco', icon: 'blank', disabled: need, action: () => E.insertBlank() },
        { label: 'Insertar páginas de otro PDF…', icon: 'insert', disabled: need, action: () => E.insertFromPdf() },
        { label: 'Insertar imágenes como páginas…', icon: 'image', action: async () => { const f = await FP.pickFiles('image/*,.tif,.tiff,.svg,.txt', true); if (f.length) E.insertConverted(f, !E.S || !E.S.pages.length); } },
        { label: 'Combinar con otros PDF (al final)…', icon: 'merge', action: () => E.mergeDialog() },
        '-',
        { label: 'Rotar a la derecha', icon: 'rotr', key: 'Ctrl+R', disabled: need, action: () => E.rotatePages(90) },
        { label: 'Rotar a la izquierda', icon: 'rotl', key: 'Ctrl+Mayús+R', disabled: need, action: () => E.rotatePages(-90) },
        { label: 'Duplicar', icon: 'copy', disabled: need, action: () => E.duplicatePages() },
        { label: 'Eliminar', icon: 'trash', disabled: need, action: () => E.deletePages() },
        { label: 'Mover arriba', icon: 'chevu', disabled: need, action: () => E.movePagesBy(-1) },
        { label: 'Mover abajo', icon: 'chevd', disabled: need, action: () => E.movePagesBy(1) },
        { label: 'Seleccionar todas', key: 'Ctrl+Mayús+A', disabled: need, action: () => { E.selPages = new Set(E.S.pages.map(p => p.id)); E.renderSide(); } },
        '-',
        { label: 'Extraer páginas…', icon: 'extract', disabled: need, action: () => E.exportSelected() },
        { label: 'Dividir PDF…', icon: 'split', disabled: need, action: () => E.splitDialog() },
        { label: 'Cambiar tamaño de página…', icon: 'resize', disabled: need, action: () => E.resizeDialog() },
        { label: 'Recortar márgenes…', icon: 'crop', disabled: need, action: () => E.cropDialog() },
        { label: 'Detectar páginas en blanco…', icon: 'scan', disabled: need, action: () => E.blankDetect() },
        { label: 'Organizar páginas', icon: 'grid', disabled: need, action: () => E.setMode('organize') },
      ],
      Documento: () => [
        { label: 'Comprimir / reducir tamaño…', icon: 'compress', disabled: need, action: () => E.compressDialog() },
        { label: 'Seguridad: contraseña y permisos…', icon: 'lock', disabled: need, action: () => E.securityDialog() },
        { label: 'Metadatos…', icon: 'meta', disabled: need, action: () => E.metaDialog() },
        '-',
        { label: 'OCR: reconocer texto…', icon: 'ocr', disabled: need, action: () => E.ocrDialog() },
        { label: 'Formulario: rellenar campos', icon: 'form', disabled: need, action: () => E.showRight('form') },
        { label: 'Sellos (marca de agua, numeración…)', icon: 'watermark', disabled: need, action: () => E.showRight('stamps') },
        '-',
        { label: 'Extraer texto', icon: 'text', disabled: need, action: () => E.extractTextDialog() },
        { label: 'Extraer imágenes (ZIP)', icon: 'zip', disabled: need, action: () => E.extractImages() },
        { label: 'Reparar PDF dañado…', icon: 'repair', action: () => E.repairDialog() },
        { label: 'Información del documento', icon: 'info', disabled: need, action: () => E.infoDialog() },
      ],
      Ayuda: () => [
        { label: 'Atajos de teclado', icon: 'info', action: shortcutsHelp },
        { label: 'Limitaciones', icon: 'info', action: limitsHelp },
        { label: 'Privacidad y almacenamiento…', icon: 'shield', action: privacyDialog },
        { label: 'Borrar datos locales…', icon: 'trash', action: clearLocal },
      ],
    };
  }

  /* ======================= Apertura ======================= */
  E.openDialog = async () => { const f = await FP.pickFiles('application/pdf,.pdf,.pedefe,.fpdf', true); if (f.length) FP.openFiles(f, 'pdf'); };
  E.confirmDiscard = async () => { if (!E.S || !FP.dirty.pdf) return true; return FP.confirm('Hay cambios sin guardar en «' + E.S.name + '». ¿Descartarlos?', 'Cambios sin guardar', 'Descartar', true); };
  E.openFiles = async function (files) {
    if (E.S && E.S.pages.length) {
      const choice = await FP.modal({ title: 'Ya hay un documento abierto', icon: 'pdf', body: h('div', null, '¿Qué quieres hacer con ' + files.map(f => f.name).join(', ') + '?'), buttons: [{ label: 'Cancelar', value: null }, { label: 'Abrir y cerrar el actual', value: 'new' }, { label: 'Añadir al final del documento', value: 'append', primary: true }] });
      if (!choice) return;
      if (choice === 'append') { for (const f of files) await E.appendPdfFile(f); return; }
      if (!await E.confirmDiscard()) return;
    }
    await E.load(files[0]);
    for (const f of files.slice(1)) await E.appendPdfFile(f, true);
    if (files.length > 1) { E.hist = []; FP.toast(files.length + ' PDF combinados. Reordena las páginas si lo necesitas.', 'ok'); }
  };
  E.load = async function (file) {
    const p = FP.progress('Abriendo ' + file.name);
    try {
      p.set(.1, 'Leyendo archivo…');
      const raw = new Uint8Array(await FP.readBuf(file));
      await FP.lib.pdflib(); await FP.lib.pdfjs();
      p.set(.25, 'Comprobando cifrado…');
      let prep; p.close(); prep = await PO.prepareBytes(raw, file.name);
      const p2 = FP.progress('Abriendo ' + file.name); p2.set(.4, 'Analizando páginas…');
      try {
        E.resetState(file.name);
        const src = await addSource(prep.bytes, file.name, prep.enc);
        E.S.pages = await pagesFromSource(src);
        if (prep.enc) FP.toast(`Documento descifrado (${prep.enc.method}). Se guardará sin contraseña salvo que configures Seguridad.`, 'ok', 6000);
        p2.set(.9, 'Preparando vista…');
        E.afterLoad();
        thumbForRecent(src).then(t => FP.addRecent(file, 'pdf', t));
      } finally { p2.close(); }
    } catch (e) { p.close(); if (e.message !== 'Apertura cancelada') FP.error(e, 'No se pudo abrir el PDF'); }
  };
  async function thumbForRecent(src) { try { const jp = await E.jsPage(src, 0); const vp = jp.getViewport({ scale: 160 / jp.getViewport({ scale: 1 }).width }); const c = FP.canvas(vp.width, vp.height); const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height); await jp.render({ canvasContext: cx, canvas: c, viewport: vp }).promise; return c.toDataURL('image/jpeg', .7); } catch (e) { return null; } }
  E.resetState = function (name) {
    E.cleanup();
    E.S = freshState(name); E.hist = []; E.redo = []; E.selId = null; E.selPages = new Set(); E.jsCache = {}; E.textCache = {}; E.find = { q: '', hits: [], cur: -1 };
  };
  E.cleanup = function () {
    if (!E.S) return;
    E.S.sources.forEach(s => { PO.closePdf(s.pdfjs); s.lib = null; });
    Object.values(E.S.assets || {}).forEach(a => { if (a.url) URL.revokeObjectURL(a.url); });
    if (el.pages) el.pages.querySelectorAll('canvas').forEach(c => { c.width = c.height = 0; });
  };
  E.afterLoad = function () {
    FP.$$('[data-tool]', el.toolbar).forEach(b => b.disabled = false);
    E.mode = 'view'; E.S.cur = 0; E.selPages = new Set();
    E.fit('width', true); E.layout(); E.renderSide(); E.renderProps(); E.setTool('select');
    el.docname.textContent = E.S.name; FP.dirty.pdf = false; updateUndoBtns(); E.formFields = null;
  };
  E.appendPdfFile = async function (file, silent) {
    const raw = new Uint8Array(await FP.readBuf(file)); const prep = await PO.prepareBytes(raw, file.name);
    if (!silent) E.push('Combinar ' + file.name);
    const src = await addSource(prep.bytes, file.name, prep.enc); const pages = await pagesFromSource(src);
    E.S.pages.push(...pages); E.layout(); E.renderSide(); if (!silent) FP.toast(`Añadidas ${pages.length} páginas de ${file.name}`, 'ok');
  };
  E.newBlank = async function () {
    if (!await E.confirmDiscard()) return;
    const v = await FP.dialog('Nuevo PDF en blanco', [
      { key: 'size', type: 'select', label: 'Tamaño', value: 'A4', options: Object.keys(PO.PAGE_SIZES).concat([['custom', 'Personalizado (mm)']]) },
      { key: 'orient', type: 'radio', label: 'Orientación', value: 'port', options: [['port', 'Vertical'], ['land', 'Horizontal']] },
      { key: 'w', type: 'number', label: 'Ancho (mm)', value: 210, half: true, show: v => v.size === 'custom' }, { key: 'h', type: 'number', label: 'Alto (mm)', value: 297, half: true, show: v => v.size === 'custom' },
      { key: 'n', type: 'number', label: 'Número de páginas', value: 1, min: 1, max: 500 }], { icon: 'blank', ok: 'Crear' });
    if (!v) return;
    let [w, hh] = v.size === 'custom' ? [v.w * 72 / 25.4, v.h * 72 / 25.4] : PO.PAGE_SIZES[v.size]; if (v.orient === 'land') [w, hh] = [hh, w];
    E.resetState('documento.pdf');
    const src = await addSource(await PO.blankPdf(w, hh, FP.clamp(v.n | 0, 1, 500)), 'en blanco');
    E.S.pages = await pagesFromSource(src); E.afterLoad();
  };
  /** Imágenes / TXT → páginas PDF */
  E.insertConverted = async function (files, asNew) {
    const v = await FP.dialog('Convertir ' + files.length + ' archivo(s) a páginas PDF', [
      { type: 'node', node: fileListEditor(files) },
      { key: 'size', type: 'select', label: 'Tamaño de página', value: 'A4', options: [['image', 'Tamaño de la imagen']].concat(Object.keys(PO.PAGE_SIZES)) },
      { key: 'orient', type: 'select', label: 'Orientación', value: 'auto', options: [['auto', 'Automática'], ['port', 'Vertical'], ['land', 'Horizontal']], show: v => v.size !== 'image' },
      { key: 'fit', type: 'select', label: 'Ajuste', value: 'fit', options: [['fit', 'Encajar (sin recortar)'], ['fill', 'Rellenar (puede recortar)'], ['noscale', 'Tamaño real si cabe']], show: v => v.size !== 'image' },
      { key: 'margin', type: 'number', label: 'Margen (pt)', value: 0, min: 0, max: 200, half: true }, { key: 'dpi', type: 'number', label: 'Resolución de referencia (ppp)', value: 96, min: 36, max: 1200, half: true },
      { type: 'note', text: 'JPG y PNG se insertan sin recomprimir (calidad original). WEBP, GIF, BMP, TIFF y SVG se convierten a PNG sin pérdida.' }], { icon: 'insert', ok: 'Convertir', size: 'wide' });
    if (!v) return;
    const list = files.__order || files;
    const p = FP.progress('Creando páginas PDF');
    try {
      const bytes = await PO.imagesToPdfBytes(list, v, p);
      if (asNew || !E.S || !E.S.pages.length) { E.resetState(FP.baseName(list[0].name) + '.pdf'); const src = await addSource(bytes, 'imágenes'); E.S.pages = await pagesFromSource(src); E.afterLoad(); FP.dirty.pdf = true; }
      else { E.push('Insertar imágenes'); const src = await addSource(bytes, 'imágenes'); const pages = await pagesFromSource(src); E.S.pages.splice(E.S.cur + 1, 0, ...pages); E.layout(); E.renderSide(); }
      FP.toast(list.length + ' archivo(s) convertidos', 'ok');
    } catch (e) { FP.error(e, 'Conversión'); } finally { p.close(); }
  };
  function fileListEditor(files) {
    const order = files.slice(); files.__order = order; const box = h('div', { class: 'flist', style: { marginBottom: '12px', maxHeight: '220px', overflow: 'auto' } });
    const draw = () => { box.innerHTML = ''; order.forEach((f, i) => { const im = h('img'); if (/image/.test(f.type) && !/tiff/.test(f.type)) { im.src = URL.createObjectURL(f); im.onload = () => URL.revokeObjectURL(im.src); } box.appendChild(h('div', { class: 'fitem' }, im, h('div', { class: 'nm' }, (i + 1) + '. ' + f.name), h('button', { class: 'ibtn', disabled: i === 0, onclick: () => { [order[i - 1], order[i]] = [order[i], order[i - 1]]; draw(); } }, icon('chevu', 's')), h('button', { class: 'ibtn', disabled: i === order.length - 1, onclick: () => { [order[i + 1], order[i]] = [order[i], order[i + 1]]; draw(); } }, icon('chevd', 's')), h('button', { class: 'ibtn', onclick: () => { order.splice(i, 1); draw(); } }, icon('x', 's')))); }); };
    draw(); return box;
  }

  /* ======================= Vista de páginas ======================= */
  E.pxPerPt = () => E.S.zoom * PX;
  E.setZoom = function (z, ev) {
    if (!E.S) return; z = FP.clamp(z, .1, 8);
    const w = el.work; const r = w.getBoundingClientRect();
    const ax = ev && ev.clientX != null ? ev.clientX - r.left : w.clientWidth / 2, ay = ev && ev.clientY != null ? ev.clientY - r.top : w.clientHeight / 2;
    const fx = (w.scrollLeft + ax) / Math.max(1, w.scrollWidth), fy = (w.scrollTop + ay) / Math.max(1, w.scrollHeight);
    E.S.zoom = z; E.layout(true);
    w.scrollLeft = fx * w.scrollWidth - ax; w.scrollTop = fy * w.scrollHeight - ay;
    renderOptbar();
  };
  E.fit = function (mode, silent) {
    if (!E.S || !E.S.pages.length) return; const p = E.curPage(); const d = E.dims(p);
    const aw = el.work.clientWidth - 60, ah = el.work.clientHeight - 50;
    const z = mode === 'width' ? aw / (d.W * PX) : Math.min(aw / (d.W * PX), ah / (d.H * PX));
    if (silent) E.S.zoom = FP.clamp(Math.min(z, 1.5), .1, 8); else { E.setZoom(z); E.goto(E.S.cur); }
  };
  let io = null;
  E.layout = function (keepScroll) {
    if (!E.S) return;
    if (E.mode === 'organize') { renderOrganizer(); return; }
    const sc = E.pxPerPt();
    if (!el.pages || !el.work.contains(el.pages)) { el.work.innerHTML = ''; el.pages = h('div', { class: 'pages' }); el.work.appendChild(el.pages); }
    if (io) io.disconnect();
    io = new IntersectionObserver((ents) => ents.forEach(en => { const box = en.target; box._vis = en.isIntersecting; if (en.isIntersecting) queueRender(box); }), { root: el.work, rootMargin: '600px 0px' });
    const existing = {}; Array.from(el.pages.children).forEach(c => existing[c.dataset.id] = c);
    const frag = [];
    E.S.pages.forEach((p, i) => {
      let box = existing[p.id]; delete existing[p.id];
      if (!box) { box = h('div', { class: 'pagebox' }); box.dataset.id = p.id; box.append(h('div', { class: 'lbl' }), h('div', { class: 'ov' }), h('div', { class: 'ov stl' })); attachOverlay(box); }
      const d = E.dims(p); box.style.width = Math.round(d.W * sc) + 'px'; box.style.height = Math.round(d.H * sc) + 'px';
      box.querySelector('.lbl').textContent = (i + 1) + ' / ' + E.S.pages.length;
      const key = p.src + ':' + p.idx + ':' + d.R + ':' + sc.toFixed(4);
      if (box._key !== key) { box._key = key; box._rendered = false; }
      frag.push(box); io.observe(box);
      drawOverlay(box, p);
    });
    Object.values(existing).forEach(b => { b.querySelectorAll('canvas').forEach(c => c.width = c.height = 0); b.remove(); }); renderPageNav();
    frag.forEach((b, i) => { if (el.pages.children[i] !== b) el.pages.insertBefore(b, el.pages.children[i] || null); });
    updateStatus();
  };
  let renderQ = [], rendering = 0;
  function queueRender(box) { if (box._rendered || box._queued) return; box._queued = true; renderQ.push(box); pump(); }
  async function pump() {
    while (rendering < 2 && renderQ.length) {
      renderQ.sort((a, b) => (b._vis ? 1 : 0) - (a._vis ? 1 : 0));
      const box = renderQ.shift(); box._queued = false; if (!box.isConnected || box._rendered) continue;
      rendering++; renderBox(box).catch(e => console.warn(e)).finally(() => { rendering--; pump(); });
    }
  }
  async function renderBox(box) {
    const p = E.page(box.dataset.id); if (!p) return; const key = box._key; const src = E.src(p.src);
    const jp = await E.jsPage(src, p.idx); const d = E.dims(p); const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vp = jp.getViewport({ scale: E.pxPerPt() * dpr, rotation: d.R });
    if (vp.width * vp.height > 40e6) { const k = Math.sqrt(40e6 / (vp.width * vp.height)); vp.scale *= k; }
    const c = FP.canvas(vp.width, vp.height); c.className = 'pc';
    const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
    if (box._task) try { box._task.cancel(); } catch (e) { }
    const lib = await FP.lib.pdfjs();
    const task = jp.render({ canvasContext: cx, canvas: c, viewport: vp, annotationMode: lib.AnnotationMode.ENABLE_FORMS }); box._task = task;
    try { await task.promise; } catch (e) { if (e && e.name === 'RenderingCancelledException') return; throw e; }
    if (box._key !== key) return;
    const old = box.querySelector('canvas.pc'); if (old) { old.width = old.height = 0; old.remove(); }
    box.insertBefore(c, box.firstChild); box._rendered = true;
    // descargar páginas lejanas para ahorrar memoria
    const all = Array.from(el.pages.children).filter(b => b._rendered); if (all.length > 14) all.filter(b => !b._vis && b !== box).slice(0, all.length - 14).forEach(b => { const cc = b.querySelector('canvas.pc'); if (cc) { cc.width = cc.height = 0; cc.remove(); } b._rendered = false; });
  }
  function onScroll() {
    if (!E.S || E.mode !== 'view' || !el.pages) return;
    const mid = el.work.scrollTop + el.work.clientHeight / 3; let cur = 0;
    for (let i = 0; i < el.pages.children.length; i++) { const b = el.pages.children[i]; if (b.offsetTop <= mid) cur = i; else break; }
    if (cur !== E.S.cur) { E.S.cur = cur; updateStatus(); highlightThumb(); renderPageNav(); }
  }
  E.goto = function (i, smooth) {
    if (!E.S) return; i = FP.clamp(i, 0, E.S.pages.length - 1); E.S.cur = i;
    if (E.mode === 'view' && el.pages && el.pages.children[i]) el.work.scrollTo({ top: el.pages.children[i].offsetTop - 20, behavior: smooth ? 'smooth' : 'auto' });
    updateStatus(); highlightThumb(); renderPageNav();
  };

  /* ---------- coordenadas ---------- */
  function ovTransform(p, sc) {
    const Wb = p.w * sc, Hb = p.h * sc;
    switch (p.rot % 360) { case 90: return `translate(${Hb}px,0) rotate(90deg)`; case 180: return `translate(${Wb}px,${Hb}px) rotate(180deg)`; case 270: return `translate(0,${Wb}px) rotate(270deg)`; default: return ''; }
  }
  E.clientToBase = function (box, p, e) {
    const r = box.getBoundingClientRect(); const sc = E.pxPerPt(); const lx = (e.clientX - r.left) / sc, ly = (e.clientY - r.top) / sc;
    switch (p.rot % 360) { case 90: return { x: ly, y: p.h - lx }; case 180: return { x: p.w - lx, y: p.h - ly }; case 270: return { x: p.w - ly, y: lx }; default: return { x: lx, y: ly }; }
  };
  /** convierte rect de vista final (rotación p.rot = r) a base */
  E.finalToBase = function (rc, p, r) {
    const W = p.w, H = p.h;
    const pt = (x, y) => { switch (r % 360) { case 90: return [y, H - x]; case 180: return [W - x, H - y]; case 270: return [W - y, x]; default: return [x, y]; } };
    const a = pt(rc.x, rc.y), b = pt(rc.x + rc.w, rc.y + rc.h);
    return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) };
  };

  /* ---------- objetos: dibujo en la superposición ---------- */
  function bbox(o) {
    if (o.type === 'line') { const pad = Math.max(6, o.sw * 3); return { x: Math.min(o.x1, o.x2) - pad, y: Math.min(o.y1, o.y2) - pad, w: Math.abs(o.x2 - o.x1) + 2 * pad, h: Math.abs(o.y2 - o.y1) + 2 * pad, pad }; }
    if (o.type === 'ink') { const xs = o.points.map(p => p[0]), ys = o.points.map(p => p[1]); const pad = o.sw; return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + 2 * pad, h: Math.max(...ys) - Math.min(...ys) + 2 * pad, pad }; }
    if (o.type === 'markup') { const xs = o.rects.flatMap(r => [r.x, r.x + r.w]), ys = o.rects.flatMap(r => [r.y, r.y + r.h]); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; }
    if (o.type === 'note') return { x: o.x, y: o.y, w: 22, h: 22 };
    return { x: o.x, y: o.y, w: o.w || 10, h: o.h || 10 };
  }
  E.bbox = bbox;
  const TAGS = { text: 'Texto añadido', whiteout: 'Tapado (superposición)', image: 'Imagen añadida', rect: 'Forma', ellipse: 'Forma', line: 'Línea', ink: 'Dibujo', markup: 'Marcado', note: 'Nota (anotación PDF)', link: 'Enlace', field: 'Campo de formulario' };
  function objEl(o, sc) {
    const b = bbox(o); const d = h('div', { class: 'obj' + (o.type === 'note' ? ' note' : o.type === 'field' ? ' field' : o.type === 'link' ? ' link' : '') });
    d.dataset.oid = o.id;
    Object.assign(d.style, { left: b.x * sc + 'px', top: b.y * sc + 'px', width: b.w * sc + 'px', height: b.h * sc + 'px', opacity: o.type === 'markup' || o.type === 'whiteout' ? 1 : (o.opacity != null ? o.opacity : 1) });
    const svgNS = 'http://www.w3.org/2000/svg';
    const mkSvg = (inner) => { const s = document.createElementNS(svgNS, 'svg'); s.setAttribute('viewBox', `0 0 ${b.w * sc} ${b.h * sc}`); s.innerHTML = inner; return s; };
    switch (o.type) {
      case 'text': {
        d.style.height = 'auto'; d.style.width = 'auto';
        const t = h('div', { class: 'txt' }); t.textContent = o.text;
        Object.assign(t.style, { fontFamily: PO.CSSFONT[o.font], fontSize: o.size * sc + 'px', color: o.color, fontWeight: o.bold ? 'bold' : 'normal', fontStyle: o.italic ? 'italic' : 'normal', textDecoration: o.underline ? 'underline' : 'none', textAlign: o.align, minWidth: o.w ? o.w * sc + 'px' : null, background: o.bg || 'transparent' });
        d.appendChild(t); break;
      }
      case 'rect': case 'whiteout': {
        const sw = o.type === 'rect' ? (o.sw || 0) * sc : 0; const fill = o.type === 'whiteout' ? (o.fill || '#ffffff') : (o.fill || 'none');
        d.appendChild(mkSvg(`<rect x="${sw / 2}" y="${sw / 2}" width="${Math.max(0, b.w * sc - sw)}" height="${Math.max(0, b.h * sc - sw)}" fill="${fill}" fill-opacity="${o.type === 'whiteout' ? 1 : (o.fillOpacity != null ? o.fillOpacity : 1)}" stroke="${o.type === 'rect' && sw ? o.stroke : 'none'}" stroke-width="${sw}"/>`));
        if (o.type === 'whiteout') d.style.outline = E.selId === o.id ? '' : '1px dotted rgba(0,0,0,.18)';
        break;
      }
      case 'ellipse': { const sw = (o.sw || 0) * sc; d.appendChild(mkSvg(`<ellipse cx="${b.w * sc / 2}" cy="${b.h * sc / 2}" rx="${Math.max(0, (b.w * sc - sw) / 2)}" ry="${Math.max(0, (b.h * sc - sw) / 2)}" fill="${o.fill || 'none'}" fill-opacity="${o.fillOpacity != null ? o.fillOpacity : 1}" stroke="${sw ? o.stroke : 'none'}" stroke-width="${sw}"/>`)); break; }
      case 'line': {
        const x1 = (o.x1 - b.x) * sc, y1 = (o.y1 - b.y) * sc, x2 = (o.x2 - b.x) * sc, y2 = (o.y2 - b.y) * sc; const sw = o.sw * sc; const hl = Math.max(8, o.sw * 4) * sc; const ang = Math.atan2(y2 - y1, x2 - x1);
        const head = (x, y, a) => `<path d="M${x} ${y} L${x - hl * Math.cos(a - .45)} ${y - hl * Math.sin(a - .45)} L${x - hl * Math.cos(a + .45)} ${y - hl * Math.sin(a + .45)}Z" fill="${o.stroke}"/>`;
        const sx = o.arrowStart ? x1 + Math.cos(ang) * hl * .8 : x1, sy = o.arrowStart ? y1 + Math.sin(ang) * hl * .8 : y1, ex = o.arrowEnd ? x2 - Math.cos(ang) * hl * .8 : x2, ey = o.arrowEnd ? y2 - Math.sin(ang) * hl * .8 : y2;
        d.appendChild(mkSvg(`<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="${o.stroke}" stroke-width="${sw}" stroke-linecap="round" ${o.dash ? `stroke-dasharray="${sw * 3} ${sw * 2}"` : ''}/>` + (o.arrowEnd ? head(x2, y2, ang) : '') + (o.arrowStart ? head(x1, y1, ang + Math.PI) : '')));
        d.style.pointerEvents = 'none'; d.firstChild.style.pointerEvents = 'stroke'; d.firstChild.firstChild.setAttribute('pointer-events', 'stroke'); d.firstChild.firstChild.style.strokeWidth = sw; break;
      }
      case 'ink': { const pts = o.points.map(p => ((p[0] - b.x) * sc).toFixed(1) + ',' + ((p[1] - b.y) * sc).toFixed(1)).join(' '); d.appendChild(mkSvg(`<polyline points="${pts}" fill="none" stroke="${o.stroke}" stroke-width="${o.sw * sc}" stroke-linecap="round" stroke-linejoin="round"/>`)); break; }
      case 'image': { const a = E.S.assets[o.asset]; d.appendChild(h('img', { src: a ? a.url : '', draggable: false })); break; }
      case 'markup': {
        o.rects.forEach(r => {
          const m = h('div', { style: { position: 'absolute', left: (r.x - b.x) * sc + 'px', width: r.w * sc + 'px' } });
          if (o.kind === 'highlight') Object.assign(m.style, { top: (r.y - b.y) * sc + 'px', height: r.h * sc + 'px', background: o.color, opacity: o.opacity != null ? o.opacity : .4, mixBlendMode: 'multiply' });
          else { const yy = o.kind === 'underline' ? r.y + r.h - Math.max(1, r.h * .06) : r.y + r.h * .55; const th = Math.max(.8, r.h * .07); Object.assign(m.style, { top: (yy - b.y - th / 2) * sc + 'px', height: Math.max(1, th * sc) + 'px', background: o.color, opacity: o.opacity != null ? o.opacity : 1 }); }
          d.appendChild(m);
        });
        break;
      }
      case 'note': d.appendChild(icon('comment', 's')); d.title = o.text || ''; d.style.background = o.color || '#ffd84d'; break;
      case 'link': d.textContent = ''; d.title = o.page ? 'Ir a página ' + o.page : (o.url || ''); break;
      case 'field': d.textContent = ({ text: '▭ ', checkbox: '☐ ', radio: '◉ ', dropdown: '▾ ' }[o.ftype] || '') + (o.name || ''); d.style.fontSize = Math.max(8, Math.min(12, b.h * sc * .5)) + 'px'; break;
    }
    if (E.selId === o.id) { d.classList.add('sel'); d.appendChild(h('div', { class: 'objtag' }, o.replaces ? 'Sustitución visual (superposición)' : TAGS[o.type] || o.type)); addHandles(d, o, sc); }
    return d;
  }
  function addHandles(d, o, sc) {
    if (o.type === 'note' || o.type === 'markup') return;
    if (o.type === 'line') { const b = bbox(o); [['p1', o.x1, o.y1], ['p2', o.x2, o.y2]].forEach(([k, x, y]) => d.appendChild(h('div', { class: 'hnd', 'data-h': k, style: { left: (x - b.x) * sc - 5 + 'px', top: (y - b.y) * sc - 5 + 'px', cursor: 'move' } }))); return; }
    [['nw', 0, 0], ['n', .5, 0], ['ne', 1, 0], ['e', 1, .5], ['se', 1, 1], ['s', .5, 1], ['sw', 0, 1], ['w', 0, .5]].forEach(([k, fx, fy]) => {
      if (o.type === 'text' && k.length === 1) return;
      d.appendChild(h('div', { class: 'hnd', 'data-h': k, style: { left: `calc(${fx * 100}% - 5px)`, top: `calc(${fy * 100}% - 5px)`, cursor: k + '-resize' } }));
    });
  }
  function drawOverlay(box, p) {
    const sc = E.pxPerPt(); const ov = box.querySelector('.ov:not(.stl)'); const stl = box.querySelector('.stl');
    ov.style.width = p.w * sc + 'px'; ov.style.height = p.h * sc + 'px'; ov.style.transform = ovTransform(p, sc);
    ov.innerHTML = '';
    p.objs.forEach(o => { const d = objEl(o, sc); ov.appendChild(d); if (o.type === 'text') { const tEl = d.firstChild; requestAnimationFrame(() => { if (!d.isConnected) return; o.w = d.offsetWidth / sc; o.h = d.offsetHeight / sc; }); if (E.editing === o.id) startEdit(d, o, true); } });
    // resaltados de búsqueda
    E.find.hits.forEach((hit, i) => { if (hit.pid !== p.id) return; hit.rects.forEach(r => ov.appendChild(h('div', { class: 'findhl' + (i === E.find.cur ? ' cur' : ''), style: { left: r.x * sc + 'px', top: r.y * sc + 'px', width: r.w * sc + 'px', height: r.h * sc + 'px' } }))); });
    if (E.hoverBoxes && E.hoverBoxes.pid === p.id) E.hoverBoxes.list.forEach((r, i) => ov.appendChild(h('div', { class: 'obj', 'data-hb': i, style: { left: r.x * sc + 'px', top: r.y * sc + 'px', width: r.w * sc + 'px', height: r.h * sc + 'px', outline: '1.5px dashed #4aa3ff', background: 'rgba(74,163,255,.10)', cursor: 'pointer' } })));
    // sellos (vista final)
    const d = E.dims(p); stl.style.width = d.W * sc + 'px'; stl.style.height = d.H * sc + 'px'; stl.style.pointerEvents = 'none'; stl.innerHTML = '';
    const i = E.S.pages.indexOf(p); const n = E.S.pages.length;
    (E.S.stamps || []).forEach(s => { if (!PO.stampApplies(s, i, n)) return; stl.appendChild(stampEl(s, d.W, d.H, i + 1, n, sc)); });
  }
  E.redrawPage = (p) => { if (!el.pages) return; const box = el.pages.querySelector(`.pagebox[data-id="${p.id}"]`); if (box) drawOverlay(box, p); };
  E.redrawAll = () => { if (E.mode === 'organize') return renderOrganizer(); E.S.pages.forEach(p => E.redrawPage(p)); };
  function stampEl(s, W, H, n, total, sc) {
    if (s.type === 'watermark' && s.asset) {
      const a = E.S.assets[s.asset]; const w = W * (s.scale || 50) / 100, hh = w * a.h / a.w;
      return h('img', { src: a.url, style: { position: 'absolute', left: (W - w) / 2 * sc + 'px', top: (H - hh) / 2 * sc + 'px', width: w * sc + 'px', height: hh * sc + 'px', opacity: s.opacity, transform: `rotate(${-(s.rotation || 0)}deg)` } });
    }
    const txt = PO.stampText(s, n + (s.start || 1) - 1 - ((s.from || 1) - 1), total, E.S.name);
    const st = { position: 'absolute', whiteSpace: 'pre', fontFamily: PO.CSSFONT[s.font || 'Helvetica'], fontSize: (s.size || 11) * sc + 'px', lineHeight: 1.2, color: s.color, opacity: s.opacity != null ? s.opacity : 1, fontWeight: s.bold ? 'bold' : 'normal', fontStyle: s.italic ? 'italic' : 'normal' };
    const e = h('div', { style: st }, txt);
    // medir
    const m = FP.canvas(1, 1).getContext('2d'); m.font = `${s.italic ? 'italic ' : ''}${s.bold ? 'bold ' : ''}${s.size || 11}px ${PO.CSSFONT[s.font || 'Helvetica']}`; const tw = m.measureText(txt).width, th = (s.size || 11) * 1.2;
    if (s.type === 'watermark') { Object.assign(e.style, { left: (W - tw) / 2 * sc + 'px', top: (H - th) / 2 * sc + 'px', transform: `rotate(${-(s.rotation || 0)}deg)` }); }
    else { const pos = PO.stampLayout(s, W, H, tw, th); Object.assign(e.style, { left: pos.x * sc + 'px', top: pos.y * sc + 'px' }); }
    return e;
  }

  /* ---------- interacción ---------- */
  function attachOverlay(box) {
    const ov = box.querySelector('.ov:not(.stl)');
    ov.addEventListener('pointerdown', (e) => onDown(e, box));
    ov.addEventListener('pointermove', (e) => onHover(e, box));
    ov.addEventListener('dblclick', (e) => { const oe = e.target.closest('.obj[data-oid]'); if (!oe) return; const f = E.findObj(oe.dataset.oid); if (f && f.o.type === 'text') startEdit(oe, f.o); else if (f && f.o.type === 'note') editNote(f.o); else if (f && f.o.type === 'link') editLink(f.o); });
    ov.addEventListener('contextmenu', (e) => { const oe = e.target.closest('.obj[data-oid]'); if (!oe) return; e.preventDefault(); E.select(oe.dataset.oid); objMenu(e); });
    box.addEventListener('pointerdown', () => { const i = E.S.pages.findIndex(p => p.id === box.dataset.id); if (i >= 0 && i !== E.S.cur) { E.S.cur = i; updateStatus(); highlightThumb(); renderPageNav(); } });
  }
  const CREATE_BOX = ['rect', 'ellipse', 'whiteout', 'link', 'f_text', 'f_checkbox', 'f_radio', 'f_dropdown', 'placeimg'];
  function onDown(e, box) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const p = E.page(box.dataset.id); if (!p) return; const pt = E.clientToBase(box, p, e); const tool = E.tool; const ov = e.currentTarget;
    if (E.editing) { const ed = FP.$('.txt[contenteditable=true]'); if (ed && ed.contains(e.target)) return; if (E._commitEdit) E._commitEdit(); }
    if (tool === 'hand') return startPan(e);
    if (tool === 'select') {
      const hnd = e.target.closest('.hnd'); const oe = e.target.closest('.obj[data-oid]');
      if (hnd && oe) return startResize(e, box, p, E.findObj(oe.dataset.oid).o, hnd.dataset.h);
      if (oe) {
        const now = Date.now(), id = oe.dataset.oid;
        if (E._lastDown && E._lastDown.id === id && now - E._lastDown.t < 450) { E._lastDown = null; const f = E.findObj(id); e.preventDefault(); if (f.o.type === 'text') { const cur = FP.$(`.obj[data-oid="${id}"]`); return startEdit(cur, f.o); } if (f.o.type === 'note') return editNote(f.o); if (f.o.type === 'link') return editLink(f.o); }
        E._lastDown = { id, t: now };
        E.select(id); return startMove(e, box, p, E.findObj(id).o);
      }
      E.select(null); return;
    }
    if ((tool === 'edittext' || tool === 'pdfimg') && E.hoverBoxes && E.hoverBoxes.pid === p.id) { const hb = e.target.closest('[data-hb]'); if (hb) { e.preventDefault(); return tool === 'edittext' ? replaceTextItem(p, E.hoverBoxes.list[+hb.dataset.hb]) : pdfImageMenu(e, p, E.hoverBoxes.list[+hb.dataset.hb]); } return; }
    e.preventDefault(); ov.setPointerCapture(e.pointerId);
    if (tool === 'text') { const o = newObj(p, { type: 'text', x: pt.x, y: pt.y - D.size * .6, text: 'Texto', font: D.font, size: D.size, color: D.color, bold: D.bold, italic: D.italic, underline: D.underline, align: D.align, opacity: D.opacity }, 'Añadir texto'); E.editing = o.id; E.redrawPage(p); E.setTool('select'); return; }
    if (tool === 'note') { E.setTool('select'); const o = newObj(p, { type: 'note', x: pt.x - 11, y: pt.y - 11, text: '', color: '#ffd84d', author: '' }, 'Nota'); editNote(o, true); return; }
    // arrastre genérico
    const sc = E.pxPerPt(); const start = pt; let cur = pt; let ghost = h('div', { class: 'obj', style: { outline: '1.5px dashed #4aa3ff', pointerEvents: 'none' } }); ov.appendChild(ghost);
    const pts = [[pt.x, pt.y]]; let svg = null;
    if (tool === 'ink') { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); Object.assign(svg.style, { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }); ov.appendChild(svg); ghost.remove(); ghost = null; }
    const mv = (ev) => {
      cur = E.clientToBase(box, p, ev);
      if (tool === 'ink') { pts.push([cur.x, cur.y]); svg.innerHTML = `<polyline points="${pts.map(q => q[0] * sc + ',' + q[1] * sc).join(' ')}" fill="none" stroke="${D.ink}" stroke-width="${D.inkW * sc}" stroke-linecap="round" stroke-linejoin="round" opacity="${D.opacity}"/>`; return; }
      if (tool === 'line' || tool === 'arrow') { ghost.style.outline = 'none'; ghost.innerHTML = `<svg style="position:absolute;left:0;top:0;overflow:visible;width:1px;height:1px"><line x1="${start.x * sc}" y1="${start.y * sc}" x2="${cur.x * sc}" y2="${cur.y * sc}" stroke="${D.stroke}" stroke-width="${D.sw * sc}"/></svg>`; Object.assign(ghost.style, { left: 0, top: 0, width: 0, height: 0 }); return; }
      let x = Math.min(start.x, cur.x), y = Math.min(start.y, cur.y), w = Math.abs(cur.x - start.x), hh = Math.abs(cur.y - start.y);
      if (ev.shiftKey && (tool === 'rect' || tool === 'ellipse' || tool === 'placeimg')) { const m = Math.max(w, hh); w = hh = m; if (cur.x < start.x) x = start.x - m; if (cur.y < start.y) y = start.y - m; }
      Object.assign(ghost.style, { left: x * sc + 'px', top: y * sc + 'px', width: w * sc + 'px', height: hh * sc + 'px', background: ['highlight', 'underline', 'strike'].includes(tool) ? 'rgba(255,225,77,.25)' : 'rgba(74,163,255,.06)' });
    };
    const up = async (ev) => {
      ov.removeEventListener('pointermove', mv); ov.removeEventListener('pointerup', up); ov.removeEventListener('pointercancel', up);
      if (ghost) ghost.remove(); if (svg) svg.remove();
      let x = Math.min(start.x, cur.x), y = Math.min(start.y, cur.y), w = Math.abs(cur.x - start.x), hh = Math.abs(cur.y - start.y);
      if (ev.shiftKey && (tool === 'rect' || tool === 'ellipse')) { const m = Math.max(w, hh); w = hh = m; if (cur.x < start.x) x = start.x - m; if (cur.y < start.y) y = start.y - m; }
      const tiny = w < 4 && hh < 4;
      if (tool === 'ink') { if (pts.length > 1) newObj(p, { type: 'ink', points: simplify(pts, .6), stroke: D.ink, sw: D.inkW, opacity: D.opacity }, 'Dibujo'); E.redrawPage(p); return; }
      if (tool === 'line' || tool === 'arrow') { if (tiny) { cur = { x: start.x + 80, y: start.y }; } newObj(p, { type: 'line', x1: start.x, y1: start.y, x2: cur.x, y2: cur.y, stroke: D.stroke, sw: D.sw, opacity: D.opacity, arrowEnd: tool === 'arrow' }, tool === 'arrow' ? 'Flecha' : 'Línea'); E.redrawPage(p); return; }
      if (['highlight', 'underline', 'strike'].includes(tool)) { await markupRegion(p, { x, y, w, h: hh }, tool); return; }
      if (tiny) { const def = { rect: [120, 80], ellipse: [100, 100], whiteout: [120, 24], link: [120, 20], f_text: [160, 22], f_checkbox: [14, 14], f_radio: [14, 14], f_dropdown: [140, 22], placeimg: [0, 0] }[tool] || [100, 60]; w = def[0]; hh = def[1]; }
      if (tool === 'rect' || tool === 'ellipse') newObj(p, { type: tool, x, y, w, h: hh, stroke: D.stroke, fill: D.fill, sw: D.sw, opacity: D.opacity }, tool === 'rect' ? 'Rectángulo' : 'Elipse');
      else if (tool === 'whiteout') newObj(p, { type: 'whiteout', x, y, w, h: hh, fill: '#ffffff' }, 'Tapar');
      else if (tool === 'link') { const o = newObj(p, { type: 'link', x, y, w, h: hh, url: 'https://' }, 'Enlace'); E.redrawPage(p); editLink(o, true); return; }
      else if (tool.startsWith('f_')) { const ft = tool.slice(2); const n = E.S.pages.reduce((a, q) => a + q.objs.filter(o => o.type === 'field').length, 0) + 1; newObj(p, { type: 'field', ftype: ft, x, y, w, h: hh, name: { text: 'texto', checkbox: 'casilla', radio: 'opcion', dropdown: 'lista' }[ft] + n, group: ft === 'radio' ? 'grupo1' : undefined, options: ft === 'dropdown' ? ['Opción 1', 'Opción 2', 'Opción 3'] : undefined, value: '' }, 'Campo de formulario'); E.showRight('props'); }
      else if (tool === 'placeimg' && E.pending) {
        const a = E.S.assets[E.pending.asset]; let iw, ih;
        if (tiny) { const maxW = Math.min(p.w * .5, E.pending.sig ? 180 : p.w * .5); const s = Math.min(1, maxW / (a.w * .75)); iw = a.w * .75 * s; ih = a.h * .75 * s; x = start.x - iw / 2; y = start.y - ih / 2; }
        else { const r = a.w / a.h; iw = w; ih = w / r; if (ih > hh && hh > 4) { ih = hh; iw = hh * r; } }
        newObj(p, { type: 'image', x, y, w: iw, h: ih, asset: E.pending.asset, opacity: 1, sig: !!E.pending.sig }, E.pending.sig ? 'Firma' : 'Imagen');
        if (!ev.shiftKey) { E.pending = null; E.setTool('select'); }
      }
      E.redrawPage(p);
    };
    ov.addEventListener('pointermove', mv); ov.addEventListener('pointerup', up); ov.addEventListener('pointercancel', up);
  }
  function simplify(pts, tol) { if (pts.length < 3) return pts; const out = [pts[0]]; for (let i = 1; i < pts.length - 1; i++) { const l = out[out.length - 1]; if (Math.hypot(pts[i][0] - l[0], pts[i][1] - l[1]) >= tol) out.push(pts[i]); } out.push(pts[pts.length - 1]); return out.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]); }
  function newObj(p, o, label) { E.push(label || 'Añadir'); o.id = FP.uid(); p.objs.push(o); E.selId = o.id; E.renderProps(); return o; }
  function startPan(e) { const w = el.work; const sx = e.clientX, sy = e.clientY, sl = w.scrollLeft, st = w.scrollTop; w.style.cursor = 'grabbing'; const mv = (ev) => { w.scrollLeft = sl - (ev.clientX - sx); w.scrollTop = st - (ev.clientY - sy); }; const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); w.style.cursor = ''; }; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); }
  function moveObj(o, dx, dy) {
    if (o.type === 'line') { o.x1 += dx; o.x2 += dx; o.y1 += dy; o.y2 += dy; }
    else if (o.type === 'ink') o.points = o.points.map(q => [q[0] + dx, q[1] + dy]);
    else if (o.type === 'markup') o.rects.forEach(r => { r.x += dx; r.y += dy; });
    else { o.x += dx; o.y += dy; }
  }
  function startMove(e, box, p, o) {
    if (e.target.closest('.txt[contenteditable=true]')) return;
    e.preventDefault(); const ov = e.currentTarget; ov.setPointerCapture(e.pointerId);
    const s0 = E.clientToBase(box, p, e); let last = s0, moved = false; const before = snap();
    const linked = o.link ? p.objs.find(x => x.id === o.link) : null;
    const mv = (ev) => { const c = E.clientToBase(box, p, ev); const dx = c.x - last.x, dy = c.y - last.y; if (!moved && Math.hypot(c.x - s0.x, c.y - s0.y) < 2) return; moved = true; moveObj(o, dx, dy); if (linked) moveObj(linked, dx, dy); last = c; E.redrawPage(p); };
    const up = () => { ov.removeEventListener('pointermove', mv); ov.removeEventListener('pointerup', up); if (moved) { E.hist.push({ label: 'Mover', s: before }); E.redo = []; E.changed(); E.renderProps(); } };
    ov.addEventListener('pointermove', mv); ov.addEventListener('pointerup', up);
  }
  function startResize(e, box, p, o, hk) {
    e.preventDefault(); e.stopPropagation(); const ov = e.currentTarget; ov.setPointerCapture(e.pointerId); const before = snap();
    const b0 = bbox(o); const o0 = JSON.parse(JSON.stringify(o)); let changed = false;
    const mv = (ev) => {
      const c = E.clientToBase(box, p, ev); changed = true;
      if (o.type === 'line') { if (hk === 'p1') { o.x1 = c.x; o.y1 = c.y; } else { o.x2 = c.x; o.y2 = c.y; } E.redrawPage(p); return; }
      let x0 = b0.x, y0 = b0.y, x1 = b0.x + b0.w, y1 = b0.y + b0.h;
      if (hk.includes('w')) x0 = Math.min(c.x, x1 - 2); if (hk.includes('e')) x1 = Math.max(c.x, x0 + 2);
      if (hk.includes('n')) y0 = Math.min(c.y, y1 - 2); if (hk.includes('s')) y1 = Math.max(c.y, y0 + 2);
      const keep = (o.type === 'image' && !ev.shiftKey) || o.type === 'text' || (ev.shiftKey && o.type !== 'image');
      if (keep && hk.length === 2) { const r = b0.w / b0.h; const nw = x1 - x0, nh = y1 - y0; if (nw / nh > r) { const w2 = nh * r; if (hk.includes('w')) x0 = x1 - w2; else x1 = x0 + w2; } else { const h2 = nw / r; if (hk.includes('n')) y0 = y1 - h2; else y1 = y0 + h2; } }
      const sx = (x1 - x0) / b0.w, sy = (y1 - y0) / b0.h;
      if (o.type === 'text') { o.size = Math.max(4, +(o0.size * sy).toFixed(1)); o.x = x0; o.y = y0; }
      else if (o.type === 'ink') { o.points = o0.points.map(q => [x0 + (q[0] - b0.x) * sx, y0 + (q[1] - b0.y) * sy]); o.sw = o0.sw; }
      else { o.x = x0; o.y = y0; o.w = x1 - x0; o.h = y1 - y0; }
      E.redrawPage(p);
    };
    const up = () => { ov.removeEventListener('pointermove', mv); ov.removeEventListener('pointerup', up); if (changed) { E.hist.push({ label: 'Redimensionar', s: before }); E.redo = []; E.changed(); E.renderProps(); } };
    ov.addEventListener('pointermove', mv); ov.addEventListener('pointerup', up);
  }
  function startEdit(d, o, fresh) {
    const t = d.querySelector('.txt'); if (!t || t.isContentEditable) return;
    E.editing = o.id; t.contentEditable = 'true'; t.style.whiteSpace = 'pre';
    const focusSel = () => { t.focus(); const range = document.createRange(); range.selectNodeContents(t); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range); };
    focusSel(); let armed = true; setTimeout(() => { if (armed && t.isConnected && document.activeElement !== t) focusSel(); }, 0); setTimeout(() => { if (armed && t.isConnected && document.activeElement !== t) focusSel(); armed = false; }, 120);
    const before = snap(); const orig = o.text;
    t.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Escape') { t.blur(); } if (ev.key === 'Enter' && !ev.shiftKey && !ev.ctrlKey) { ev.preventDefault(); document.execCommand('insertLineBreak'); } });
    t.addEventListener('paste', (ev) => { ev.preventDefault(); document.execCommand('insertText', false, (ev.clipboardData || window.clipboardData).getData('text')); });
    t.addEventListener('keydown', () => { armed = false; }, { capture: true });
    let done = false;
    const onBlur = (ev, force) => {
      if (armed && !force) { setTimeout(() => { if (t.isConnected && document.activeElement !== t) focusSel(); }, 0); return; }
      if (done) return; done = true; armed = false; E._commitEdit = null;
      t.removeEventListener('blur', onBlur);
      t.contentEditable = 'false'; E.editing = null;
      const txt = t.innerText.replace(/\n$/, ''); const f = E.findObj(o.id);
      if (!f) return;
      if (!txt.trim()) { f.p.objs = f.p.objs.filter(x => x.id !== o.id && x.id !== o.link); E.selId = null; }
      else if (txt !== orig) { o.text = txt; if (!fresh) { E.hist.push({ label: 'Editar texto', s: before }); E.redo = []; } }
      E.changed(); E.redrawPage(f.p); E.renderProps();
    };
    t.addEventListener('blur', onBlur); E._commitEdit = () => onBlur(null, true);
  }
  E.select = function (id) { if (E.selId === id) return; const prev = E.selId && E.findObj(E.selId); E.selId = id; if (prev) E.redrawPage(prev.p); const f = id && E.findObj(id); if (f) E.redrawPage(f.p); E.renderProps(); renderOptbar(); };
  function objMenu(e) {
    const f = E.findObj(E.selId); if (!f) return; const o = f.o;
    FP.menu({ x: e.clientX, y: e.clientY }, [
      o.type === 'text' ? { label: 'Editar texto', icon: 'text', action: () => { const d = FP.$(`.obj[data-oid="${o.id}"]`); d && startEdit(d, o); } } : null,
      o.type === 'image' ? { label: 'Recortar imagen…', icon: 'crop', action: () => cropImageObj(o) } : null,
      o.type === 'image' ? { label: 'Sustituir imagen…', icon: 'swap', action: () => replaceImageObj(o) } : null,
      o.type === 'image' ? { label: 'Girar 90°', icon: 'rotr', action: () => rotateImageObj(o) } : null,
      { label: 'Duplicar', icon: 'copy', key: 'Ctrl+D', action: () => E.duplicateObj() },
      { label: 'Traer al frente', icon: 'chevu', action: () => arrange(1) }, { label: 'Enviar al fondo', icon: 'chevd', action: () => arrange(-1) },
      '-', { label: 'Eliminar', icon: 'trash', key: 'Supr', action: () => E.deleteObj() }]);
  }
  function arrange(dir) { const f = E.findObj(E.selId); if (!f) return; E.push('Organizar'); const a = f.p.objs; a.splice(a.indexOf(f.o), 1); dir > 0 ? a.push(f.o) : a.unshift(f.o); E.redrawPage(f.p); }
  E.deleteObj = function () { const f = E.findObj(E.selId); if (!f) return; E.push('Eliminar objeto'); f.p.objs = f.p.objs.filter(x => x.id !== f.o.id && !(f.o.link && x.id === f.o.link)); E.selId = null; E.redrawPage(f.p); E.renderProps(); };
  E.duplicateObj = function () { const f = E.findObj(E.selId); if (!f) return; E.push('Duplicar objeto'); const c = JSON.parse(JSON.stringify(f.o)); c.id = FP.uid(); delete c.link; moveObj(c, 12, 12); if (c.type === 'field') c.name += '_2'; f.p.objs.push(c); E.selId = c.id; E.redrawPage(f.p); E.renderProps(); };
  E.copyObj = () => { const f = E.findObj(E.selId); if (f) { E.clip = JSON.parse(JSON.stringify(f.o)); FP.toast('Objeto copiado'); } };
  E.pasteObj = () => { if (!E.clip) return; const p = E.curPage(); E.push('Pegar'); const c = JSON.parse(JSON.stringify(E.clip)); c.id = FP.uid(); delete c.link; moveObj(c, 10, 10); p.objs.push(c); E.selId = c.id; E.redrawPage(p); E.renderProps(); };
  function nudge(dx, dy) { const f = E.findObj(E.selId); if (!f) return; if (!E._nudgeT) E.push('Mover'); clearTimeout(E._nudgeT); E._nudgeT = setTimeout(() => E._nudgeT = null, 600); moveObj(f.o, dx, dy); E.redrawPage(f.p); }

  /* ---------- notas y enlaces ---------- */
  async function editNote(o, fresh) {
    const v = await FP.dialog('Nota adhesiva', [{ key: 'text', type: 'textarea', label: 'Comentario', value: o.text, rows: 5 }, { key: 'author', type: 'text', label: 'Autor', value: o.author || '' }, { key: 'color', type: 'color', label: 'Color', value: o.color || '#ffd84d' },
      { type: 'note', text: 'Se guarda como anotación PDF real (/Text), visible en Acrobat y otros lectores.' }], { icon: 'note' });
    const f = E.findObj(o.id); if (!f) return;
    if (!v) { if (fresh && !o.text) { f.p.objs = f.p.objs.filter(x => x !== o); E.hist.pop(); E.selId = null; } E.redrawPage(f.p); return; }
    if (!fresh) E.push('Editar nota'); Object.assign(o, v); E.redrawPage(f.p); E.renderProps();
  }
  async function editLink(o, fresh) {
    const v = await FP.dialog('Enlace', [{ key: 'kind', type: 'radio', label: 'Destino', value: o.page ? 'page' : 'url', options: [['url', 'Dirección web'], ['page', 'Página del documento']] },
      { key: 'url', type: 'url', label: 'URL', value: o.url || 'https://', show: v => v.kind === 'url' }, { key: 'page', type: 'number', label: 'Página', value: o.page || 1, min: 1, max: E.S.pages.length, show: v => v.kind === 'page' }], { icon: 'link', validate: v => v.kind === 'url' && !/^(https?:|mailto:|tel:)/i.test(v.url) ? 'La URL debe empezar por https://, http://, mailto: o tel:' : null });
    const f = E.findObj(o.id); if (!f) return;
    if (!v) { if (fresh) { f.p.objs = f.p.objs.filter(x => x !== o); E.hist.pop(); E.selId = null; E.redrawPage(f.p); } return; }
    if (!fresh) E.push('Editar enlace'); if (v.kind === 'url') { o.url = v.url; o.page = null; } else { o.page = v.page; o.url = ''; } E.redrawPage(f.p); E.renderProps();
  }

  /* ---------- texto existente ---------- */
  async function textItems(p) { const k = p.src + ':' + p.idx; if (!E.textCache[k]) E.textCache[k] = PO.pageTextItems(await E.jsPage(E.src(p.src), p.idx)); return E.textCache[k]; }
  async function onHover(e, box) {
    if (E.tool !== 'edittext' && E.tool !== 'pdfimg') return;
    const p = E.page(box.dataset.id);
    if (!E.hoverBoxes || E.hoverBoxes.pid !== p.id || E.hoverBoxes.tool !== E.tool) {
      const prev = E.hoverBoxes && E.page(E.hoverBoxes.pid);
      E.hoverBoxes = { pid: p.id, tool: E.tool, list: [] };
      if (prev) E.redrawPage(prev);
      if (E.tool === 'edittext') { const items = await textItems(p); E.hoverBoxes.list = items.filter(it => it.str.trim() && it.w > 1).map(it => Object.assign({}, it, { x: it.x - 1, y: it.y - 1, w: it.w + 2, h: it.h + 2, item: it })); }
      else { const imgs = await PO.detectImages(await E.jsPage(E.src(p.src), p.idx)); E.hoverBoxes.list = imgs; if (!imgs.length) FP.toast('No se detectan imágenes en esta página', 'warn'); }
      E.redrawPage(p);
    }
  }
  function replaceTextItem(p, hb) {
    const it = hb.item; const size = Math.max(4, +(it.fh || it.h).toFixed(1)); const base = PO.BASELINE[it.fam];
    E.push('Sustituir texto');
    const wo = { id: FP.uid(), type: 'whiteout', x: it.x - .5, y: it.y - .5, w: it.w + 1, h: it.h + 1.5, fill: '#ffffff' };
    const baseline = it.y + it.h - (it.fh || it.h) * .0;
    const to = { id: FP.uid(), type: 'text', x: it.x, y: baseline - size * base, text: it.str, font: it.fam, size, color: '#000000', bold: /bold/i.test(it.fontName || ''), italic: false, underline: false, align: 'left', opacity: 1, replaces: true, link: wo.id };
    p.objs.push(wo, to); E.selId = to.id; E.editing = to.id; E.setTool('select'); E.redrawPage(p); E.renderProps();
    FP.toast('Edición visual: el texto original queda tapado por un rectángulo blanco y se añade texto nuevo encima. No se modifica el flujo de contenido original.', 'warn', 7000);
  }

  /* ---------- resaltado sobre texto ---------- */
  async function markupRegion(p, rc, tool) {
    const kind = tool; const items = await textItems(p); const rects = [];
    items.forEach(it => {
      if (!it.str.trim()) return;
      const ix0 = Math.max(rc.x, it.x), ix1 = Math.min(rc.x + rc.w, it.x + it.w), iy0 = Math.max(rc.y, it.y), iy1 = Math.min(rc.y + rc.h, it.y + it.h);
      if (ix1 <= ix0 || iy1 <= iy0) return; if ((iy1 - iy0) < it.h * .3 && rc.h > 4) return;
      if (Math.abs(it.ang) < .05 && it.str.length > 1) { const cw = it.w / it.str.length; const a = Math.floor((ix0 - it.x) / cw + .3), b = Math.ceil((ix1 - it.x) / cw - .3); if (b <= a) return; rects.push({ x: it.x + a * cw, y: it.y, w: (b - a) * cw, h: it.h }); }
      else rects.push({ x: it.x, y: it.y, w: it.w, h: it.h });
    });
    // fusionar por línea
    rects.sort((a, b) => a.y - b.y || a.x - b.x); const merged = [];
    rects.forEach(r => { const m = merged.find(q => Math.abs(q.y - r.y) < r.h * .5 && r.x <= q.x + q.w + r.h * .6); if (m) { const x1 = Math.max(m.x + m.w, r.x + r.w); m.x = Math.min(m.x, r.x); m.w = x1 - m.x; m.h = Math.max(m.h, r.h); } else merged.push(Object.assign({}, r)); });
    if (!merged.length) { if (rc.w < 4 || rc.h < 4) { FP.toast('Arrastra sobre el texto que quieres marcar', 'warn'); return; } merged.push(rc); FP.toast('No se detectó texto: se marcó el área seleccionada', 'warn'); }
    newObj(p, { type: 'markup', kind, rects: merged.map(r => ({ x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.w.toFixed(2), h: +r.h.toFixed(2) })), color: kind === 'highlight' ? D.hl : (kind === 'strike' ? '#d92020' : '#1d4ed8'), opacity: kind === 'highlight' ? .45 : 1 }, { highlight: 'Resaltar', underline: 'Subrayar', strike: 'Tachar' }[kind]);
    E.redrawPage(p);
  }

  /* ---------- imágenes del PDF ---------- */
  function pdfImageMenu(e, p, im) {
    FP.menu({ x: e.clientX, y: e.clientY }, [
      { header: `Imagen ${im.pw || '?'}×${im.ph || '?'} px` },
      { label: 'Extraer (calidad original)', icon: 'download', action: async () => { const r = await PO.extractOneImage(E, p, im); if (!r) return FP.toast('No se pudo extraer esta imagen (formato interno no compatible)', 'err'); FP.download(r.blob, 'imagen_pagina' + (E.S.pages.indexOf(p) + 1) + '.' + r.ext); } },
      { label: 'Sustituir en el contenido original…', icon: 'swap', tip: 'Modifica el PDF de verdad', action: () => realImageOp(p, im, true) },
      { label: 'Eliminar del contenido original', icon: 'trash', action: () => realImageOp(p, im, false) },
      '-',
      { label: 'Cubrir con blanco (superposición)', icon: 'whiteout', action: () => { newObj(p, { type: 'whiteout', x: im.x, y: im.y, w: im.w, h: im.h, fill: '#ffffff' }, 'Tapar imagen'); E.redrawPage(p); } },
      { label: 'Colocar otra imagen encima (superposición)…', icon: 'img', action: async () => { const f = await FP.pickFiles('image/*'); if (!f[0]) return; const a = await E.addAsset(f[0]); newObj(p, { type: 'image', x: im.x, y: im.y, w: im.w, h: im.h, asset: a, opacity: 1 }, 'Imagen'); E.redrawPage(p); } },
    ]);
  }
  async function realImageOp(p, im, replace) {
    let file = null; if (replace) { const f = await FP.pickFiles('image/*,.tif,.tiff'); if (!f[0]) return; file = f[0]; }
    await FP.busy(replace ? 'Sustituyendo imagen…' : 'Eliminando imagen…', async () => {
      try {
        const bytes = await PO.replaceImageReal(E, p, im, file);
        E.push(replace ? 'Sustituir imagen' : 'Eliminar imagen');
        const src = await addSource(bytes, E.src(p.src).name + ' (mod.)'); p.src = src.id; p.idx = 0; E.hoverBoxes = null; E.layout(); E.renderSide();
        FP.toast(replace ? 'Imagen sustituida en el contenido del PDF (se estira al mismo marco).' : 'Imagen eliminada del contenido del PDF.', 'ok');
      } catch (e) { FP.error(e, 'Operación real no posible'); }
    });
  }

  /* ---------- activos e imágenes ---------- */
  E.addAsset = async function (fileOrCanvas, preferJpg) {
    let bytes, type, w, hh;
    if (fileOrCanvas instanceof HTMLCanvasElement) { const c = fileOrCanvas; const b = await FP.toBlob(c, preferJpg ? 'image/jpeg' : 'image/png', .92); bytes = new Uint8Array(await b.arrayBuffer()); type = preferJpg ? 'jpg' : 'png'; w = c.width; hh = c.height; }
    else {
      const t = await FP.sniff(fileOrCanvas);
      if (t === 'jpg' || t === 'png') { bytes = new Uint8Array(await FP.readBuf(fileOrCanvas)); type = t; const img = await FP.blobToImage(fileOrCanvas); w = img.naturalWidth; hh = img.naturalHeight; if (t === 'png' && bytes[25] === 3 && false) type = 'png'; }
      else { const c = await FP.loadImageFile(fileOrCanvas, { svgScale: 2 }); return E.addAsset(c); }
    }
    const id = FP.uid(); E.S.assets[id] = { id, type, bytes, w, h: hh, url: URL.createObjectURL(new Blob([bytes], { type: type === 'jpg' ? 'image/jpeg' : 'image/png' })) };
    return id;
  };
  async function assetCanvas(id) { const a = E.S.assets[id]; const img = await FP.blobToImage(new Blob([a.bytes], { type: a.type === 'jpg' ? 'image/jpeg' : 'image/png' })); const c = FP.canvas(img.naturalWidth, img.naturalHeight); c.getContext('2d').drawImage(img, 0, 0); return c; }
  async function cropImageObj(o) {
    const c = await assetCanvas(o.asset); const maxW = Math.min(760, innerWidth - 80), maxH = Math.min(480, innerHeight - 260); const s = Math.min(maxW / c.width, maxH / c.height, 1);
    const view = FP.canvas(c.width * s, c.height * s); view.getContext('2d').drawImage(c, 0, 0, view.width, view.height);
    const wrap = h('div', { style: { position: 'relative', display: 'inline-block', touchAction: 'none' } }, view); const sel = h('div', { style: { position: 'absolute', outline: '2px dashed #ff6b3d', boxShadow: '0 0 0 9999px rgba(0,0,0,.45)', pointerEvents: 'none' } }); wrap.appendChild(sel);
    let r = { x: 0, y: 0, w: view.width, h: view.height }; const upd = () => Object.assign(sel.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); upd();
    wrap.addEventListener('pointerdown', (e) => { const b = view.getBoundingClientRect(); const sx = e.clientX - b.left, sy = e.clientY - b.top; wrap.setPointerCapture(e.pointerId); const mv = (ev) => { const x = FP.clamp(ev.clientX - b.left, 0, view.width), y = FP.clamp(ev.clientY - b.top, 0, view.height); r = { x: Math.min(sx, x), y: Math.min(sy, y), w: Math.abs(x - sx), h: Math.abs(y - sy) }; upd(); }; const up = () => { wrap.removeEventListener('pointermove', mv); wrap.removeEventListener('pointerup', up); }; wrap.addEventListener('pointermove', mv); wrap.addEventListener('pointerup', up); });
    const ok = await FP.modal({ title: 'Recortar imagen', icon: 'crop', size: 'wide', body: h('div', { style: { textAlign: 'center' } }, h('div', { class: 'fp-muted small', style: { marginBottom: '8px' } }, 'Arrastra para definir el área que se conserva.'), wrap), buttons: [{ label: 'Cancelar', value: false }, { label: 'Recortar', value: true, primary: true }] });
    if (!ok || r.w < 3 || r.h < 3) return;
    const cx = Math.round(r.x / s), cy = Math.round(r.y / s), cw = Math.round(r.w / s), ch = Math.round(r.h / s);
    const out = FP.canvas(cw, ch); out.getContext('2d').drawImage(c, cx, cy, cw, ch, 0, 0, cw, ch);
    const f = E.findObj(o.id); E.push('Recortar imagen');
    const id = await E.addAsset(out, E.S.assets[o.asset].type === 'jpg');
    const kx = o.w / c.width, ky = o.h / c.height; o.x += cx * kx; o.y += cy * ky; o.w = cw * kx; o.h = ch * ky; o.asset = id; E.redrawPage(f.p);
  }
  async function replaceImageObj(o) { const fl = await FP.pickFiles('image/*,.tif,.tiff,.svg'); if (!fl[0]) return; const id = await E.addAsset(fl[0]); const f = E.findObj(o.id); E.push('Sustituir imagen'); const a = E.S.assets[id]; const r = a.w / a.h; const nh = o.w / r; o.y += (o.h - nh) / 2; o.h = nh; o.asset = id; E.redrawPage(f.p); }
  async function rotateImageObj(o) { const c = await assetCanvas(o.asset); const r = FP.canvas(c.height, c.width); const x = r.getContext('2d'); x.translate(r.width, 0); x.rotate(Math.PI / 2); x.drawImage(c, 0, 0); const id = await E.addAsset(r, E.S.assets[o.asset].type === 'jpg'); const f = E.findObj(o.id); E.push('Girar imagen'); const cx = o.x + o.w / 2, cy = o.y + o.h / 2; [o.w, o.h] = [o.h, o.w]; o.x = cx - o.w / 2; o.y = cy - o.h / 2; o.asset = id; E.redrawPage(f.p); }

  /* ======================= Herramientas ======================= */
  E.setTool = async function (t) {
    if (!E.S || !E.S.pages.length) return;
    if (t === 'image') { const f = await FP.pickFiles('image/*,.tif,.tiff,.svg'); if (!f[0]) return; E.pending = { asset: await E.addAsset(f[0]) }; t = 'placeimg'; FP.toast('Haz clic en la página para colocar la imagen, o arrastra para definir su tamaño.'); }
    if (t === 'sign') { const a = await signatureDialog(); if (!a) return; E.pending = { asset: a, sig: true }; t = 'placeimg'; FP.toast('Haz clic donde quieras colocar la firma (Mayús: colocar varias).'); }
    const prevHover = E.hoverBoxes && E.page(E.hoverBoxes.pid); E.hoverBoxes = null; if (prevHover) E.redrawPage(prevHover);
    E.tool = t;
    FP.$$('[data-tool]', el.toolbar).forEach(b => b.classList.toggle('on', b.dataset.tool === t || (t === 'placeimg' && (E.pending && E.pending.sig ? b.dataset.tool === 'sign' : b.dataset.tool === 'image'))));
    const cur = { hand: 'grab', select: 'default', text: 'text', note: 'copy' }[t] || 'crosshair';
    FP.$$('.ov:not(.stl)', el.work).forEach(o => o.style.cursor = cur);
    if (t === 'edittext') FP.toast('Pasa el ratón sobre el texto y haz clic en el fragmento a sustituir.');
    if (t === 'pdfimg') FP.toast('Pasa el ratón sobre la página para ver las imágenes detectadas.');
    renderOptbar();
  };
  function renderOptbar() {
    if (!E.S || !el.optbar) return; const ob0 = el.optbar; ob0.innerHTML = ''; const ob = { append: (...xs) => ob0.append(...xs.filter(x => x != null && x !== false)), appendChild: (x) => ob0.appendChild(x) };
    const f = E.selId && E.findObj(E.selId); const o = f && f.o; const t = o ? (o.type === 'line' ? (o.arrowEnd ? 'arrow' : 'line') : o.type) : E.tool;
    const upd = (k, v, label) => { if (o) { if (!E._optT) E.push(label || 'Propiedad'); clearTimeout(E._optT); E._optT = setTimeout(() => E._optT = null, 700); o[k] = v; E.redrawPage(f.p); E.renderProps(); } };
    const setD = (k, v, ok) => { D[k] = v; upd(ok || k, v); };
    const names = { select: 'Seleccionar', hand: 'Mano', text: 'Texto', edittext: 'Editar texto', placeimg: 'Colocar imagen', pdfimg: 'Imágenes del PDF', rect: 'Rectángulo', ellipse: 'Elipse', line: 'Línea', arrow: 'Flecha', ink: 'Mano alzada', whiteout: 'Tapar', highlight: 'Resaltar', underline: 'Subrayar', strike: 'Tachar', note: 'Nota', link: 'Enlace', image: 'Imagen', markup: 'Marcado', field: 'Campo' };
    ob.appendChild(h('span', { class: 'ttl' }, (o ? 'Objeto: ' : '') + (names[t] || t)));
    const colorIn = (k, val, label, ok) => h('label', null, label, h('input', { type: 'color', value: val || '#000000', oninput: (e) => setD(k, e.target.value, ok) }));
    const num = (k, val, label, min, max, step, ok) => h('label', null, label, h('input', { type: 'number', value: val, min, max, step: step || 1, onchange: (e) => setD(k, parseFloat(e.target.value), ok) }));
    const opac = (val) => h('label', null, 'Opacidad', h('input', { type: 'range', min: 5, max: 100, value: Math.round((val != null ? val : 1) * 100), oninput: (e) => setD('opacity', e.target.value / 100) }));
    if (t === 'text') {
      const s = o || D;
      ob.append(h('select', { onchange: (e) => setD('font', e.target.value) }, ['Helvetica', 'Times', 'Courier'].map(fn => h('option', { value: fn, selected: s.font === fn }, { Helvetica: 'Helvetica (sans)', Times: 'Times (serif)', Courier: 'Courier (mono)' }[fn]))),
        num('size', s.size, 'Tamaño', 4, 400, .5), colorIn('color', s.color, 'Color'),
        ...[['bold', 'N', 'Negrita'], ['italic', 'K', 'Cursiva'], ['underline', 'S', 'Subrayado']].map(([k, l, tip]) => h('button', { class: 'ibtn' + (s[k] ? ' on' : ''), 'data-tip': tip, style: { fontWeight: k === 'bold' ? 'bold' : 'normal', fontStyle: k === 'italic' ? 'italic' : 'normal', textDecoration: k === 'underline' ? 'underline' : 'none' }, onclick: (e) => { setD(k, !s[k]); renderOptbar(); } }, l)),
        h('select', { onchange: (e) => setD('align', e.target.value) }, [['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']].map(([v, l]) => h('option', { value: v, selected: s.align === v }, l))), opac(s.opacity));
    } else if (['rect', 'ellipse'].includes(t)) {
      const s = o || D;
      ob.append(colorIn('stroke', s.stroke, 'Borde'), num('sw', s.sw, 'Grosor', 0, 50, .5), h('label', null, h('input', { type: 'checkbox', checked: !!s.fill, onchange: (e) => { setD('fill', e.target.checked ? (D._lastFill || '#ffd84d') : ''); renderOptbar(); } }), 'Relleno'), s.fill ? h('input', { type: 'color', value: s.fill, oninput: (e) => { D._lastFill = e.target.value; setD('fill', e.target.value); } }) : null, opac(s.opacity));
    } else if (t === 'line' || t === 'arrow') {
      const s = o || D; ob.append(colorIn('stroke', s.stroke, 'Color'), num('sw', s.sw, 'Grosor', .5, 50, .5), opac(s.opacity));
      if (o) ob.append(h('label', null, h('input', { type: 'checkbox', checked: !!o.arrowStart, onchange: (e) => upd('arrowStart', e.target.checked) }), 'Flecha inicio'), h('label', null, h('input', { type: 'checkbox', checked: !!o.arrowEnd, onchange: (e) => upd('arrowEnd', e.target.checked) }), 'Flecha final'), h('label', null, h('input', { type: 'checkbox', checked: !!o.dash, onchange: (e) => upd('dash', e.target.checked) }), 'Discontinua'));
    } else if (t === 'ink') { const s = o ? { ink: o.stroke, inkW: o.sw, opacity: o.opacity } : D; ob.append(colorIn('ink', s.ink, 'Color', 'stroke'), num('inkW', s.inkW, 'Grosor', .5, 40, .5, 'sw'), opac(s.opacity)); }
    else if (['highlight', 'underline', 'strike', 'markup'].includes(t)) { if (o) ob.append(colorIn('color', o.color, 'Color'), opac(o.opacity)); else ob.append(h('label', null, 'Color', h('input', { type: 'color', value: D.hl, oninput: (e) => D.hl = e.target.value })), h('span', { class: 'fp-muted small' }, 'Arrastra sobre el texto')); }
    else if (t === 'whiteout') ob.append(o ? colorIn('fill', o.fill || '#ffffff', 'Color de relleno') : h('span', { class: 'fp-muted small' }, 'Dibuja un rectángulo opaco. Es una superposición: el contenido original sigue debajo.'));
    else if (t === 'image') ob.append(opac(o.opacity), h('button', { class: 'btn sm', onclick: () => cropImageObj(o) }, icon('crop', 's'), 'Recortar'), h('button', { class: 'btn sm', onclick: () => replaceImageObj(o) }, icon('swap', 's'), 'Sustituir'), h('button', { class: 'btn sm', onclick: () => rotateImageObj(o) }, icon('rotr', 's'), 'Girar'));
    if (o) ob.append(h('div', { class: 'sep' }), h('button', { class: 'ibtn', 'data-tip': 'Duplicar', onclick: () => E.duplicateObj() }, icon('copy')), h('button', { class: 'ibtn', 'data-tip': 'Eliminar', onclick: () => E.deleteObj() }, icon('trash')));
    ob.append(h('div', { style: { flex: 1 } }));
    renderPageNav();
  }
  function renderPageNav() {
    if (!E.S || !el.optbar) return; let nav = FP.$('.pnav', el.optbar);
    if (!nav) { nav = h('div', { class: 'pnav', style: { display: 'flex', alignItems: 'center', gap: '4px' } }); el.optbar.appendChild(nav); }
    nav.innerHTML = '';
    const pi = h('input', { type: 'number', value: E.S.cur + 1, min: 1, max: E.S.pages.length, style: { width: '52px' }, onchange: (e) => E.goto(+e.target.value - 1) });
    nav.append(h('button', { class: 'ibtn', 'data-tip': 'Página anterior', onclick: () => E.goto(E.S.cur - 1) }, icon('chevu')), pi, h('span', { class: 'fp-muted small' }, '/ ' + E.S.pages.length), h('button', { class: 'ibtn', 'data-tip': 'Página siguiente', onclick: () => E.goto(E.S.cur + 1) }, icon('chevd')),
      h('div', { class: 'sep' }), h('button', { class: 'ibtn', 'data-tip': 'Alejar', onclick: () => E.setZoom(E.S.zoom / 1.25) }, icon('zoomout')),
      h('select', { onchange: (e) => { const v = e.target.value; if (v === 'page' || v === 'width') E.fit(v); else E.setZoom(+v); } }, [['', Math.round(E.S.zoom * 100) + ' %'], [.5, '50 %'], [.75, '75 %'], [1, '100 %'], [1.25, '125 %'], [1.5, '150 %'], [2, '200 %'], [3, '300 %'], [4, '400 %'], ['page', 'Ajustar página'], ['width', 'Ajustar ancho']].map(([v, l]) => h('option', { value: v }, l))),
      h('button', { class: 'ibtn', 'data-tip': 'Acercar', onclick: () => E.setZoom(E.S.zoom * 1.25) }, icon('zoomin')),
      h('button', { class: 'ibtn', 'data-tip': 'Ajustar a la página', onclick: () => E.fit('page') }, icon('fit')), h('button', { class: 'ibtn', 'data-tip': 'Ajustar al ancho', onclick: () => E.fit('width') }, icon('fitw')),
      h('button', { class: 'ibtn', 'data-tip': 'Organizar páginas', onclick: () => E.setMode(E.mode === 'organize' ? 'view' : 'organize') }, icon('grid')),
      h('button', { class: 'ibtn', 'data-tip': 'Pantalla completa', onclick: () => E.fullscreen() }, icon('full')),
      h('button', { class: 'ibtn mobonly', 'data-tip': 'Paneles', onclick: () => { el.right.classList.toggle('mob'); } }, icon('menu')));
  }
  function updateStatus() {
    if (!E.S || !el.status) return; const p = E.curPage(); if (!p) { el.status.textContent = 'Documento vacío'; return; } const d = E.dims(p);
    el.status.innerHTML = '';
    el.status.append(...[h('span', null, 'Página ' + (E.S.cur + 1) + ' de ' + E.S.pages.length), h('span', null, (d.W * 25.4 / 72).toFixed(0) + ' × ' + (d.H * 25.4 / 72).toFixed(0) + ' mm'), h('span', null, 'Zoom ' + Math.round(E.S.zoom * 100) + ' %'),
      E.selPages.size > 1 ? h('span', null, E.selPages.size + ' páginas seleccionadas') : null, h('span', { class: 'sp' }),
      E.S.security ? h('span', { style: { color: 'var(--ok)' } }, '🔒 Se cifrará con AES‑256 al guardar') : null,
      h('span', null, E.S.pages.reduce((a, q) => a + q.objs.length, 0) + ' elementos añadidos'), h('span', null, 'Procesamiento local')].filter(Boolean));
  }

  /* ======================= Panel izquierdo ======================= */
  E.showLeft = function (tab) { E.leftTab = tab; E.renderSide(); if (tab === 'find') setTimeout(() => { const i = FP.$('#pdf-find'); i && i.focus(); }, 30); };
  E.renderSide = function () {
    if (!E.S) return;
    el.ltabs.innerHTML = '';
    [['pages', 'Páginas'], ['find', 'Buscar'], ['list', 'Elementos']].forEach(([k, l]) => el.ltabs.appendChild(h('div', { class: 'tb' + (E.leftTab === k ? ' on' : ''), onclick: () => E.showLeft(k) }, l)));
    el.lbody.innerHTML = '';
    if (E.leftTab === 'pages') renderThumbs(el.lbody, 120, false);
    else if (E.leftTab === 'find') renderFind();
    else renderAnnList();
    if (E.rightTab === 'stamps' || E.rightTab === 'form') E.renderProps();
    updateStatus();
  };
  const thumbIOs = {};
  function renderThumbs(container, width, grid) {
    const wrap = h('div', { class: grid ? 'organizer' : 'thumbs' }); container.appendChild(wrap);
    const key = grid ? 'g' : 'l'; if (thumbIOs[key]) thumbIOs[key].disconnect();
    const thumbIO = thumbIOs[key] = new IntersectionObserver((ents) => ents.forEach(en => { if (en.isIntersecting) { renderThumb(en.target, width); thumbIO.unobserve(en.target); } }), { root: grid ? el.work : container, rootMargin: '300px' });
    E.S.pages.forEach((p, i) => {
      const d = E.dims(p); const s = Math.min(width / d.W, (grid ? 220 : 170) / d.H);
      const ph = h('div', { class: 'ph', style: { width: d.W * s + 'px', height: d.H * s + 'px' } });
      const t = h('div', { class: 'thumb' + (i === E.S.cur ? ' cur' : '') + (E.selPages.has(p.id) ? ' sel' : ''), draggable: true }, ph, h('div', { class: 'n' }, String(i + 1) + (p.objs.length ? ' •' : '') + (p.rot ? ' ↻' : '')));
      t.dataset.id = p.id; t._w = d.W * s; t._h = d.H * s;
      t.addEventListener('click', (e) => {
        if (e.ctrlKey || e.metaKey) { E.selPages.has(p.id) ? E.selPages.delete(p.id) : E.selPages.add(p.id); }
        else if (e.shiftKey) { const a = E.S.cur, b = i; for (let k = Math.min(a, b); k <= Math.max(a, b); k++) E.selPages.add(E.S.pages[k].id); }
        else { E.selPages = new Set([p.id]); }
        E.S.cur = i; FP.$$('.thumb', wrap).forEach(x => { x.classList.toggle('sel', E.selPages.has(x.dataset.id)); x.classList.toggle('cur', x.dataset.id === p.id); });
        if (!grid) E.goto(i, true); updateStatus();
      });
      t.addEventListener('dblclick', () => { if (grid) { E.setMode('view'); E.goto(i); } });
      t.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!E.selPages.has(p.id)) { E.selPages = new Set([p.id]); E.S.cur = i; FP.$$('.thumb', wrap).forEach(x => x.classList.toggle('sel', E.selPages.has(x.dataset.id))); } pageMenu(e); });
      t.addEventListener('dragstart', (e) => { if (!E.selPages.has(p.id)) { E.selPages = new Set([p.id]); } e.dataTransfer.setData('text/pedefe-pages', JSON.stringify([...E.selPages])); e.dataTransfer.effectAllowed = 'move'; });
      t.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); const r = t.getBoundingClientRect(); const after = grid ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2; FP.$$('.thumb', wrap).forEach(x => x.classList.remove('dragover-a', 'dragover-b')); t.classList.add(after ? 'dragover-a' : 'dragover-b'); t._after = after; });
      t.addEventListener('dragleave', () => t.classList.remove('dragover-a', 'dragover-b'));
      t.addEventListener('drop', async (e) => {
        e.preventDefault(); e.stopPropagation(); t.classList.remove('dragover-a', 'dragover-b');
        const ids = e.dataTransfer.getData('text/pedefe-pages');
        const pos = E.S.pages.indexOf(p) + (t._after ? 1 : 0);
        if (ids) { E.movePagesTo(JSON.parse(ids), pos); return; }
        if (e.dataTransfer.files.length) await E.insertFilesAt(Array.from(e.dataTransfer.files), pos);
      });
      wrap.appendChild(t); thumbIO.observe(t);
    });
  }
  async function renderThumb(t, width) {
    const p = E.page(t.dataset.id); if (!p) return; const src = E.src(p.src); const jp = await E.jsPage(src, p.idx); const d = E.dims(p);
    const vp = jp.getViewport({ scale: (t._w / d.W) * Math.min(2, devicePixelRatio || 1), rotation: d.R });
    const c = FP.canvas(vp.width, vp.height); c.style.width = t._w + 'px'; c.style.height = t._h + 'px';
    const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
    try { await jp.render({ canvasContext: cx, canvas: c, viewport: vp }).promise; } catch (e) { return; }
    const ph = t.querySelector('.ph'); if (ph) ph.replaceWith(c);
  }
  function highlightThumb() { FP.$$('.thumb', el.lbody).forEach(t => t.classList.toggle('cur', t.dataset.id === (E.curPage() || {}).id)); const c = FP.$('.thumb.cur', el.lbody); if (c && E.leftTab === 'pages') { const r = c.getBoundingClientRect(), pr = el.lbody.getBoundingClientRect(); if (r.top < pr.top || r.bottom > pr.bottom) c.scrollIntoView({ block: 'nearest' }); } }
  function pageMenu(e) {
    FP.menu({ x: e.clientX, y: e.clientY }, [
      { header: E.selPages.size + ' página(s)' },
      { label: 'Rotar a la derecha', icon: 'rotr', action: () => E.rotatePages(90) }, { label: 'Rotar a la izquierda', icon: 'rotl', action: () => E.rotatePages(-90) },
      { label: 'Duplicar', icon: 'copy', action: () => E.duplicatePages() }, { label: 'Insertar página en blanco después', icon: 'blank', action: () => E.insertBlank() },
      { label: 'Insertar PDF después…', icon: 'insert', action: () => E.insertFromPdf() },
      { label: 'Extraer (descargar)…', icon: 'extract', action: () => E.exportSelected() },
      '-', { label: 'Eliminar', icon: 'trash', action: () => E.deletePages() }]);
  }
  E.setMode = function (m) {
    E.mode = m; el.pages = null; el.work.innerHTML = '';
    if (m === 'organize') renderOrganizer(); else { E.layout(); E.goto(E.S.cur); }
  };
  function renderOrganizer() {
    el.work.innerHTML = '';
    const bar = h('div', { class: 'optbar', style: { position: 'sticky', top: 0, zIndex: 3, flexWrap: 'wrap', whiteSpace: 'normal' } }, h('span', { class: 'ttl' }, icon('grid', 's'), 'Organizar páginas'), h('span', { class: 'fp-muted small' }, 'Arrastra para reordenar · Ctrl/Mayús para seleccionar varias · suelta archivos para insertarlos'),
      h('div', { style: { flex: 1 } }),
      h('button', { class: 'btn sm', onclick: () => E.rotatePages(-90) }, icon('rotl', 's'), 'Izq.'), h('button', { class: 'btn sm', onclick: () => E.rotatePages(90) }, icon('rotr', 's'), 'Der.'),
      h('button', { class: 'btn sm', onclick: () => E.duplicatePages() }, icon('copy', 's'), 'Duplicar'), h('button', { class: 'btn sm', onclick: () => E.insertBlank() }, icon('blank', 's'), 'En blanco'),
      h('button', { class: 'btn sm', onclick: () => E.exportSelected() }, icon('extract', 's'), 'Extraer'), h('button', { class: 'btn sm danger', onclick: () => E.deletePages() }, icon('trash', 's'), 'Eliminar'),
      h('button', { class: 'btn sm pri', onclick: () => E.setMode('view') }, 'Volver al editor'));
    el.work.appendChild(bar); const holder = h('div'); el.work.appendChild(holder);
    renderThumbs(holder, 160, true);
    // también el panel lateral
    if (E.leftTab === 'pages') { el.lbody.innerHTML = ''; renderThumbs(el.lbody, 120, false); }
  }

  /* ---------- operaciones de página ---------- */
  const selOrCur = () => { const ids = E.selPages.size ? E.S.pages.filter(p => E.selPages.has(p.id)) : [E.curPage()]; return ids.filter(Boolean); };
  const rerender = () => { E.layout(); E.renderSide(); };
  E.rotatePages = function (deg) { const ps = selOrCur(); if (!ps.length) return; E.push('Rotar páginas'); ps.forEach(p => p.rot = ((p.rot + deg) % 360 + 360) % 360); rerender(); };
  E.deletePages = async function () {
    const ps = selOrCur(); if (!ps.length) return;
    if (ps.length >= E.S.pages.length) return FP.toast('No puedes eliminar todas las páginas del documento', 'warn');
    if (!await FP.confirm(`¿Eliminar ${ps.length} página(s)?`, 'Eliminar páginas', 'Eliminar', true)) return;
    E.push('Eliminar páginas'); const ids = new Set(ps.map(p => p.id)); E.S.pages = E.S.pages.filter(p => !ids.has(p.id)); E.selPages = new Set(); E.S.cur = Math.min(E.S.cur, E.S.pages.length - 1); rerender();
  };
  E.duplicatePages = function () { const ps = selOrCur(); E.push('Duplicar páginas'); const last = E.S.pages.indexOf(ps[ps.length - 1]); const copies = ps.map(p => { const c = JSON.parse(JSON.stringify(p)); c.id = FP.uid(); c.objs.forEach(o => o.id = FP.uid()); return c; }); E.S.pages.splice(last + 1, 0, ...copies); rerender(); };
  E.movePagesTo = function (ids, pos) {
    const set = new Set(ids); const moving = E.S.pages.filter(p => set.has(p.id)); if (!moving.length) return;
    E.push('Reordenar páginas'); let before = 0; E.S.pages.forEach((p, i) => { if (i < pos && set.has(p.id)) before++; });
    E.S.pages = E.S.pages.filter(p => !set.has(p.id)); E.S.pages.splice(pos - before, 0, ...moving); E.S.cur = E.S.pages.indexOf(moving[0]); rerender();
  };
  E.movePagesBy = function (d) { const ps = selOrCur(); const i = E.S.pages.indexOf(ps[0]); const j = d < 0 ? i - 1 : E.S.pages.indexOf(ps[ps.length - 1]) + 2; if (j < 0 || j > E.S.pages.length) return; E.movePagesTo(ps.map(p => p.id), j); };
  E.insertBlank = async function () {
    const p = E.curPage(); const d = p ? E.dims(p) : { W: 595.28, H: 841.89 };
    E.push('Insertar página en blanco'); const src = await addSource(await PO.blankPdf(d.W, d.H), 'en blanco'); const pages = await pagesFromSource(src);
    const at = selOrCur().length ? E.S.pages.indexOf(selOrCur().slice(-1)[0]) + 1 : E.S.pages.length; E.S.pages.splice(at, 0, ...pages); E.S.cur = at; rerender(); E.goto(at);
  };
  E.insertFilesAt = async function (files, pos) {
    for (const f of files) {
      const t = await FP.sniff(f);
      if (t === 'pdf') { const prep = await PO.prepareBytes(new Uint8Array(await FP.readBuf(f)), f.name); E.push('Insertar ' + f.name); const src = await addSource(prep.bytes, f.name, prep.enc); const pages = await pagesFromSource(src); E.S.pages.splice(pos, 0, ...pages); pos += pages.length; }
      else if (FP.IMG_TYPES.includes(t)) { const bytes = await PO.imagesToPdfBytes([f], { size: 'image', margin: 0, dpi: 96 }); E.push('Insertar imagen'); const src = await addSource(bytes, f.name); const pages = await pagesFromSource(src); E.S.pages.splice(pos, 0, ...pages); pos += pages.length; }
    }
    rerender();
  };
  E.insertFromPdf = async function () {
    const f = await FP.pickFiles('.pdf,application/pdf'); if (!f[0]) return;
    const prep = await PO.prepareBytes(new Uint8Array(await FP.readBuf(f[0])), f[0].name); const pdf = await PO.openPdfjs(prep.bytes); const n = pdf.numPages; PO.closePdf(pdf);
    const v = await FP.dialog('Insertar páginas de ' + f[0].name, [{ key: 'range', type: 'text', label: `Páginas (1-${n}). Ej.: 1-3, 5`, value: '1-' + n }, { key: 'where', type: 'select', label: 'Posición', value: 'after', options: [['after', 'Después de la página actual'], ['before', 'Antes de la página actual'], ['start', 'Al principio'], ['end', 'Al final']] }], { icon: 'insert' });
    if (!v) return; const idx = PO.parseRange(v.range, n); if (!idx.length) return FP.toast('Rango no válido', 'warn');
    E.push('Insertar páginas'); const src = await addSource(prep.bytes, f[0].name, prep.enc); const pages = await pagesFromSource(src, idx);
    const at = { after: E.S.cur + 1, before: E.S.cur, start: 0, end: E.S.pages.length }[v.where]; E.S.pages.splice(at, 0, ...pages); rerender(); E.goto(at);
  };
  E.mergeDialog = async function () { const fs = await FP.pickFiles('.pdf,application/pdf', true); if (!fs.length) return; if (!E.S || !E.S.pages.length) return E.openFiles(fs); for (const f of fs) await E.appendPdfFile(f); };

  /* ======================= Guardar y exportar ======================= */
  E.export = async function (opts, title) {
    const p = FP.progress(title || 'Generando PDF');
    try { return await PO.exportBytes(E, opts, p); } finally { p.close(); }
  };
  E.saveDialog = async function () {
    if (!E.S || !E.S.pages.length) return;
    const hasFields = E.S.pages.some(p => p.objs.some(o => o.type === 'field'));
    const v = await FP.dialog('Guardar PDF', [
      { key: 'name', type: 'text', label: 'Nombre del archivo', value: FP.baseName(E.S.name) + '.pdf' },
      { key: 'flattenForms', type: 'checkbox', label: 'Aplanar campos de formulario (dejan de ser editables)', value: false },
      { key: 'flattenAnnots', type: 'checkbox', label: 'Aplanar anotaciones (notas, resaltados de otros programas…) en el contenido', value: false },
      { key: 'ocrLayer', type: 'checkbox', label: 'Incluir capa de texto OCR invisible (si se ha reconocido texto)', value: true },
      { type: 'note', html: 'Los textos, formas, imágenes y firmas que has añadido se integran en el contenido de la página. Las notas y enlaces se guardan como anotaciones PDF reales.' + (hasFields ? '<br>Los campos de formulario nuevos se crean como campos AcroForm reales.' : '') + (E.S.security ? '<br><b>El archivo se cifrará con AES‑256.</b>' : '') },
    ], { icon: 'download', ok: 'Guardar' });
    if (!v) return;
    try {
      const bytes = await E.export(v);
      FP.download(new Blob([bytes], { type: 'application/pdf' }), /\.pdf$/i.test(v.name) ? v.name : v.name + '.pdf');
      FP.dirty.pdf = false; FP.db.del('autosave', 'pdf');
    } catch (e) { FP.error(e, 'Error al guardar'); }
  };
  E.exportSelected = async function () {
    const n = E.S.pages.length; const sel = E.S.pages.map((p, i) => E.selPages.has(p.id) ? i + 1 : null).filter(Boolean);
    const v = await FP.dialog('Extraer / exportar páginas', [{ key: 'range', type: 'text', label: 'Páginas (ej.: 1-3, 5, 8-)', value: sel.length ? sel.join(',') : String(E.S.cur + 1) }, { key: 'mode', type: 'radio', label: 'Salida', value: 'one', options: [['one', 'Un único PDF'], ['each', 'Un PDF por página (ZIP)']] }], { icon: 'extract', ok: 'Exportar' });
    if (!v) return; const idx = PO.parseRange(v.range, n); if (!idx.length) return FP.toast('Rango no válido', 'warn');
    try {
      if (v.mode === 'one') { const b = await E.export({ pageIds: idx.map(i => E.S.pages[i].id) }); FP.download(new Blob([b], { type: 'application/pdf' }), FP.baseName(E.S.name) + '_paginas.pdf'); }
      else { const items = []; const pr = FP.progress('Exportando páginas'); try { for (let k = 0; k < idx.length; k++) { pr.set(k / idx.length, 'Página ' + (idx[k] + 1)); items.push({ name: FP.baseName(E.S.name) + '_p' + (idx[k] + 1) + '.pdf', blob: new Blob([await PO.exportBytes(E, { pageIds: [E.S.pages[idx[k]].id] })], { type: 'application/pdf' }) }); } FP.download(await PO.zipBlobs(items, pr), FP.baseName(E.S.name) + '_paginas.zip'); } finally { pr.close(); } }
    } catch (e) { FP.error(e, 'Exportación'); }
  };
  E.splitDialog = async function () {
    const n = E.S.pages.length;
    const v = await FP.dialog('Dividir PDF', [{ key: 'mode', type: 'radio', label: 'Modo', value: 'every', options: [['every', 'Cada N páginas'], ['ranges', 'Por rangos'], ['size', 'En partes iguales']] },
      { key: 'n', type: 'number', label: 'N páginas por archivo', value: 1, min: 1, max: n, show: v => v.mode === 'every' },
      { key: 'parts', type: 'number', label: 'Número de partes', value: 2, min: 2, max: n, show: v => v.mode === 'size' },
      { key: 'ranges', type: 'text', label: 'Rangos separados por «;» (ej.: 1-3; 4-6; 7-)', value: '1-' + Math.ceil(n / 2) + '; ' + (Math.ceil(n / 2) + 1) + '-', show: v => v.mode === 'ranges' }], { icon: 'split', ok: 'Dividir' });
    if (!v) return; let groups = [];
    if (v.mode === 'every') for (let i = 0; i < n; i += v.n) groups.push([...Array(Math.min(v.n, n - i)).keys()].map(k => i + k));
    else if (v.mode === 'size') { const per = Math.ceil(n / v.parts); for (let i = 0; i < n; i += per) groups.push([...Array(Math.min(per, n - i)).keys()].map(k => i + k)); }
    else groups = v.ranges.split(';').map(r => PO.parseRange(r, n)).filter(g => g.length);
    if (!groups.length) return FP.toast('Nada que dividir', 'warn');
    const pr = FP.progress('Dividiendo PDF', true);
    try { const items = []; for (let g = 0; g < groups.length; g++) { if (pr.cancelled) throw new Error('Cancelado'); pr.set(g / groups.length, 'Parte ' + (g + 1) + ' de ' + groups.length); items.push({ name: `${FP.baseName(E.S.name)}_parte${g + 1}_p${groups[g][0] + 1}-${groups[g][groups[g].length - 1] + 1}.pdf`, blob: new Blob([await PO.exportBytes(E, { pageIds: groups[g].map(i => E.S.pages[i].id) })], { type: 'application/pdf' }) }); } FP.download(await PO.zipBlobs(items, pr), FP.baseName(E.S.name) + '_dividido.zip'); }
    catch (e) { FP.error(e, 'División'); } finally { pr.close(); }
  };
  E.toImagesDialog = async function () {
    const n = E.S.pages.length;
    const v = await FP.dialog('Convertir PDF a imágenes', [{ key: 'format', type: 'select', label: 'Formato', value: 'jpg', options: [['jpg', 'JPG'], ['png', 'PNG'], ['webp', 'WEBP']] },
      { key: 'dpi', type: 'select', label: 'Resolución', value: '150', options: [['72', '72 ppp (pantalla)'], ['96', '96 ppp'], ['150', '150 ppp (recomendado)'], ['200', '200 ppp'], ['300', '300 ppp (impresión)'], ['600', '600 ppp (máxima)']] },
      { key: 'quality', type: 'range', label: 'Calidad', value: 90, min: 30, max: 100, unit: ' %', show: v => v.format !== 'png' },
      { key: 'transparent', type: 'checkbox', label: 'Fondo transparente', value: false, show: v => v.format === 'png' },
      { key: 'range', type: 'text', label: 'Páginas', value: '1-' + n }, { key: 'zip', type: 'checkbox', label: 'Descargar todas en un único ZIP', value: true }], { icon: 'image', ok: 'Convertir' });
    if (!v) return; const idx = PO.parseRange(v.range, n); if (!idx.length) return;
    const pr = FP.progress('PDF a imágenes', true);
    try {
      pr.set(0, 'Generando PDF con tus cambios…'); const bytes = await PO.exportBytes(E, { noSecurity: true });
      const items = await PO.renderBytesToImages(bytes, { format: v.format, dpi: +v.dpi, quality: v.quality / 100, transparent: v.transparent, indices: idx, base: FP.baseName(E.S.name) }, pr);
      if (v.zip && items.length > 1) FP.download(await PO.zipBlobs(items, pr), FP.baseName(E.S.name) + '_' + v.format + '.zip');
      else for (const it of items) { FP.download(it.blob, it.name); await FP.sleep(250); }
    } catch (e) { FP.error(e, 'Conversión'); } finally { pr.close(); }
  };
  E.extractTextDialog = async function () {
    const pr = FP.progress('Extrayendo texto'); let txt; try { txt = await PO.extractText(E, pr); } finally { pr.close(); }
    const ta = h('textarea', { style: { width: '100%', height: '50vh', fontFamily: 'ui-monospace,Consolas,monospace', fontSize: '12px' } }, txt);
    const empty = txt.replace(/=== Página \d+ ===/g, '').trim().length < 3;
    await FP.modal({ title: 'Texto del documento', icon: 'text', size: 'wide', body: h('div', null, empty ? h('div', { class: 'note warn' }, 'No se encontró texto. Si es un documento escaneado, usa Documento › OCR.') : null, ta), buttons: [{ label: 'Copiar', onClick: () => { navigator.clipboard.writeText(ta.value).then(() => FP.toast('Copiado', 'ok')); return false; } }, { label: 'Descargar TXT', primary: true, onClick: () => { FP.download(new Blob([ta.value], { type: 'text/plain;charset=utf-8' }), FP.baseName(E.S.name) + '.txt'); } }] });
  };
  E.extractImages = async function () {
    const pr = FP.progress('Extrayendo imágenes', true);
    try { const items = await PO.extractImages(E, pr); if (!items.length) { FP.toast('No se encontraron imágenes extraíbles', 'warn'); return; } FP.download(await PO.zipBlobs(items, pr), FP.baseName(E.S.name) + '_imagenes.zip'); FP.toast(items.length + ' imágenes extraídas' + (items.skipped ? ` (${items.skipped} en formato no compatible)` : ''), 'ok'); }
    catch (e) { FP.error(e, 'Extracción'); } finally { pr.close(); }
  };
  E.compressDialog = async function () {
    const v = await FP.dialog('Comprimir PDF', [
      { key: 'mode', type: 'radio', label: 'Método', value: 'images', options: [['lossless', 'Sin pérdida'], ['images', 'Recomprimir imágenes'], ['raster', 'Máxima (rasterizar)']] },
      { type: 'note', html: '<b>Sin pérdida:</b> reorganiza la estructura y elimina objetos no usados.<br><b>Recomprimir imágenes:</b> reduce y recomprime las fotos internas en JPEG; el texto sigue siendo texto.<br><b>Rasterizar:</b> convierte cada página en una imagen; el texto deja de ser seleccionable.' },
      { key: 'quality', type: 'range', label: 'Calidad JPEG', value: 70, min: 20, max: 95, unit: ' %', show: v => v.mode !== 'lossless' },
      { key: 'maxDim', type: 'select', label: 'Tamaño máximo de las imágenes', value: '1600', options: [['800', '800 px (pantalla)'], ['1200', '1200 px'], ['1600', '1600 px (equilibrado)'], ['2400', '2400 px (impresión)'], ['100000', 'Sin reducir']], show: v => v.mode === 'images' },
      { key: 'dpi', type: 'select', label: 'Resolución', value: '110', options: [['72', '72 ppp'], ['110', '110 ppp'], ['150', '150 ppp'], ['200', '200 ppp']], show: v => v.mode === 'raster' },
      { key: 'gray', type: 'checkbox', label: 'Escala de grises', value: false, show: v => v.mode === 'raster' },
      { key: 'strip', type: 'checkbox', label: 'Eliminar metadatos', value: false, show: v => v.mode !== 'raster' }], { icon: 'compress', ok: 'Comprimir' });
    if (!v) return;
    const pr = FP.progress('Comprimiendo', true);
    try {
      pr.set(0, 'Generando PDF…'); const orig = await PO.exportBytes(E, { noSecurity: true });
      const out = await PO.compress(orig, { mode: v.mode, quality: v.quality / 100, maxDim: +v.maxDim, dpi: +v.dpi, gray: v.gray, strip: v.strip }, pr);
      let final = out; if (E.S.security) final = await (await FP.lib.crypt()).encrypt(out, E.S.security);
      pr.close();
      const pct = Math.round((1 - out.length / orig.length) * 100);
      const ok = await FP.modal({ title: 'Resultado de la compresión', icon: 'compress', body: h('div', null, h('p', null, 'Tamaño original: ', h('b', null, FP.fmtBytes(orig.length))), h('p', null, 'Tamaño comprimido: ', h('b', null, FP.fmtBytes(out.length)), ' ', h('span', { class: 'badge' }, pct > 0 ? '−' + pct + ' %' : 'sin reducción')), v.mode === 'images' ? h('p', { class: 'fp-muted small' }, (out.__changed || 0) + ' imágenes recomprimidas.') : null, pct <= 0 ? h('div', { class: 'note warn' }, 'El archivo ya estaba optimizado. Prueba otro método o una calidad menor.') : null), buttons: [{ label: 'Cerrar', value: false }, { label: 'Descargar', value: true, primary: true }] });
      if (ok) FP.download(new Blob([final], { type: 'application/pdf' }), FP.baseName(E.S.name) + '_comprimido.pdf');
    } catch (e) { pr.close(); FP.error(e, 'Compresión'); }
  };
  E.securityDialog = async function () {
    const s = E.S.security || { userPassword: '', ownerPassword: '', permissions: {} }; const pm = s.permissions || {};
    const src0 = E.S.sources[0]; const enc = src0 && src0.enc;
    const v = await FP.dialog('Seguridad del documento', [
      enc ? { type: 'note', html: `El original estaba cifrado (${enc.method}) y se ha descifrado al abrirlo. Si no configuras una contraseña aquí, se guardará <b>sin protección</b>.` } : null,
      { key: 'on', type: 'checkbox', label: 'Proteger el PDF al guardar (cifrado AES‑256)', value: !!E.S.security },
      { key: 'userPassword', type: 'password', label: 'Contraseña para abrir (vacía = se abre sin contraseña, pero se aplican los permisos)', value: s.userPassword, show: v => v.on },
      { key: 'ownerPassword', type: 'password', label: 'Contraseña de propietario (para cambiar permisos)', value: s.ownerPassword, show: v => v.on },
      { key: 'print', type: 'checkbox', label: 'Permitir imprimir', value: pm.print !== false, show: v => v.on },
      { key: 'copy', type: 'checkbox', label: 'Permitir copiar texto e imágenes', value: pm.copy !== false, show: v => v.on },
      { key: 'modify', type: 'checkbox', label: 'Permitir modificar el documento', value: pm.modify !== false, show: v => v.on },
      { key: 'annotate', type: 'checkbox', label: 'Permitir comentarios y rellenar formularios', value: pm.annotate !== false, show: v => v.on },
      { key: 'assemble', type: 'checkbox', label: 'Permitir insertar, rotar o eliminar páginas', value: pm.assemble !== false, show: v => v.on },
      { type: 'note', kind: 'warn', text: 'Los permisos los respetan los lectores PDF, pero no son una protección absoluta. La contraseña de apertura sí cifra el contenido.', show: v => v.on },
    ].filter(Boolean), { icon: 'lock', validate: v => v.on && !v.userPassword && !v.ownerPassword ? 'Indica al menos una contraseña (de apertura o de propietario)' : null });
    if (!v) return; E.push('Seguridad');
    E.S.security = v.on ? { userPassword: v.userPassword, ownerPassword: v.ownerPassword || '', permissions: { print: v.print, copy: v.copy, modify: v.modify, annotate: v.annotate, fillForms: v.annotate, assemble: v.assemble } } : null;
    updateStatus(); FP.toast(v.on ? 'Se cifrará con AES‑256 al guardar' : 'El documento se guardará sin contraseña', 'ok');
  };
  E.metaDialog = async function () {
    const src = E.src(E.curPage().src); let cur = {};
    try { const d = await PO.libDoc(src); cur = { title: d.getTitle() || '', author: d.getAuthor() || '', subject: d.getSubject() || '', keywords: d.getKeywords() || '', creator: d.getCreator() || '', producer: d.getProducer() || '', created: d.getCreationDate(), modified: d.getModificationDate() }; } catch (e) { }
    let xmp = false; try { const md = await src.pdfjs.getMetadata(); xmp = !!md.metadata; } catch (e) { }
    const m = E.S.meta || cur;
    const v = await FP.dialog('Metadatos del documento', [
      { type: 'note', html: `Creado: ${cur.created ? cur.created.toLocaleString('es-ES') : '—'} · Modificado: ${cur.modified ? cur.modified.toLocaleString('es-ES') : '—'}${xmp ? ' · Contiene metadatos XMP' : ''}` },
      { key: 'title', label: 'Título', value: m.title || '' }, { key: 'author', label: 'Autor', value: m.author || '' }, { key: 'subject', label: 'Asunto', value: m.subject || '' },
      { key: 'keywords', label: 'Palabras clave (separadas por comas)', value: m.keywords || '' }, { key: 'creator', label: 'Aplicación de origen', value: m.creator || '', half: true }, { key: 'producer', label: 'Productor', value: m.producer || '', half: true },
      { key: 'strip', type: 'checkbox', label: 'Eliminar TODOS los metadatos al guardar (información del documento y XMP)', value: !!(E.S.meta && E.S.meta.strip) }], { icon: 'meta' });
    if (!v) return; E.push('Metadatos'); E.S.meta = v; FP.toast(v.strip ? 'Los metadatos se eliminarán al guardar' : 'Metadatos actualizados', 'ok');
  };
  E.infoDialog = async function () {
    const n = E.S.pages.length; const srcs = E.S.sources.filter(s => E.S.pages.some(p => p.src === s.id));
    const rows = [['Nombre', E.S.name], ['Páginas', n], ['Orígenes', srcs.map(s => s.name + ' (' + FP.fmtBytes(s.bytes.length) + ')').join(', ')], ['Elementos añadidos', E.S.pages.reduce((a, p) => a + p.objs.length, 0)], ['Sellos', (E.S.stamps || []).length], ['OCR', E.S.pages.filter(p => p.ocr).length + ' página(s)'], ['Cifrado al guardar', E.S.security ? 'AES‑256' : 'No']];
    try { const md = await srcs[0].pdfjs.getMetadata(); rows.push(['Versión PDF', md.info.PDFFormatVersion || '?'], ['Productor original', md.info.Producer || '—']); } catch (e) { }
    FP.modal({ title: 'Información', icon: 'info', body: h('table', { style: { width: '100%', borderCollapse: 'collapse' } }, rows.map(r => h('tr', null, h('td', { class: 'fp-muted', style: { padding: '4px 8px 4px 0', verticalAlign: 'top' } }, r[0]), h('td', null, String(r[1]))))) });
  };
  E.repairDialog = async function () {
    const f = await FP.pickFiles('.pdf,application/pdf'); if (!f[0]) return; const pr = FP.progress('Reparando ' + f[0].name);
    try {
      await FP.lib.pdflib(); await FP.lib.pdfjs(); const r = await PO.repair(new Uint8Array(await FP.readBuf(f[0])), pr); pr.close();
      const ok = await FP.modal({ title: 'PDF reparado', icon: 'repair', body: h('div', null, h('p', null, 'Método: ' + r.method), h('p', null, 'Tamaño: ' + FP.fmtBytes(r.bytes.length))), buttons: [{ label: 'Descargar', value: 'dl' }, { label: 'Abrir en el editor', value: 'open', primary: true }] });
      if (ok === 'dl') FP.download(new Blob([r.bytes], { type: 'application/pdf' }), FP.baseName(f[0].name) + '_reparado.pdf');
      if (ok === 'open') { if (await E.confirmDiscard()) await E.load(new File([r.bytes], FP.baseName(f[0].name) + '_reparado.pdf', { type: 'application/pdf' })); }
    } catch (e) { pr.close(); FP.error(e, 'No se pudo reparar'); }
  };
  E.blankDetect = async function () {
    const pr = FP.progress('Analizando páginas', true); const blanks = [];
    try {
      for (let i = 0; i < E.S.pages.length; i++) {
        if (pr.cancelled) break; pr.set(i / E.S.pages.length, 'Página ' + (i + 1));
        const p = E.S.pages[i]; if (p.objs.length) continue; const jp = await E.jsPage(E.src(p.src), p.idx); const vp = jp.getViewport({ scale: 120 / Math.max(p.w, p.h) });
        const c = FP.canvas(vp.width, vp.height); const cx = c.getContext('2d', { willReadFrequently: true }); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height); await jp.render({ canvasContext: cx, canvas: c, viewport: vp }).promise;
        const d = cx.getImageData(0, 0, c.width, c.height).data; let ink = 0; for (let k = 0; k < d.length; k += 4) if (d[k] + d[k + 1] + d[k + 2] < 690) ink++;
        if (ink / (d.length / 4) < .002) blanks.push(p);
      }
    } finally { pr.close(); }
    if (!blanks.length) return FP.alert('No se han encontrado páginas en blanco.');
    E.selPages = new Set(blanks.map(p => p.id)); E.renderSide();
    const ok = await FP.confirm(`Se han detectado ${blanks.length} página(s) en blanco: ${blanks.map(p => E.S.pages.indexOf(p) + 1).join(', ')}. Están seleccionadas. ¿Eliminarlas?`, 'Páginas en blanco', 'Eliminar', true);
    if (ok) { if (blanks.length >= E.S.pages.length) return FP.toast('Todas las páginas están en blanco; no se eliminan', 'warn'); E.push('Eliminar páginas en blanco'); const ids = new Set(blanks.map(p => p.id)); E.S.pages = E.S.pages.filter(p => !ids.has(p.id)); E.selPages = new Set(); E.S.cur = 0; rerender(); }
  };
  E.cropDialog = async function () {
    const ps = selOrCur();
    const v = await FP.dialog('Recortar márgenes (' + ps.length + ' página/s)', [{ key: 'unit', type: 'select', label: 'Unidad', value: 'mm', options: [['mm', 'Milímetros'], ['pt', 'Puntos']] },
      { key: 't', type: 'number', label: 'Superior', value: 10, half: true, min: 0 }, { key: 'b', type: 'number', label: 'Inferior', value: 10, half: true, min: 0 }, { key: 'l', type: 'number', label: 'Izquierdo', value: 10, half: true, min: 0 }, { key: 'r', type: 'number', label: 'Derecho', value: 10, half: true, min: 0 },
      { key: 'all', type: 'checkbox', label: 'Aplicar a todas las páginas', value: ps.length === 1 && E.S.pages.length > 1 ? false : true }, { type: 'note', text: 'Se modifica la caja de recorte (CropBox) del PDF: el contenido exterior queda oculto, no se elimina.' }], { icon: 'crop', ok: 'Recortar' });
    if (!v) return; const k = v.unit === 'mm' ? 72 / 25.4 : 1; const targets = v.all ? E.S.pages : ps;
    await FP.busy('Recortando…', async () => {
      try {
        E.push('Recortar márgenes');
        for (const p of targets) {
          const vm = { t: v.t * k, r: v.r * k, b: v.b * k, l: v.l * k }; const r = p.rot % 360;
          const m = r === 90 ? { l: vm.t, t: vm.r, r: vm.b, b: vm.l } : r === 180 ? { t: vm.b, b: vm.t, l: vm.r, r: vm.l } : r === 270 ? { t: vm.l, r: vm.t, b: vm.r, l: vm.b } : vm;
          if (m.l + m.r >= p.w - 10 || m.t + m.b >= p.h - 10) throw new Error('Márgenes demasiado grandes para la página ' + (E.S.pages.indexOf(p) + 1));
          const bytes = await PO.cropPageBytes(E, p, m); const src = await addSource(bytes, E.src(p.src).name + ' (recorte)');
          p.src = src.id; p.idx = 0; p.w -= m.l + m.r; p.h -= m.t + m.b; p.objs.forEach(o => moveObj(o, -m.l, -m.t)); if (p.ocr) p.ocr = null;
        }
        rerender();
      } catch (e) { E.undo(); FP.error(e, 'Recorte'); }
    });
  };
  E.resizeDialog = async function () {
    const ps = selOrCur();
    const v = await FP.dialog('Cambiar tamaño de página', [{ key: 'size', type: 'select', label: 'Nuevo tamaño', value: 'A4', options: Object.keys(PO.PAGE_SIZES).concat([['custom', 'Personalizado (mm)']]) },
      { key: 'orient', type: 'select', label: 'Orientación', value: 'keep', options: [['keep', 'Como la página original'], ['port', 'Vertical'], ['land', 'Horizontal']] },
      { key: 'w', type: 'number', label: 'Ancho (mm)', value: 210, half: true, show: v => v.size === 'custom' }, { key: 'h', type: 'number', label: 'Alto (mm)', value: 297, half: true, show: v => v.size === 'custom' },
      { key: 'mode', type: 'select', label: 'Contenido', value: 'fit', options: [['fit', 'Escalar para encajar'], ['none', 'Sin escalar (centrado)'], ['stretch', 'Estirar']] },
      { key: 'all', type: 'checkbox', label: 'Aplicar a todas las páginas', value: true }], { icon: 'resize', ok: 'Aplicar' });
    if (!v) return; const targets = v.all ? E.S.pages : ps;
    await FP.busy('Cambiando tamaño…', async () => {
      try {
        E.push('Cambiar tamaño de página');
        for (const p of targets) {
          let [W, H] = v.size === 'custom' ? [v.w * 72 / 25.4, v.h * 72 / 25.4] : PO.PAGE_SIZES[v.size]; const d = E.dims(p);
          const land = v.orient === 'land' || (v.orient === 'keep' && d.W > d.H); if ((land && W < H) || (!land && W > H)) [W, H] = [H, W];
          const r = await PO.resizePageBytes(E, p, W, H, v.mode); const src = await addSource(r.bytes, 'redimensionado');
          // transformar objetos: base → vista (rotación p.rot) → escala y desplazamiento
          const tr = (x, y) => { let vx, vy; switch (p.rot % 360) { case 90: vx = p.h - y; vy = x; break; case 180: vx = p.w - x; vy = p.h - y; break; case 270: vx = y; vy = p.w - x; break; default: vx = x; vy = y; } return [r.ox + vx * r.sx, (H - r.oy - r.sy * r.dh) + vy * r.sy]; };
          p.objs.forEach(o => {
            if (o.type === 'line') { [o.x1, o.y1] = tr(o.x1, o.y1); [o.x2, o.y2] = tr(o.x2, o.y2); o.sw *= r.sx; }
            else if (o.type === 'ink') { o.points = o.points.map(q => tr(q[0], q[1])); o.sw *= r.sx; }
            else if (o.type === 'markup') o.rects = o.rects.map(q => { const a = tr(q.x, q.y), b = tr(q.x + q.w, q.y + q.h); return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) }; });
            else { const bb = bbox(o); const a = tr(bb.x, bb.y), b = tr(bb.x + bb.w, bb.y + bb.h); o.x = Math.min(a[0], b[0]); o.y = Math.min(a[1], b[1]); if (o.w != null) { o.w = Math.abs(b[0] - a[0]); o.h = Math.abs(b[1] - a[1]); } if (o.size) o.size *= r.sy; }
          });
          p.src = src.id; p.idx = 0; p.rot = 0; p.origRot = 0; p.w = W; p.h = H; p.ocr = null;
        }
        rerender(); E.fit('width');
      } catch (e) { E.undo(); FP.error(e, 'Cambio de tamaño'); }
    });
  };

  /* ---------- OCR ---------- */
  E.ocrDialog = async function () {
    const LANGS = [['spa', 'Español'], ['eng', 'Inglés'], ['cat', 'Catalán'], ['glg', 'Gallego'], ['eus', 'Euskera'], ['fra', 'Francés'], ['deu', 'Alemán'], ['ita', 'Italiano'], ['por', 'Portugués']];
    const n = E.S.pages.length;
    const v = await FP.dialog('OCR · reconocimiento de texto', [
      { type: 'note', html: 'El reconocimiento se hace <b>en tu navegador</b> con Tesseract.js. La primera vez se descargan los modelos de idioma (≈ 2–15 MB por idioma) desde cdn.jsdelivr.net; tus páginas no se envían a ningún sitio.' },
      ...LANGS.map(([k, l], i) => ({ key: 'L_' + k, type: 'checkbox', label: l, value: k === 'spa', half: true })),
      { key: 'range', type: 'text', label: 'Páginas', value: '1-' + n }, { key: 'dpi', type: 'select', label: 'Resolución de análisis', value: '300', options: [['200', '200 ppp (rápido)'], ['300', '300 ppp (recomendado)'], ['400', '400 ppp (texto pequeño)']] }], { icon: 'ocr', ok: 'Reconocer', size: 'wide', validate: v => !Object.keys(v).some(k => k.startsWith('L_') && v[k]) ? 'Elige al menos un idioma' : null });
    if (!v) return; const langs = LANGS.map(l => l[0]).filter(k => v['L_' + k]); const idx = PO.parseRange(v.range, n); if (!idx.length) return;
    const pr = FP.progress('OCR', true); let res;
    try { res = await PO.ocrPages(E, idx.map(i => E.S.pages[i]), langs, +v.dpi, pr); }
    catch (e) { pr.close(); return FP.error(e, 'OCR (¿sin conexión para descargar el idioma?)'); }
    pr.close();
    E.push('OCR'); res.forEach(r => r.page.ocr = r.ocr); E.changed();
    const txt = res.map(r => '=== Página ' + (E.S.pages.indexOf(r.page) + 1) + ' ===\n' + (r.ocr.text || '').trim()).join('\n\n');
    const words = res.reduce((a, r) => a + r.ocr.words.length, 0); const conf = res.length ? Math.round(res.reduce((a, r) => a + (r.ocr.conf || 0), 0) / res.length) : 0;
    const ta = h('textarea', { style: { width: '100%', height: '40vh', fontSize: '12px' } }, txt);
    await FP.modal({ title: 'Texto reconocido', icon: 'ocr', size: 'wide', body: h('div', null, h('div', { class: 'note' }, `${res.length} página(s) · ${words} palabras · confianza media ${conf} %. Al guardar el PDF se añade una capa de texto invisible: el documento será seleccionable y buscable. Ya puedes buscar en él (Ctrl+F).`), ta),
      buttons: [{ label: 'Copiar', onClick: () => { navigator.clipboard.writeText(ta.value); FP.toast('Copiado', 'ok'); return false; } }, { label: 'Descargar TXT', onClick: () => { FP.download(new Blob([ta.value], { type: 'text/plain;charset=utf-8' }), FP.baseName(E.S.name) + '_ocr.txt'); return false; } }, { label: 'Guardar PDF con texto', primary: true, onClick: () => { setTimeout(() => E.saveDialog(), 50); } }] });
  };

  /* ---------- búsqueda ---------- */
  const norm = (s, cs) => { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); return cs ? s : s.toLowerCase(); };
  function renderFind() {
    const inp = h('input', { id: 'pdf-find', type: 'text', placeholder: 'Buscar en el documento…', value: E.find.q, style: { width: '100%' } });
    const cs = h('input', { type: 'checkbox', checked: !!E.find.cs }); const res = h('div', { class: 'list-b' });
    const go = async () => {
      const q = inp.value.trim(); E.find.q = q; E.find.cs = cs.checked; E.find.hits = []; E.find.cur = -1; res.innerHTML = '';
      if (q.length < 1) { E.redrawAll(); return; } const nq = norm(q, cs.checked);
      res.appendChild(h('div', { class: 'fp-muted small' }, 'Buscando…'));
      for (let i = 0; i < E.S.pages.length; i++) {
        const p = E.S.pages[i]; const items = await textItems(p);
        items.forEach(it => { const s = norm(it.str, cs.checked); let k = s.indexOf(nq); while (k >= 0) { const cw = it.w / Math.max(1, it.str.length); const r = Math.abs(it.ang) < .05 ? { x: it.x + k * cw, y: it.y, w: nq.length * cw, h: it.h } : { x: it.x, y: it.y, w: it.w, h: it.h }; E.find.hits.push({ pid: p.id, page: i, rects: [r], ctx: it.str }); k = s.indexOf(nq, k + 1); } });
        if (p.ocr) p.ocr.words.forEach(w => { if (norm(w.text, cs.checked).includes(nq)) E.find.hits.push({ pid: p.id, page: i, rects: [E.finalToBase(w, p, p.ocr.r)], ctx: w.text + ' (OCR)' }); });
      }
      res.innerHTML = ''; res.appendChild(h('div', { class: 'fp-muted small' }, E.find.hits.length + ' resultado(s)' + (E.find.hits.length ? '' : '. Si es un escaneado, usa OCR.')));
      E.find.hits.slice(0, 500).forEach((hit, j) => res.appendChild(h('div', { class: 'li', onclick: () => gotoHit(j) }, h('b', null, 'Pág. ' + (hit.page + 1) + ': '), hit.ctx.slice(0, 80))));
      E.redrawAll(); if (E.find.hits.length) gotoHit(0);
    };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { if (E.find.q === inp.value.trim() && E.find.hits.length) gotoHit((E.find.cur + (e.shiftKey ? -1 : 1) + E.find.hits.length) % E.find.hits.length); else go(); } });
    el.lbody.append(h('div', { style: { padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' } }, inp, h('label', { class: 'fp-row small' }, cs, 'Distinguir mayúsculas'), h('div', { style: { display: 'flex', gap: '4px' } }, h('button', { class: 'btn sm pri', onclick: go }, icon('search', 's'), 'Buscar'), h('button', { class: 'btn sm', onclick: () => E.find.hits.length && gotoHit((E.find.cur - 1 + E.find.hits.length) % E.find.hits.length) }, icon('chevu', 's')), h('button', { class: 'btn sm', onclick: () => E.find.hits.length && gotoHit((E.find.cur + 1) % E.find.hits.length) }, icon('chevd', 's')), h('button', { class: 'btn sm fp-ghost', onclick: () => { inp.value = ''; go(); } }, 'Limpiar'))), res);
    if (E.find.q && !E.find.hits.length) go();
  }
  function gotoHit(j) {
    const prev = E.find.hits[E.find.cur]; E.find.cur = j; const hit = E.find.hits[j]; if (E.mode !== 'view') E.setMode('view');
    const p = E.page(hit.pid); if (prev) E.redrawPage(E.page(prev.pid)); E.redrawPage(p);
    const box = el.pages && el.pages.querySelector(`.pagebox[data-id="${p.id}"]`); if (!box) return; const sc = E.pxPerPt(); const r = hit.rects[0];
    E.S.cur = hit.page; el.work.scrollTo({ top: box.offsetTop + r.y * sc - el.work.clientHeight / 3, behavior: 'smooth' }); updateStatus();
  }
  function renderAnnList() {
    const box = h('div', { class: 'list-b' }); let n = 0;
    E.S.pages.forEach((p, i) => p.objs.forEach(o => { n++; box.appendChild(h('div', { class: 'li', onclick: () => { E.goto(i); E.setTool('select'); E.select(o.id); } }, h('b', null, 'Pág. ' + (i + 1) + ' · ' + (TAGS[o.type] || o.type)), o.type === 'text' ? h('div', { class: 'fp-muted' }, o.text.slice(0, 60)) : o.type === 'note' ? h('div', { class: 'fp-muted' }, o.text.slice(0, 60)) : o.type === 'field' ? h('div', { class: 'fp-muted' }, o.name) : null)); }));
    if (!n) box.appendChild(h('div', { class: 'fp-muted small' }, 'Aún no has añadido elementos.'));
    el.lbody.appendChild(box);
  }

  /* ======================= Panel derecho ======================= */
  E.showRight = function (t) { E.rightTab = t; el.right.classList.add('mob'); E.renderProps(); };
  E.renderProps = function () {
    if (!E.S || !el.rbody) return;
    el.rtabs.innerHTML = ''; [['props', 'Propiedades'], ['form', 'Formulario'], ['stamps', 'Sellos']].forEach(([k, l]) => el.rtabs.appendChild(h('div', { class: 'tb' + (E.rightTab === k ? ' on' : ''), onclick: () => E.showRight(k) }, l)));
    el.rbody.innerHTML = '';
    if (E.rightTab === 'form') return renderFormPanel();
    if (E.rightTab === 'stamps') return renderStamps();
    const f = E.selId && E.findObj(E.selId);
    if (!f) {
      el.rbody.appendChild(h('div', { class: 'ptools' }, h('div', { class: 'hd' }, 'Acciones rápidas'),
        ...[['Añadir texto', 'text', () => E.setTool('text')], ['Añadir imagen', 'img', () => E.setTool('image')], ['Firmar', 'sign', () => E.setTool('sign')], ['Resaltar texto', 'highlight', () => E.setTool('highlight')], ['Marca de agua', 'watermark', () => E.stampDialog({ type: 'watermark' })], ['Numerar páginas', 'hash', () => E.stampDialog({ type: 'pagenum' })], ['OCR', 'ocr', () => E.ocrDialog()], ['Comprimir', 'compress', () => E.compressDialog()], ['Proteger con contraseña', 'lock', () => E.securityDialog()], ['Convertir a imágenes', 'image', () => E.toImagesDialog()], ['Organizar páginas', 'grid', () => E.setMode('organize')]].map(([l, ic, fn]) => h('button', { class: 'btn', onclick: fn }, icon(ic, 's'), l)),
        h('div', { class: 'note', style: { marginTop: '12px' } }, 'Los elementos que añades se colocan ', h('b', null, 'encima'), ' del contenido original. «Editar texto existente» tapa el original y escribe encima: no reescribe el texto interno del PDF.')));
      return;
    }
    const o = f.o; const box = h('div', { style: { padding: '10px' } });
    const fields = []; const bb = bbox(o);
    fields.push({ type: 'note', html: `<b>${o.replaces ? 'Sustitución visual (superposición)' : TAGS[o.type]}</b> · página ${E.S.pages.indexOf(f.p) + 1}` });
    if (o.type === 'text') fields.push({ key: 'text', type: 'textarea', label: 'Texto', value: o.text, rows: 3 }, { key: 'bg', type: 'checkbox', label: 'Fondo blanco detrás del texto', value: !!o.bg });
    if (o.type === 'field') {
      fields.push({ key: 'name', label: 'Nombre del campo', value: o.name });
      if (o.ftype === 'radio') fields.push({ key: 'group', label: 'Grupo (las opciones del mismo grupo se excluyen)', value: o.group || '' });
      if (o.ftype === 'dropdown') fields.push({ key: 'options', type: 'textarea', label: 'Opciones (una por línea)', value: (o.options || []).join('\n'), rows: 4 });
      if (o.ftype === 'text') fields.push({ key: 'value', label: 'Valor inicial', value: o.value || '' }, { key: 'multiline', type: 'checkbox', label: 'Varias líneas', value: !!o.multiline });
      if (o.ftype === 'checkbox' || o.ftype === 'radio') fields.push({ key: 'value', type: 'checkbox', label: 'Marcado por defecto', value: !!o.value });
      if (o.ftype === 'dropdown') fields.push({ key: 'value', label: 'Valor por defecto', value: o.value || '' });
    }
    if (o.type === 'note') fields.push({ key: 'text', type: 'textarea', label: 'Comentario', value: o.text, rows: 4 }, { key: 'author', label: 'Autor', value: o.author || '' });
    if (o.type === 'link') fields.push({ key: 'url', label: 'URL (vacía si es a página)', value: o.url || '' }, { key: 'page', type: 'number', label: 'Ir a página', value: o.page || '', min: 1, max: E.S.pages.length });
    if (o.type !== 'line' && o.type !== 'ink' && o.type !== 'markup' && o.type !== 'note') fields.push({ key: 'x', type: 'number', label: 'X (pt)', value: +bb.x.toFixed(1), half: true, step: .5 }, { key: 'y', type: 'number', label: 'Y (pt)', value: +bb.y.toFixed(1), half: true, step: .5 }, ...(o.type !== 'text' ? [{ key: 'w', type: 'number', label: 'Ancho', value: +bb.w.toFixed(1), half: true, step: .5 }, { key: 'h', type: 'number', label: 'Alto', value: +bb.h.toFixed(1), half: true, step: .5 }] : []));
    const form = FP.buildForm(fields);
    const apply = h('button', { class: 'btn pri sm', onclick: () => {
      const v = form.values(); E.push('Propiedades');
      for (const k in v) { if (v[k] === undefined || Number.isNaN(v[k])) continue; if (k === 'options') o.options = v.options.split('\n').map(s => s.trim()).filter(Boolean); else if (k === 'bg') o.bg = v.bg ? '#ffffff' : null; else if (k === 'page') o.page = v.page || null; else o[k] = v[k]; }
      E.redrawPage(f.p); E.renderProps(); FP.toast('Aplicado', 'ok');
    } }, 'Aplicar');
    box.append(form.el, h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, apply, h('button', { class: 'btn sm', onclick: () => E.duplicateObj() }, icon('copy', 's'), 'Duplicar'), h('button', { class: 'btn sm', onclick: () => arrange(1) }, 'Al frente'), h('button', { class: 'btn sm', onclick: () => arrange(-1) }, 'Al fondo'), h('button', { class: 'btn sm danger', onclick: () => E.deleteObj() }, icon('trash', 's'), 'Eliminar')));
    if (o.type === 'image' && o.sig) box.appendChild(h('div', { class: 'note warn' }, 'Firma visual: es una imagen de tu firma. No equivale a una firma electrónica cualificada ni a una firma criptográfica (certificado digital), que garantizan identidad e integridad.'));
    el.rbody.appendChild(box);
  };

  /* ---------- formularios existentes ---------- */
  async function loadFormFields() {
    const out = [];
    for (const src of E.S.sources) {
      if (!E.S.pages.some(p => p.src === src.id)) continue;
      try { const d = await PO.libDoc(src); const form = d.getForm(); form.getFields().forEach(f => {
        const L = window.PDFLib; const name = f.getName(); let type = 'other', value = null, options = null;
        if (f instanceof L.PDFTextField) { type = 'text'; value = f.getText() || ''; }
        else if (f instanceof L.PDFCheckBox) { type = 'checkbox'; value = f.isChecked(); }
        else if (f instanceof L.PDFRadioGroup) { type = 'radio'; value = f.getSelected() || ''; options = f.getOptions(); }
        else if (f instanceof L.PDFDropdown) { type = 'dropdown'; value = (f.getSelected() || [])[0] || ''; options = f.getOptions(); }
        else if (f instanceof L.PDFOptionList) { type = 'dropdown'; value = (f.getSelected() || [])[0] || ''; options = f.getOptions(); }
        else if (f instanceof L.PDFSignature) type = 'signature'; else if (f instanceof L.PDFButton) type = 'button';
        out.push({ src: src.id, srcName: src.name, name, type, value, options, ro: f.isReadOnly() });
      }); } catch (e) { console.warn(e); }
    }
    return out;
  }
  async function renderFormPanel() {
    const box = h('div', { style: { padding: '10px' } }); el.rbody.appendChild(box);
    box.appendChild(h('div', { class: 'fp-muted small' }, 'Cargando campos…'));
    const fields = E.formFields || (E.formFields = await loadFormFields()); box.innerHTML = '';
    const first = E.S.pages[0] && E.S.pages[0].src;
    const usable = fields.filter(f => f.type !== 'other' && f.type !== 'button');
    if (!usable.length) box.appendChild(h('div', { class: 'note' }, 'Este documento no tiene campos de formulario rellenables. Puedes crear campos nuevos con las herramientas de formulario de la barra izquierda.'));
    else {
      box.appendChild(h('div', { class: 'note' }, 'Rellena los campos y pulsa «Aplicar al documento» para verlos en la página. Se guardan como campos AcroForm (siguen siendo editables salvo que aplanes al guardar).'));
      usable.forEach(f => {
        const key = f.src + ':' + f.name; const cur = key in E.S.formValues ? E.S.formValues[key] : f.value; let inp;
        const set = (v) => { if (!E._fT) E.push('Rellenar formulario'); clearTimeout(E._fT); E._fT = setTimeout(() => E._fT = null, 900); E.S.formValues[key] = v; };
        if (f.type === 'signature') { box.appendChild(h('div', { class: 'field' }, h('span', null, f.name + ' (campo de firma digital)'), h('div', { class: 'fp-muted small' }, 'Requiere un certificado; usa la herramienta Firma para una firma visual.'))); return; }
        if (f.type === 'text') inp = h('input', { type: 'text', value: cur || '', disabled: f.ro, oninput: (e) => set(e.target.value) });
        else if (f.type === 'checkbox') inp = h('input', { type: 'checkbox', checked: !!cur, disabled: f.ro, onchange: (e) => set(e.target.checked) });
        else inp = h('select', { disabled: f.ro, onchange: (e) => set(e.target.value) }, h('option', { value: '' }, '—'), (f.options || []).map(o => h('option', { value: o, selected: o === cur }, o)));
        box.appendChild(f.type === 'checkbox' ? h('label', { class: 'fp-row', style: { marginBottom: '8px' } }, inp, f.name) : h('div', { class: 'field' }, h('span', null, f.name + (f.src !== first ? ' · ' + f.srcName : '')), inp));
      });
      box.appendChild(h('button', { class: 'btn pri', onclick: applyFormToView }, icon('check', 's'), 'Aplicar al documento'));
    }
    const created = []; E.S.pages.forEach((p, i) => p.objs.forEach(o => { if (o.type === 'field') created.push([i, o]); }));
    if (created.length) { box.appendChild(h('div', { class: 'hd', style: { marginTop: '14px', fontWeight: 600 } }, 'Campos nuevos')); created.forEach(([i, o]) => box.appendChild(h('div', { class: 'li', onclick: () => { E.goto(i); E.setTool('select'); E.select(o.id); E.showRight('props'); } }, `Pág. ${i + 1} · ${o.ftype} · ${o.name}`))); }
  }
  async function applyFormToView() {
    const bySrc = {}; Object.keys(E.S.formValues).forEach(k => { const [sid, ...r] = k.split(':'); (bySrc[sid] = bySrc[sid] || {})[r.join(':')] = E.S.formValues[k]; });
    if (!Object.keys(bySrc).length) return FP.toast('No hay cambios en el formulario', 'warn');
    await FP.busy('Aplicando valores…', async () => {
      try {
        E.push('Aplicar formulario');
        for (const sid in bySrc) {
          const src = E.src(sid); const d = await PO.freshLib(src.bytes); const form = d.getForm();
          for (const name in bySrc[sid]) { const f = form.getFieldMaybe(name); if (!f) continue; const v = bySrc[sid][name]; try { if (f.setText) f.setText(String(v)); else if (f.check) v ? f.check() : f.uncheck(); else if (f.select) { if (v) f.select(v); else if (f.clear) f.clear(); } } catch (e) { console.warn(e); } }
          form.updateFieldAppearances(await d.embedFont(window.PDFLib.StandardFonts.Helvetica));
          const nsrc = await addSource(await d.save(), src.name, src.enc); E.S.pages.forEach(p => { if (p.src === sid) p.src = nsrc.id; });
          Object.keys(E.S.formValues).forEach(k => { if (k.startsWith(sid + ':')) delete E.S.formValues[k]; });
        }
        E.formFields = null; rerender(); E.renderProps(); FP.toast('Formulario aplicado', 'ok');
      } catch (e) { FP.error(e, 'Formulario'); }
    });
  }

  /* ---------- sellos ---------- */
  function renderStamps() {
    const box = h('div', { style: { padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px' } });
    const names = { watermark: 'Marca de agua', pagenum: 'Numeración', header: 'Encabezado', footer: 'Pie de página' };
    (E.S.stamps || []).forEach(s => box.appendChild(h('div', { class: 'fitem' }, h('div', { class: 'nm' }, h('b', null, names[s.type]), ' · ', s.asset ? 'imagen' : (s.text || '')), h('button', { class: 'ibtn', 'data-tip': 'Editar', onclick: () => E.stampDialog(s) }, icon('pen', 's')), h('button', { class: 'ibtn', 'data-tip': 'Eliminar', onclick: () => { E.push('Eliminar sello'); E.S.stamps = E.S.stamps.filter(x => x !== s); E.redrawAll(); E.renderProps(); } }, icon('trash', 's')))));
    if (!(E.S.stamps || []).length) box.appendChild(h('div', { class: 'fp-muted small' }, 'Los sellos se aplican a varias páginas a la vez y se integran al guardar.'));
    box.append(h('button', { class: 'btn', onclick: () => E.stampDialog({ type: 'watermark' }) }, icon('watermark', 's'), 'Marca de agua'), h('button', { class: 'btn', onclick: () => E.stampDialog({ type: 'pagenum' }) }, icon('hash', 's'), 'Numeración'), h('button', { class: 'btn', onclick: () => E.stampDialog({ type: 'header' }) }, icon('header', 's'), 'Encabezado'), h('button', { class: 'btn', onclick: () => E.stampDialog({ type: 'footer' }) }, icon('header', 's'), 'Pie de página'));
    el.rbody.appendChild(box);
  }
  E.stampDialog = async function (s) {
    const isNew = !s.id; const t = s.type;
    const def = { watermark: { text: 'CONFIDENCIAL', size: 60, color: '#d02020', opacity: .25, rotation: 45, pos: 'cc' }, pagenum: { text: 'Página {n} de {total}', size: 10, color: '#333333', opacity: 1, pos: 'bc', start: 1, from: 1 }, header: { text: '{nombre}', size: 9, color: '#555555', opacity: 1, pos: 'tc' }, footer: { text: '{fecha}', size: 9, color: '#555555', opacity: 1, pos: 'br' } }[t];
    const c = Object.assign({ font: 'Helvetica', bold: false, italic: false, margin: 28, pages: 'all' }, def, s);
    const posOpts = [['tl', 'Arriba izquierda'], ['tc', 'Arriba centro'], ['tr', 'Arriba derecha'], ['bl', 'Abajo izquierda'], ['bc', 'Abajo centro'], ['br', 'Abajo derecha']];
    const v = await FP.dialog({ watermark: 'Marca de agua', pagenum: 'Numeración de páginas', header: 'Encabezado', footer: 'Pie de página' }[t], [
      t === 'watermark' ? { key: 'kind', type: 'radio', label: 'Tipo', value: c.asset ? 'img' : 'text', options: [['text', 'Texto'], ['img', 'Imagen / logotipo']] } : null,
      { key: 'text', label: 'Texto · variables: {n} página, {total} total, {fecha}, {nombre}', value: c.text, show: v => v.kind !== 'img' },
      { key: 'font', type: 'select', label: 'Fuente', value: c.font, options: ['Helvetica', 'Times', 'Courier'], half: true, show: v => v.kind !== 'img' }, { key: 'size', type: 'number', label: 'Tamaño', value: c.size, min: 4, max: 300, half: true, show: v => v.kind !== 'img' },
      { key: 'bold', type: 'checkbox', label: 'Negrita', value: c.bold, show: v => v.kind !== 'img' }, { key: 'italic', type: 'checkbox', label: 'Cursiva', value: c.italic, show: v => v.kind !== 'img' },
      { key: 'color', type: 'color', label: 'Color', value: c.color, show: v => v.kind !== 'img' },
      t === 'watermark' ? { key: 'scale', type: 'range', label: 'Tamaño de la imagen (% del ancho)', value: c.scale || 50, min: 5, max: 100, unit: ' %', show: v => v.kind === 'img' } : null,
      { key: 'opacity', type: 'range', label: 'Opacidad', value: Math.round(c.opacity * 100), min: 5, max: 100, unit: ' %' },
      t === 'watermark' ? { key: 'rotation', type: 'range', label: 'Rotación', value: c.rotation, min: -90, max: 90, unit: '°' } : { key: 'pos', type: 'select', label: 'Posición', value: c.pos, options: posOpts },
      t !== 'watermark' ? { key: 'margin', type: 'number', label: 'Margen (pt)', value: c.margin, min: 0, max: 200, half: true } : null,
      t === 'pagenum' ? { key: 'start', type: 'number', label: 'Número inicial', value: c.start, min: 0, half: true } : null,
      t === 'pagenum' ? { key: 'from', type: 'number', label: 'Empezar en la página física', value: c.from, min: 1, max: E.S.pages.length, half: true } : null,
      { key: 'pages', label: 'Páginas («all» = todas; o rango: 1-3, 5, impares, pares)', value: c.pages },
    ].filter(Boolean), { icon: t === 'watermark' ? 'watermark' : 'hash' });
    if (!v) return;
    if (t === 'watermark' && v.kind === 'img' && !c.asset) { const f = await FP.pickFiles('image/*,.svg'); if (!f[0]) return; c.asset = await E.addAsset(f[0]); }
    E.push(isNew ? 'Añadir sello' : 'Editar sello');
    const ns = Object.assign(c, v, { opacity: v.opacity / 100, id: c.id || FP.uid(), type: t }); if (v.kind === 'text') delete ns.asset; delete ns.kind;
    if (isNew) E.S.stamps.push(ns); else { const i = E.S.stamps.findIndex(x => x.id === ns.id); E.S.stamps[i] = ns; }
    E.redrawAll(); E.rightTab = 'stamps'; E.renderProps();
  };

  /* ---------- firma ---------- */
  async function signatureDialog() {
    const saved = (await FP.db.all('signatures')).sort((a, b) => b.date - a.date);
    let tab = saved.length ? 'saved' : 'draw'; let result = null;
    const body = h('div'); const tabs = h('div', { class: 'tabs', style: { marginBottom: '10px' } }); const content = h('div');
    body.append(tabs, content, h('div', { class: 'note warn' }, 'Firma visual: una imagen de tu firma colocada en el documento. No es una firma electrónica cualificada ni criptográfica (certificado digital / PAdES) y no garantiza la integridad del documento.'));
    const remember = h('input', { type: 'checkbox' }); const remL = h('label', { class: 'fp-row small', style: { marginTop: '8px' } }, remember, 'Guardar esta firma en este navegador');
    let getCanvas = null;
    const draw = () => {
      tabs.innerHTML = ''; [['draw', 'Dibujar'], ['type', 'Escribir'], ['image', 'Importar imagen'], ['saved', 'Guardadas (' + saved.length + ')']].forEach(([k, l]) => tabs.appendChild(h('div', { class: 'tb' + (tab === k ? ' on' : ''), onclick: () => { tab = k; draw(); } }, l)));
      content.innerHTML = '';
      if (tab === 'draw') {
        const pad = h('canvas', { class: 'sigpad' }); const color = h('input', { type: 'color', value: '#0b2a6b' }); const wid = h('input', { type: 'range', min: 1, max: 8, value: 3, step: .5 });
        content.append(pad, h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', marginTop: '8px' } }, h('label', { class: 'fp-row small' }, 'Color', color), h('label', { class: 'fp-row small' }, 'Grosor', wid), h('button', { class: 'btn sm', onclick: () => { strokes = []; redraw(); } }, 'Borrar')), remL);
        let strokes = []; let cur = null;
        requestAnimationFrame(() => { pad.width = pad.offsetWidth * 2; pad.height = pad.offsetHeight * 2; redraw(); });
        const redraw = () => { const x = pad.getContext('2d'); x.clearRect(0, 0, pad.width, pad.height); x.lineCap = x.lineJoin = 'round'; strokes.forEach(s => { x.strokeStyle = s.c; x.lineWidth = s.w * 2; x.beginPath(); s.p.forEach((q, i) => { if (i === 0) x.moveTo(q[0], q[1]); else { const pr = s.p[i - 1]; x.quadraticCurveTo(pr[0], pr[1], (pr[0] + q[0]) / 2, (pr[1] + q[1]) / 2); } }); x.stroke(); }); };
        const pos = (e) => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * pad.width / r.width, (e.clientY - r.top) * pad.height / r.height]; };
        pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); cur = { c: color.value, w: +wid.value, p: [pos(e)] }; strokes.push(cur); });
        pad.addEventListener('pointermove', (e) => { if (!cur) return; cur.p.push(pos(e)); redraw(); });
        pad.addEventListener('pointerup', () => cur = null);
        getCanvas = () => strokes.length ? trimCanvas(pad) : null;
      } else if (tab === 'type') {
        const inp = h('input', { type: 'text', value: '', placeholder: 'Tu nombre', style: { width: '100%', fontSize: '16px' } });
        const fonts = ['"Segoe Script","Brush Script MT","Lucida Handwriting",cursive', '"Brush Script MT","Comic Sans MS",cursive', 'Georgia,serif']; let fi = 0;
        const prev = h('canvas', { class: 'sigpad', style: { height: '120px' } }); const color = h('input', { type: 'color', value: '#0b2a6b' });
        const fsel = h('select', { onchange: (e) => { fi = +e.target.value; render(); } }, fonts.map((f, i) => h('option', { value: i }, ['Manuscrita 1', 'Manuscrita 2', 'Serif'][i])));
        const render = () => { prev.width = prev.offsetWidth * 2 || 800; prev.height = 240; const x = prev.getContext('2d'); x.clearRect(0, 0, prev.width, prev.height); x.fillStyle = color.value; x.font = `italic 96px ${fonts[fi]}`; x.textBaseline = 'middle'; x.fillText(inp.value || '', 20, 120); };
        inp.addEventListener('input', render); color.addEventListener('input', render);
        content.append(inp, h('div', { style: { display: 'flex', gap: '10px', margin: '8px 0' } }, fsel, h('label', { class: 'fp-row small' }, 'Color', color)), prev, remL); setTimeout(render, 30);
        getCanvas = () => inp.value.trim() ? trimCanvas(prev) : null;
      } else if (tab === 'image') {
        const st = { c: null }; const prev = h('div', { style: { minHeight: '120px', display: 'grid', placeItems: 'center', background: 'var(--bg2)', borderRadius: '8px', marginTop: '8px' } }, 'Ninguna imagen');
        const rmw = h('input', { type: 'checkbox', checked: true }); const thr = h('input', { type: 'range', min: 150, max: 250, value: 215 });
        const proc = () => { if (!st.src) return; const c = FP.canvas(st.src.width, st.src.height); const x = c.getContext('2d'); x.drawImage(st.src, 0, 0); if (rmw.checked) { const id = x.getImageData(0, 0, c.width, c.height), d = id.data, t = +thr.value; for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; if (l > t) d[i + 3] = 0; else if (l > t - 30) d[i + 3] = Math.round(255 * (t - l) / 30); } x.putImageData(id, 0, 0); } st.c = trimCanvas(c); prev.innerHTML = ''; const im = h('img', { src: st.c.toDataURL(), style: { maxWidth: '100%', maxHeight: '160px' } }); prev.style.background = 'repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/16px 16px'; prev.appendChild(im); };
        content.append(h('button', { class: 'btn', onclick: async () => { const f = await FP.pickFiles('image/*'); if (!f[0]) return; st.src = await FP.loadImageFile(f[0]); proc(); } }, icon('folder', 's'), 'Elegir imagen de la firma'),
          h('label', { class: 'fp-row small', style: { marginTop: '8px' } }, rmw, 'Eliminar fondo claro'), h('label', { class: 'fp-row small' }, 'Umbral', thr), prev, remL);
        rmw.onchange = proc; thr.oninput = proc; getCanvas = () => st.c;
      } else {
        if (!saved.length) content.appendChild(h('div', { class: 'fp-muted' }, 'No hay firmas guardadas.'));
        const g = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: '8px' } });
        saved.forEach(s => g.appendChild(h('div', { class: 'rc', style: { background: '#fff' }, onclick: async () => { const c = await FP.loadImageFile(new File([s.blob], 'firma.png')); result = c; FP.$('.ovl .btn.pri').click(); } }, h('div', { class: 'fp-th', style: { backgroundImage: `url(${s.thumb})`, backgroundColor: '#fff' } }), h('button', { class: 'x', style: { display: 'grid' }, onclick: async (e) => { e.stopPropagation(); await FP.db.del('signatures', s.id); saved.splice(saved.indexOf(s), 1); draw(); } }, icon('x', 's')))));
        content.appendChild(g); getCanvas = () => result;
      }
    };
    draw();
    const ok = await FP.modal({ title: 'Firma', icon: 'sign', size: 'wide', body, buttons: [{ label: 'Cancelar', value: false }, { label: 'Usar firma', primary: true, value: true }] });
    if (!ok) return null; const c = result || (getCanvas && getCanvas()); if (!c) { FP.toast('No hay firma', 'warn'); return null; }
    if (remember.checked && tab !== 'saved') { const b = await FP.toBlob(c, 'image/png'); FP.db.put('signatures', { id: FP.uid(), date: Date.now(), blob: b, thumb: c.toDataURL('image/png') }); }
    return E.addAsset(c);
  }
  function trimCanvas(c) {
    const x = c.getContext('2d', { willReadFrequently: true }); const d = x.getImageData(0, 0, c.width, c.height).data; let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let xx = 0; xx < c.width; xx++) if (d[(y * c.width + xx) * 4 + 3] > 8) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null; const pad = 6; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(c.width - 1, x1 + pad); y1 = Math.min(c.height - 1, y1 + pad);
    const o = FP.canvas(x1 - x0 + 1, y1 - y0 + 1); o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height); return o;
  }

  /* ======================= Proyecto ======================= */
  async function projectBlob() {
    const JSZip = await FP.lib.jszip(); const z = new JSZip();
    const used = new Set(E.S.pages.map(p => p.src));
    const assets = {}; Object.values(E.S.assets).forEach(a => { assets[a.id] = { id: a.id, type: a.type, w: a.w, h: a.h }; z.file('assets/' + a.id + '.' + a.type, a.bytes); });
    const srcs = E.S.sources.filter(s => used.has(s.id)); srcs.forEach(s => z.file('sources/' + s.id + '.pdf', s.bytes));
    z.file('project.json', JSON.stringify({ app: 'YO AMO EL PEDEFE', kind: 'pdf', version: 1, name: E.S.name, pages: E.S.pages, stamps: E.S.stamps, meta: E.S.meta, formValues: E.S.formValues, sources: srcs.map(s => ({ id: s.id, name: s.name })), assets }));
    return z.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } });
  }
  E.saveProject = async function () {
    try { const b = await FP.busy('Guardando proyecto…', () => projectBlob()); FP.download(b, FP.baseName(E.S.name) + '.pedefe'); FP.dirty.pdf = false; FP.db.del('autosave', 'pdf'); FP.toast('El proyecto conserva el PDF original y todas tus modificaciones editables. (Las contraseñas no se guardan en el proyecto.)', 'ok', 6000); }
    catch (e) { FP.error(e, 'Proyecto'); }
  };
  E.openProject = async function (file) {
    if (!await E.confirmDiscard()) return;
    const p = FP.progress('Abriendo proyecto');
    try {
      const JSZip = await FP.lib.jszip(); await FP.lib.pdflib(); await FP.lib.pdfjs(); const z = await JSZip.loadAsync(file);
      const pj = JSON.parse(await z.file('project.json').async('string')); if (!['YO AMO EL PEDEFE', 'FOTOPEA'].includes(pj.app) || pj.kind !== 'pdf') throw new Error('No es un proyecto del editor PDF (.pedefe)');
      E.resetState(pj.name);
      for (const s of pj.sources) { const bytes = await z.file('sources/' + s.id + '.pdf').async('uint8array'); const pdfjs = await PO.openPdfjs(bytes); E.S.sources.push({ id: s.id, name: s.name, bytes, pdfjs, n: pdfjs.numPages }); }
      for (const id in pj.assets) { const a = pj.assets[id]; const bytes = await z.file('assets/' + id + '.' + a.type).async('uint8array'); E.S.assets[id] = Object.assign(a, { bytes, url: URL.createObjectURL(new Blob([bytes], { type: a.type === 'jpg' ? 'image/jpeg' : 'image/png' })) }); }
      Object.assign(E.S, { pages: pj.pages, stamps: pj.stamps || [], meta: pj.meta, formValues: pj.formValues || {} });
      p.close(); E.afterLoad(); FP.toast('Proyecto restaurado', 'ok');
    } catch (e) { p.close(); FP.error(e, 'No se pudo abrir el proyecto'); }
  };
  let autoT = null;
  function scheduleAutosave() {
    if (!FP.settings.autosave) return; clearTimeout(autoT);
    autoT = setTimeout(async () => { if (!E.S || !FP.dirty.pdf) return; const tot = E.S.sources.reduce((a, s) => a + s.bytes.length, 0); if (tot > 120 * 1048576) return; try { const b = await projectBlob(); await FP.db.put('autosave', { id: 'pdf', kind: 'pdf', name: E.S.name, date: Date.now(), blob: b }); } catch (e) { console.warn('autoguardado', e); } }, 15000);
  }
  E.restoreAutosave = async (a) => { await E.openProject(new File([a.blob], a.name + '.pedefe')); FP.dirty.pdf = true; };
  E.close = async function () { if (!await E.confirmDiscard()) return; E.cleanup(); E.S = null; FP.dirty.pdf = false; FP.db.del('autosave', 'pdf'); el.pages = null; renderEmpty(); };
  E.pageToImage = async function () {
    const v = await FP.dialog('Exportar página ' + (E.S.cur + 1) + ' como PNG', [{ key: 'dpi', type: 'select', label: 'Resolución', value: '150', options: [['96', '96 ppp'], ['150', '150 ppp'], ['300', '300 ppp']] }], { icon: 'image', ok: 'Exportar' });
    if (!v) return; const pr = FP.progress('Renderizando página');
    try { const b = await PO.exportBytes(E, { pageIds: [E.curPage().id], noSecurity: true }); const items = await PO.renderBytesToImages(b, { format: 'png', dpi: +v.dpi, base: FP.baseName(E.S.name) + '_p' + (E.S.cur + 1) }, pr); pr.close(); FP.download(items[0].blob, FP.baseName(E.S.name) + '_pagina' + (E.S.cur + 1) + '.png'); }
    catch (e) { pr.close(); FP.error(e); }
  };
  E.fullscreen = () => { if (document.fullscreenElement) document.exitFullscreen(); else (el.root.requestFullscreen ? el.root.requestFullscreen() : null); };

  function historyDialog() {
    const list = h('div', { class: 'list-b hist' });
    E.hist.forEach((x, i) => list.appendChild(h('div', { class: 'li', onclick: () => { const n = E.hist.length - i; for (let k = 0; k < n; k++) E.undo(); FP.closeMenus(); FP.$('.ovl') && FP.$('.ovl').remove(); } }, (i + 1) + '. ' + x.label)));
    list.appendChild(h('div', { class: 'li cur' }, 'Estado actual')); E.redo.slice().reverse().forEach(x => list.appendChild(h('div', { class: 'li fut' }, x.label)));
    FP.modal({ title: 'Historial', icon: 'history', body: h('div', null, h('div', { class: 'fp-muted small' }, 'Haz clic en un paso para volver al estado anterior a él.'), list) });
  }
  function shortcutsHelp() {
    const rows = [['Ctrl+O', 'Abrir'], ['Ctrl+S', 'Guardar PDF'], ['Ctrl+Mayús+S', 'Guardar proyecto'], ['Ctrl+Z / Ctrl+Y', 'Deshacer / Rehacer'], ['Ctrl+C / Ctrl+V / Ctrl+D', 'Copiar / pegar / duplicar objeto'], ['Supr', 'Eliminar objeto'], ['Flechas (Mayús)', 'Mover objeto 1 pt (10 pt)'], ['Ctrl+F', 'Buscar'], ['Ctrl + / Ctrl −', 'Zoom'], ['Ctrl+0 / Ctrl+2', 'Ajustar página / ancho'], ['Ctrl+R', 'Rotar página'], ['Av Pág / Re Pág', 'Página siguiente / anterior'], ['V H T E I G R O L A P W U N K S', 'Herramientas'], ['Mayús al dibujar', 'Proporciones fijas']];
    FP.modal({ title: 'Atajos de teclado', icon: 'info', body: h('table', { style: { width: '100%' } }, rows.map(r => h('tr', null, h('td', { class: 'kbd', style: { padding: '3px 12px 3px 0', color: 'var(--tx)' } }, r[0]), h('td', null, r[1])))) });
  }
  function limitsHelp() {
    FP.alert(`<p><b>Privacidad:</b> todo se procesa en tu navegador; los documentos no se suben a ningún servidor. Solo el OCR descarga sus modelos de idioma de un CDN público.</p>
      <p><b>Edición de texto existente:</b> los PDF no guardan párrafos editables sino glifos posicionados con fuentes incrustadas (a menudo parciales). el editor ofrece una <i>sustitución visual</i>: tapa el texto original y escribe encima. Se indica siempre como superposición.</p>
      <p><b>Imágenes existentes:</b> se pueden sustituir o eliminar realmente cuando son XObjects directos de la página; si están anidadas, solo es posible cubrirlas.</p>
      <p><b>Fuentes:</b> el texto nuevo usa las 14 fuentes estándar PDF (Helvetica, Times, Courier con variantes). Caracteres fuera de Latin‑1 extendido (p. ej. emojis) se sustituyen por «?».</p>
      <p><b>Firma:</b> la firma es visual (imagen). Una firma electrónica cualificada requiere un certificado y software específico (p. ej. AutoFirma).</p>
      <p><b>Seguridad:</b> cifrado AES‑256 real (PDF 2.0). Se pueden abrir PDF cifrados con RC4/AES conociendo la contraseña.</p>
      <p><b>Tamaño:</b> el límite lo marca la memoria del navegador; documentos de cientos de MB pueden ser lentos.</p>`, 'Limitaciones y privacidad');
  }

  /* ======================= Teclado ======================= */
  function onKey(e) {
    if (FP.current !== 'pdf' || FP.$('.ovl')) return;
    if (FP.inField(e)) return;
    const m = FP.mod(e); const k = e.key.toLowerCase();
    if (m && k === 'o') { e.preventDefault(); return E.openDialog(); }
    if (!E.S || !E.S.pages.length) return;
    if (m && k === 's') { e.preventDefault(); return e.shiftKey ? E.saveProject() : E.saveDialog(); }
    if (m && k === 'z') { e.preventDefault(); return e.shiftKey ? E.redoFn() : E.undo(); }
    if (m && k === 'y') { e.preventDefault(); return E.redoFn(); }
    if (m && k === 'f') { e.preventDefault(); return E.showLeft('find'); }
    if (m && k === 'c') { if (E.selId) { e.preventDefault(); E.copyObj(); } return; }
    if (m && k === 'v') { if (E.clip) { e.preventDefault(); E.pasteObj(); } return; }
    if (m && k === 'd') { e.preventDefault(); return E.duplicateObj(); }
    if (m && k === 'r') { e.preventDefault(); return E.rotatePages(e.shiftKey ? -90 : 90); }
    if (m && e.shiftKey && k === 'a') { e.preventDefault(); E.selPages = new Set(E.S.pages.map(p => p.id)); return E.renderSide(); }
    if (m && (k === '+' || k === '=')) { e.preventDefault(); return E.setZoom(E.S.zoom * 1.25); }
    if (m && k === '-') { e.preventDefault(); return E.setZoom(E.S.zoom / 1.25); }
    if (m && k === '0') { e.preventDefault(); return E.fit('page'); }
    if (m && k === '1') { e.preventDefault(); return E.setZoom(1); }
    if (m && k === '2') { e.preventDefault(); return E.fit('width'); }
    if (e.key === 'Delete' || e.key === 'Backspace') { if (E.selId) { e.preventDefault(); E.deleteObj(); } else if (E.selPages.size && (E.mode === 'organize' || document.activeElement === el.left || el.left.contains(document.activeElement))) E.deletePages(); return; }
    if (e.key === 'Escape') { E.pending = null; E.select(null); return E.setTool('select'); }
    if (e.key.startsWith('Arrow') && E.selId) { e.preventDefault(); const d = e.shiftKey ? 10 : 1; return nudge(e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0); }
    if (e.key === 'PageDown') { e.preventDefault(); return E.goto(E.S.cur + 1); }
    if (e.key === 'PageUp') { e.preventDefault(); return E.goto(E.S.cur - 1); }
    if (e.key === 'F11') { e.preventDefault(); return E.fullscreen(); }
    if (!m && !e.altKey) { const t = TOOLS.find(t => t !== '-' && t[3] && t[3].toLowerCase() === k); if (t) { e.preventDefault(); E.setTool(t[0]); } }
  }
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', () => { if (FP.current === 'pdf' && E.S) renderPageNav(); });

  /* ======================= Registro de vista ======================= */
  let built = false;
  FP.views.pdf = {
    show(root) { if (!built) { build(root); built = true; } if (E.S && E.S.pages.length) { E.layout(); } else renderEmpty(); },
    hide() { },
    openFiles: (f) => E.openFiles(f), openProject: (f) => E.openProject(f), insertConverted: (f, n) => E.insertConverted(f, n), newBlank: () => E.newBlank(), restoreAutosave: (a) => E.restoreAutosave(a),
    onDropFiles: async (files, e) => { const fs = Array.from(files); const types = await Promise.all(fs.map(f => FP.sniff(f))); if (types.every(t => t === 'pdf')) return E.openFiles(fs); if (E.S && E.S.pages.length && types.every(t => FP.IMG_TYPES.includes(t) || t === 'txt')) return E.insertConverted(fs, false); return FP.openFiles(fs, 'pdf'); },
    async runTool(id) {
      if (!E.S || !E.S.pages.length) return;
      const map = { merge: () => FP.toast('PDF combinados. Reordena las páginas y pulsa «Guardar PDF».', 'ok', 5000), split: E.splitDialog, organize: () => E.setMode('organize'), toimg: E.toImagesDialog, compress: E.compressDialog, protect: E.securityDialog, unlock: () => FP.alert('El documento se ha abierto y descifrado. Pulsa «Guardar PDF» para descargarlo <b>sin contraseña</b>.', 'Quitar contraseña'), ocr: E.ocrDialog, sign: () => E.setTool('sign'), watermark: () => E.stampDialog({ type: 'watermark' }), pagenum: () => E.stampDialog({ type: 'pagenum' }), meta: E.metaDialog, extracttext: E.extractTextDialog, repair: () => FP.toast('El PDF se ha abierto correctamente. Si estaba dañado, usa Documento › Reparar con el archivo original.', 'ok') };
      if (map[id]) await map[id]();
    },
  };
  FP.PDFE = E;
})();
