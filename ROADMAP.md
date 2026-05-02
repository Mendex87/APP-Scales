# Roadmap

Este plan parte del estado `v1.0.0` y prioriza mejoras que aumentan confiabilidad operativa, velocidad de uso en campo y calidad visual sin complicar la app innecesariamente.

## Prioridad 1 - Robustez operativa

### Estados de balanza mas claros

- Separar estado metrologico de estado administrativo: `Activa`, `Fuera de servicio`, `Pendiente de calibracion`, `Calibrada`, `Fuera de tolerancia`.
- Mostrar vencimiento de calibracion por frecuencia configurable.
- Agregar semaforo por equipo en listado y selector.

### Cierre de evento mas seguro

- Agregar pantalla final de revision antes de guardar, con resumen de datos criticos y advertencias.
- Bloquear guardado si hay valores numericos absurdos o signos incompatibles.
- Registrar version de app en cada evento para trazabilidad.
- Registrar `created_by`, `updated_by` y timestamps reales de creacion/edicion.

### Edicion controlada

- Permitir correcciones de evento solo a `admin`, dejando auditoria de cambios.
- Agregar motivo obligatorio al editar datos historicos.
- Evitar sobrescritura accidental con avisos si otro usuario modifico datos recientemente.

### Operacion offline mejor definida

- Marcar claramente si un evento se guardo local o remoto.
- Agregar cola de sincronizacion para enviar a Supabase cuando vuelve la conexion.
- Mostrar conflictos y permitir resolverlos antes de pisar datos.

## Prioridad 2 - Trazabilidad y reportes

### Reporte tecnico por evento

- Generar PDF o vista imprimible con datos del equipo, inspeccion previa, cero, span, acumulado, material real, diagnostico y responsable.
- Incluir foto de balanza y firma/nombre del tecnico.
- Agregar codigo QR o link interno al evento.

### Exportacion util

- Redisenar Google Sheets para enviar solo campos relevantes: equipo, fecha, tecnico, errores, factores, estado, observaciones y link al detalle.
- Agregar exportacion CSV para historial filtrado.
- Agregar filtros por planta, linea, estado, tecnico, rango de fechas y fuera de tolerancia.

### Auditoria

- Crear tabla `audit_logs` para altas, bajas, ediciones, eliminaciones y cambios de usuario.
- Mostrar auditoria solo para administradores.
- Guardar actor, accion, entidad, fecha y resumen del cambio.

## Prioridad 3 - Mejoras para uso en campo

### Captura mas rapida

- Agregar botones de accion rapida desde una balanza: `Calibrar`, `Ver historial`, `Herramientas para esta balanza`.
- Mantener el contexto seleccionado al cambiar entre pantallas.
- Agregar autocompletado desde ultimo evento: factores, cadena usada, velocidad y datos de puente.

### Asistente de calibracion

- Reordenar `Nueva calibracion` para que el contexto sea el primer bloque: balanza, cadena, fecha, tolerancia y estado rapido del equipo.
- Precargar datos de cadena al seleccionarla, manteniendo `Kg/m de cadena` editable para correcciones justificadas en campo.
- Convertir el formulario largo en un flujo paso a paso con progreso visible.
- Permitir guardar borrador de evento y retomarlo.
- Marcar cada paso como `Completo`, `Pendiente` o `Con advertencia`.
- Dejar el cierre del evento como ultimo paso con resumen final, diagnostico automatico y boton unico de guardado.

### Gestion de patrones

- Mantener alta de cadenas para `admin` y `tecnico`.
- Mantener eliminacion de cadenas solo para `admin`.
- Conservar trazabilidad historica copiando nombre y kg/m de la cadena dentro de cada evento.

### Fotos y evidencia

- Permitir adjuntar fotos por evento: parametros del controlador, instalacion, cadena, material real o ticket de balanza externa.
- Comprimir imagenes y asociarlas a secciones del evento.
- Mostrar galeria de evidencia dentro del historial.

## Prioridad 4 - Visual y experiencia

### Jerarquia visual

- Reducir ruido en tarjetas largas mostrando primero los datos accionables y ocultando lo secundario.
- Mejorar contraste de estados y botones destructivos.
- Agregar iconografia sobria para equipo, historial, herramientas, usuarios y alertas.

### Dashboard operativo

- Crear pantalla inicial con KPIs: balanzas activas, vencidas, fuera de tolerancia, eventos del mes y proximas calibraciones.
- Agregar grafico simple de error por balanza en el tiempo.
- Mostrar ranking de equipos con mayor desvio.

### Mobile-first real en campo

- Optimizar formularios para uso con guantes o pantalla chica: inputs mas altos, acciones pegajosas y menos desplazamiento.
- Agregar barra de progreso fija en evento.
- Mejorar uso horizontal para tablets en planta.

## Prioridad 5 - Modelo tecnico y calidad

### Base de datos

- Normalizar algunos campos historicos si crece el volumen: plantas, lineas, equipos, cadenas, eventos, evidencias y auditoria.
- Agregar migrations versionadas en vez de un unico `schema.sql` acumulativo.
- Agregar indices por planta, equipo, fecha y estado.

### Testing

- Agregar tests unitarios para calculos: velocidad, errores, factores y diagnosticos.
- Agregar tests de permisos por rol.
- Agregar validacion automatica de build en GitHub Actions.

### Seguridad

- Revisar policies RLS con casos reales por rol.
- Limitar acciones de Edge Function a payloads esperados.
- Agregar rate limiting o protecciones basicas para operaciones administrativas.

## Siguiente sprint recomendado

1. Agregar dashboard operativo con vencimientos y fuera de tolerancia.
2. Agregar reporte imprimible/PDF por evento.
3. Agregar borradores de calibracion para no perder carga en campo.
4. Agregar tabla de auditoria para ediciones/eliminaciones.
5. Redisenar Google Sheets como exportacion resumida, no espejo completo de la base.
