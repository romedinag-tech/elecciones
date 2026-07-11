# -*- coding: utf-8 -*-
"""
build_geo.py — regenera data/recintos.geojson y data/areas.geojson desde los datos del proyecto SERVEL.
Requiere DuckDB con extensión spatial. Ajusta SERVEL si cambia la ruta.
Ejecutar desde la raíz del repo:  python -X utf8 scripts/build_geo.py
"""
import duckdb, os
REPO=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVEL=r"C:\Users\Rodrigo\Análisis RMG\SERVEL"
DATA=os.path.join(REPO,"data"); os.makedirs(DATA, exist_ok=True)
con=duckdb.connect(); con.execute("INSTALL spatial; LOAD spatial;")
def P(p): return p.replace("\\","/")

# tamaño/atributos por recinto (agregado de dim_local por codigo_rec, evita duplicar por variantes)
con.execute(f"""CREATE TABLE dl AS
  SELECT codigo_rec, max(inscritos_max) inscritos, max(n_mesas_max) n_mesas_serv,
         any_value(dependencia) dependencia, max(matricula) matricula
  FROM read_parquet('{P(SERVEL)}/depurado/dim/dim_local.parquet') WHERE codigo_rec IS NOT NULL GROUP BY 1""")

# recintos (puntos)
con.execute(f"""CREATE TABLE rec AS
  SELECT r.codigo_rec, r.recinto, r.comuna, r.region, r.glosa_tipo,
         TRY_CAST(r.n_mesas AS INT) n_mesas, dl.inscritos, dl.dependencia,
         ST_Point(r.longitud, r.latitud) geom
  FROM read_parquet('{P(SERVEL)}/anclas/recintos_2025.parquet') r LEFT JOIN dl USING(codigo_rec)""")
out=P(os.path.join(DATA,"recintos.geojson"))
if os.path.exists(out): os.remove(out)
con.execute(f"COPY (SELECT * FROM rec) TO '{out}' WITH (FORMAT GDAL, DRIVER 'GeoJSON')")
print("recintos.geojson", con.execute("SELECT count(*) FROM rec").fetchone()[0])

# áreas de influencia (polígonos simplificados)
con.execute(f"""CREATE TABLE ar AS
  SELECT a.codigo_rec, a.recinto, dl.inscritos, dl.dependencia, ST_Simplify(a.geom,0.001) geom
  FROM ST_Read('{P(SERVEL)}/geo/Areas_Adyacentes_presidenciales2025.shp') a LEFT JOIN dl USING(codigo_rec)
  WHERE a.geom IS NOT NULL""")
out=P(os.path.join(DATA,"areas.geojson"))
if os.path.exists(out): os.remove(out)
con.execute(f"COPY (SELECT * FROM ar) TO '{out}' WITH (FORMAT GDAL, DRIVER 'GeoJSON', LAYER_CREATION_OPTIONS 'COORDINATE_PRECISION=5')")
print("areas.geojson", con.execute("SELECT count(*) FROM ar").fetchone()[0])
