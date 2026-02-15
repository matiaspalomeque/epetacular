import { CPI_INDEX, getLatestCpiKey } from './cpi.js';

export function initializeCharts(billsData, latestMonthLabel) {
    const chartBills = billsData.filter(b => b.consumptionKwh > 0);
    const periods = chartBills.map(b => b.period);

    const latestCpiKey = getLatestCpiKey();
    const cpiLatest = CPI_INDEX[latestCpiKey];

    function getCpiForBill(emissionDate) {
        const parts = emissionDate.split('/');
        const key = parts[1] + '/' + parts[2];
        return CPI_INDEX[key] || null;
    }

    function adjustValue(nominal, emissionDate) {
        const cpiBill = getCpiForBill(emissionDate);
        if (!cpiBill || !cpiLatest) return nominal;
        return nominal * (cpiLatest / cpiBill);
    }

    let inflationEnabled = false;

    function getValue(nominal, emissionDate) {
        return inflationEnabled ? adjustValue(nominal, emissionDate) : nominal;
    }

    function formatCurrency(value) {
        return '$' + formatNumber(value);
    }

    function formatNumber(value) {
        return value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    const tooltipBase = {
        backgroundColor: 'rgba(0, 55, 110, 0.95)',
        titleColor: '#ffffff',
        bodyColor: '#ffffff',
        borderColor: 'rgba(0, 55, 110, 0.3)',
        borderWidth: 1,
        padding: 12
    };

    const scaleDefaults = {
        y: {
            beginAtZero: true,
            ticks: { color: '#63666a' },
            grid: { color: 'rgba(0, 55, 110, 0.1)' }
        },
        x: {
            ticks: { color: '#63666a' },
            grid: { display: false }
        }
    };

    function makeOptions(tooltipFormatter, overrides) {
        const opts = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    ...tooltipBase,
                    callbacks: { label: tooltipFormatter }
                }
            },
            scales: { ...scaleDefaults },
            interaction: { intersect: false, mode: 'index' }
        };
        if (overrides) {
            if (overrides.legend) opts.plugins.legend = overrides.legend;
            if (overrides.filler) opts.plugins.filler = overrides.filler;
            if (overrides.scales) opts.scales = { ...opts.scales, ...overrides.scales };
        }
        return opts;
    }

    Chart.defaults.color = '#63666a';
    Chart.defaults.borderColor = 'rgba(0, 55, 110, 0.1)';
    Chart.defaults.font.family = "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto";

    function computeData() {
        const consumption = chartBills.map(b => b.consumptionKwh);
        const totals = chartBills.map(b => getValue(b.total, b.emissionDate));
        const importeBasico = chartBills.map(b => getValue(b.importeBasico, b.emissionDate));
        const consumoDiario = chartBills.map(b => (
            b.days > 0 ? +(b.consumptionKwh / b.days).toFixed(2) : 0
        ));
        const costoxkwh = chartBills.map(b => +(getValue(b.total, b.emissionDate) / b.consumptionKwh).toFixed(2));

        const taxKeys = ['IVA 21%', 'C.A.P.', 'Ley 7797', 'Ord. Mun. 1618/62', 'Ord. Mun. 1592/62', 'Ley 6604-FER', 'Energías Renovables'];
        const taxDataByKey = {};
        taxKeys.forEach(key => {
            taxDataByKey[key] = chartBills.map(b => getValue(b.taxes[key] || 0, b.emissionDate));
        });
        const totalTaxes = chartBills.map(b => {
            return Object.values(b.taxes).reduce((a, v) => a + getValue(v, b.emissionDate), 0);
        });

        function getTierPrices(tierName) {
            return chartBills.map(b => {
                const tier = b.tiers.find(t => t.tier === tierName);
                if (!tier) return null;
                return inflationEnabled ? +(getValue(tier.pricePerKwh, b.emissionDate)).toFixed(5) : tier.pricePerKwh;
            });
        }

        return {
            consumption, totals, importeBasico, consumoDiario, costoxkwh,
            taxKeys, taxDataByKey, totalTaxes,
            pricesPrimeros: getTierPrices('Primeros'),
            pricesSegundos: getTierPrices('Segundos'),
            pricesTerceros: getTierPrices('Terceros'),
            pricesUltimos: getTierPrices('Ultimos'),
        };
    }

    let chartData = computeData();

    const consumoChart = new Chart(document.getElementById('consumoChart'), {
        type: 'bar',
        data: {
            labels: periods,
            datasets: [{
                label: 'Consumo (kWh)',
                data: chartData.consumption,
                backgroundColor: (ctx) => {
                    const bimester = parseInt(periods[ctx.dataIndex].split('/')[0]);
                    return bimester <= 2 || bimester === 6 ? 'rgba(0, 99, 151, 0.8)' : 'rgba(0, 55, 110, 0.8)';
                },
                borderColor: 'rgba(0, 55, 110, 1)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: makeOptions(ctx => formatNumber(ctx.parsed.y) + ' kWh')
    });

    const facturaChart = new Chart(document.getElementById('facturaChart'), {
        type: 'line',
        data: {
            labels: periods,
            datasets: [{
                label: 'Total Facturado ($)',
                data: chartData.totals,
                borderColor: '#00376e',
                backgroundColor: 'rgba(0, 55, 110, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.3,
                pointRadius: 5,
                pointBackgroundColor: '#00376e',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: makeOptions(ctx => formatCurrency(ctx.parsed.y))
    });

    const costoxkwhChart = new Chart(document.getElementById('costoxkwhChart'), {
        type: 'line',
        data: {
            labels: periods,
            datasets: [{
                label: 'Costo por kWh ($/kWh)',
                data: chartData.costoxkwh,
                borderColor: '#14b8a6',
                backgroundColor: 'rgba(20, 184, 166, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.3,
                pointRadius: 5,
                pointBackgroundColor: '#14b8a6',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: makeOptions(ctx => '$' + formatNumber(ctx.parsed.y) + '/kWh')
    });

    const consumoDiarioChart = new Chart(document.getElementById('consumoDiarioChart'), {
        type: 'bar',
        data: {
            labels: periods,
            datasets: [{
                label: 'Consumo Diario Promedio (kWh/día)',
                data: chartData.consumoDiario,
                backgroundColor: 'rgba(0, 99, 151, 0.8)',
                borderColor: 'rgba(0, 55, 110, 1)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: makeOptions(ctx => formatNumber(ctx.parsed.y) + ' kWh/día')
    });

    const tierColors = ['#00376e', '#006397', '#88c5e5', '#63666a'];
    const tarifasChart = new Chart(document.getElementById('tarifasChart'), {
        type: 'line',
        data: {
            labels: periods,
            datasets: [
                { label: 'Primeros ($/kWh)', data: chartData.pricesPrimeros, borderColor: tierColors[0], backgroundColor: 'rgba(59, 130, 246, 0.05)', borderWidth: 2, tension: 0.3, pointRadius: 3, pointBackgroundColor: tierColors[0] },
                { label: 'Segundos ($/kWh)', data: chartData.pricesSegundos, borderColor: tierColors[1], backgroundColor: 'rgba(0, 99, 151, 0.05)', borderWidth: 2, tension: 0.3, pointRadius: 3, pointBackgroundColor: tierColors[1] },
                { label: 'Terceros ($/kWh)', data: chartData.pricesTerceros, borderColor: tierColors[2], backgroundColor: 'rgba(136, 197, 229, 0.05)', borderWidth: 2, tension: 0.3, pointRadius: 3, pointBackgroundColor: tierColors[2] },
                { label: 'Últimos ($/kWh)', data: chartData.pricesUltimos, borderColor: tierColors[3], backgroundColor: 'rgba(99, 102, 106, 0.05)', borderWidth: 2, tension: 0.3, pointRadius: 3, pointBackgroundColor: tierColors[3] },
            ]
        },
        options: makeOptions(
            ctx => ctx.dataset.label + ': $' + formatNumber(ctx.parsed.y),
            { legend: { labels: { color: '#63666a', padding: 15 }, position: 'top' } }
        )
    });

    const composicionChart = new Chart(document.getElementById('composicionChart'), {
        type: 'bar',
        data: {
            labels: periods,
            datasets: [
                { label: 'Importe Básico ($)', data: chartData.importeBasico, backgroundColor: 'rgba(0, 55, 110, 0.8)', borderRadius: 4 },
                { label: 'Total Impuestos ($)', data: chartData.totalTaxes, backgroundColor: 'rgba(0, 99, 151, 0.8)', borderRadius: 4 },
            ]
        },
        options: makeOptions(
            ctx => ctx.dataset.label + ': ' + formatCurrency(ctx.parsed.y),
            {
                legend: { labels: { color: '#63666a', padding: 15 } },
                scales: {
                    x: { stacked: true, ticks: { color: '#63666a' }, grid: { display: false } },
                    y: { stacked: true, beginAtZero: true, ticks: { color: '#63666a' }, grid: { color: 'rgba(0, 55, 110, 0.1)' } },
                }
            }
        )
    });

    const taxColors = ['#00376e', '#006397', '#88c5e5', '#63666a', '#004d7a', '#005a8c', '#4a90a4'];
    const impuestosChart = new Chart(document.getElementById('impuestosChart'), {
        type: 'line',
        data: {
            labels: periods,
            datasets: chartData.taxKeys.map((key, idx) => ({
                label: key,
                data: chartData.taxDataByKey[key],
                backgroundColor: taxColors[idx],
                borderColor: taxColors[idx],
                fill: true,
                tension: 0.3,
                pointRadius: 2,
                pointBackgroundColor: taxColors[idx]
            }))
        },
        options: makeOptions(
            ctx => ctx.dataset.label + ': ' + formatCurrency(ctx.parsed.y),
            {
                filler: { propagate: true },
                legend: { labels: { color: '#63666a', padding: 15 }, position: 'top' },
                scales: {
                    x: { stacked: true, ticks: { color: '#63666a' }, grid: { display: false } },
                    y: { stacked: true, beginAtZero: true, ticks: { color: '#63666a' }, grid: { color: 'rgba(0, 55, 110, 0.1)' } },
                }
            }
        )
    });

    function updateKPIs() {
        const kpiBills = chartBills.length > 0 ? chartBills : billsData;
        const lastBill = kpiBills[kpiBills.length - 1];
        if (!lastBill) {
            return;
        }
        const lastTotal = getValue(lastBill.total, lastBill.emissionDate);
        const totalBilled = kpiBills.reduce((sum, bill) => sum + getValue(bill.total, bill.emissionDate), 0);
        document.getElementById('kpi-last-total').textContent = formatCurrency(lastTotal);
        document.getElementById('kpi-total-billed').textContent = formatCurrency(totalBilled);
    }

    function refreshCharts() {
        chartData = computeData();

        facturaChart.data.datasets[0].data = chartData.totals;
        costoxkwhChart.data.datasets[0].data = chartData.costoxkwh;
        tarifasChart.data.datasets[0].data = chartData.pricesPrimeros;
        tarifasChart.data.datasets[1].data = chartData.pricesSegundos;
        tarifasChart.data.datasets[2].data = chartData.pricesTerceros;
        tarifasChart.data.datasets[3].data = chartData.pricesUltimos;
        composicionChart.data.datasets[0].data = chartData.importeBasico;
        composicionChart.data.datasets[1].data = chartData.totalTaxes;
        chartData.taxKeys.forEach((key, idx) => {
            impuestosChart.data.datasets[idx].data = chartData.taxDataByKey[key];
        });

        facturaChart.update();
        costoxkwhChart.update();
        tarifasChart.update();
        composicionChart.update();
        impuestosChart.update();
        updateKPIs();
    }

    document.getElementById('inflationToggle').addEventListener('change', function() {
        inflationEnabled = this.checked;
        document.getElementById('inflationLabel').textContent = inflationEnabled
            ? `Ajustado por inflación (pesos de ${latestMonthLabel})`
            : 'Valores nominales';
        refreshCharts();
    });

    // --- Modal: ¿Qué es el ajuste por inflación? ---
    const modalHTML = `
        <div id="inflationModal" class="modal-overlay">
            <div class="modal-content">
                <button class="modal-close" id="modalClose" aria-label="Cerrar">&times;</button>
                <h2>¿Qué es el ajuste por inflación?</h2>

                <p>Cuando mirás tus facturas de luz a lo largo del tiempo, los montos en pesos no son directamente comparables entre sí. Una factura de $50.000 de hace un año no representa lo mismo que $50.000 hoy, porque los precios en general subieron.</p>

                <p>El <strong>ajuste por inflación</strong> corrige esto: convierte todos los importes a <strong>pesos de hoy</strong>, para que puedas comparar cuánto pagaste realmente en cada período.</p>

                <h3>¿Cómo funciona?</h3>
                <p>Usamos el <strong>IPC</strong> (Índice de Precios al Consumidor), un indicador oficial publicado por el INDEC que mide cuánto suben los precios mes a mes en Argentina.</p>

                <p>La fórmula es sencilla:</p>
                <div class="modal-formula">
                    Valor ajustado = Valor original × (IPC de hoy ÷ IPC del mes de la factura)
                </div>

                <h3>Ejemplo</h3>
                <p>Si una factura de <strong>enero 2024</strong> fue de <strong>$50.000</strong>, y desde entonces los precios subieron un 144%, el valor ajustado sería:</p>
                <div class="modal-formula">
                    $50.000 × 2.44 = <strong>$122.157</strong>
                </div>
                <p>Esto significa que esos $50.000 de enero 2024 equivalen a unos $122.157 en pesos actuales.</p>

                <h3>¿Qué se ajusta y qué no?</h3>
                <ul>
                    <li><strong>Se ajustan</strong> todos los valores en pesos: total facturado, costo por kWh, precios por escalón e impuestos.</li>
                    <li><strong>No se ajusta</strong> el consumo en kWh, porque es una medida física (la electricidad que usaste) y no cambia con la inflación.</li>
                </ul>

                <h3>¿Para qué sirve?</h3>
                <p>Con el ajuste activado podés responder preguntas como:</p>
                <ul>
                    <li>¿Estoy pagando más o menos por la luz que hace un año, <em>en términos reales</em>?</li>
                    <li>¿El costo por kWh subió más o menos que la inflación general?</li>
                    <li>¿Cuál fue el bimestre que más pagué, descontando la inflación?</li>
                </ul>

                <div class="modal-source">
                    <strong>Fuente de datos:</strong> IPC Nivel General Nacional, INDEC
                    (<a href="https://datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26" target="_blank" rel="noopener">datos.gob.ar</a>).
                    Datos disponibles desde enero 2021 hasta ${latestMonthLabel}.
                </div>
            </div>
        </div>
    `;
    document.getElementById('dashboardArea').insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById('inflationModal');
    document.getElementById('inflationInfoLink').addEventListener('click', function(e) {
        e.preventDefault();
        modal.classList.add('visible');
    });
    document.getElementById('modalClose').addEventListener('click', function() {
        modal.classList.remove('visible');
    });
    modal.addEventListener('click', function(e) {
        if (e.target === modal) modal.classList.remove('visible');
    });

    updateKPIs();
}
