# Flujo Real de Calibracion de Balanzas Dinamicas

Este documento resume un flujo realista de calibracion de balanzas sobre cinta transportadora, basado en practica industrial y referencias tecnicas/regulatorias.

## Secuencia recomendada

1. `Preparacion del trabajo`
2. `Inspeccion previa`
3. `Cero`
4. `Verificacion de velocidad`
5. `Span con peso patron (cadena o peso de prueba)`
6. `Validacion con material real`
7. `Ajuste final`
8. `Reprueba / cierre`

## 1. Preparacion del trabajo

Objetivo: dejar identificado el equipo y el contexto del servicio.

Datos a capturar:
- planta
- linea
- cinta
- balanza
- controlador / integrador
- tipo de trabajo
  - puesta en marcha
  - rutina
  - post mantenimiento
  - post cambio de banda
  - troubleshooting
- producto transportado
- capacidad nominal
- velocidad nominal
- tecnico
- fecha y hora
- orden de trabajo

## 2. Inspeccion previa

Objetivo: no calibrar sobre un problema mecanico.

Chequeos tipicos:
- banda vacia y limpia
- sin acumulacion de material
- estado de la banda y empalme
- alineacion del tren de pesaje
- estado de rolos / rodamientos
- tracking y tension de la banda
- vibraciones estructurales
- estado del sensor de velocidad
- revision de parametros del integrador

Decision:
- si falla la inspeccion, la calibracion deberia bloquearse o quedar marcada como condicionada

## 3. Cero

Objetivo: fijar la referencia de banda vacia.

Buenas practicas:
- banda vacia
- velocidad normal de operacion
- tiempo suficiente o varias vueltas completas

Datos a capturar:
- banda vacia confirmada
- velocidad durante cero
- duracion o cantidad de vueltas
- cero inicial
- cero final
- deriva de cero
- cero ajustado si/no
- valor de cero final

## 4. Verificacion de velocidad

Objetivo: el error de velocidad impacta directo en el caudal/peso.

Metodos reales que encontramos:
- `automatica`
  - sensor de velocidad dedicado / rueda de velocidad
- `calculada`
  - largo de cinta y tiempo por vuelta completa
- `rpm`
  - diametro del rolo y rpm medidas

Datos a capturar:
- metodo usado
- velocidad fisica medida
- velocidad indicada por controlador
- error %
- observaciones

## 5. Span con peso patron

Objetivo: verificar la respuesta simulada del sistema antes del material real.

Puede hacerse con:
- cadena de calibracion
- pesas patron
- chequeo electronico

En tu metodologia, el foco es:
- `Span con peso patron (cadena)`

Datos a capturar:
- kg/m de cadena
- cantidad de pasadas
- promedio lectura controlador
- error promedio
- factor provisorio
- observaciones

Nota:
- en regulacion/metrologia, esto sirve como chequeo tecnico, pero el cierre real de exactitud sigue siendo el material real

## 6. Validacion con material real

Objetivo: esta es la referencia final del sistema completo.

En tu caso:
- se pesan paladas/cantidad fija de material
- se compara el peso real externo contra el totalizado de la balanza

Datos a capturar:
- peso real externo
- peso medido por balanza
- error %
- factor anterior
- factor sugerido

Formula confirmada:

```text
error % = (peso balanza - peso real) / peso real * 100
```

```text
factor nuevo = factor anterior x (peso externo / medido por balanza dinamica)
```

## 7. Ajuste final

Objetivo: dejar la balanza cerrada contra material real.

Datos a capturar:
- factor anterior
- factor final
- motivo del ajuste
- tecnico

Regla operativa tuya:
- si hay diferencia, manda el material real

## 8. Reprueba / cierre

Objetivo: confirmar que el ajuste dejo al equipo dentro de tolerancia.

Datos a capturar:
- error final
- estado
  - dentro de tolerancia
  - fuera de tolerancia
  - condicional
- observaciones finales
- aprobacion tecnica

## Criterios de aceptacion

Hay dos niveles:

### Regulatorio / custodia
- material test oficial
- varias corridas individuales
- tolerancias mas estrictas

### Operativo de planta
En tu caso actual:

```text
tolerancia = +/- 1%
```

Esto deberia seguir siendo configurable por balanza o por evento.

## Lo que la app deberia hacer

### Bloquear o advertir
- si no hay balanza seleccionada
- si la inspeccion previa falla
- si no hay velocidad verificada
- si falta material real para cierre final

### Calcular automaticamente
- velocidad por rpm
- velocidad por vuelta completa
- kg/m de cadena
- carga sobre tren
- caudal esperado
- error % de cadena
- error % de material real
- factor sugerido

### Guardar trazabilidad
- as-found
- as-left
- factor antes
- factor despues
- error antes
- error despues
- fecha, tecnico y equipo

## Como deberia ordenarse la app

### Flujo principal sugerido
1. `Balanzas`
2. `Herramientas`
3. `Nuevo evento`
4. `Historial`
5. `Sheets`

### Dentro de `Nuevo evento`
1. identificacion del evento
2. inspeccion previa
3. foto de parametros
4. verificacion de velocidad
5. span con peso patron
6. validacion con material real
7. ajuste final
8. cierre

## Puntos que todavia conviene confirmar con vos

1. si queres registrar formalmente la `inspeccion previa` como checklist
   confirmado: `si`
2. si el `cero` va a ser parte obligatoria de cada evento
   confirmado: `siempre`
3. si queres guardar `velocidad verificada` como parte fija del evento
4. si el `cierre` debe tener un campo formal de estado final
5. si queres registrar `as-found` y `as-left` en mas detalle
6. si queres que algunas etapas puedan marcarse como `omitidas` con motivo

## Referencias consultadas

- NISA - Belt Scales
- Cech Scale - Conveyor & Belt Scale Calibration and Verification
- Thermo Fisher - Belt Conveyor Scale Handbook
- Belt-Way manuals/resources
- QKE Global - calibration process for belt scales
- NIST Handbook 44 - belt-conveyor scale systems
