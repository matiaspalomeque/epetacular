# EPEtacular

**Analizador de facturas de luz de la EPE (Empresa Provincial de la Energía de Santa Fe)**

https://matiaspalomeque.github.io/epetacular/

---

## ¿Qué es?

EPEtacular es una herramienta web que te permite analizar tus facturas de luz de la EPE de manera visual e interactiva. Subís tus PDFs y obtenés un dashboard con gráficos de consumo, costos e impuestos a lo largo del tiempo.

**Todo el procesamiento ocurre en tu navegador. Tus facturas nunca salen de tu dispositivo.**

## ¿Cómo se usa?

1. Ingresá a [matiaspalomeque.github.io/epetacular](https://matiaspalomeque.github.io/epetacular/)
2. Arrastrá o seleccioná tus facturas en PDF de la EPE
3. Hacé clic en **"Generar Dashboard"**
4. Explorá los gráficos

## ¿Qué muestra el dashboard?

- Consumo en kWh por bimestre
- Total facturado por bimestre
- Costo por kWh
- Consumo diario promedio
- Evolución de tarifas por tramo (Primeros, Segundos, Terceros, Últimos kWh)
- Composición de la factura: importe básico vs impuestos
- Desglose de impuestos (IVA, C.A.P., Ley 7797, etc.)

## Ajuste por inflación

El dashboard incluye un toggle para ver los valores **ajustados por inflación** usando el IPC (Índice de Precios al Consumidor) del INDEC. Esto permite comparar cuánto pagaste realmente en cada período, en pesos de hoy.

## Tecnologías

- HTML, CSS y JavaScript vanilla (sin frameworks)
- [PDF.js](https://mozilla.github.io/pdf.js/) para leer los PDFs
- [Chart.js](https://www.chartjs.org/) para los gráficos
- IPC del INDEC vía [datos.gob.ar](https://datos.gob.ar)
