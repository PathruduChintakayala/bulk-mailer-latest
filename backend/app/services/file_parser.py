import csv
import io
from typing import AsyncGenerator
from openpyxl import load_workbook
from email_validator import validate_email, EmailNotValidError


def parse_csv_headers(file_content: bytes) -> list[str]:
    """Extract column headers from CSV content."""
    text = file_content.decode("utf-8-sig")
    reader = csv.reader(io.StringIO(text))
    headers = next(reader)
    return [h.strip() for h in headers]


def parse_excel_headers(file_content: bytes) -> list[str]:
    """Extract column headers from Excel content."""
    wb = load_workbook(filename=io.BytesIO(file_content), read_only=True)
    ws = wb.active
    headers = []
    for cell in next(ws.iter_rows(min_row=1, max_row=1, values_only=True)):
        headers.append(str(cell).strip() if cell else "")
    wb.close()
    return headers


def parse_csv_rows(file_content: bytes, batch_size: int = 500) -> AsyncGenerator[list[dict], None]:
    """Parse CSV rows in batches. Returns generator of row dicts."""
    text = file_content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    batch = []
    for row in reader:
        batch.append(row)
        if len(batch) >= batch_size:
            yield batch
            batch = []
    if batch:
        yield batch


def parse_excel_rows(file_content: bytes, batch_size: int = 500) -> AsyncGenerator[list[dict], None]:
    """Parse Excel rows in batches. Returns generator of row dicts."""
    wb = load_workbook(filename=io.BytesIO(file_content), read_only=True)
    ws = wb.active

    # Get headers from first row
    headers = []
    for row in ws.iter_rows(min_row=1, max_row=1, values_only=True):
        headers = [str(cell).strip() if cell else f"col_{i}" for i, cell in enumerate(row)]
        break

    batch = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        row_dict = {}
        for i, value in enumerate(row):
            if i < len(headers):
                row_dict[headers[i]] = str(value) if value is not None else ""
        batch.append(row_dict)
        if len(batch) >= batch_size:
            yield batch
            batch = []

    if batch:
        yield batch
    wb.close()


def validate_email_address(email: str) -> bool:
    """Validate an email address format."""
    try:
        validate_email(email, check_deliverability=False)
        return True
    except EmailNotValidError:
        return False


def count_rows(file_content: bytes, file_type: str) -> int:
    """Count total data rows in the file."""
    if file_type == "csv":
        text = file_content.decode("utf-8-sig")
        return sum(1 for _ in csv.reader(io.StringIO(text))) - 1  # minus header
    else:
        wb = load_workbook(filename=io.BytesIO(file_content), read_only=True)
        ws = wb.active
        count = ws.max_row - 1 if ws.max_row else 0
        wb.close()
        return count
