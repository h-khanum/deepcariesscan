"""
DeepCariesScan — Flask backend.

Serves the existing static frontend and provides the REST API the frontend's
"BACKEND INTEGRATION NOTE" comments were written for.

Roles & permissions
-------------------
  dentist : full CRUD on patients and their scan reports, dashboard,
            analysis, settings.
  patient : read-only access to their OWN patient record and scan reports,
            plus PDF report download. All write endpoints reject patients
            with 403.

Run:
    cd backend
    pip install -r requirements.txt
    python app.py            # http://localhost:5000

Demo accounts (seeded on first run):
    Dentist  demo.dentist@kcd.edu.pk / DemoAccess123
    Patient  ahmad.raza@email.com    / PatientView123
"""

import base64
import functools
import json
import os
from datetime import date

from flask import (Flask, jsonify, request, send_from_directory, session,
                   send_file, redirect)
from werkzeug.security import check_password_hash, generate_password_hash

from database import (CLINIC_SETTINGS_KEY, DEFAULT_CLINIC_SETTINGS,
                      DEFAULT_USER_SETTINGS, get_db, init_db, next_patient_id)
from inference import run_inference
from report_pdf import build_report

FRONTEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")
app.secret_key = os.environ.get("DCS_SECRET_KEY", "deepcariesscan-dev-secret-change-me")
app.config["MAX_CONTENT_LENGTH"] = 12 * 1024 * 1024  # 10MB image + overhead

SEVERITY_ORDER = ["e", "d1", "d2", "d3", "p"]

init_db()


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def current_user(conn):
    uid = session.get("user_id")
    if not uid:
        return None
    return conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()


def login_required(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("user_id"):
            return jsonify({"ok": False, "message": "Authentication required."}), 401
        return fn(*args, **kwargs)
    return wrapper


def dentist_required(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("user_id"):
            return jsonify({"ok": False, "message": "Authentication required."}), 401
        if session.get("role") != "dentist":
            return jsonify({"ok": False, "message": "Only dentists can perform this action."}), 403
        return fn(*args, **kwargs)
    return wrapper


def can_access_patient(patient_id):
    """Dentists can access any patient; patients only their own record."""
    if session.get("role") == "dentist":
        return True
    return session.get("patient_id") == patient_id


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------
def scan_summary(row):
    lesions = json.loads(row["lesions"] or "[]")
    highest = max((SEVERITY_ORDER.index(l["severity"]) for l in lesions
                   if l.get("severity") in SEVERITY_ORDER), default=0)
    avg_conf = round(sum(l.get("confidence", 0) for l in lesions) / len(lesions)) if lesions else 0
    return {
        "id": row["id"],
        "patientId": row["patient_id"],
        "date": row["scan_date"],
        "type": row["xray_type"],
        "status": row["status"],
        "severity": SEVERITY_ORDER[highest] if lesions else "e",
        "confidence": avg_conf,
        "lesionCount": len(lesions),
    }


def scan_full(row):
    data = scan_summary(row)
    data["lesions"] = json.loads(row["lesions"] or "[]")
    data["notes"] = row["notes"] or ""
    data["image"] = row["image_data"] or ""
    return data


def patient_summary(conn, row):
    scans = conn.execute(
        "SELECT * FROM scans WHERE patient_id = ? ORDER BY scan_date, id", (row["id"],)
    ).fetchall()
    summaries = [scan_summary(s) for s in scans]
    latest = summaries[-1] if summaries else None
    highest = max((SEVERITY_ORDER.index(s["severity"]) for s in summaries), default=0)
    return {
        "id": row["id"],
        "name": row["name"],
        "age": row["age"],
        "gender": row["gender"] or "",
        "totalScans": len(summaries),
        "lastScan": latest["date"] if latest else None,
        "severity": SEVERITY_ORDER[highest] if summaries else None,
        "confidence": latest["confidence"] if latest else None,
        "status": latest["status"] if latest else None,
    }


def patient_full(conn, row):
    data = patient_summary(conn, row)
    data.update({
        "dob": row["dob"] or "",
        "phone": row["phone"] or "",
        "email": row["email"] or "",
        "address": row["address"] or "",
        "emergencyContact": row["emergency_contact"] or "",
        "medicalTags": json.loads(row["medical_tags"] or "[]"),
        "notes": row["notes"] or "",
        "firstVisit": row["first_visit"] or "",
    })
    scans = conn.execute(
        "SELECT * FROM scans WHERE patient_id = ? ORDER BY scan_date, id", (row["id"],)
    ).fetchall()
    data["scans"] = [scan_summary(s) for s in scans]
    return data


def get_user_settings(conn, user_id):
    row = conn.execute("SELECT data FROM settings WHERE user_id = ?", (user_id,)).fetchone()
    merged = json.loads(json.dumps(DEFAULT_USER_SETTINGS))
    if row:
        for key, value in json.loads(row["data"]).items():
            if isinstance(value, dict) and isinstance(merged.get(key), dict):
                merged[key].update(value)
            else:
                merged[key] = value
    return merged


def get_clinic_settings(conn):
    row = conn.execute("SELECT data FROM settings WHERE user_id = ?",
                       (CLINIC_SETTINGS_KEY,)).fetchone()
    return {**DEFAULT_CLINIC_SETTINGS, **(json.loads(row["data"]) if row else {})}


def save_settings(conn, user_id, data):
    conn.execute(
        "INSERT INTO settings (user_id, data) VALUES (?, ?) "
        "ON CONFLICT(user_id) DO UPDATE SET data = excluded.data",
        (user_id, json.dumps(data)),
    )


# ---------------------------------------------------------------------------
# Static frontend
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return redirect("/login.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(FRONTEND_DIR, path)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
@app.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""

    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    conn.close()

    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"ok": False, "message": "Invalid email or password."}), 401

    session.clear()
    session["user_id"] = user["id"]
    session["role"] = user["role"]
    session["patient_id"] = user["patient_id"]

    redirect_to = "dashboard.html" if user["role"] == "dentist" \
        else f"patient-details.html?id={user['patient_id']}"
    return jsonify({"ok": True, "redirect": redirect_to, "role": user["role"]})


@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/me")
@login_required
def me():
    conn = get_db()
    user = current_user(conn)
    conn.close()
    if not user:
        session.clear()
        return jsonify({"ok": False, "message": "Session expired."}), 401
    return jsonify({"ok": True, "user": {
        "id": user["id"], "email": user["email"], "name": user["name"],
        "role": user["role"], "title": user["title"] or "",
        "phone": user["phone"] or "", "patientId": user["patient_id"],
    }})


# ---------------------------------------------------------------------------
# Patients — CRUD (write: dentist only; read: dentist any / patient self)
# ---------------------------------------------------------------------------
@app.route("/api/patients", methods=["GET"])
@login_required
def list_patients():
    conn = get_db()
    if session["role"] == "patient":
        rows = conn.execute("SELECT * FROM patients WHERE id = ?",
                            (session.get("patient_id"),)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM patients").fetchall()

    results = [patient_summary(conn, r) for r in rows]

    # optional server-side search used by New Scan's patient lookup
    q = (request.args.get("search") or "").strip().lower()
    if q:
        results = [p for p in results
                   if q in p["name"].lower() or q in p["id"].lower()]
    conn.close()
    return jsonify({"ok": True, "results": results, "total": len(results)})


@app.route("/api/patients", methods=["POST"])
@dentist_required
def create_patient():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"ok": False, "message": "Patient name is required."}), 400

    conn = get_db()
    pid = next_patient_id(conn)
    conn.execute(
        """INSERT INTO patients (id, name, age, gender, dob, phone, email, address,
                                 emergency_contact, medical_tags, notes, first_visit)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        (pid, name, data.get("age"), data.get("gender") or "", data.get("dob") or "",
         data.get("phone") or "", data.get("email") or "", data.get("address") or "",
         data.get("emergencyContact") or "",
         json.dumps(data.get("medicalTags") or []),
         data.get("notes") or "", date.today().isoformat()),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM patients WHERE id = ?", (pid,)).fetchone()
    result = patient_full(conn, row)
    conn.close()
    return jsonify({"ok": True, "patient": result}), 201


@app.route("/api/patients/<pid>", methods=["GET"])
@login_required
def get_patient(pid):
    if not can_access_patient(pid):
        return jsonify({"ok": False, "message": "You can only view your own record."}), 403
    conn = get_db()
    row = conn.execute("SELECT * FROM patients WHERE id = ?", (pid,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"ok": False, "message": "Patient not found."}), 404
    result = patient_full(conn, row)
    conn.close()
    return jsonify({"ok": True, "patient": result})


@app.route("/api/patients/<pid>", methods=["PUT"])
@dentist_required
def update_patient(pid):
    data = request.get_json(silent=True) or {}
    conn = get_db()
    row = conn.execute("SELECT * FROM patients WHERE id = ?", (pid,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"ok": False, "message": "Patient not found."}), 404

    fields = {
        "name": data.get("name", row["name"]),
        "age": data.get("age", row["age"]),
        "gender": data.get("gender", row["gender"]),
        "dob": data.get("dob", row["dob"]),
        "phone": data.get("phone", row["phone"]),
        "email": data.get("email", row["email"]),
        "address": data.get("address", row["address"]),
        "emergency_contact": data.get("emergencyContact", row["emergency_contact"]),
        "notes": data.get("notes", row["notes"]),
        "medical_tags": json.dumps(data["medicalTags"]) if "medicalTags" in data
                        else row["medical_tags"],
    }
    if not (fields["name"] or "").strip():
        conn.close()
        return jsonify({"ok": False, "message": "Patient name cannot be empty."}), 400

    conn.execute(
        """UPDATE patients SET name=?, age=?, gender=?, dob=?, phone=?, email=?,
           address=?, emergency_contact=?, notes=?, medical_tags=? WHERE id=?""",
        (*fields.values(), pid),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM patients WHERE id = ?", (pid,)).fetchone()
    result = patient_full(conn, row)
    conn.close()
    return jsonify({"ok": True, "patient": result})


@app.route("/api/patients/<pid>", methods=["DELETE"])
@dentist_required
def delete_patient(pid):
    conn = get_db()
    row = conn.execute("SELECT id FROM patients WHERE id = ?", (pid,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"ok": False, "message": "Patient not found."}), 404
    conn.execute("DELETE FROM patients WHERE id = ?", (pid,))  # scans cascade
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Scans / reports — CRUD (write: dentist only; read + PDF: dentist or owner)
# ---------------------------------------------------------------------------
@app.route("/api/patients/<pid>/scans", methods=["POST"])
@dentist_required
def create_scan(pid):
    data = request.get_json(silent=True) or {}
    conn = get_db()
    if not conn.execute("SELECT id FROM patients WHERE id = ?", (pid,)).fetchone():
        conn.close()
        return jsonify({"ok": False, "message": "Patient not found."}), 404

    lesions = data.get("lesions") or []
    cur = conn.execute(
        """INSERT INTO scans (patient_id, scan_date, xray_type, status, notes, lesions, image_data)
           VALUES (?,?,?,?,?,?,?)""",
        (pid, data.get("date") or date.today().isoformat(),
         "Periapical",  # the only supported X-ray type
         data.get("status") if data.get("status") in ("complete", "review") else "complete",
         data.get("notes") or "", json.dumps(lesions), data.get("image") or ""),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM scans WHERE id = ?", (cur.lastrowid,)).fetchone()
    result = scan_full(row)
    conn.close()
    return jsonify({"ok": True, "scan": result}), 201


@app.route("/api/scans/<int:sid>", methods=["GET"])
@login_required
def get_scan(sid):
    conn = get_db()
    row = conn.execute("SELECT * FROM scans WHERE id = ?", (sid,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"ok": False, "message": "Scan not found."}), 404
    if not can_access_patient(row["patient_id"]):
        conn.close()
        return jsonify({"ok": False, "message": "You can only view your own reports."}), 403
    patient = conn.execute("SELECT * FROM patients WHERE id = ?",
                           (row["patient_id"],)).fetchone()
    result = scan_full(row)
    result["patient"] = {"id": patient["id"], "name": patient["name"], "age": patient["age"]}
    conn.close()
    return jsonify({"ok": True, "scan": result})


@app.route("/api/scans/<int:sid>", methods=["PUT"])
@dentist_required
def update_scan(sid):
    data = request.get_json(silent=True) or {}
    conn = get_db()
    row = conn.execute("SELECT * FROM scans WHERE id = ?", (sid,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"ok": False, "message": "Scan not found."}), 404

    notes = data.get("notes", row["notes"])
    status = data.get("status", row["status"])
    if status not in ("complete", "review"):
        status = row["status"]
    conn.execute("UPDATE scans SET notes = ?, status = ? WHERE id = ?", (notes, status, sid))
    conn.commit()
    row = conn.execute("SELECT * FROM scans WHERE id = ?", (sid,)).fetchone()
    result = scan_full(row)
    conn.close()
    return jsonify({"ok": True, "scan": result})


@app.route("/api/scans/<int:sid>", methods=["DELETE"])
@dentist_required
def delete_scan(sid):
    conn = get_db()
    if not conn.execute("SELECT id FROM scans WHERE id = ?", (sid,)).fetchone():
        conn.close()
        return jsonify({"ok": False, "message": "Scan not found."}), 404
    conn.execute("DELETE FROM scans WHERE id = ?", (sid,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/scans/<int:sid>/report.pdf")
@login_required
def download_report(sid):
    """Both roles may download — a patient only for their own scans."""
    conn = get_db()
    row = conn.execute("SELECT * FROM scans WHERE id = ?", (sid,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"ok": False, "message": "Scan not found."}), 404
    if not can_access_patient(row["patient_id"]):
        conn.close()
        return jsonify({"ok": False, "message": "You can only download your own reports."}), 403

    patient = conn.execute("SELECT * FROM patients WHERE id = ?",
                           (row["patient_id"],)).fetchone()
    clinic = get_clinic_settings(conn)
    conn.close()

    pdf_bytes = build_report(row, patient, json.loads(row["lesions"] or "[]"), clinic)
    import io as _io
    filename = f"DeepCariesScan-Report-{patient['id']}-{row['scan_date']}.pdf"
    return send_file(_io.BytesIO(pdf_bytes), mimetype="application/pdf",
                     as_attachment=True, download_name=filename)


# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------
@app.route("/api/analyze", methods=["POST"])
@dentist_required
def analyze():
    import sys
    print("[DEBUG] /api/analyze route was hit", file=sys.stderr, flush=True)
    file = request.files.get("image")
    if not file:
        return jsonify({"ok": False, "message": "No X-ray image provided."}), 400

    image_bytes = file.read()
    lesions = run_inference(image_bytes)

    conn = get_db()
    threshold = get_user_settings(conn, session["user_id"])["ai"]["confidenceThreshold"]
    conn.close()

    # Below-threshold findings flag the whole scan for a human second look
    status = "review" if any(l["confidence"] < threshold for l in lesions) else "complete"
    return jsonify({"ok": True, "lesions": lesions, "status": status,
                    "xrayType": "Periapical"})


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
@app.route("/api/dashboard/summary")
@dentist_required
def dashboard_summary():
    conn = get_db()
    scans = conn.execute("SELECT * FROM scans").fetchall()
    total_patients = conn.execute("SELECT COUNT(*) c FROM patients").fetchone()["c"]

    severity_counts = {k: 0 for k in SEVERITY_ORDER}
    pending_review = 0
    lesions_detected = 0
    confidences = []

    for s in scans:
        lesions = json.loads(s["lesions"] or "[]")
        lesions_detected += len(lesions)
        for l in lesions:
            if l.get("severity") in severity_counts:
                severity_counts[l["severity"]] += 1
            confidences.append(l.get("confidence", 0))
        if s["status"] == "review":
            pending_review += 1
    avg_confidence = round(sum(confidences) / len(confidences)) if confidences else 0

    recent = []
    for s in sorted(scans, key=lambda r: (r["scan_date"], r["id"]), reverse=True)[:6]:
        summary = scan_summary(s)
        patient = conn.execute("SELECT name FROM patients WHERE id = ?",
                               (s["patient_id"],)).fetchone()
        summary["patientName"] = patient["name"] if patient else "Unknown"
        recent.append(summary)
    conn.close()

    labels = {"e": "Enamel", "d1": "Dentin 1", "d2": "Dentin 2", "d3": "Dentin 3", "p": "Pulp"}
    return jsonify({"ok": True,
                    "stats": {"totalPatients": total_patients, "totalScans": len(scans),
                              "lesionsDetected": lesions_detected,
                              "pendingReview": pending_review,
                              "avgConfidence": avg_confidence},
                    "severity": [{"key": k, "label": labels[k], "count": severity_counts[k]}
                                 for k in SEVERITY_ORDER],
                    "recentScans": recent})


# ---------------------------------------------------------------------------
# Settings / account
# ---------------------------------------------------------------------------
@app.route("/api/settings", methods=["GET"])
@login_required
def read_settings():
    conn = get_db()
    user = current_user(conn)
    payload = {
        "account": {"name": user["name"], "title": user["title"] or "",
                    "email": user["email"], "phone": user["phone"] or ""},
        "preferences": get_user_settings(conn, user["id"]),
    }
    if user["role"] == "dentist":
        payload["clinic"] = get_clinic_settings(conn)
    conn.close()
    return jsonify({"ok": True, "settings": payload})


@app.route("/api/settings", methods=["PUT"])
@login_required
def write_settings():
    data = request.get_json(silent=True) or {}
    conn = get_db()
    user = current_user(conn)

    if "account" in data:
        acct = data["account"]
        email = (acct.get("email") or user["email"]).strip()
        clash = conn.execute("SELECT id FROM users WHERE email = ? AND id != ?",
                             (email, user["id"])).fetchone()
        if clash:
            conn.close()
            return jsonify({"ok": False, "message": "That email is already in use."}), 400
        conn.execute("UPDATE users SET name=?, title=?, email=?, phone=? WHERE id=?",
                     (acct.get("name", user["name"]), acct.get("title", user["title"]),
                      email, acct.get("phone", user["phone"]), user["id"]))

    if "preferences" in data:
        merged = get_user_settings(conn, user["id"])
        for key, value in data["preferences"].items():
            if isinstance(value, dict) and isinstance(merged.get(key), dict):
                merged[key].update(value)
            else:
                merged[key] = value
        merged["ai"]["defaultXrayType"] = "Periapical"  # only supported type
        save_settings(conn, user["id"], merged)

    if "clinic" in data and user["role"] == "dentist":
        clinic = {**get_clinic_settings(conn), **data["clinic"]}
        save_settings(conn, CLINIC_SETTINGS_KEY, clinic)

    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/account/password", methods=["POST"])
@login_required
def change_password():
    data = request.get_json(silent=True) or {}
    current = data.get("currentPassword") or ""
    new = data.get("newPassword") or ""
    if len(new) < 8:
        return jsonify({"ok": False, "message": "New password must be at least 8 characters."}), 400

    conn = get_db()
    user = current_user(conn)
    if not check_password_hash(user["password_hash"], current):
        conn.close()
        return jsonify({"ok": False, "message": "Current password is incorrect."}), 400
    conn.execute("UPDATE users SET password_hash = ? WHERE id = ?",
                 (generate_password_hash(new), user["id"]))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/account/export")
@login_required
def export_data():
    conn = get_db()
    user = current_user(conn)
    export = {"account": {"name": user["name"], "email": user["email"], "role": user["role"]},
              "preferences": get_user_settings(conn, user["id"])}
    if user["role"] == "dentist":
        export["patients"] = [patient_full(conn, r)
                              for r in conn.execute("SELECT * FROM patients").fetchall()]
    elif user["patient_id"]:
        row = conn.execute("SELECT * FROM patients WHERE id = ?",
                           (user["patient_id"],)).fetchone()
        if row:
            export["patientRecord"] = patient_full(conn, row)
    conn.close()
    # keep exports light — strip embedded images
    for p in export.get("patients", []):
        for s in p.get("scans", []):
            s.pop("image", None)
    return jsonify(export)


@app.route("/api/account", methods=["DELETE"])
@login_required
def delete_account():
    conn = get_db()
    conn.execute("DELETE FROM settings WHERE user_id = ?", (session["user_id"],))
    conn.execute("DELETE FROM users WHERE id = ?", (session["user_id"],))
    conn.commit()
    conn.close()
    session.clear()
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000,
            debug=os.environ.get("DCS_DEBUG") == "1")