export async function extractPdfText(arrayBuffer, pdfjsLib) {
    const uint8 = new Uint8Array(arrayBuffer);
    const doc = await pdfjsLib.getDocument({ data: uint8 }).promise;

    let fullText = "";
    for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const lines = [];
        let lastY = null;

        for (const item of content.items) {
            if (item.str) {
                const y = Math.round(item.transform[5]);
                if (lastY !== null && Math.abs(y - lastY) > 3) {
                    lines.push("\n");
                }
                lines.push(item.str);
                lastY = y;
            }
        }
        fullText += lines.join("") + "\n";
    }

    return fullText;
}

const SKIP_WORDS = [
    "EMPRESA", "ENERGÍA", "ENERGIA", "I.V.A", "RESPONSABLE",
    "MALABIA", "ROSARIO", "CONSUMIDOR", "FRANCISCO", "SANTA FE",
    "BOULEVAR", "CODIGO", "LINK PAGOS", "NUMERO", "NÚMERO",
    "FECHA", "CUIT", "PROPIETARIO", "DIRECCIÓN", "DIRECCION",
    "INFORMACION", "INFORMACIÓN", "MEDICION", "MEDICIÓN",
];

export function extractClientName(text) {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

    for (const line of lines.slice(0, 30)) {
        const cleaned = line.replace(/\s+/g, " ").replace(/Empresa Provincial.*/, "").trim();
        const words = cleaned.split(" ").filter(w => w.length > 0);

        if (
            words.length >= 2 &&
            words.length <= 5 &&
            cleaned.length >= 8 &&
            cleaned.length <= 50 &&
            cleaned === cleaned.toUpperCase() &&
            /^[A-ZÁÉÍÓÚÑÜ ]+$/.test(cleaned) &&
            !SKIP_WORDS.some(sw => cleaned.includes(sw))
        ) {
            return cleaned;
        }
    }

    return null;
}
