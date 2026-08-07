"""
DeepCariesScan — Database layer (SQLite, stdlib only).

Schema:
  users     — dentists and patients (patients are linked to a patient record)
  patients  — clinical patient records (CRUD: dentist only)
  scans     — saved AI analysis reports for a patient (CRUD: dentist only,
              patients get read + PDF download for their own records)
  settings  — per-user preference blobs + one shared "clinic" blob (key 0)

The database file lives next to this module as deepcaries.db and is created
and seeded automatically on first run.
"""

import json
import os
import sqlite3
from datetime import date

from werkzeug.security import generate_password_hash

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "deepcaries.db")

CLINIC_SETTINGS_KEY = 0  # settings.user_id = 0 → shared clinic information row


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------
SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('dentist', 'patient')),
    title         TEXT DEFAULT '',
    phone         TEXT DEFAULT '',
    patient_id    TEXT REFERENCES patients(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS patients (
    id                TEXT PRIMARY KEY,          -- e.g. PT-004821
    name              TEXT NOT NULL,
    age               INTEGER,
    gender            TEXT DEFAULT '',
    dob               TEXT DEFAULT '',
    phone             TEXT DEFAULT '',
    email             TEXT DEFAULT '',
    address           TEXT DEFAULT '',
    emergency_contact TEXT DEFAULT '',
    medical_tags      TEXT DEFAULT '[]',         -- JSON array of strings
    notes             TEXT DEFAULT '',
    first_visit       TEXT DEFAULT '',
    created_at        TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scans (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id   TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    scan_date    TEXT NOT NULL,                  -- ISO date
    xray_type    TEXT NOT NULL DEFAULT 'Periapical',
    status       TEXT NOT NULL DEFAULT 'complete' CHECK (status IN ('complete','review')),
    notes        TEXT DEFAULT '',
    lesions      TEXT NOT NULL DEFAULT '[]',     -- JSON: [{surface,severity,confidence,box:{x,y,w,h}}]
    image_data   TEXT DEFAULT '',                -- data URL of the analyzed X-ray (optional)
    created_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
    user_id INTEGER PRIMARY KEY,
    data    TEXT NOT NULL DEFAULT '{}'
);
"""


# ---------------------------------------------------------------------------
# Seed data — mirrors the demo content that shipped with the frontend so the
# UI looks exactly the same on first run.
# ---------------------------------------------------------------------------
SEED_PATIENTS = [
    # (id, name, age, gender, last-scan severity/conf/status baked into scans below)
    ("PT-004821", "Ahmad Raza",     34, "Male"),
    ("PT-004798", "Sana Bibi",      27, "Female"),
    ("PT-004777", "Bilal Hussain",  41, "Male"),
    ("PT-004761", "Fatima Noor",    19, "Female"),
    ("PT-004750", "Usman Ali",      52, "Male"),
    ("PT-004732", "Mehreen Sheikh",  8, "Female"),
    ("PT-004715", "Kamran Yousaf",  46, "Male"),
    ("PT-004702", "Ayesha Malik",   31, "Female"),
    ("PT-004688", "Hassan Javed",   24, "Male"),
    ("PT-004671", "Zainab Farooq",  60, "Female"),
    ("PT-004659", "Imran Qureshi",  37, "Male"),
    ("PT-004640", "Nadia Aslam",    29, "Female"),
    ("PT-004622", "Waqas Ahmed",    15, "Male"),
    ("PT-004601", "Rabia Saeed",    44, "Female"),
]

# (patient_id, scan_date, severity, confidence, status, extra_lesions)
SEED_SCANS = [
    ("PT-004821", "2026-04-22", "e",  90, "complete"),
    ("PT-004821", "2026-06-02", "d1", 71, "complete"),
    ("PT-004821", "2026-07-11", "d2", 78, "review"),
    ("PT-004798", "2026-07-10", "e",  91, "complete"),
    ("PT-004777", "2026-07-10", "p",  88, "complete"),
    ("PT-004761", "2026-07-09", "d1", 65, "complete"),
    ("PT-004750", "2026-07-09", "d3", 82, "review"),
    ("PT-004732", "2026-07-08", "e",  95, "complete"),
    ("PT-004715", "2026-07-06", "d2", 73, "review"),
    ("PT-004702", "2026-07-05", "d1", 69, "complete"),
    ("PT-004688", "2026-07-03", "e",  89, "complete"),
    ("PT-004671", "2026-07-02", "p",  94, "review"),
    ("PT-004659", "2026-06-30", "d3", 80, "complete"),
    ("PT-004640", "2026-06-28", "d1", 71, "complete"),
    ("PT-004622", "2026-06-25", "e",  92, "complete"),
    ("PT-004601", "2026-06-22", "d2", 76, "review"),
]

# Finding label per severity for the seeded demo scans — matches the model's
# class vocabulary (see inference.CLASS_TO_SEVERITY).
SEVERITY_TO_LABEL = {"e": "Restoration", "d1": "Root Canal", "d2": "Caries",
                     "d3": "Caries", "p": "Periapical Lesion"}


def _seed_lesions(severity, confidence):
    """A small, plausible finding set headlined by the seeded severity."""
    base = [
        {"surface": SEVERITY_TO_LABEL[severity], "severity": severity, "confidence": confidence,
         "box": {"x": 40, "y": 28, "w": 14, "h": 20}},
    ]
    if severity in ("d2", "d3", "p"):
        base.append({"surface": SEVERITY_TO_LABEL["d1"], "severity": "d1",
                     "confidence": max(50, confidence - 12),
                     "box": {"x": 12, "y": 12, "w": 15, "h": 18}})
    if severity == "p":
        base.append({"surface": SEVERITY_TO_LABEL["d2"], "severity": "d2",
                     "confidence": max(50, confidence - 20),
                     "box": {"x": 66, "y": 48, "w": 17, "h": 22}})
    return base


DEFAULT_USER_SETTINGS = {
    "notifications": {"analysisComplete": True, "flaggedForReview": True, "weeklySummary": False, "smsAlerts": False},
    "ai": {"confidenceThreshold": 70, "defaultXrayType": "Periapical"},
}

DEFAULT_CLINIC_SETTINGS = {
    "name": "Khyber College of Dentistry",
    "phone": "+92 91 9211440",
    "address": "Bacha Khan Chowk, Peshawar, Khyber Pakhtunkhwa",
}


def init_db():
    first_run = not os.path.exists(DB_PATH)
    conn = get_db()
    conn.executescript(SCHEMA)

    if first_run or conn.execute("SELECT COUNT(*) c FROM users").fetchone()["c"] == 0:
        today = date.today().isoformat()

        for pid, name, age, gender in SEED_PATIENTS:
            first_scan = min((s[1] for s in SEED_SCANS if s[0] == pid), default=today)
            conn.execute(
                """INSERT INTO patients (id, name, age, gender, first_visit, phone, email)
                   VALUES (?,?,?,?,?,?,?)""",
                (pid, name, age, gender, first_scan, "", ""),
            )

        # Richer demo record for the linked demo patient account
        conn.execute(
            """UPDATE patients SET dob='1992-03-14', phone='+92 300 1234567',
               email='ahmad.raza@email.com', address='Hayatabad, Peshawar',
               emergency_contact='+92 300 7654321',
               medical_tags=?, notes=? WHERE id='PT-004821'""",
            (json.dumps(["Penicillin allergy", "Type 2 Diabetes"]),
             "Patient is diabetic — monitor healing time if any restorative work is "
             "needed. Prefers morning appointments."),
        )

        for pid, scan_date, sev, conf, status in SEED_SCANS:
            conn.execute(
                """INSERT INTO scans (patient_id, scan_date, xray_type, status, lesions, notes)
                   VALUES (?,?,?,?,?,?)""",
                (pid, scan_date, "Periapical", status,
                 json.dumps(_seed_lesions(sev, conf)),
                 "Patient reports mild sensitivity. Recommend routine follow-up."
                 if status == "review" else ""),
            )

        # Demo accounts — the login page's "Use demo account" button fills the
        # dentist credentials; the patient account demonstrates view-only access.
        conn.execute(
            "INSERT INTO users (email, password_hash, name, role, title, phone) VALUES (?,?,?,?,?,?)",
            ("demo.dentist@kcd.edu.pk", generate_password_hash("DemoAccess123"),
             "Dr. Ayesha Tariq", "dentist", "Dental Practitioner", "+92 300 9988776"),
        )
        conn.execute(
            "INSERT INTO users (email, password_hash, name, role, patient_id) VALUES (?,?,?,?,?)",
            ("ahmad.raza@email.com", generate_password_hash("PatientView123"),
             "Ahmad Raza", "patient", "PT-004821"),
        )

        conn.execute("INSERT INTO settings (user_id, data) VALUES (?,?)",
                     (CLINIC_SETTINGS_KEY, json.dumps(DEFAULT_CLINIC_SETTINGS)))
        conn.execute("INSERT INTO settings (user_id, data) VALUES (?,?)",
                     (1, json.dumps(DEFAULT_USER_SETTINGS)))

        conn.commit()
    conn.close()


def next_patient_id(conn):
    """Generate the next sequential PT-XXXXXX id."""
    row = conn.execute(
        "SELECT id FROM patients WHERE id LIKE 'PT-%' ORDER BY CAST(SUBSTR(id, 4) AS INTEGER) DESC LIMIT 1"
    ).fetchone()
    n = int(row["id"][3:]) + 1 if row else 1
    return f"PT-{n:06d}"
