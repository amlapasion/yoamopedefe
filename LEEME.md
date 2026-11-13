# YO AMO EL PEDEFE 1.8.0

Herramientas PDF gratis en el navegador, con un **Editor PDF avanzado integrado** (procedente de FOTOPEA). Todo se procesa en tu equipo.

## Cómo usarlo
- **En tu ordenador:** abre `index.html` desde esta carpeta (no copies el HTML suelto: necesita `editor/` y `vendor/`).
- **En Internet:** sube la carpeta completa a un alojamiento estático (Netlify Drop, GitHub Pages…).
- **Funciona sin conexión:** el Editor PDF y todo lo que usa pdf-lib o JSZip.
- **Necesitan Internet:**
  - Las herramientas clásicas que usan PDF.js 3 desde CDN (igual que antes).
  - El OCR, la primera vez que se usa cada idioma.

## Estructura
```
index.html            Web principal (herramientas clásicas + acceso al editor)
editor/core.js        Núcleo del editor (espacio de nombres FP, aislado del resto de la web)
editor/pdf-editor.js  Interfaz del Editor PDF avanzado
editor/pdf-ops.js     Exportación, conversión, páginas, compresión, OCR, imágenes
editor/pdfcrypt.js    Cifrado AES-256 / descifrado RC4-AES
editor/tiff.js        Lectura de TIFF para convertir imágenes a PDF
editor/editor.css     Estilos del editor (todos bajo .fp, con la identidad visual de la web)
vendor/pdf-lib.min.js, vendor/jszip.min.js   Usados por toda la web (misma versión que antes, ahora locales)
vendor/pdfjs/         PDF.js 6.2 del editor, con globales renombrados (FPpdfjsLib) para no chocar con el PDF.js 3 de la web
```
- **Carga del editor:** solo se carga al abrir «Editor PDF avanzado», en la categoría «Editar y organizar PDF», o al entrar en `#editor`.
- **Navegación:** el botón «Herramientas», «Volver» y el botón atrás del móvil vuelven al inicio.
- **Al volver al editor:** el documento abierto sigue ahí.

## Editor PDF avanzado: herramientas
- **Visor:** miniaturas, zoom, ajustar a página o ancho, búsqueda (también en texto OCR) y pantalla completa.
- **Texto y objetos:**
  - Texto añadido con fuente, tamaño, color, negrita, cursiva, subrayado y alineación.
  - Sustitución visual del texto existente.
- **Imágenes:** añadir, recortar, girar o sustituir. Las imágenes originales del PDF se pueden extraer, sustituir o eliminar realmente.
- **Formas y anotaciones:**
  - Rectángulos, elipses, líneas, flechas y mano alzada.
  - Corrector blanco, resaltado, subrayado y tachado.
  - Notas adhesivas reales y enlaces.
- **Sellos:** marca de agua, numeración, encabezado y pie.
- **Firma visual:** dibujada, escrita o importada.
- **Formularios:** rellenar campos existentes y crear campos AcroForm nuevos (texto, casilla, opción y lista).
- **Páginas:**
  - Añadir en blanco, eliminar, duplicar, reordenar arrastrando, extraer, dividir y combinar.
  - Insertar desde otro PDF, rotar, cambiar el tamaño, recortar márgenes y detectar páginas en blanco.
- **Conversión:**
  - PDF a JPG, PNG o WEBP (también en ZIP).
  - Imágenes y TXT a PDF.
  - Exportar la página actual como PNG.
- **Optimización:** compresión con tres métodos, metadatos (ver, editar o eliminar), aplanado y reparación.
- **Seguridad:** contraseña y permisos con AES-256, y apertura de PDF cifrados.
- **Extracción y OCR:** extracción de texto e imágenes, y OCR multidioma con capa de texto invisible.
- **Proyectos y almacenamiento:**
  - Proyectos editables `.pedefe`. También abre los `.fpdf` que creaba FOTOPEA.
  - Historial de deshacer y rehacer, autoguardado y recientes guardados solo en este navegador.

## Diferencias con la versión de FOTOPEA
- **Navegación:** la marca de FOTOPEA se sustituye por el botón «Herramientas».
- **«Abrir en el editor de imágenes»:** pasa a ser «Exportar página actual como imagen PNG», para no depender de FOTOPEA.
- **Datos locales:** se guardan en la base `pedefe-editor` de este navegador, separada de FOTOPEA.
