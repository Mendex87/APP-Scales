# Roadmap de producto

Este roadmap parte del estado `v3.0.12` y prioriza mejoras que aumentan confiabilidad operativa, trazabilidad de calibracion y velocidad de uso en campo sin transformar la app en un CMMS generico pesado.

## Estado actual

La app ya cubre el nucleo operativo:

- Alta y gestion de balanzas dinamicas sobre cinta.
- Alta y uso de cadenas/patrones de calibracion.
- Registro de calibraciones con precheck, cero, velocidad, span con cadena, material real, ajuste final y diagnostico.
- Historial tecnico con filtros, paginado y reportes imprimibles basicos.
- Roles de usuario y sesiones.
- Guardado en servidor online con fallback local.
- Sincronizacion resumida hacia Google Sheets.
- Hora visible y calculos funcionales en zona Argentina.

## Senales tomadas de investigacion web

Las referencias de CMMS, EAM, inspecciones y software de calibracion repiten estos patrones:

- Los CMMS modernos priorizan ordenes de trabajo, mantenimiento preventivo, historial de activos, inventario, dashboards, mobile/offline y auditoria.
- Las apps lideres de campo reducen errores con QR, fotos, checklists, instrucciones claras, notificaciones y captura inmediata desde el movil.
- El software especializado de calibracion agrega planificacion, certificados, aprobaciones, integridad de datos, trazabilidad metrologica y analisis de tendencias.
- ISO/IEC 17025 refuerza competencia, resultados validos, reportes/certificados confiables y enfoque basado en riesgos.
- Para esta app, la ventaja competitiva no es copiar un CMMS completo, sino resolver muy bien la calibracion real de balanzas dinamicas en planta.

## Principios de decision

- Priorizar seguridad de datos en campo antes que graficos o automatizaciones avanzadas.
- Mantener la carga rapida para tecnicos con guantes, movil y conectividad irregular.
- Separar trazabilidad interna de textos visibles para usuario final.
- No agregar modulos administrativos grandes si no resuelven un problema directo de calibracion.
- Cada mejora importante debe pasar por preview antes de `main`.

## P0 - Pendiente operativo inmediato

### Redeploy de sincronizacion Sheets

- Motivo: `v3.0.10` normalizo fechas de Google Sheets en hora Argentina tambien dentro de la funcion del servidor.
- Pendiente: desplegar `sync-sheets-event` cuando haya token/login disponible para la CLI.
- Comando: `npx supabase functions deploy sync-sheets-event --project-ref qatnjksbzegltidoujms`.
- Criterio de cierre: guardar una calibracion real y verificar `Fecha evento` y `Fecha sincronizacion` en Google Sheets como `dd/mm/aaaa hh:mm` Argentina.

## P1 - Cero perdida de datos en campo

### Borrador robusto de calibracion

- Guardar automaticamente el formulario completo por equipo y usuario.
- Permitir retomar borrador despues de cerrar, recargar o perder conexion.
- Mostrar estado claro: `Borrador guardado`, `Pendiente de sincronizar`, `Listo para enviar`.

### Cola offline real

- Guardar eventos localmente cuando no hay conexion.
- Sincronizar automaticamente al volver el servidor online.
- Mostrar conflictos si el equipo o evento fue modificado por otro usuario.
- Evitar que un evento local se pierda por cerrar navegador o cambiar de pantalla.

### Revision final antes de guardar

- Mostrar resumen de datos criticos antes del guardado definitivo.
- Marcar advertencias por valores absurdos, signos incompatibles o campos incompletos.
- Confirmar factor anterior, factor final, error final, estado y tecnico.

### Validaciones numericas duras

- Bloquear peso real o indicado en cero cuando no corresponda.
- Alertar errores mayores a umbrales configurables.
- Detectar cambios de factor demasiado grandes respecto del historico.
- Registrar la version de app en cada evento guardado.

## P2 - Asistente de calibracion guiado

### Flujo paso a paso

- Reemplazar el formulario largo por pasos: contexto, inspeccion previa, cero, velocidad, span, material real, ajuste final, revision.
- Mostrar progreso fijo y estado por paso: `Pendiente`, `Completo`, `Con advertencia`.
- Mantener autoguardado entre pasos.

### Precheck con bloqueo operativo

- Si falla la inspeccion previa, permitir marcar evento como `Condicionado` o `Bloqueado`.
- Registrar motivo mecanico: acumulacion, rolos, vibracion, banda, sensor, controlador u otro.
- Sugerir no calibrar si la condicion mecanica invalida el resultado.

### Repeticiones y promedios

- Permitir varias pasadas de cadena y varias corridas con material real.
- Calcular promedio, dispersion y mejor/peor corrida.
- Guardar cada corrida para auditoria, no solo el resultado final.

### Diagnostico tecnico automatico

- Generar diagnostico inicial segun precheck, error, ajuste y tolerancia.
- Sugerir factor nuevo y explicar formula usada.
- Permitir que el tecnico edite observaciones finales sin perder el diagnostico calculado.

## P3 - Evidencia y certificado tecnico

### Evidencia fotografica por evento

- Implementar el plan de `CAMERA-EVIDENCE-PLAN.md`.
- Tomar foto desde camara trasera o cargar desde galeria.
- Categorias iniciales: parametros, cadena, material real, ticket externo, observacion.
- Comprimir imagenes antes de subir.
- Guardar el evento aunque falle una foto, dejando advertencia clara.

### Galeria en historial

- Mostrar miniaturas por categoria dentro del evento.
- Abrir imagen ampliada en modal.
- Indicar `Sin evidencia fotografica cargada` cuando corresponda.

### Certificado/reporte por evento

- Crear reporte imprimible/PDF con datos de equipo, cadena, resultados, factores, diagnostico y responsable.
- Incluir fotos relevantes y QR/link al evento.
- Mostrar version de app, fecha Argentina y fuente de datos.

### Firma y aprobacion

- Agregar firma/nombre de tecnico responsable.
- Permitir aprobacion de supervisor/admin cuando el evento queda fuera de tolerancia o condicionado.
- Registrar motivo de aprobacion o rechazo.

## P4 - Programa preventivo por balanza

### Estados de equipo mas precisos

- Separar estado administrativo de estado metrologico.
- Estados sugeridos: `Activa`, `Fuera de servicio`, `Pendiente`, `Calibrada`, `Vencida`, `Fuera de tolerancia`, `Condicionada`.
- Mantener historial de cambios de estado.

### Vencimientos y agenda

- Usar frecuencia configurable por equipo.
- Mostrar `Vence pronto`, `Vencida` y `Sin control reciente`.
- Crear vista calendario/lista de proximas calibraciones.
- Permitir filtrar por planta, linea, tecnico y estado.

### Alertas operativas

- Alertar equipos fuera de tolerancia.
- Alertar equipos sin evento en X dias.
- Alertar errores repetidos o factor que cambia demasiado.
- Mostrar accion recomendada y responsable sugerido.

### Ordenes simples de trabajo

- No crear un CMMS completo en primera etapa.
- Agregar tareas simples vinculadas a balanza: revisar, calibrar, corregir mecanica, reprueba.
- Estados: `Abierta`, `En curso`, `Bloqueada`, `Cerrada`.
- Convertir alerta critica en tarea manualmente.

## P5 - Dashboard y analitica util

### Dashboard operativo interno

- KPIs: equipos activos, vencidos, fuera de tolerancia, eventos del mes, pendientes de sincronizar.
- Ranking de balanzas con mayor desvio.
- Lista de proximas calibraciones.
- Lista de ultimos eventos fuera de tolerancia.

### Tendencias por balanza

- Evolucion de error final en el tiempo.
- Evolucion de factor final.
- Cantidad de ajustes por periodo.
- Tendencia de estabilidad de cada equipo.

### Analisis de patrones

- Comparar resultados por cadena usada.
- Detectar equipos que se descalibran mas rapido.
- Detectar tecnicos/equipos con mayor cantidad de eventos condicionados.
- Identificar plantas o lineas con mayor carga de trabajo.

### Google Sheets como tablero ejecutivo

- Mantener Sheets como salida resumida, no como fuente de verdad.
- Confirmar hojas `Eventos`, `Equipos`, `Alertas`, `Dashboard` y `Configuracion`.
- Agregar link al detalle del evento cuando exista URL estable.
- Mantener formato visual alineado con la app.

## P6 - Identificacion rapida e integraciones

### QR por equipo

- Generar QR para cada balanza.
- Escanear QR para abrir ficha, historial o nueva calibracion.
- Incluir QR en reporte y etiqueta imprimible.

### Codigos cortos operativos

- Mantener IDs internos para trazabilidad.
- Mostrar codigos cortos tipo `EQ-001`, `CAL-2026-0001` para planta y reportes.
- Evitar que usuarios operativos dependan de IDs largos.

### Exportaciones

- Exportar historial filtrado a CSV.
- Exportar evento individual en JSON tecnico para respaldo.
- Preparar estructura futura para integracion con ERP/CMMS externo sin acoplar la app.

## P7 - Auditoria, permisos y seguridad

### Auditoria completa

- Crear `audit_logs` para altas, ediciones, eliminaciones, login/logout y cambios de permisos.
- Guardar actor, entidad, accion, fecha Argentina visible, fecha ISO interna y resumen del cambio.
- Mostrar auditoria solo a admin.

### Edicion historica controlada

- Permitir correcciones de eventos solo a admin/supervisor autorizado.
- Exigir motivo obligatorio.
- Guardar revision anterior y revision nueva.
- Evitar editar eventos aprobados sin crear nueva revision.

### Reglas por rol

- Mantener tecnico enfocado en carga de campo.
- Supervisor revisa, aprueba y comenta.
- Admin administra equipos, usuarios, reglas y correcciones historicas.
- Viewer solo consulta reportes/historial.

### Hardening tecnico

- Revisar policies de permisos con casos reales por rol.
- Validar payloads de funciones del servidor.
- Agregar protecciones basicas de abuso en acciones administrativas.
- Documentar backups y restauracion.

## P8 - Calidad interna y escalabilidad

### Migraciones versionadas

- Pasar de `schema.sql` acumulativo a migraciones versionadas cuando el modelo siga creciendo.
- Agregar indices por equipo, fecha, planta, estado y tecnico.
- Mantener scripts re-ejecutables para instalaciones existentes.

### Tests automaticos

- Tests de calculos: error %, factor sugerido, tolerancia, fecha Argentina, vencimientos.
- Tests de permisos por rol.
- Tests de conversion `datetime-local` a ISO en zona Argentina.
- GitHub Actions para `npm run build` en cada rama.

### Performance real

- Medir carga con volumen grande: 1.000, 5.000 y 20.000 eventos.
- Migrar consultas remotas a paginado real si el historial crece.
- Mantener lazy loading de historial y fotos.

### Observabilidad simple

- Log tecnico no visible para usuario final con version, fuente de datos y tiempo de carga.
- Registrar errores de sincronizacion para diagnostico admin.
- Exportar diagnostico local cuando el tecnico reporta falla.

## P9 - Automatizaciones avanzadas

Estas mejoras son utiles, pero deben esperar a que P1-P8 esten firmes.

### Ayuda inteligente al tecnico

- Sugerir observaciones desde datos cargados.
- Explicar alertas de factor o error con lenguaje tecnico corto.
- Generar resumen ejecutivo del evento para reporte.

### Voz a texto

- Permitir dictar observaciones en mobile.
- Mantener edicion manual antes de guardar.
- No usar si no se puede garantizar privacidad y control del dato.

### Prediccion de riesgo

- Riesgo de vencimiento o desvio por tendencia historica.
- Sugerir proxima fecha segun estabilidad real, no solo intervalo fijo.
- Detectar anomalias de factor, error o repeticion de fallas.

## Sprints recomendados

### Sprint 1 - Campo seguro

- Redeploy de `sync-sheets-event`.
- Borrador robusto con autoguardado.
- Revision final antes de guardar.
- Validaciones numericas duras.
- Registrar version de app en evento.

### Sprint 2 - Evidencia

- Tabla/bucket de evidencias.
- Captura de fotos por categoria.
- Compresion y subida tolerante a fallos.
- Galeria en historial.

### Sprint 3 - Preventivo

- Estados de equipo refinados.
- Vencimientos y alertas operativas.
- Dashboard de pendientes, vencidas y fuera de tolerancia.
- Google Sheets alineado con alertas ejecutivas.

### Sprint 4 - Reporte y auditoria

- Reporte/certificado imprimible con QR.
- Firma/aprobacion.
- Auditoria de ediciones y cambios administrativos.
- Edicion historica con motivo y revision.

### Sprint 5 - Offline real e integraciones

- Cola offline con resolucion de conflictos.
- QR por equipo.
- Exportacion CSV.
- Preparacion de API/estructura para integraciones externas.

## Ideas descartadas por ahora

- Inventario completo de repuestos: util para CMMS, pero no central para calibracion de balanzas en esta etapa.
- Compras/proveedores: agrega complejidad administrativa sin mejorar el registro tecnico inmediato.
- Planificacion financiera de activos: propio de EAM, no del foco actual.
- Chat interno completo: puede resolverse primero con notas y auditoria.
- IA predictiva antes de tener datos historicos limpios y suficientes.

## Metricas de exito

- Tiempo promedio para cargar una calibracion completa.
- Porcentaje de eventos con evidencia fotografica.
- Porcentaje de eventos guardados sin conexion que luego sincronizan correctamente.
- Cantidad de eventos fuera de tolerancia detectados a tiempo.
- Cantidad de equipos vencidos o sin control reciente.
- Tiempo de carga inicial con volumen real de datos.
- Cantidad de correcciones historicas con motivo/auditoria completa.

## Fuentes consultadas

- IBM, `What is a CMMS?` (`https://www.ibm.com/topics/what-is-a-cmms`): work orders, inventario, mantenimiento preventivo, dashboards, compliance, mobile y tendencias AI/IoT.
- IBM Maximo Application Suite (`https://www.ibm.com/products/maximo`): EAM, APM, inspecciones, field service, condition-based maintenance y lifecycle planning.
- IBM, `What is preventive maintenance?` (`https://www.ibm.com/topics/what-is-preventive-maintenance`): mantenimiento por tiempo, uso, condicion, predictivo y prescriptivo.
- Fiix CMMS (`https://fiixsoftware.com/cmms/`): ordenes de trabajo, planificador preventivo, perfiles de activos, inventario, reporting, app mobile, QR/offline/fotos/notas.
- Limble CMMS (`https://limblecmms.com/cmms-software/`): checklists con fotos, jerarquias de activos, QR, dashboards, inventario y adopcion por tecnicos.
- UpKeep Mobile CMMS (`https://upkeep.com/cmms/`): mobile-first, push notifications, historial en movil, requester flow, offline, costos y partes.
- Beamex Calibration Management Software (`https://www.beamex.com/calibration-software/`): planificacion, ejecucion, historiales, analisis, reportes, certificados y flujo digital de calibracion.
- Beamex Data Integrity (`https://www.beamex.com/solutions/calibration-data-integrity/`): exactitud, consistencia, auditoria, firma electronica, integridad offline y riesgos de procesos manuales.
- Beamex Metrological Traceability (`https://blog.beamex.com/metrological-traceability-in-calibration-are-you-traceable`): cadena documentada, certificados, incertidumbre, procedimientos, competencia y vencimiento de trazabilidad.
- GAGEtrak Calibration Management Software (`https://gagetrak.com/calibration-management-software/`): trazabilidad, procedimientos, calendario flexible, reporting, auditorias y soporte IIoT/API.
- ISO/IEC 17025 (`https://www.iso.org/ISO-IEC-17025-testing-and-calibration-laboratories.html`): resultados validos, competencia, certificados/reportes confiables y enfoque de riesgo.
