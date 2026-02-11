# OpenFan Z-Image Turbo — RunPod Serverless Docker Image
# Deploy to RunPod Serverless for AI image generation
#
# Build: docker build -t openfan/z-image-turbo:latest -f docker/Dockerfile docker/
# Push:  docker push openfan/z-image-turbo:latest

FROM runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    wget \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps
RUN pip install --no-cache-dir \
    runpod \
    comfyui \
    torch \
    torchvision \
    pillow \
    requests \
    safetensors \
    accelerate

# Copy handler
COPY handler.py /app/handler.py

# Download Z-Image Turbo model (placeholder — replace with actual model path)
# RUN wget -O /app/models/z-image-turbo.safetensors "https://huggingface.co/..."

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD python -c "import runpod; print('healthy')"

# RunPod handler entrypoint
CMD ["python", "-u", "/app/handler.py"]
