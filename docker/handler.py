"""
OpenFan Z-Image Turbo — RunPod Serverless Handler

Receives generation requests, runs Z-Image Turbo via ComfyUI, returns base64 images.

Input:
{
    "prompt": "portrait of a woman, golden hour, luxury fashion",
    "negative_prompt": "blurry, low quality, deformed",
    "char_block": "woman, deep dark brown skin...",  # prepended to prompt
    "width": 1024,
    "height": 1024,
    "seed": 42,  # optional, random if not provided
    "num_images": 1
}

Output:
{
    "images": ["base64_encoded_image_1", ...]
}
"""

import runpod  # type: ignore[import-unresolved]
import base64
import io
import random
from PIL import Image

# Placeholder for actual model loading
# In production, this loads Z-Image Turbo via ComfyUI or diffusers
MODEL = None


def load_model():
    """Load Z-Image Turbo model. Called once on cold start."""
    global MODEL
    # TODO: Replace with actual Z-Image Turbo model loading
    # from diffusers import StableDiffusionPipeline
    # MODEL = StableDiffusionPipeline.from_pretrained(
    #     "z-image-turbo",
    #     torch_dtype=torch.float16,
    #     safety_checker=None,  # NSFW variant
    # ).to("cuda")
    print("Model loaded (placeholder)")
    MODEL = "loaded"


def generate_image(_prompt, _negative_prompt, width, height, seed):
    """Generate a single image. Returns PIL Image."""
    if seed is None:
        seed = random.randint(0, 2**32 - 1)

    # TODO: Replace with actual generation
    # generator = torch.Generator("cuda").manual_seed(seed)
    # result = MODEL(
    #     prompt=prompt,
    #     negative_prompt=negative_prompt,
    #     width=width,
    #     height=height,
    #     num_inference_steps=4,  # Turbo = fewer steps
    #     generator=generator,
    # )
    # return result.images[0]

    # Placeholder: generate a solid color image
    img = Image.new("RGB", (width, height), color=(random.randint(0, 255), random.randint(0, 255), random.randint(0, 255)))
    return img


def image_to_base64(img):
    """Convert PIL Image to base64 JPEG string."""
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=95)
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def handler(event):
    """RunPod serverless handler."""
    input_data = event.get("input", {})

    prompt = input_data.get("prompt", "")
    negative_prompt = input_data.get("negative_prompt", "")
    char_block = input_data.get("char_block", "")
    width = input_data.get("width", 1024)
    height = input_data.get("height", 1024)
    seed = input_data.get("seed")
    num_images = min(input_data.get("num_images", 1), 4)

    if not prompt:
        return {"error": "prompt is required"}

    # Prepend char_block to prompt for identity consistency
    full_prompt = f"{char_block}, {prompt}" if char_block else prompt

    # Load model on first request
    if MODEL is None:
        load_model()

    # Generate images
    images = []
    for i in range(num_images):
        img_seed = (seed + i) if seed is not None else None
        img = generate_image(full_prompt, negative_prompt, width, height, img_seed)
        images.append(image_to_base64(img))

    return {"images": images}


# Start RunPod serverless worker
runpod.serverless.start({"handler": handler})
