import { parseCurrency } from './parse.js';
import { extractClientName } from './pdf.js';

function extractBasicInfo(text) {
    const clientName = extractClientName(text);
    const emissionMatch = text.match(/FECHA DE EMISION:\s*(\d{2}\/\d{2}\/\d{4})/);
    if (!clientName || !emissionMatch) return null;

    let periodMatch = text.match(/PERIODO\s*(\d+\/\d+)/);
    if (!periodMatch) {
        periodMatch = text.match(/R\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+\/\d+)/);
    }

    let daysMatch = text.match(/CANT\. DIAS\s*(\d+)/);
    if (!daysMatch) daysMatch = text.match(/D[ií]as:\s*(\d+)/);

    let consumptionMatch = text.match(/Consumo Total:\s*(\d+)\s*kWh/);
    if (!consumptionMatch) consumptionMatch = text.match(/CONSUMO.*?(\d+)\s*kWh/);

    return {
        clientName,
        emissionDate: emissionMatch[1],
        period: periodMatch ? periodMatch[1] : "",
        days: daysMatch ? parseInt(daysMatch[1]) : 0,
        consumptionKwh: consumptionMatch ? parseInt(consumptionMatch[1]) : 0,
    };
}

function extractTiers(text) {
    const tiers = [];
    const tierNames = ["Primeros", "Segundos", "Terceros", "Ultimos", "Últimos"];

    for (const tierName of tierNames) {
        let regex = new RegExp(
            `${tierName}\\s+(\\d+)\\s+KWh\\s+\\(\\s*([\\d.,]+)\\s+\\$/kWh\\)\\s+\\$\\*+([\\d.,]+)`,
            "i"
        );
        let match = text.match(regex);

        if (!match) {
            regex = new RegExp(
                `${tierName}\\s+(\\d+)\\s+kWh\\s+x\\s+\\$([\\d.,]+)\\s*=\\s+\\$([\\d.,]+)`,
                "i"
            );
            match = text.match(regex);
        }

        if (match) {
            tiers.push({
                tier: tierName === "Ultimos" || tierName === "Últimos" ? "Ultimos" : tierName,
                kwh: parseInt(match[1]),
                pricePerKwh: parseCurrency(match[2]),
                amount: parseCurrency(match[3]),
            });
        }
    }

    return tiers;
}

function extractCharges(text) {
    let cuotaMatch = text.match(/Cuota\s+de\s+servicio\s*:\s*\$\*+([\d.,]+)/i);
    if (!cuotaMatch) cuotaMatch = text.match(/Cuota\s+Servicio.*?\$([\d.,]+)/i);

    let importeMatch = text.match(/Importe Básico\s*:\s*\$\*+([\d.,]+)/i);
    if (!importeMatch) importeMatch = text.match(/IMPORTE BASICO.*?\$([\d.,]+)/i);

    return {
        cuotaServicioRate: cuotaMatch ? parseCurrency(cuotaMatch[1]) : 0,
        importeBasico: importeMatch ? parseCurrency(importeMatch[1]) : 0,
    };
}

function extractTaxes(text) {
    const taxes = {};
    const taxPatterns = [
        { key: "Ley 6604-FER", pattern: /Ley N°?6604-FER.*?\$\*+(\d[\d.,]*)/i },
        { key: "Ord. Mun. 1592/62", pattern: /Ord\. Mun\. N\.?°?\s*1592\/62.*?\$\*+(\d[\d.,]*)/i },
        { key: "Ord. Mun. 1618/62", pattern: /Ord\. Mun\. N\.?°?\s*1618\/62.*?\$\*+(\d[\d.,]*)/i },
        { key: "Ley 7797", pattern: /Ley N\.?°?\s*7797.*?\$\*+(\d[\d.,]*)/i },
        { key: "C.A.P.", pattern: /C\.A\.P\..*?\$\*+(\d[\d.,]*)/i },
        { key: "Energías Renovables", pattern: /Energías Renovables.*?\$\*+(\d[\d.,]*)/i },
        { key: "IVA 21%", pattern: /IVA.*?\$\*+(\d[\d.,]*)/i },
    ];

    for (const { key, pattern } of taxPatterns) {
        const match = text.match(pattern);
        if (match) taxes[key] = parseCurrency(match[1]);
    }

    return taxes;
}

function extractTotal(text) {
    let totalMatch = text.match(/TOTAL\s+\$\*+(\d[\d.,]*)/i);
    if (!totalMatch) totalMatch = text.match(/Importe Total.*?\$\*+(\d[\d.,]*)/i);
    if (!totalMatch) totalMatch = text.match(/TOTAL A PAGAR.*?\$([\d.,]+)/i);
    return totalMatch ? parseCurrency(totalMatch[1]) : 0;
}

export function extractBillData(text, filename) {
    const basic = extractBasicInfo(text);
    if (!basic) return null;

    const tiers = extractTiers(text);
    const charges = extractCharges(text);
    const taxes = extractTaxes(text);
    const total = extractTotal(text);

    let consumption = basic.consumptionKwh;
    if (consumption === 0 && tiers.length > 0) {
        consumption = tiers.reduce((sum, tier) => sum + tier.kwh, 0);
    }

    return {
        filename,
        clientName: basic.clientName,
        emissionDate: basic.emissionDate,
        period: basic.period,
        days: basic.days,
        consumptionKwh: consumption,
        cuotaServicioRate: charges.cuotaServicioRate,
        tiers,
        importeBasico: charges.importeBasico,
        taxes,
        total,
    };
}
