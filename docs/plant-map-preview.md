# Preview mapa 3D de planta

Estado: preview activa en rama `preview-plant-map`.

Version de referencia: `v4.0.7`.

Esta funcionalidad todavia no debe documentarse en manuales de usuario/tecnico ni considerarse operativa final. La app puede estar en operacion real para calibraciones y trazabilidad, pero el mapa 3D sigue en etapa de pulido hasta aprobacion explicita.

## Objetivo

Construir `/mapa` como vista 3D de planta para ubicar puntos operativos, balanzas, silos, despachos, cintas y caminos con una representacion fiel al plano real.

La prioridad definida para la primera version pulida es la zona de despachos:

- silos
- despachos
- cintas
- caminos/circulacion de camiones

El PDF de vista superior entregado por Ezequiel es la referencia principal para posicionar el layout real.

## Alcance actual

- Ruta `/mapa` protegida dentro de la app autenticada.
- Acceso desde Dashboard.
- Escena 3D con Three.js y `OrbitControls`.
- Puntos operativos con estado de calibracion/vencimiento.
- Edicion admin con `Editar mapa`, `Guardar edicion` y `Cancelar`.
- Cambios de mapa quedan en borrador hasta guardar.
- Objetos 3D editables en `plant_map_objects`.
- Puntos operativos en `plant_map_points`.
- Vinculo opcional `plant_map_points.object_id` para que un punto siga la posicion proyectada de un objeto 3D.
- Panel de edicion al costado derecho solo en modo edicion.
- Vista normal ampliada: mapa a ancho completo y detalle debajo.
- Soporte para modelos `.glb`/`.gltf` por objeto mediante `model_path`.
- Carpeta de modelos: `public/models/plant/`.
- Modelo inicial versionado: `public/models/plant/silo.glb`.

## Modelos GLB

Formato recomendado: `.glb`.

Ruta fisica dentro del repo:

```text
public/models/plant/silo.glb
```

Ruta a pegar en el editor del mapa:

```text
/models/plant/silo.glb
```

Si el archivo no existe o falla la carga, la escena muestra un bloque fallback para no romper el mapa. Esto permite guardar el layout aunque falten modelos definitivos.

El modelo se escala dentro del volumen configurado por el objeto:

- `Largo`
- `Ancho`
- `Alto`
- `Tamaño`

## Editor actual

El editor se reorganizo en secciones plegables:

- `Vinculos`
- `Objetos`
- `Objeto y modelo`
- `Transformar`
- `Dimensiones`

Los presets industriales quedan ocultos dentro de `Objetos`. No son la solucion visual final; se mantienen solo como herramienta auxiliar mientras se reemplazan por modelos reales de Fusion 360/Blender.

## Base de datos

El archivo fuente de esquema es:

```text
supabase/schema.sql
```

Columnas relevantes:

- `plant_map_points.object_id`
- `plant_map_objects.model_path`
- `plant_map_objects.width`
- `plant_map_objects.depth`
- `plant_map_objects.height`
- `plant_map_objects.slope`
- `plant_map_objects.color`
- `plant_map_objects.elevation`

Para que el preview persista online, correr `supabase/schema.sql` en el servidor online cada vez que se agreguen columnas nuevas.

### Proteccion de object_id

Se agrego una proteccion para que `plant_map_points.object_id` nunca quede en `null`. Esto evita errores al guardar desde pestanas viejas o versiones cacheadas:

```sql
new.object_id := coalesce(new.object_id, '');
```

Esta proteccion debe quedar en `supabase/schema.sql` para que una base reconstruida tenga el mismo comportamiento que la base usada durante la preview.

## Decisiones tomadas

- No reintroducir Google Sheets.
- No mostrar `Supabase` en UI final; usar `servidor online` para usuario final.
- No mover estos cambios a `main` hasta aprobacion explicita.
- No actualizar manuales publicos ni PDFs mientras `/mapa` siga en preview.
- Usar modelos `.glb` exportados/conversionados desde Fusion 360 o Blender para objetos reales.
- Priorizar fidelidad visual de zona de despachos antes que agregar funciones nuevas.

## Pendiente antes de aprobar

- Rehacer layout de zona de despachos fiel al plano.
- Incorporar modelos reales para silos, despachos, cintas y caminos.
- Agregar camaras rapidas: despacho, basculas, superior, reset.
- Mejorar resaltado del objeto vinculado al punto seleccionado.
- Permitir ocultar/mostrar etiquetas.
- Evaluar capas bloqueables para caminos, silos, cintas y puntos.
- Agregar snapshot o respaldo antes de guardar ediciones grandes del mapa.
- Definir cuando se considera suficientemente pulido para documentarlo en manuales.

## Verificacion recomendada

- Entrar como admin.
- Abrir `/mapa`.
- Confirmar version `v4.0.7` o superior.
- Confirmar que fuera de edicion el mapa ocupa el ancho completo.
- Entrar a `Editar mapa`.
- Seleccionar un silo.
- En `Objeto y modelo`, cargar `/models/plant/silo.glb`.
- Guardar edicion.
- Recargar en otra pestana y confirmar persistencia.
- Confirmar que puntos sin objeto vinculado guardan sin error.
