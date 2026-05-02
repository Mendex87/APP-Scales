# Plan De Evidencia Fotografica Con Camara Movil

Este documento unifica la etapa 1 y etapa 2 de la mejora de imagenes para convertir las fotos en evidencia operativa real dentro de cada calibracion.

## Objetivo

Agregar evidencia fotografica por evento de calibracion, permitiendo tomar fotos directamente con la camara del movil o seleccionar imagenes desde galeria.

La mejora busca que cada calibracion pueda conservar evidencia visual de:

- Parametros del controlador.
- Cadena instalada.
- Material real o ticket externo.
- Condiciones mecanicas observadas.
- Cualquier observacion relevante del trabajo en campo.

## Alcance Funcional

### Nueva Calibracion

Agregar una seccion `Evidencia fotografica` dentro del flujo de `Nueva calibracion`.

Campos sugeridos:

- `Foto parametros controlador`.
- `Foto cadena instalada`.
- `Foto material real`.
- `Foto ticket externo`.
- `Foto observacion general`.

Cada campo deberia permitir:

- Tomar foto con camara del movil.
- Seleccionar imagen desde galeria.
- Ver preview antes de guardar.
- Cambiar foto.
- Quitar foto.
- Comprimir imagen antes de subirla.

### Camara Movil

Usar input web compatible con moviles:

```tsx
<input
  type="file"
  accept="image/*"
  capture="environment"
/>
```

Notas:

- `capture="environment"` sugiere usar la camara trasera.
- En algunos navegadores puede mostrar opciones de camara y galeria.
- Vercel ya sirve por `https`, necesario para mejor compatibilidad en moviles.
- Debe mantenerse la opcion de elegir desde galeria por si la foto ya fue tomada.

## Categorias De Evidencia

Categorias iniciales recomendadas:

- `parametros`: pantalla o placa del controlador con parametros relevantes.
- `cadena`: cadena instalada sobre la cinta o zona de prueba.
- `material_real`: material usado en validacion real.
- `ticket`: ticket de balanza externa o comprobante de peso.
- `observacion`: evidencia general de condicion mecanica, limpieza, sensor, acumulacion o hallazgos.

## Modelo De Datos

Crear tabla nueva para asociar fotos a eventos:

```sql
create table if not exists public.event_photos (
  id text primary key,
  event_id text not null references public.calibration_events(id) on delete cascade,
  photo_path text not null,
  category text not null default 'observacion',
  label text not null default '',
  created_at timestamptz not null default now()
);
```

Indice recomendado:

```sql
create index if not exists event_photos_event_id_idx
  on public.event_photos (event_id);
```

## Storage

Crear bucket nuevo:

```text
event-photos
```

Ruta sugerida para archivos:

```text
events/{eventId}/{category}-{timestamp}.jpg
```

Ejemplos:

```text
events/CAL-2026-0001/parametros-1714590000000.jpg
events/CAL-2026-0001/cadena-1714590000000.jpg
events/CAL-2026-0001/ticket-1714590000000.jpg
```

## Policies RLS

Lectura:

- Usuarios autenticados pueden leer evidencias.

Escritura:

- `admin` y `tecnico` pueden insertar evidencias.
- `admin` y `tecnico` pueden actualizar evidencias si se permite correccion.
- Solo `admin` deberia poder eliminar evidencias.

Storage:

- Bucket `event-photos` con lectura para usuarios autenticados.
- Escritura para `admin` y `tecnico`.
- Eliminacion solo para `admin`, si se implementa baja de evidencia.

## Flujo De Guardado

1. El tecnico carga la calibracion.
2. En cada paso relevante puede tomar foto o elegir imagen.
3. La app muestra preview local.
4. Al guardar evento, primero se crea el `calibration_event`.
5. Luego se comprimen y suben las imagenes a Supabase Storage.
6. Por cada imagen subida se inserta un registro en `event_photos`.
7. Si alguna foto falla, mostrar advertencia clara sin perder el evento.

Decision recomendada:

- El evento debe poder guardarse aunque una foto falle.
- La app debe mostrar: `Evento guardado, pero no se pudieron subir X evidencias`.

## Historial

En el detalle de cada evento agregar bloque `Evidencias`.

Debe mostrar:

- Miniaturas agrupadas por categoria.
- Nombre legible de categoria.
- Click para abrir modal ampliado.
- Si no hay fotos: `Sin evidencia fotografica cargada`.

## Reportes Futuros

Cuando se implemente reporte imprimible/PDF, incluir:

- Foto principal de la balanza.
- Fotos de evidencia del evento.
- Categoria y etiqueta de cada foto.
- Fecha del evento y tecnico responsable.

## Componentes A Crear

### `PhotoEvidenceField`

Responsable de:

- Mostrar titulo/categoria.
- Abrir camara/galeria.
- Mostrar preview.
- Cambiar/quitar imagen.
- Entregar archivo seleccionado al formulario.

### `EventEvidenceGallery`

Responsable de:

- Mostrar evidencias en historial.
- Agrupar por categoria.
- Abrir modal de imagen.

## Tipos Frontend

Tipo sugerido:

```ts
type EventPhoto = {
  id: string
  eventId: string
  photoPath: string
  category: 'parametros' | 'cadena' | 'material_real' | 'ticket' | 'observacion'
  label: string
  createdAt: string
}
```

Estado local sugerido durante carga:

```ts
type PendingEventPhoto = {
  category: EventPhoto['category']
  label: string
  file: File
  previewUrl: string
}
```

## UX Recomendada

- No bloquear la calibracion si faltan fotos en la primera version.
- Mostrar la seccion como recomendada, no obligatoria.
- Usar mensajes claros: `Tomar foto`, `Cambiar`, `Quitar`.
- En mobile, botones grandes y faciles de tocar.
- Mostrar aviso: `Las imagenes se comprimen antes de subirlas`.

## Implementacion Recomendada

Version sugerida: `v1.1.0`, porque implica cambios de base de datos, storage, UI y persistencia.

Orden de trabajo:

1. Crear tabla `event_photos` y policies RLS.
2. Crear bucket `event-photos` y policies de storage.
3. Agregar tipos `EventPhoto` y `PendingEventPhoto`.
4. Agregar funciones de repository para cargar/guardar evidencias.
5. Crear componente `PhotoEvidenceField`.
6. Integrar evidencias en `Nueva calibracion`.
7. Subir fotos al guardar evento.
8. Crear componente `EventEvidenceGallery`.
9. Mostrar evidencias en `Historial`.
10. Actualizar `CHANGELOG.md`, version y documentacion de Supabase.
11. Ejecutar build y pruebas manuales en desktop/mobile.

## Riesgos Y Decisiones Pendientes

- Definir si alguna evidencia sera obligatoria en el futuro.
- Definir limite de cantidad de fotos por evento.
- Definir calidad/tamano maximo de compresion.
- Definir si se permitira eliminar evidencia despues de guardar el evento.
- Definir si `supervisor` puede ver todas las evidencias, recomendado: si.
- Definir si `viewer` puede ver evidencias, recomendado: si, como consulta basica.
