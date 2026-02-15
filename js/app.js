import { getLatestCpiKey } from './cpi.js';
import { sortByEmissionDate } from './parse.js';
import { extractPdfText } from './pdf.js';
import { extractBillData } from './extract.js';
import { initializeCharts } from './charts.js';

window.addEventListener('load', function() {
    initApp();
});

function initApp() {
    console.log('Checking PDF.js availability...', typeof window.pdfjsLib);

    const pdfjsLib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];

    if (!pdfjsLib) {
        document.getElementById('status').textContent = 'Error: PDF.js no se cargó correctamente. Por favor, recarga la página.';
        document.getElementById('status').className = 'error';
        console.error('PDF.js not found. Window keys:', Object.keys(window).filter(k => k.toLowerCase().includes('pdf')));
        return;
    }

    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    let uploadedFiles = [];
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    const processBtn = document.getElementById('processBtn');
    const statusEl = document.getElementById('status');
    const fileList = document.getElementById('fileList');
    const fileItems = document.getElementById('fileItems');
    const fileCount = document.getElementById('fileCount');
    const dashboardArea = document.getElementById('dashboardArea');

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function showStatus(message, type = 'info') {
        statusEl.textContent = message;
        statusEl.className = type;
    }

    function hideStatus() {
        statusEl.className = '';
        statusEl.textContent = '';
    }

    function addFiles(files) {
        if (files.length === 0) {
            return;
        }
        const pdfFiles = files.filter(file => file.name.toLowerCase().endsWith('.pdf'));
        if (pdfFiles.length === 0) {
            showStatus('Por favor, selecciona archivos PDF solamente.', 'error');
            return;
        }

        uploadedFiles.push(...pdfFiles.map(file => ({ file, name: file.name })));
        updateFileList();

        const ignoredCount = files.length - pdfFiles.length;
        const ignoredMessage = ignoredCount > 0 ? ` Se omitieron ${ignoredCount} archivo(s) no PDF.` : '';
        showStatus(
            `${pdfFiles.length} archivo(s) cargado(s). Haz clic en "Generar Dashboard" para procesar.${ignoredMessage}`,
            ignoredCount > 0 ? 'info' : 'success'
        );
    }

    function updateFileList() {
        if (uploadedFiles.length === 0) {
            fileList.classList.remove('visible');
            return;
        }

        fileList.classList.add('visible');
        fileCount.textContent = String(uploadedFiles.length);

        fileItems.innerHTML = uploadedFiles.map((file, index) => {
            const statusClass = ['pending', 'processing', 'success', 'error'].includes(file.status)
                ? file.status
                : 'pending';
            const fileName = escapeHtml(file.name);
            const statusText = escapeHtml(file.statusText || 'Pendiente');

            return `
                <div class="file-item">
                    <span class="name">${fileName}</span>
                    <span class="status ${statusClass}">${statusText}</span>
                    <span class="remove" onclick="window.removeFile(${index})" title="Eliminar">✕</span>
                </div>
            `;
        }).join('');
    }

    window.removeFile = function(index) {
        uploadedFiles.splice(index, 1);
        updateFileList();
        if (uploadedFiles.length === 0) {
            hideStatus();
        }
    };

    window.resetApp = function() {
        uploadedFiles = [];
        updateFileList();
        hideStatus();
        dashboardArea.classList.remove('visible');
        dashboardArea.innerHTML = '';
        uploadZone.classList.remove('processing');
        processBtn.disabled = false;
    };

    uploadZone.addEventListener('click', (e) => {
        if (uploadZone.classList.contains('processing')) {
            return;
        }
        if (e.target instanceof Element && e.target.closest('button')) {
            return;
        }
        fileInput.click();
    });

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        addFiles(Array.from(e.dataTransfer.files));
    });

    fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files || []);
        addFiles(files);
        fileInput.value = '';
    });

    window.processFiles = async function() {
        if (uploadedFiles.length === 0) {
            showStatus('No hay archivos para procesar.', 'error');
            return;
        }

        uploadZone.classList.add('processing');
        processBtn.disabled = true;
        showStatus('Procesando archivos...', 'info');

        const billsData = [];
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < uploadedFiles.length; i++) {
            const fileObj = uploadedFiles[i];
            fileObj.status = 'processing';
            fileObj.statusText = 'Procesando...';
            updateFileList();

            try {
                const arrayBuffer = await fileObj.file.arrayBuffer();
                const text = await extractPdfText(arrayBuffer, pdfjsLib);
                const billData = extractBillData(text, fileObj.name);

                if (!billData) {
                    fileObj.status = 'error';
                    fileObj.statusText = 'No se pudo extraer datos';
                    errorCount++;
                } else {
                    billsData.push(billData);
                    fileObj.status = 'success';
                    fileObj.statusText = '✓ Procesado';
                    successCount++;
                }
            } catch (err) {
                console.error('Error processing PDF:', err);
                fileObj.status = 'error';
                fileObj.statusText = 'Error al leer';
                errorCount++;
            }

            updateFileList();
        }

        uploadZone.classList.remove('processing');
        processBtn.disabled = false;

        if (billsData.length === 0) {
            showStatus('No se pudo procesar ninguna factura. Verifica que sean facturas EPE válidas.', 'error');
            return;
        }

        showStatus(
            `✓ ${successCount} facturas procesadas exitosamente${errorCount > 0 ? `, ${errorCount} error(es)` : ''}. Generando dashboard...`,
            'success'
        );

        sortByEmissionDate(billsData);
        renderDashboard(billsData);
    };

    function renderDashboard(billsData) {
        const latestCpiKey = getLatestCpiKey();
        const [latestMonth, latestYear] = latestCpiKey.split("/");
        const monthNames = {
            "01": "enero", "02": "febrero", "03": "marzo", "04": "abril",
            "05": "mayo", "06": "junio", "07": "julio", "08": "agosto",
            "09": "septiembre", "10": "octubre", "11": "noviembre", "12": "diciembre",
        };
        const latestMonthLabel = `${monthNames[latestMonth]} ${latestYear}`;

        const lastBill = billsData[billsData.length - 1];
        const totalConsumption = billsData.reduce((sum, b) => sum + b.consumptionKwh, 0);
        const avgConsumption = totalConsumption / billsData.length;
        const totalBilled = billsData.reduce((sum, b) => sum + b.total, 0);

        const dashboardHTML = `
            <header>
                <img src="logo.png" alt="EPEtacular - Analizador de facturas de la EPE" class="header-logo">
                <h1>Dashboard de Facturación Eléctrica</h1>
                <p class="subtitle">Empresa Provincial de la Energía - Santa Fe</p>
                <p class="note">Generado el ${new Date().toLocaleDateString('es-AR')}</p>
                <div class="inflation-toggle">
                    <input type="checkbox" id="inflationToggle">
                    <label for="inflationToggle" id="inflationLabel">Valores nominales</label>
                    <a href="#" id="inflationInfoLink" class="inflation-info-link" title="¿Qué significa esto?">ⓘ ¿Qué es esto?</a>
                </div>
            </header>

            <div class="kpi-grid">
                <div class="kpi-card">
                    <div class="kpi-label">Última Factura Total</div>
                    <div class="kpi-value" id="kpi-last-total">$${lastBill.total.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div class="kpi-subtext">Período ${lastBill.period}</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Total Facturado</div>
                    <div class="kpi-value" id="kpi-total-billed">$${totalBilled.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div class="kpi-subtext">Todos los períodos</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Consumo Promedio</div>
                    <div class="kpi-value">${avgConsumption.toFixed(1)} kWh</div>
                    <div class="kpi-subtext">Por bimestre</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Consumo Total</div>
                    <div class="kpi-value">${totalConsumption.toFixed(1)} kWh</div>
                    <div class="kpi-subtext">Todos los períodos</div>
                </div>
            </div>

            <div class="charts-grid">
                <div class="chart-container">
                    <h3><span class="gradient-icon"></span>Consumo (kWh) por Bimestre</h3>
                    <div class="chart-inner"><canvas id="consumoChart"></canvas></div>
                </div>
                <div class="chart-container">
                    <h3><span class="gradient-icon"></span>Total Facturado ($) por Bimestre</h3>
                    <div class="chart-inner"><canvas id="facturaChart"></canvas></div>
                </div>
                <div class="chart-container">
                    <h3><span class="gradient-icon"></span>Costo por kWh ($/kWh)</h3>
                    <div class="chart-inner"><canvas id="costoxkwhChart"></canvas></div>
                </div>
                <div class="chart-container">
                    <h3><span class="gradient-icon"></span>Consumo Diario Promedio (kWh/día)</h3>
                    <div class="chart-inner"><canvas id="consumoDiarioChart"></canvas></div>
                </div>
                <div class="chart-container full-width">
                    <h3><span class="gradient-icon"></span>Evolución de Tarifas por Tramo ($/kWh)</h3>
                    <div class="chart-inner" style="height: 300px;"><canvas id="tarifasChart"></canvas></div>
                </div>
                <div class="chart-container full-width">
                    <h3><span class="gradient-icon"></span>Composición de la Factura: Importe Básico vs Impuestos</h3>
                    <div class="chart-inner"><canvas id="composicionChart"></canvas></div>
                </div>
                <div class="chart-container full-width">
                    <h3><span class="gradient-icon"></span>Desglose de Impuestos por Período</h3>
                    <div class="chart-inner"><canvas id="impuestosChart"></canvas></div>
                </div>
            </div>

            <footer>
                <p><strong>Nota:</strong> Dashboard generado desde ${billsData.length} facturas de la EPE.</p>
                <p style="margin-top: 15px;">Análisis realizado completamente en tu navegador - tus datos nunca salen de tu dispositivo</p>
                <p style="margin-top: 10px;"><button class="btn" onclick="window.resetApp()">Procesar Más Facturas</button></p>
            </footer>
        `;

        dashboardArea.innerHTML = dashboardHTML;
        dashboardArea.classList.add('visible');

        initializeCharts(billsData, latestMonthLabel);

        setTimeout(() => {
            dashboardArea.scrollIntoView({ behavior: 'smooth' });
        }, 300);
    }
}
