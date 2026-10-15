// Merilo vrta: ena celica mreže ≈ 10 cm (glej CLAUDE.md). Rastline so v sub-celicah (pol celice).
// Če se merilo spremeni, spremeni samo to konstanto.
export const CM_PER_CELL = 10;
export const CM_PER_SUBCELL = CM_PER_CELL / 2;

// "120 × 80 cm" ali "1,2 × 3 m" pri večjih merah
export function formatBedSize(widthCells: number, heightCells: number): string {
  const w = widthCells * CM_PER_CELL;
  const h = heightCells * CM_PER_CELL;
  if (w >= 100 && h >= 100) return `${fmtM(w)} × ${fmtM(h)} m`;
  return `${w} × ${h} cm`;
}

// Površina v m² (slovenska decimalna vejica)
export function formatArea(widthCells: number, heightCells: number): string {
  const m2 = (widthCells * CM_PER_CELL * heightCells * CM_PER_CELL) / 10000;
  return `${m2.toLocaleString("sl-SI", { maximumFractionDigits: 2 })} m²`;
}

function fmtM(cm: number) {
  return (cm / 100).toLocaleString("sl-SI", { maximumFractionDigits: 2 });
}
