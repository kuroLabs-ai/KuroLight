# Evaluating local AI restoration

The evaluation runner compares each AI-restored image with its high-resolution reference and with
a Lanczos-upscaled version of the same low-resolution input. It reports PSNR, SSIM, metric deltas,
elapsed inference time, and the actual inference device. These metrics help compare runs but do not
replace visual review for invented details, faces, text, anime, noise, or motion blur.

Use only images you are licensed and authorized to evaluate. Keep paired input/reference images on
the local machine. The runner does not download images, contact an image service, or send image data
anywhere. The Real-ESRGAN model must already be installed using the app's model-download control.

Create a JSON manifest next to the image files. Paths are relative to the manifest; each reference
must have the exact dimensions the selected target produces (the target height is applied to the
shorter input dimension).

```json
{
  "dataset_license": "Describe the license or authorization",
  "dataset_provenance": "Describe where the images came from",
  "items": [
    {
      "id": "face-01",
      "category": "faces",
      "input": "low-resolution/face-01.png",
      "reference": "references/face-01.png",
      "target_height": 720
    },
    {
      "id": "text-01",
      "category": "text",
      "input": "low-resolution/text-01.png",
      "reference": "references/text-01.png",
      "target_height": 720
    },
    {
      "id": "anime-01",
      "category": "anime",
      "input": "low-resolution/anime-01.png",
      "reference": "references/anime-01.png",
      "target_height": 720
    },
    {
      "id": "noise-01",
      "category": "noise",
      "input": "low-resolution/noise-01.png",
      "reference": "references/noise-01.png",
      "target_height": 720
    },
    {
      "id": "motion-blur-01",
      "category": "motion-blur",
      "input": "low-resolution/motion-blur-01.png",
      "reference": "references/motion-blur-01.png",
      "target_height": 720
    }
  ]
}
```

Run from the repository root after installing KuroLight's Python dependencies:

```powershell
python -m kurolight.processing.enhancement_evaluation path\to\manifest.json path\to\results
```

The results directory contains `restored_*.png` files and `enhancement-evaluation.json`. Keep the
dataset license and provenance accurate when sharing a report; reports include local file paths.
Do not mark restoration quality as validated until all categories have representative results and
the images have been visually reviewed.
