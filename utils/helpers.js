export const truncateDefinition = (def) => {
    if (!def) return '';
    const separators = ['，', '。', ','];
    let minIndex = def.length;
    separators.forEach(sep => {
        const idx = def.indexOf(sep);
        if (idx !== -1 && idx < minIndex) {
            minIndex = idx;
        }
    });
    return def.substring(0, minIndex);
};
