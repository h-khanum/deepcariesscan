# DeepCariesScan

AI-powered dental caries detection and severity classification, built as a Final Year Project (BS Data Science, UET Peshawar) in partnership with **Khyber College of Dentistry (KCD)**.

DeepCariesScan analyzes periapical dental X-rays and classifies detected lesions into 5 clinical severity stages — **Enamel → Dentin 1 → Dentin 2 → Dentin 3 → Pulp exposure** — using a YOLO object-detection model trained on 800+ dentist-annotated KCD radiographs.

**Live demo:** [hafsakhanum.pythonanywhere.com](https://hafsakhanum.pythonanywhere.com)

---

## Try it yourself

1. Open the [live demo](https://hafsakhanum.pythonanywhere.com)
2. On the login page, click **"Use demo clinician account"** — this autofills a working demo login
3. Click **Sign In**
4. Go to **New Scan**, upload one of the sample X-rays from [`sample-xrays/`](./sample-xrays) in this repo, and click **Analyze X-ray**

**Demo credentials** (also available via the one-click button above):
```
Email:    demo.dentist@kcd.edu.pk
Password: DemoAccess123
```

---

## What it does

- Detects and localizes carious lesions in dental X-rays with bounding boxes
- Classifies each detection into one of 5 severity stages, matching standard clinical grading
- Shows confidence scores alongside every detection (never hidden — see below)
- Full clinician workflow: patient records, scan history, PDF reports

This is a diagnostic **aid**, not a replacement for a licensed dentist's diagnosis — that disclaimer is shown in the UI at all times.

## Tech stack

- **Model:** YOLO (small variant), trained on Roboflow-annotated KCD radiographs
- **Backend:** Flask + Ultralytics + OpenCV
- **Frontend:** Vanilla HTML/CSS/JS (deliberate — no framework, no build step)
- **Deployment:** PythonAnywhere

## Repo structure

```
├── backend/           Flask app, inference logic, trained model weights
├── css/ js/            Frontend styling and behavior
├── *.html              App pages (login, dashboard, new-scan, patient records, etc.)
├── sample-xrays/       A few sample X-rays to try the demo with
└── render-deploy/      Standalone Gradio-based demo (alternate lightweight deployment)
```

## Team

- Hafsa Khanum — [GitHub](https://github.com/h-khanum)
- Qazi Muhammad Aflah
- Tajallah Zakeen

**Supervisor:** Dr. Syed Adeel Ali Shah — Department of CS&IT, UET Peshawar

**Clinical partner:** Khyber College of Dentistry (KCD), Peshawar
