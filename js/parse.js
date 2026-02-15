export function parseCurrency(str) {
    return parseFloat(str.replace(/\$/g, "").replace(/\*/g, "").replace(/\./g, "").replace(",", "."));
}

export function titleCase(name) {
    return name.toLowerCase().split(" ")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

export function sortByEmissionDate(bills) {
    return bills.sort((a, b) => {
        const dateA = a.emissionDate.split("/").reverse().join("");
        const dateB = b.emissionDate.split("/").reverse().join("");
        return dateA.localeCompare(dateB);
    });
}
