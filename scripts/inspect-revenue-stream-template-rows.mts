import ExcelJS from "exceljs";

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile("templates/revenue-stream-template.xlsx");
const ws = wb.getWorksheet("Sheet1");
if (!ws) throw new Error("Sheet1 not found");
for (let r = 1; r <= 120; r++) {
  const row = ws.getRow(r);
  const label = row.getCell(2).value ?? row.getCell(3).value ?? row.getCell(1).value ?? "";
  console.log(r, JSON.stringify(label));
}

console.log("\n--- rows 93-95, columns D/E/F ---");
for (const r of [78, 79, 80, 93, 94, 95, 96, 97, 98]) {
  for (const col of ["D", "E", "F"]) {
    const cell = ws.getCell(col + r);
    console.log(col + r, JSON.stringify(cell.value), cell.numFmt);
  }
}
