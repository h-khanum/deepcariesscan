"""
DeepCariesScan — PDF report generation (fpdf2).

Builds a clean, printable analysis report for a saved scan: clinic header,
patient details, findings table, clinician notes, and the standard
"diagnostic aid" disclaimer. Returns the PDF as bytes.
"""

import base64
import io
from datetime import datetime

from fpdf import FPDF

SEVERITY_LABEL = {"e": "Enamel", "d1": "Dentin 1", "d2": "Dentin 2", "d3": "Dentin 3", "p": "Pulp"}
SEVERITY_RGB = {
    "e":  (56, 189, 172),
    "d1": (245, 185, 66),
    "d2": (240, 140, 60),
    "d3": (226, 88, 66),
    "p":  (190, 40, 60),
}
TEAL = (23, 122, 118)
INK = (15, 23, 42)
MUTED = (100, 116, 139)


def _decode_image(data_url):
    """Return raw image bytes from a data URL, or None."""
    try:
        if data_url and data_url.startswith("data:image"):
            return base64.b64decode(data_url.split(",", 1)[1])
    except Exception:
        pass
    return None


def build_report(scan, patient, lesions, clinic):
    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()

    # ---- Clinic header -----------------------------------------------------
    pdf.set_text_color(*TEAL)
    pdf.set_font("Helvetica", "B", 18)
    pdf.cell(0, 9, "DeepCariesScan - AI Analysis Report", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*MUTED)
    pdf.cell(0, 5, clinic.get("name", ""), new_x="LMARGIN", new_y="NEXT")
    line2 = " - ".join(x for x in (clinic.get("address", ""), clinic.get("phone", "")) if x)
    if line2:
        pdf.cell(0, 5, line2, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)
    pdf.set_draw_color(*TEAL)
    pdf.set_line_width(0.6)
    pdf.line(pdf.l_margin, pdf.get_y(), 210 - pdf.r_margin, pdf.get_y())
    pdf.ln(5)

    # ---- Patient & scan meta ----------------------------------------------
    pdf.set_text_color(*INK)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 7, "Patient & Scan Details", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)

    rows = [
        ("Patient", f"{patient['name']}  ({patient['id']})"),
        ("Age / Gender", f"{patient['age'] or '-'} / {patient['gender'] or '-'}"),
        ("Scan date", scan["scan_date"]),
        ("X-ray type", scan["xray_type"]),
        ("Status", "Needs review" if scan["status"] == "review" else "Complete"),
        ("Report generated", datetime.now().strftime("%d %b %Y, %H:%M")),
    ]
    for label, value in rows:
        pdf.set_text_color(*MUTED)
        pdf.cell(42, 6, label)
        pdf.set_text_color(*INK)
        pdf.cell(0, 6, str(value), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    # ---- X-ray image (if stored with the record) ---------------------------
    img_bytes = _decode_image(scan["image_data"])
    if img_bytes:
        try:
            pdf.set_font("Helvetica", "B", 12)
            pdf.cell(0, 7, "Analyzed X-ray", new_x="LMARGIN", new_y="NEXT")
            pdf.image(io.BytesIO(img_bytes), w=110)
            pdf.ln(3)
        except Exception:
            pass  # unsupported format — report is still valid without the image

    # ---- Findings table -----------------------------------------------------
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*INK)
    pdf.cell(0, 7, f"AI Findings ({len(lesions)})", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(240, 247, 246)
    pdf.set_text_color(*MUTED)
    pdf.cell(14, 7, "#", border="B", fill=True)
    pdf.cell(66, 7, "Location", border="B", fill=True)
    pdf.cell(40, 7, "Severity", border="B", fill=True)
    pdf.cell(40, 7, "Confidence", border="B", fill=True, new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "", 10)
    for i, lesion in enumerate(lesions, 1):
        pdf.set_text_color(*INK)
        pdf.cell(14, 7, str(i), border="B")
        pdf.cell(66, 7, lesion.get("surface", "-"), border="B")
        pdf.set_text_color(*SEVERITY_RGB.get(lesion.get("severity"), INK))
        pdf.cell(40, 7, SEVERITY_LABEL.get(lesion.get("severity"), "-"), border="B")
        pdf.set_text_color(*INK)
        pdf.cell(40, 7, f"{lesion.get('confidence', 0)}%", border="B",
                 new_x="LMARGIN", new_y="NEXT")
    if not lesions:
        pdf.set_text_color(*MUTED)
        pdf.cell(0, 7, "No lesions detected.", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    # ---- Clinician notes -----------------------------------------------------
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*INK)
    pdf.cell(0, 7, "Clinician Notes", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.multi_cell(0, 6, scan["notes"] or "No notes recorded for this scan.")
    pdf.ln(4)

    # ---- Disclaimer -----------------------------------------------------------
    pdf.set_font("Helvetica", "I", 8.5)
    pdf.set_text_color(*MUTED)
    pdf.multi_cell(
        0, 4.5,
        "DeepCariesScan is a diagnostic aid, not a final diagnosis. All findings "
        "must be verified by a qualified dental practitioner before treatment "
        "decisions are made.",
    )

    return bytes(pdf.output())
