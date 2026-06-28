from __future__ import annotations

from pathlib import Path

import pandas as pd
from openpyxl import load_workbook
from openpyxl.styles import Font

from app.report_styles import HEADER, fill_for_metric


def write_excel(path: str | Path, sheets: dict[str, pd.DataFrame | list[str]]) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        for name, data in sheets.items():
            sheet_name = name[:31]
            if isinstance(data, list):
                df = pd.DataFrame({"Вывод": data})
            else:
                df = data
            df.to_excel(writer, sheet_name=sheet_name, index=False)
    style_workbook(path)
    return path


def style_workbook(path: str | Path) -> None:
    wb = load_workbook(path)
    for ws in wb.worksheets:
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = ws.dimensions
        for cell in ws[1]:
            cell.fill = HEADER
            cell.font = Font(bold=True)
        headers = [cell.value for cell in ws[1]]
        for idx, header in enumerate(headers, 1):
            max_len = len(str(header or ""))
            for row in ws.iter_rows(min_row=2, min_col=idx, max_col=idx):
                cell = row[0]
                if isinstance(cell.value, float) and str(header).endswith("%"):
                    cell.number_format = "0.00%"
                    fill = fill_for_metric(str(header), cell.value)
                    if fill:
                        cell.fill = fill
                if cell.value is not None:
                    max_len = min(max(max_len, len(str(cell.value))), 60)
            ws.column_dimensions[ws.cell(row=1, column=idx).column_letter].width = max_len + 2
    wb.save(path)
