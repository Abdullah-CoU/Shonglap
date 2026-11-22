"""Minimal FastAPI sidecar for Whisper transcription using faster-whisper."""

import os
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, Form
from faster_whisper import WhisperModel

app = FastAPI(title="Shonglap Whisper Sidecar")

MODEL_NAME = os.getenv("WHISPER_MODEL", "large-v3")
DEVICE = os.getenv("WHISPER_DEVICE", "auto")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "default")

# Dhaka civic terms to bias recognition
INITIAL_PROMPT = (
    "ঢাকা, বাংলাদেশ নাগরিক অভিযোগ। এলাকা: গুলশান, বনানী, ধানমন্ডি, উত্তরা, মিরপুর, "
    "মতিঝিল, পুরান ঢাকা, যাত্রাবাড়ী, মোহাম্মদপুর, তেজগাঁও, বড্ডা, রামপুরা, "
    "বারিধারা, মোহাখালি, কাফরুল, ক্যান্টনমেন্ট, ওয়ারী, লালবাগ, সুত্রাপুর, "
    "জেন্ডারিয়া, শ্যামপুর, দেমড়া, কদমতলী, আদাবর, হাজারীবাগ, সাভার। "
    "সমস্যা: রাস্তা, গর্ত, ময়লা, আবর্জনা, মশা, ডেঙ্গু, বাতি, পানি, ড্রেন, "
    "জলাবদ্ধতা, বিদ্যুৎ, গ্যাস লিক, নির্মাণ, ট্রাফিক, পুলিশ, আগুন, দূষণ।"
)

_model = None


def get_model():
    global _model
    if _model is None:
        device = DEVICE
        if device == "auto":
            try:
                import torch
                device = "cuda" if torch.cuda.is_available() else "cpu"
            except Exception:
                device = "cpu"
        compute = COMPUTE_TYPE
        if compute == "default":
            compute = "float16" if device == "cuda" else "int8"
        _model = WhisperModel(MODEL_NAME, device=device, compute_type=compute)
    return _model


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), language: str = Form("bn")):
    suffix = Path(file.filename).suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        model = get_model()
        segments, info = model.transcribe(
            tmp_path,
            language=language,
            initial_prompt=INITIAL_PROMPT,
            beam_size=int(os.getenv("WHISPER_BEAM_SIZE", "1")),
        )

        segment_list = []
        text_parts = []
        for seg in segments:
            segment_list.append({
                "start": round(seg.start, 2),
                "end": round(seg.end, 2),
                "text": seg.text.strip(),
            })
            text_parts.append(seg.text.strip())

        full_text = " ".join(text_parts)
        duration = round(info.duration, 2) if hasattr(info, "duration") else 0.0

        return {
            "text": full_text,
            "language": info.language if hasattr(info, "language") else language,
            "duration": duration,
            "segments": segment_list,
        }
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


@app.get("/health")
async def health():
    return {"status": "ok", "model": MODEL_NAME, "device": DEVICE}
