import { utils, writeFile } from 'xlsx';

export function writeExcelFile(rows: Record<string, unknown>[], sheetName: string, fileName: string) {
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.json_to_sheet(rows), sheetName);
  writeFile(workbook, fileName);
}
