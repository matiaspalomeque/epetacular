import { getLatestCpiKey } from './cpi.js';
import { sortByEmissionDate } from './parse.js';
import { extractPdfText } from './pdf.js';
import { extractBillData } from './extract.js';
import { initializeCharts } from './charts.js';

window.addEventListener('load', function() {
    initApp();
});

function initApp() {
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

        uploadedFiles = [...uploadedFiles, ...pdfFiles.map(file => ({ file, name: file.name }))];
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
                    <span class="remove" data-index="${index}" title="Eliminar">✕</span>
                </div>
            `;
        }).join('');
    }

    function removeFile(index) {
        uploadedFiles = [...uploadedFiles.slice(0, index), ...uploadedFiles.slice(index + 1)];
        updateFileList();
        if (uploadedFiles.length === 0) {
            hideStatus();
        }
    }

    function resetApp() {
        uploadedFiles = [];
        updateFileList();
        hideStatus();
        dashboardArea.classList.remove('visible');
        dashboardArea.innerHTML = '';
        uploadZone.classList.remove('processing');
        processBtn.disabled = false;
    }

    fileItems.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.remove');
        if (removeBtn) {
            const index = parseInt(removeBtn.dataset.index, 10);
            if (Number.isNaN(index)) return;
            removeFile(index);
        }
    });

    document.getElementById('selectFilesBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    document.getElementById('resetBtn').addEventListener('click', () => {
        resetApp();
    });

    dashboardArea.addEventListener('click', (e) => {
        if (e.target.id === 'resetFromDashboardBtn') resetApp();
    });

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

    processBtn.addEventListener('click', () => processFiles());

    async function processFiles() {
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

        function updateFileStatus(index, status, statusText) {
            uploadedFiles = uploadedFiles.map((f, idx) =>
                idx === index ? { ...f, status, statusText } : f
            );
            updateFileList();
        }

        for (let i = 0; i < uploadedFiles.length; i++) {
            const fileObj = uploadedFiles[i];
            updateFileStatus(i, 'processing', 'Procesando...');

            try {
                const arrayBuffer = await fileObj.file.arrayBuffer();
                const text = await extractPdfText(arrayBuffer, pdfjsLib);
                const billData = extractBillData(text, fileObj.name);

                if (billData.error) {
                    updateFileStatus(i, 'error', billData.error);
                    errorCount++;
                } else {
                    billsData.push(billData);
                    updateFileStatus(i, 'success', '✓ Procesado');
                    successCount++;
                }
            } catch (err) {
                console.error('Error processing PDF:', err);
                updateFileStatus(i, 'error', 'Error al leer');
                errorCount++;
            }
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

        const sortedBills = sortByEmissionDate(billsData);
        renderDashboard(sortedBills);
    }

    function renderDashboard(billsData) {
        const latestCpiKey = getLatestCpiKey();
        const [latestMonth, latestYear] = latestCpiKey.split("/");
        const monthNames = {
            "01": "enero", "02": "febrero", "03": "marzo", "04": "abril",
            "05": "mayo", "06": "junio", "07": "julio", "08": "agosto",
            "09": "septiembre", "10": "octubre", "11": "noviembre", "12": "diciembre",
        };
        const latestMonthLabel = `${monthNames[latestMonth]} ${latestYear}`;

        const latestCpiDate = new Date(parseInt(latestYear, 10), parseInt(latestMonth, 10) - 1);
        const now = new Date();
        const monthsStale = (now.getFullYear() - latestCpiDate.getFullYear()) * 12
            + (now.getMonth() - latestCpiDate.getMonth());
        const cpiStaleWarning = monthsStale > 3
            ? `<p class="cpi-stale-warning">Los datos de IPC tienen ${monthsStale} meses de atraso (último dato: ${latestMonthLabel}). El ajuste por inflación puede no ser preciso.</p>`
            : '';

        const lastBill = billsData[billsData.length - 1];
        const totalConsumption = billsData.reduce((sum, b) => sum + b.consumptionKwh, 0);
        const avgConsumption = totalConsumption / billsData.length;
        const totalBilled = billsData.reduce((sum, b) => sum + b.total, 0);

        const dashboardHTML = `
            <header>
                <img src="logo.png" alt="EPEtacular - Analizador de facturas de la EPE" class="header-logo">
                <h1>Dashboard de Facturación Eléctrica</h1>
                <p class="subtitle">Empresa Provincial de la Energía - Santa Fe</p>
                <p class="note">Generado el ${now.toLocaleDateString('es-AR')}</p>
                <div class="inflation-toggle">
                    <input type="checkbox" id="inflationToggle">
                    <label for="inflationToggle" id="inflationLabel">Valores nominales</label>
                    <a href="#" id="inflationInfoLink" class="inflation-info-link" title="¿Qué significa esto?">ⓘ ¿Qué es esto?</a>
                </div>
                ${cpiStaleWarning}
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
                <p style="margin-top: 10px;"><button class="btn" id="resetFromDashboardBtn">Procesar Más Facturas</button></p>
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
