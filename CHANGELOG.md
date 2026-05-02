# Changelog

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
