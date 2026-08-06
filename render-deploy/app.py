"""
DeepCariesScan — Gradio demo, standalone version for Render (or any host
that isn't Hugging Face Spaces).

This is your teammate's hf-space/app.py with the Hugging-Face-only parts
removed:
  - no `import spaces` / `@spaces.GPU(...)` (that's HF's ZeroGPU allocator,
    meaningless off HF — this just runs on Render's CPU directly)
  - no gradio_client monkey-patch (that patch exists only to work around a
    bug caused by HF Spaces pinning gradio_client==1.3.0 alongside a newer
    huggingface_hub; off HF we can just use a current, matched Gradio version)

Everything else — model loading, class map, inference, UI layout — is
unchanged from the version already trained/tested for this project.
"""

import glob
import os

import cv2
import gradio as gr
import numpy as np
from PIL import Image
from ultralytics import YOLO

EXAMPLE_FILES = sorted(
    glob.glob("examples/*.jpg") +
    glob.glob("examples/*.jpeg") +
    glob.glob("examples/*.png")
)

MODEL_PATH = os.environ.get("MODEL_PATH", "best.pt")
IMG_SIZE = 640

CLASS_INFO = {
    "e":  {"color": (255, 200,  50), "desc": "Enamel caries - earliest stage"},
    "d1": {"color": (255, 140,   0), "desc": "Dentin caries - outer third"},
    "d2": {"color": (220,  80,   0), "desc": "Dentin caries - mid third"},
    "d3": {"color": (180,   0,   0), "desc": "Dentin caries - deep, near pulp"},
    "p":  {"color": (120,   0, 160), "desc": "Pulp involvement / periapical"},
}
SEVERITY = ["e", "d1", "d2", "d3", "p"]

print("Loading model ...")
model = YOLO(MODEL_PATH)
print("Model loaded OK")


def predict(image, conf, iou):
    if image is None:
        return None, "No image provided."

    img_np = np.array(image.convert("RGB"))
    results = model.predict(source=img_np, imgsz=IMG_SIZE,
                             conf=conf, iou=iou, verbose=False)[0]

    annotated = img_np.copy()
    detections = []

    if results.boxes is not None and len(results.boxes):
        names = model.names
        for box in results.boxes:
            cls_id = int(box.cls[0])
            conf_v = float(box.conf[0])
            cls_key = names[cls_id]
            info = CLASS_INFO.get(cls_key, {"color": (0, 255, 0), "desc": ""})
            color = info["color"][::-1]
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
            lbl = "{} {:.2f}".format(cls_key.upper(), conf_v)
            (tw, th), _ = cv2.getTextSize(lbl, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
            cv2.rectangle(annotated, (x1, y1 - th - 8), (x1 + tw + 4, y1), color, -1)
            cv2.putText(annotated, lbl, (x1 + 2, y1 - 4),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            detections.append({"class": cls_key, "conf": round(conf_v, 4),
                                "desc": info["desc"]})

    out_img = Image.fromarray(cv2.cvtColor(annotated, cv2.COLOR_BGR2RGB))

    if not detections:
        report = "No caries detected above threshold."
    else:
        detections.sort(key=lambda d: SEVERITY.index(d["class"])
                         if d["class"] in SEVERITY else 99)
        worst = detections[-1]["class"]
        lines = ["{} lesion(s) detected\n".format(len(detections))]
        for i, d in enumerate(detections, 1):
            lines.append("{}. {} - conf {:.2f} - {}".format(
                i, d["class"].upper(), d["conf"], d["desc"]))
        lines.append("\nMost severe: {}".format(worst.upper()))
        report = "\n".join(lines)

    return out_img, report


with gr.Blocks(title="DeepCariesScan") as demo:
    gr.Markdown(
        "# DeepCariesScan\n"
        "Upload a periapical radiograph to detect caries severity: "
        "**e** -> **d1** -> **d2** -> **d3** -> **p**\n\n"
        "*Periapical radiographs | Khyber College of Dentistry | UET Peshawar FYP 2026*"
    )
    with gr.Row():
        with gr.Column():
            inp = gr.Image(type="pil", label="Upload X-ray")
            conf = gr.Slider(0.10, 0.90, value=0.25, step=0.05, label="Confidence")
            iou = gr.Slider(0.10, 0.90, value=0.45, step=0.05, label="IoU")
            btn = gr.Button("Detect", variant="primary")
        with gr.Column():
            out_img = gr.Image(type="pil", label="Annotated Output")
            out_report = gr.Textbox(label="Report", lines=10)

    if EXAMPLE_FILES:
        gr.Examples(
            examples=[[f] for f in EXAMPLE_FILES],
            inputs=inp,
            examples_per_page=8,
            label="Sample Radiographs",
        )
    gr.Markdown("*Research and educational use only. "
                "Clinical diagnosis requires a qualified dental professional.*")

    btn.click(fn=predict, inputs=[inp, conf, iou], outputs=[out_img, out_report])
    inp.change(fn=predict, inputs=[inp, conf, iou], outputs=[out_img, out_report])

demo.queue()

# Render assigns a port via the $PORT environment variable and expects the
# service to bind to 0.0.0.0 on that port - this is the one line that
# changes between "runs on Hugging Face" and "runs on Render".
demo.launch(
    server_name="0.0.0.0",
    server_port=int(os.environ.get("PORT", 7860)),
    show_api=False,
)
