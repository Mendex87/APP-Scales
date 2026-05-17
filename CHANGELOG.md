# Changelog

## v4.0.15 - Camion termo cerrado

- Se reemplaza el camion doble caja por un modelo mas simple: cabina frontal sin trompa y un unico modulo cerrado tipo termo.
- El selector lo muestra como `Camion termo cerrado` y ajusta dimensiones iniciales mas cortas.

## v4.0.14 - Camion doble caja del mapa

- Se agrega `Camion doble caja` al selector de modelos 3D del mapa, con chasis largo, cabina, ruedas y dos cajas de carga.
- Al seleccionar este modelo, el editor ajusta dimensiones iniciales de camion para que no aparezca aplastado.

## v4.0.13 - Fallback de modelos importados

- Los objetos con modelo `.glb` seleccionado ya no muestran un cubo temporal si el modelo tarda o falla al cargar.
- Si un modelo importado no carga, el mapa muestra un marcador pequeño de error en lugar de confundirlo con un bloque.

## v4.0.12 - Modelo adicional del mapa

- El selector de modelos 3D del mapa suma `Persona durmiendo`, cargado desde `public/models/plant/persona-durmiendo-carretilla.glb`.

## v4.0.11 - Banda compacta del mapa

- La tarjeta de estado del mapa pasa arriba como banda horizontal compacta de ancho completo.
- Los controles de vista quedan mas chicos y ubicados abajo para no competir con los datos operativos.
- La vista normal elimina el panel de detalle externo; las acciones rapidas quedan dentro del mapa.

## v4.0.10 - Navegacion y estado del mapa

- El mapa 3D conserva la camara al crear objetos o editar dimensiones/modelos, evitando volver al punto inicial.
- La navegacion suma paneo y presets de vista para general, despachos y superior.
- La vista normal muestra el estado de la balanza seleccionada dentro del mapa y retira los nombres flotantes de objetos 3D.

## v4.0.9 - Etiquetas compactas del mapa

- El mapa 3D reduce el tamaño y contraste de los nombres de objetos para que no tapen la planta.
- Los puntos de balanza usan marcador y etiqueta mas compactos, manteniendo la seleccion y el estado visual.

## v4.0.8 - Selector de modelos del mapa

- El editor de mapa reemplaza la carga manual de ruta `.glb` por un desplegable con modelos 3D disponibles: silo, cinta y cinta con balanza.
- Los objetos conservan internamente `model_path`, pero el administrador ya no necesita ver ni pegar rutas para probar modelos importados.

## v4.0.7 - Mapa normal ampliado

- La vista normal de `/mapa` usa el ancho completo para la planta 3D y mueve el detalle del punto debajo, dejando el panel lateral reservado para modo edicion.
- El canvas 3D normal aumenta su altura para que el mapa de planta sea el foco principal fuera de la edicion.

## v4.0.6 - Guardado de puntos libres del mapa

- El guardado del mapa conserva `object_id` como texto vacio cuando un punto operativo no esta vinculado a un objeto 3D, evitando errores de restriccion en el servidor online.

## v4.0.5 - Modelos GLB para mapa 3D

- El editor de mapa permite asociar una ruta `.glb`/`.gltf` a cada objeto para reemplazar la geometria generativa por modelos exportados desde Fusion 360/Blender.
- La escena 3D carga modelos desde `public/models/plant/`, los escala al volumen configurado y conserva un fallback visual si el archivo todavia no existe.
- El panel de edicion queda dividido en secciones plegables para ocultar presets y reducir ruido visual.

## v4.0.4 - Presets industriales de mapa

- El editor 3D de planta agrega una biblioteca de presets industriales para crear cintas, tolvas, silos, despachos, basculas, caminos, zonas y marcadores con medidas iniciales utiles.
- Los presets se insertan cerca del objeto seleccionado y quedan en borrador hasta confirmar con `Guardar edicion`.

## v4.0.3 - Reporte imprimible depurado

- El reporte A4 reduce informacion repetida: la cabecera identifica evento/equipo y el resumen queda enfocado en resultado, tolerancia, pasadas y factor final.
- `Pesos de referencia` concentra pesos principales, diferencia y porcentaje de error material final.
- Se unifican bloques tecnicos de controlador/parametros y cadena/acumulado para mejorar lectura sin perder trazabilidad.

## v4.0.2 - Recuperacion de contraseña

- La pantalla de ingreso agrega `Olvidé mi contraseña` para pedir un link de recuperacion por email desde el servidor online.
- El link de recuperacion abre una pantalla segura para cargar y confirmar nueva contraseña; al finalizar se cierra la sesion temporal y se vuelve al ingreso.
- El reenvio de emails queda protegido con cooldown local persistido para reducir bloqueos por limite de correo del proveedor.
- La documentacion cubre URLs permitidas, SMTP transaccional y plantilla de email de recuperacion.

## v4.0.1 - Validacion y trazabilidad de eventos

- El cierre del wizard bloquea tolerancias, tiempos, factores y pasadas con valores imposibles, negativos, incompletos o fuera de rangos operativos razonables.
- Cada evento registra la version de app dentro de `parameter_snapshot.appVersion`, evitando una migracion de esquema y manteniendo compatibilidad con datos existentes.
- Historial y reporte imprimible muestran `Version app` para facilitar auditoria de eventos.
- El borrador local muestra la fecha/hora del ultimo guardado o autoguardado para que el tecnico sepa que recupera.

## v4.0.0 - Wizard de cierre seguro

- El wizard refuerza el cierre del evento: bloqueos con salto al paso correspondiente, boton `Ir al primer bloqueo`, pasos 5 y 6 marcados como `No requerido` en controles preventivos y Paso 8 convertido en revision final.
- Paso 1 se reorganiza como `Contexto operativo`, con selectores visuales para balanza/cinta y cadena patron, mas fecha y tolerancia en una sola entrada de trabajo.
- Paso 4 hace obligatorio `Factor calibracion actual`; este valor representa el factor cargado en el controlador antes de validar con material real.
- Paso 7 usa siempre el factor del Paso 4 como factor base de la primera pasada con material real; los factores post-ajuste quedan reservados para verificaciones posteriores.
- Paso 8 destaca el `Factor final de calibracion` como valor de cierre del controlador, junto con estado de bloqueos y responsable tecnico.
- Manuales HTML fuente/publicos, PDFs, README y documentacion tecnica quedan alineados con el flujo `v4.0.0`.

## v3.0.17 - Bloqueo de guardado duplicado

- Se evita que un doble click o submit repetido en `Guardar evento` cree calibraciones duplicadas.
- El wizard bloquea recuperar, guardar o descartar borradores, cambiar pasos y navegar mientras el evento se esta guardando.
- El boton de cierre muestra `Guardando...` durante la operacion para dejar claro que el evento ya esta en proceso.

## v3.0.16 - Retiro de Google Sheets

- Se retira Google Sheets del flujo operativo: guardar, eliminar eventos y dar de baja balanzas ya no invocan `sync-sheets-event` ni Apps Script.
- Se elimina la Edge Function `sync-sheets-event` y la documentacion activa de configuracion de Sheets.
- Los estados `sync_status`, `sync_message` y `synced_at` se conservan por compatibilidad como estado interno de sincronizacion local/servidor, no como estado de planillas.
- Manuales, README, roadmap y guia interna se actualizan para dejar servidor online, historial y PDF como fuentes vigentes de consulta.

## v3.0.15 - Flujo de calibracion y reporte A4

- Los campos numericos del wizard aceptan coma o punto decimal y permiten borradores de entrada como `1.`, `1,` o `.5` sin bloquear la carga.
- La inspeccion previa agrega `Marcar todo OK`, el cero queda simplificado a `Cero realizado`, `Valor observado` y unidad visible, y el descarte de borrador limpia campos manuales sin perder datos autocompletados de balanza/cinta.
- La foto de parametros retira `Span` y `Filtro`; el paso de cadena usa `Tiempo de test (min)` y el acumulado usa `Caudal leido`.
- El reporte imprimible pasa a formato A4 vertical de una pagina con resumen primero, pesos de referencia destacados, todas las pasadas de material, soporte tecnico y firma de tecnico.
- Se corrige la impresion de fondos del encabezado y se aplica el degrade oscuro a tarjetas principales y encabezados de tabla del reporte.
- En desktop se reducen los autoscrolls automaticos: ya no se fuerza el salto al cambiar pantalla ni al avanzar pasos del wizard; en mobile se conserva el guiado.
- Manuales HTML, PDFs publicos/fuente y documentacion tecnica quedan alineados con el flujo `v3.0.15`.

## v3.0.14 - Cierre automatico de sesion

- La app cierra automaticamente la sesion tras 30 minutos sin actividad de teclado, click, toque, scroll o foco.
- El cierre automatico reutiliza el flujo normal de logout, registra `logout_at` en auditoria de sesiones y vuelve a la pantalla de login.
- La ultima actividad queda persistida en el navegador para que recargar la pagina no evite el vencimiento.
- Los manuales HTML fuente y publicos quedan restilizados con la estetica industrial actual y version documentada `v3.0.14`; no se regeneran PDFs.

## v3.0.13 - Selector metrico/imperial

- Se agrega un switch global `Metrico / Imperial` en la cabecera autenticada.
- Los formularios, herramientas, historial y reportes convierten unidades solo en la interfaz; los datos guardados siguen en metrico como base canonica.
- El modo imperial muestra longitudes en `ft`/`in`, pesos en `lb`, peso lineal en `lb/ft`, velocidad en `ft/min` y caudal en `lb/h`.
- Se actualizan manuales HTML para aclarar que el cambio de unidades no migra ni reescribe datos historicos.

## v3.0.12 - Reloj sin etiqueta visible

- La capsula de hora Argentina queda solo con fecha y hora, sin el texto visible `Hora AR`.
- Se conserva la etiqueta accesible para lectores de pantalla.

## v3.0.11 - Reloj Argentina discreto

- Se agrega una capsula discreta en el encabezado autenticado con fecha y hora Argentina en vivo.
- El reloj se actualiza cada 30 segundos y usa el mismo helper de zona `America/Argentina/Buenos_Aires`.

## v3.0.10 - Hora Argentina

- La app centraliza la visualizacion y seleccion de fecha/hora en `America/Argentina/Buenos_Aires`.
- El campo `Fecha y hora`, historial, reportes, dashboard, sesiones y filtros mensuales ya no dependen de la zona horaria del dispositivo o runtime.
- La Edge Function `sync-sheets-event` formatea fechas para Google Sheets en hora Argentina antes de reenviar a Apps Script.
- Los timestamps internos se conservan como ISO para trazabilidad, pero se muestran y agrupan segun hora Argentina.

## v3.0.9 - Encabezado de sesiones

- La tabla de sesiones ahora usa fondos y bordes reales en lugar de variables inexistentes, evitando el encabezado plano sobre la card.
- El encabezado de columnas se rediseña como banda industrial oscura con diagonales y mejor separación visual.

## v3.0.8 - Limpieza de ancla post-login

- Al ingresar desde el boton publico `Ingresar a la app`, la URL ya no conserva `#acceso` despues del login exitoso.
- Se mantiene el ancla antes de autenticarse para seguir bajando directamente al formulario de acceso.

## v3.0.7 - Popups industriales

- Los mensajes popup ahora usan placas oscuras con cortes diagonales, textura tecnica y acento por estado.
- Se agrega una etiqueta visual (`OK`, `INFO`, `ALERTA`, `ERROR`) para identificar rapidamente el tipo de aviso.
- La barra de progreso adopta un riel diagonal con el color del estado, manteniendo contraste y legibilidad en desktop/mobile.

## v3.0.6 - Reveal de login cubierto

- La transicion de ingreso ahora arranca antes de renderizar visualmente la app autenticada, evitando que el dashboard aparezca antes del efecto.
- La capa de presentacion queda opaca y con blur mientras se carga el usuario, y recien revela la app al final de la animacion.
- Se mantiene el respeto a `prefers-reduced-motion` y no se modifica la logica de autenticacion.

## v3.0.5 - Pulso legible y transicion de ingreso

- El barrido `action-pulse` de botones ahora se renderiza detras del contenido para que iconos y texto no queden tapados.
- Los botones primarios naranjas oscurecen la base durante el pulso, manteniendo el texto claro visible mientras pasa el barrido.
- El login exitoso dispara una transicion de ingreso con placas diagonales naranjas/negro, alineada con la identidad visual del cambio claro/oscuro.
- La transicion de ingreso respeta `prefers-reduced-motion` y no cambia la logica de autenticacion.

## v3.0.4 - Barrido diagonal en botones de accion

- Se extiende el efecto `action-pulse` a botones de accion `.primary` y `.secondary` tambien en pantalla publica/login.
- Los botones `submit` ahora reciben el barrido diagonal al pulsar, respetando controles deshabilitados y `prefers-reduced-motion`.
- Se mantienen separados los efectos propios de claro/oscuro y navegacion inferior para evitar animaciones duplicadas.
- Se documenta el criterio de uso del efecto y el comportamiento actual de autoscrolls en `docs/interaction-patterns.md`.

## v3.0.3 - Preview de performance

- Se agrega paginado del historial para renderizar 25 eventos por pagina en lugar de pintar todo el historial filtrado.
- Se separan componentes de historial, paginacion, fotos de equipo y metricas para reducir complejidad de `App.tsx`.
- Se agrega logging de performance en consola con fuente de datos, cantidad de equipos/cadenas/eventos y tiempo de carga inicial.
- Las fotos de equipos ahora usan carga diferida (`loading="lazy"`) y decodificacion asincronica.
- Se documenta baseline de build y estrategia de medicion en `docs/performance-baseline.md`.

## v3.0.2 - Etiquetas de servidor online

- Se reemplazan menciones visibles de `Supabase` por textos operativos orientados a usuario final: `Servidor online`, `Modo local`, `servidor de usuarios` y `permisos por rol`.
- El manual tecnico explica que el servidor online es una base de datos en la nube, protegida por permisos de usuario y con respaldo remoto para preservar trazabilidad.
- El manual administrador y la guia interna quedan alineados para ocultar detalles del proveedor sin modificar imports, variables ni integraciones tecnicas.
- Se aclara el alcance real del rol `Tecnico`: puede dar de alta equipos nuevos y registrar trabajo de campo, pero no editar equipos existentes, darlos de baja, eliminar datos ni gestionar usuarios.

## v3.0.1 - Borrado real de sesiones

- El boton `Borrar registros` de sesiones ahora ejecuta la accion `clear_sessions` en la Edge Function `manage-users`.
- La limpieza usa service role luego de validar rol admin, evitando falsos positivos cuando RLS no borra filas desde el cliente.
- La app muestra la cantidad de registros eliminados y limpia el ID local de sesion.

## v3.0.0 - Corte estable de seguridad y sesiones

- Se consolida en `main` el endurecimiento de datos, Sheets seguro, fecha automatica para no-admin y auditoria de sesiones.
- Los avisos de login/logout ahora se renderizan tambien en la pantalla publica, por lo que errores de credenciales y cierres de sesion quedan visibles.
- El registro de sesiones ahora se crea solo en logins exitosos, evitando duplicados generados por restauracion de sesion o cambios de estado de Supabase Auth.
- El logout cierra la sesion actual por ID local y tambien limpia sesiones abiertas duplicadas creadas por versiones preview anteriores.
- La pantalla `Usuarios > Sesiones` ahora muestra columnas `Usuario`, `Inicio`, `Cierre` y `Dispositivo` (`Movil` o `Navegador`).
- La vista de sesiones deduplica registros repetidos y permite a un admin borrar todo el historial de sesiones desde la app.
- Se agrego policy RLS `admin delete user_sessions` para que solo admins puedan eliminar registros de sesiones.
- Se solicita limpiar el historial existente de `user_sessions` para iniciar v3.0.0 con auditoria limpia.

## v2.0.12 - Fecha automatica no-admin y sesiones (preview)

- El campo de fecha/hora en el wizard de nueva calibracion queda bloqueado para roles no-admin (tecnico, supervisor, consulta); la fecha se asigna automaticamente al momento del guardado.
- Solo el rol admin puede elegir fecha y hora manualmente en una calibracion.
- Se creo la tabla `user_sessions` en Supabase para registrar ingresos y cierres de sesion de todos los usuarios.
- Cada inicio de sesion registra usuario, fecha/hora, IP (si disponible) y user agent; el cierre de sesion actualiza `logout_at`.
- La pantalla de Gestion de usuarios (solo admin) now tiene una pestana de Sesiones para ver el historial de accesos de todos los usuarios.
- Los datos de sesion se guardan indefinidamente y solo son visibles para admins.

## v2.0.11 - Sheets seguro (preview separada)

- La Edge Function `sync-sheets-event` ahora recibe solo `eventId` del cliente y consulta Supabase con service role para armar el payload oficial hacia Google Sheets.
- El navegador ya no construye el resumen del evento; la Edge Function lo genera servidor-side, eliminando la posibilidad de enviar datos falsos a Sheets.
- Los payloads de `delete_event` y `delete_equipment` siguen funcionando igual; los deletes requieren rol `admin`.
- Esta preview requiere redeploy de la Edge Function `sync-sheets-event` para tomar efecto.

## v2.0.10 - Endurecimiento de datos (preview separada)

- Los eventos de calibracion ahora se guardan con `insert` en lugar de `upsert` para evitar sobrescrituras por collision de ID.
- Si dos usuarios intentan crear un evento con el mismo ID, la base rechazara el segundo en lugar de sobrescribir el primero.
- Se agrego la columna `check_interval_days` en la tabla `equipments` de Supabase con valor default de 30 dias.
- Se actualizo el mapeo de lectura/escritura de equipos para usar la columna real de `check_interval_days` en lugar del marcador interno en `notes`.
- Se agrego constraint `check (sync_status in ('pendiente', 'sincronizado', 'error'))` en `calibration_events.sync_status`.
- La clave foranea de `calibration_events` a `equipments` ahora usa `on delete restrict` en lugar de `on delete cascade`, evitando que una baja de equipo elimine historial de calibraciones.
- Esta version mantiene compatibilidad con equipos existentes: si `check_interval_days` no existe en un registro, se lee desde el marcador interno `notes`.

## v2.0.9 - Transicion de tema en preview

- Se agrego una transicion diagonal tipo placa industrial al alternar claro/oscuro usando View Transition API cuando el navegador lo soporta.
- El boton de tema dispara un barrido angular naranja y conserva fallback suave para navegadores sin soporte.
- Se extendio el barrido angular a botones de accion no-submit, dejando el nav inferior y el selector de tema con sus interacciones especificas.
- Se respeta `prefers-reduced-motion` para evitar animaciones a usuarios que pidan reducir movimiento.

## v2.0.8 - Tema oscuro en preview

- Se agrego selector de tema claro/oscuro en el encabezado de la app autenticada.
- El tema claro conserva la identidad visual existente; el tema oscuro usa superficies industriales oscuras manteniendo acentos naranjas.
- La preferencia de tema queda guardada en el navegador.
- Se ajusto la grilla de KPIs del dashboard para evitar tarjetas desproporcionadas.

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
