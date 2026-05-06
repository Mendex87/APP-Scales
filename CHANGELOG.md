# Changelog

## v2.0.7 - Vencimientos por frecuencia de control

- Se agrego frecuencia de control en dias por balanza, con valor default de 30 dias.
- El dashboard ahora calcula controles vencidos, proximos a vencer y balanzas al dia segun el ultimo evento valido.
- La cola de accion prioriza desvio abierto, control vencido, control proximo y equipos sin historial.
- La implementacion preview guarda la frecuencia de forma compatible sin requerir migracion inmediata de Supabase.

## v2.0.6 - Pulido frontend operativo

- Se agrego un bloque de pulso operativo en dashboard con salud del parque, ultimo evento, fuente de datos y modo de uso.
- Se agrego una cola de prioridad para abrir rapidamente equipos con desvio, primera calibracion pendiente o seguimiento normal.
- Se agrego una guia de avance en el wizard con porcentaje listo, siguiente accion y bloqueos pendientes antes del cierre.

## v2.0.5 - Manuales actualizados

- Se actualizo el manual tecnico HTML publico y fuente con `Factor final` obligatorio.
- Se actualizo el manual administrador fuente y el manual admin interno generado por la app con Google Sheets, Dashboard, Alertas, codigos cortos y sincronizacion de borrados.
- Los manuales HTML ahora ofrecen imprimir/guardar PDF desde el navegador para evitar descargar PDFs estaticos desactualizados.

## v2.0.4 - Factor final obligatorio

- El cierre de una calibracion/control ahora exige cargar `Factor final` antes de guardar el evento.
- El factor final guardado corresponde al valor declarado en `Ajuste final y aprobacion`, evitando cierres con valores inferidos por fallback.

## v2.0.3 - Pulido UX navegador y movil

- Se mejoro la navegacion principal como barra flotante en escritorio y barra tactil segura en movil.
- Se agrego desplazamiento automatico al cambiar de pantalla y de paso del wizard para evitar quedar a mitad de formulario.
- Se incorporo progreso visual del wizard, foco visible, labels accesibles e inputs mas ergonomicos para uso en campo.
- Se pulieron tarjetas, metricas, filas de resultados y estados para reducir ruido y mejorar lectura en pantallas chicas.

## v2.0.2 - Borrados sincronizados con Google Sheets

- La app ahora notifica a Google Sheets cuando un admin elimina un evento o da de baja una balanza.
- La Edge Function `sync-sheets-event` acepta acciones `upsert_event`, `delete_event` y `delete_equipment`, con borrados restringidos a rol `admin`.
- El Apps Script documentado elimina filas afectadas, reconstruye `Equipos`, `Alertas` y `Dashboard`, y mantiene Sheets alineado con Supabase.

## v2.0.1 - Fecha de evento legible en Sheets

- La Edge Function de Google Sheets ahora normaliza `Fecha evento` y `Fecha sincronizacion` a `dd/mm/aaaa hh:mm` antes de reenviar el resumen a Apps Script.
- El cambio solo afecta el resumen enviado a Sheets; Supabase conserva sus fechas internas sin cambios.

## v2.0.0 - Corte estable operativo

- Se consolida la app como version estable con Supabase, roles, manuales internos/publicos, dashboard operativo, reportes y exportacion resumida a Google Sheets.
- Las fechas enviadas a Google Sheets ahora usan formato legible `dd/mm/aaaa hh:mm` en lugar de ISO UTC.
- La sincronizacion interna del evento conserva timestamp ISO para Supabase y trazabilidad tecnica.

## v1.1.24 - Resumen automatico a Google Sheets

- Se agrego exportacion automatica de un resumen por calibracion/control hacia Google Sheets despues de guardar el evento en Supabase.
- Se creo la Edge Function `sync-sheets-event` para reenviar el resumen al Web App de Apps Script sin exponer secretos en el navegador.
- Se documento la estructura recomendada de hojas `Eventos` y `Equipos`, dejando `Alertas` para calculo propio en Google Sheets.

## v1.1.23 - Acceso tecnico desde manual admin

- Se agrego acceso al manual tecnico de campo dentro del manual administrador interno para que un admin pueda consultar ambos documentos desde su sesion.

## v1.1.22 - Manual admin interno ampliado

- Se amplio el manual administrador generado dentro de la app con secciones de usuarios, balanzas, cadenas, calibraciones, historial, Supabase/RLS, Vercel, acciones destructivas y checklist.
- El manual admin sigue sin publicarse como archivo estatico y conserva opcion de imprimir o guardar PDF desde la sesion admin.

## v1.1.21 - Endurecimiento publico y manual admin interno

- Se agregaron headers de seguridad en Vercel para reducir clickjacking, sniffing, permisos de navegador innecesarios y carga de recursos no esperados.
- Se elimino el PDF y HTML administrador de `public` para que el manual admin no quede disponible por URL directa.
- El manual admin ahora se genera dentro de la app solo para usuarios con rol `admin`; el acceso publico sigue redirigiendo al manual tecnico de campo.
- Se agrego `docs/technical-change-log.md` para registrar decisiones tecnicas y el motivo de cambios sensibles.

## v1.1.20 - Desvios abiertos por balanza

- El dashboard ahora cuenta equipos actualmente fuera de tolerancia segun el ultimo evento de cada balanza.
- El historial conserva los eventos antiguos fuera de tolerancia sin afectar el estado actual del parque.

## v1.1.19 - Manual admin no publico

- Se quito el manual administrador del indice publico y del sitemap.
- Se redirige la ruta publica `/manual/admin` al manual tecnico de campo y se agrega `noindex` para recursos administrativos.
- El boton de manual para usuarios admin logueados abre el PDF administrador directamente desde la app.

## v1.1.18 - Manual publico de campo

- Se quito el encabezado publico de la landing para simplificar el ingreso.
- El acceso publico a manuales ahora apunta solo al manual tecnico de campo; el manual admin queda para usuarios admin logueados.

## v1.1.17 - Inicio sin aviso persistente

- Se quito el aviso de exito al cargar datos desde Supabase para evitar un popup innecesario al ingresar.

## v1.1.16 - Landing con video industrial

- Se rediseño la pagina publica y el login con una composicion responsive de presentacion y acceso protegido.
- Se integro el video de intro como fondo visual con capas CSS, overlay de legibilidad y fallback para movimiento reducido.

## v1.1.15 - Decimales con coma o punto

- Se permite cargar valores numericos con coma o punto decimal en formularios y herramientas.
- La app normaliza internamente la coma decimal como punto antes de calcular, validar y guardar.

## v1.1.14 - Frontend operativo

- Se agrego landing publica con acceso a manuales e ingreso protegido.
- Se incorporo dashboard operativo con KPIs, accion recomendada y accesos rapidos.
- Se mejoraron tarjetas, filtros de historial y wizard con estados por paso y pre-reporte de cierre.

## v1.1.13 - SEO tecnico

- Se agregaron metadatos SEO, Open Graph, canonical y datos estructurados para la app y manuales web.
- Se publicaron `robots.txt` y `sitemap.xml` para indexacion de la pagina principal y manuales.

## v1.1.12 - Descarga PDF desde manual web

- Se agrego descarga directa del PDF correspondiente dentro de cada manual HTML.
- Los manuales web mantienen el acceso por rol desde el boton `Manual` de la app.

## v1.1.11 - Manuales web

- Se publicaron los manuales HTML como paginas estaticas bajo `/manual/`.
- El boton `Manual` ahora abre la version web correspondiente al rol.

## v1.1.10 - Ajustes del flujo de calibracion

- Se simplifico el wizard de nueva calibracion con etiquetas de campo alineadas al lenguaje operativo.
- Se ocultaron campos no necesarios de parametros y cierre, manteniendo compatibilidad con eventos historicos.
- Se acorto el codigo de evento al formato `CAL-YYMMSS`, por ejemplo `CAL-260502`.

## v1.1.9 - Acciones de balanzas consistentes

- Se ajusto el layout de las acciones en tarjetas de balanza para evitar saltos visuales con nombres largos.
- En movil, los botones de accion quedan debajo del encabezado y ocupan el ancho disponible.

## v1.1.8 - Manuales por rol

- Se separo el manual completo para administradores del manual tecnico de campo.
- El boton `Manual` ahora descarga el documento correspondiente al rol logueado.
- El manual tecnico se enfoca solo en procedimiento de campo, calibracion, control preventivo, pasadas con material y cierre.

## v1.1.7 - Legibilidad del manual

- Se ajusto la tipografia de titulos del manual para evitar la sobre-negrita del PDF y mejorar la lectura.

## v1.1.6 - Manual descargable y enfoque movil iOS

- Se agrego descarga directa del manual de usuario desde la cabecera de la app.
- Se publico el PDF del manual como asset web en `public/manual-usuario.pdf`.
- Se ajusto la experiencia movil/iOS con safe areas, header compacto, wizard horizontal, acciones inferiores sticky e inputs numericos optimizados.
- Se agrego manifest basico para mejorar el comportamiento como app instalada.

## v1.1.5 - Manual de usuario

- Se agrego un manual de usuario completo en HTML y PDF con la paleta visual de la app.
- El documento cubre roles, balanzas, cadenas, calibraciones, controles preventivos, borradores, herramientas, historial, reportes, usuarios y problemas frecuentes.

## v1.1.4 - Guardado tecnico de eventos

- Se corrigio el guardado de calibraciones para que el rol tecnico no intente actualizar la balanza al cerrar un evento.
- Evita conflictos con la policy RLS de `equipments`, donde la actualizacion sigue reservada a administradores.

## v1.1.3 - Seleccion flexible de cadenas

- Si una balanza tiene cadenas de su misma planta, el selector muestra solo esas cadenas.
- Si la planta de la balanza no tiene cadenas cargadas, el selector permite elegir entre todas las disponibles.

## v1.1.2 - Controles preventivos

- Se ajustaron las validaciones para permitir controles preventivos con material en balanzas ya calibradas.
- Cadena, caudal y acumulado quedan obligatorios solo para la primera calibracion/carga del equipo.

## v1.1.1 - Pasadas de material y control preventivo

- Se agregaron pasadas con material certificado para diferenciar control inicial y verificaciones post-ajuste.
- El estado del evento ahora usa la ultima pasada completa: `Control conforme`, `Calibrada` o `Fuera de tolerancia`.
- El historial y el reporte imprimible muestran si hubo ajuste, cuantas pasadas se hicieron y cual fue el error final.
- Se mantiene compatibilidad con eventos historicos sin pasadas detalladas.

## v1.1.0 - Flujo guiado y reportes

- Se convirtio `Nueva calibracion` en un wizard por pasos con navegacion directa, anterior y siguiente.
- Se agrego borrador local de calibracion para guardar, recuperar y descartar eventos en curso.
- Se agrego reporte imprimible desde el historial de eventos.

## v1.0.6 - Iconografia

- Se agrego favicon SVG con monograma industrial.
- Se incorporo `lucide-react` para iconos de interfaz.
- Se agregaron iconos en navegacion inferior y acciones principales.

## v1.0.5 - Motion refinado

- Se agrego barra de progreso y salida animada en toasts.
- Se refinaron transiciones de pantallas, tarjetas, collapsibles y modales.
- Se agregaron microinteracciones en estados hover/focus para controles de formulario.

## v1.0.4 - Interacciones visuales

- Se ajusto el scroll de `Editar` para llevar directamente al formulario de balanza.
- Se mejoraron los efectos hover/active de botones con transiciones visuales mas industriales.

## v1.0.3 - Edicion de balanzas

- Se ajusto el boton `Editar` para abrir automaticamente el formulario de balanza y llevar al usuario al inicio de la pantalla.

## v1.0.2 - Correccion de toasts

- Se corrigio el temporizador de mensajes para que los toasts vuelvan a desaparecer automaticamente.

## v1.0.1 - Confirmaciones y avisos

- Se agrego eliminacion de cadenas de calibracion solo para administradores.
- Se ajusto la seleccion de cadena en nueva calibracion para precargar siempre el kg/m de la cadena elegida, manteniendo el campo editable.
- Se documento el plan de reordenamiento de nueva calibracion hacia un flujo por contexto, inspeccion, cero, parametros, span, acumulado, material real y cierre.
- Se reemplazaron las confirmaciones nativas del navegador por un modal propio de la app para acciones destructivas.
- Se elimino el aviso persistente de `syncNotice` para que los mensajes operativos aparezcan como toasts temporales.

## v1.0.0 - Punto base operativo

Esta version consolida la aplicacion como base funcional para operar calibraciones de balanzas dinamicas con trazabilidad, roles y persistencia remota.

### Operacion de calibraciones

- Se implemento el flujo completo de evento de calibracion: seleccion de balanza, inspeccion previa, cero, foto de parametros, span con cadena, acumulado, material real, ajuste final y aprobacion.
- Se agregaron validaciones de cierre para evitar eventos incompletos: balanza seleccionada, inspeccion previa completa, cero registrado, responsable logueado, cadena, lectura promedio, caudal esperado, acumulado, peso externo, peso medido y factor final.
- Se incorporo diagnostico automatico para marcar inspecciones incompletas, errores de cadena, acumulado/material real fuera de tolerancia y correcciones significativas de factor.
- Se agrego historial de calibraciones con detalle expandible, estado por tolerancia y datos clave del evento.
- Se agrego eliminacion de eventos solo para administradores.

### Equipos y cadenas

- Se agrego alta y gestion de balanzas dinamicas con datos tecnicos principales: planta, linea, cinta, controlador, dimensiones, velocidad nominal, factores y unidad de totalizador.
- Se agrego baja de balanzas solo para administradores, con eliminacion asociada de eventos por cascada en Supabase.
- Se agrego gestion de cadenas de calibracion por planta para reutilizar datos en herramientas y eventos.
- Se incorporaron fotos de balanzas en Supabase Storage con compresion previa, miniaturas en listados y vista ampliada en modal.

### Herramientas tecnicas

- Se agregaron calculadoras de campo para velocidad por RPM, velocidad por vuelta completa, cadena de calibracion, acumulado y factor de correccion.
- Los resultados de herramientas pueden trasladarse al evento activo cuando el usuario tiene permiso operativo.
- Las herramientas quedan disponibles para consulta tambien en roles no operativos.

### Autenticacion y roles

- Se migro el acceso a Supabase Auth, eliminando usuarios hardcodeados.
- Se agrego tabla `profiles` para vincular usuario autenticado con nombre visible y rol.
- Se agrego Edge Function `manage-users` para que el administrador liste, cree y elimine usuarios usando `SERVICE_ROLE_KEY`.
- Se consolidaron roles:
  - `admin`: acceso total, gestion de usuarios, eliminacion y edicion administrativa.
  - `tecnico`: operacion completa sin eliminacion ni gestion de usuarios.
  - `supervisor`: lectura avanzada de balanzas, herramientas e historial.
  - `viewer`: consulta basica de herramientas e historial.
- Los campos de responsabilidad `Quien cambio` y `Responsable tecnico` ahora se toman automaticamente del usuario logueado.

### Persistencia y Supabase

- Se agrego persistencia en Supabase para balanzas, cadenas y eventos de calibracion.
- Se conserva almacenamiento local como modo contingencia cuando Supabase no esta configurado o no responde.
- Se agregaron policies RLS para lectura autenticada, escritura por `admin`/`tecnico` y eliminacion solo por `admin`.
- Se agrego bucket publico `equipment-photos` para fotos de balanzas.
- Se pauso la integracion con Google Sheets para redisenar mas adelante un envio resumido y util.

### Interfaz visual

- Se rediseño la interfaz con estilo industrial claro inspirado en Enerblock: naranja/coral, negro, grises calidos, grilla sutil y foco mobile-first.
- Se agregaron tarjetas replegables para reducir carga visual en formularios largos.
- Se agrego navegacion inferior responsive por rol.
- Se agregaron badges de estado, toasts superiores y componentes visuales para fotos de equipos.

### Versiones intermedias relevantes

- `v0.8.0`: rediseño visual general.
- `v0.9.0`: eliminacion de eventos y formularios replegables.
- `v0.10.0`: baja de balanzas.
- `v0.11.0`: rol supervisor inicial.
- `v0.12.0`: Supabase Auth, profiles, gestion de usuarios y Storage.
- `v0.13.0`: integracion visual de fotos de balanzas.
- `v0.14.0`: rol tecnico, permisos separados y responsable automatico.
