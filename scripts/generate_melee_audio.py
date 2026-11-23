"""Efeitos originais sintetizados; Python padrão, sem downloads ou dependências.

Execute na raiz: python3 scripts/generate_melee_audio.py
Os WAVs prontos são versionados; o jogo não depende deste script.
"""

from pathlib import Path
import math
import random
import struct
import wave


ROOT = Path(__file__).resolve().parents[1] / "assets" / "audio"
RATE = 44100


def render(name, duration, seed):
    rng = random.Random(seed)
    samples = []
    low = slow = 0.0
    for i in range(round(duration * RATE)):
        t = i / RATE
        p = t / duration
        noise = rng.uniform(-1, 1)
        low += (0.16 if name == "soco" else 0.48) * (noise - low)
        slow += 0.035 * (noise - slow)
        # Rajada de ar com ataque e cauda suaves. Não há som de impacto.
        center = 0.30 if name == "soco" else 0.49
        envelope = math.exp(-((p - center) / 0.19) ** 2) * math.sin(math.pi * p) ** 2
        sample = (low - slow) * envelope
        if name == "katana":
            # Ressonância metálica discreta acompanhando o corte.
            ring = math.sin(2 * math.pi * 1780 * t) + 0.35 * math.sin(2 * math.pi * 2870 * t)
            sample += 0.035 * ring * envelope
        samples.append(sample)
    peak = max(abs(sample) for sample in samples)
    with wave.open(str(ROOT / f"{name}.wav"), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes(b"".join(struct.pack("<h", round(sample / peak * 0.85 * 32767)) for sample in samples))


if __name__ == "__main__":
    render("soco", 0.24, 7)
    render("katana", 0.48, 19)
