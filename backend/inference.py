"""
DeepCariesScan — Inference module.

`run_inference(image_bytes)` is the single integration point for the
detection model. It returns a list of finding dicts:

    [{ "surface": str,            # finding label = detected class name
       "severity": str,           # one of: e, d1, d2, d3, p (drives badge color)
       "confidence": int,         # 0–100
       "box": {"x": float, "y": float, "w": float, "h": float} }]  # % of image

(The JSON key is still called "surface" for backward compatibility with the
frontend and saved records — it now simply carries the model's class name.)

Box values are PERCENTAGES of image width/height (0–100) so the frontend
overlay positions correctly regardless of rendered size.

----------------------------------------------------------------------------
USING REAL YOLO WEIGHTS
----------------------------------------------------------------------------
1. Put your trained weights file here:

       backend/weights/best.pt        <-- exactly this path/name

2. Install the runtime:

       pip install ultralytics

3. Restart the server. That's it — on startup this module detects the
   weights file, loads the model once, and every /api/analyze call runs the
   real model instead of the simulator. If the file is missing or
   ultralytics isn't installed, it falls back to the simulator below and
   logs which mode is active.

Adjust CLASS_TO_SEVERITY / MODEL_CONF below to match your training run.
"""

import hashlib
import os
import random

# ---------------------------------------------------------------------------
# Model configuration
# ---------------------------------------------------------------------------
WEIGHTS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            "weights", "best.pt")
MODEL_CONF = 0.25  # minimum detection confidence passed to the model

# The 5 trained severity classes (matches the KCD dataset / YOLO training
# run — see Design Bible §6.2). The model's class name IS the severity key,
# so no separate mapping is needed: e -> e, d1 -> d1, etc.
CLASSES = ["e", "d1", "d2", "d3", "p"]
CLASS_TO_SEVERITY = {c: c for c in CLASSES}

# Human-readable labels for the "surface" field shown in the UI/report.
CLASS_LABELS = {
    "e":  "Enamel Caries",
    "d1": "Dentin Caries (D1)",
    "d2": "Dentin Caries (D2)",
    "d3": "Dentin Caries (D3)",
    "p":  "Pulp Involvement",
}

_model = None  # loaded once, lazily


def _load_model():
    """Load YOLO weights if present; return None to use the simulator."""
    global _model
    if _model is not None:
        return _model
    if not os.path.exists(WEIGHTS_PATH):
        print(f"[inference] No weights at {WEIGHTS_PATH} — using simulated findings.")
        return None
    try:
        from ultralytics import YOLO
    except ImportError:
        print("[inference] ultralytics not installed (pip install ultralytics) — "
              "using simulated findings.")
        return None
    _model = YOLO(WEIGHTS_PATH)
    print(f"[inference] Loaded YOLO weights from {WEIGHTS_PATH}.")
    return _model


def _run_yolo(model, image_bytes):
    import io
    from PIL import Image

    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    results = model.predict(img, conf=MODEL_CONF, verbose=False)[0]
    w, h = img.size

    lesions = []
    for b in results.boxes:
        x1, y1, x2, y2 = b.xyxy[0].tolist()
        name = results.names[int(b.cls)].lower()
        lesions.append({
            "surface": CLASS_LABELS.get(name, name.title()),  # e.g. "Dentin Caries (D2)"
            "severity": CLASS_TO_SEVERITY.get(name, "d1"),
            "confidence": round(float(b.conf) * 100),
            "box": {"x": round(x1 / w * 100, 1), "y": round(y1 / h * 100, 1),
                    "w": round((x2 - x1) / w * 100, 1),
                    "h": round((y2 - y1) / h * 100, 1)},
        })
    return lesions


# ---------------------------------------------------------------------------
# Simulator fallback — deterministic (seeded from the image bytes) so
# re-analyzing the same image gives the same result. Only used until real
# weights are placed at backend/weights/best.pt.
# ---------------------------------------------------------------------------
_SIM_CLASSES = ["e", "d1", "d2", "d3", "p"]
_SIM_WEIGHTS = [0.35, 0.25, 0.20, 0.12, 0.08]


def _run_simulator(image_bytes):
    seed = int(hashlib.sha256(image_bytes or b"empty").hexdigest()[:12], 16)
    rng = random.Random(seed)

    n = rng.randint(2, 4)
    lesions = []
    used_cells = set()
    for _ in range(n):
        # keep boxes from stacking on top of each other
        for _attempt in range(10):
            cell = (rng.randint(0, 3), rng.randint(0, 2))
            if cell not in used_cells:
                used_cells.add(cell)
                break
        cx, cy = cell
        name = rng.choices(_SIM_CLASSES, weights=_SIM_WEIGHTS)[0]
        lesions.append({
            "surface": CLASS_LABELS.get(name, name.title()),
            "severity": CLASS_TO_SEVERITY.get(name, "d1"),
            "confidence": rng.randint(52, 96),
            "box": {
                "x": round(6 + cx * 23 + rng.uniform(0, 4), 1),
                "y": round(8 + cy * 28 + rng.uniform(0, 4), 1),
                "w": round(rng.uniform(12, 18), 1),
                "h": round(rng.uniform(15, 22), 1),
            },
        })
    return lesions


def run_inference(image_bytes):
    """Analyze a periapical X-ray: real YOLO if weights are present, else simulator."""
    model = _load_model()
    if model is not None:
        return _run_yolo(model, image_bytes)
    return _run_simulator(image_bytes)