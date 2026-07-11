# elecciones — visor geográfico electoral (Chile)

Visor estático (Leaflet + GitHub Pages) de la infraestructura electoral de Chile. Primera capa:
**recintos de votación** (puntos) y sus **áreas de influencia** oficiales (Presidencial 2025, SERVEL / IDE Chile).

## Contenido
- `index.html` · `app.js` · `theme.css` — visor (vanilla JS, sin build).
- `data/recintos.geojson` — 3.164 recintos: nombre, comuna, región, `glosa_tipo` (local / penitenciario),
  nº de mesas, inscritos (padrón del local), dependencia (MINEDUC, proxy NSE).
- `data/areas.geojson` — 3.145 polígonos de área de influencia (simplificados para web), coloreados por inscritos.
- `scripts/build_geo.py` — regenera los GeoJSON desde los parquet depurados del proyecto SERVEL (reproducible).

## Ver
Publicar por GitHub Pages (rama `main`, raíz) y abrir la URL de Pages.

## Notas
- Coordenadas en WGS84. Áreas simplificadas (tol. ~0.001°) + precisión 5 decimales para peso web (~9 MB).
  Si se agregan más capas/indicadores, migrar los polígonos a **vector tiles (PMTiles)**.
- Fuente: capa oficial de recintos y áreas de influencia (SERVEL / Ministerio de Bienes Nacionales — IDE Chile),
  enriquecida con el padrón por local (SERVEL) y el directorio MINEDUC.
- Próximas capas: distritos electorales (28), % por bloque/candidato, participación, NSE por manzana.
