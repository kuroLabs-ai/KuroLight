# GPU Acceleration Policy: Benchmarks, CPU Fallback, and Output Tolerance

This document defines the technical criteria, benchmarks, CPU fallback contract, and
numerical output tolerance requirements for enabling hardware GPU acceleration in KuroLight.

---

## 1. Core Policy Principle

> **Rule**: GPU acceleration is considered **only after empirical benchmarks** prove a net
> speedup over CPU execution on target tile dimensions. CPU execution is the authoritative
> reference implementation, and automatic fallback is guaranteed under all circumstances.

---

## 2. Why GPU Acceleration is Conditional

In photo processing applications, hardware acceleration introduces non-trivial overheads:
1. **PCIe Transfer Latency**: Moving pixel buffers back and forth between system RAM and GPU VRAM
   can exceed the compute time of simple operations (e.g. 64×64 tile convolution).
2. **Kernel Initialization & JIT Compiles**: DirectML / CUDA shader compilation can induce first-frame
   stutter or high memory allocation spikes.
3. **Driver Flakiness & Out-Of-Memory**: Mobile or integrated GPUs (Intel UHD / Iris Xe, AMD Radeon Vega)
   frequently throttle or run out of memory when processing 4K photographic rasters.

Therefore, GPU execution is never assumed to be faster; it must be benchmarked using
`scripts/benchmark_gpu.py` across tile sizes (64×64, 128×128, 256×256) before promotion to default.

---

## 3. Seamless CPU Fallback Contract

KuroLight enforces a 100% resilient fallback chain:

```
[Inference Request]
         │
         ▼
[Detect Available Providers] (DirectML -> CUDA -> CPU)
         │
         ├─► Provider Available & enable_gpu = True
         │        │
         │        ▼
         │   [Attempt GPU Execution]
         │        │
         │        ├─► Success ──► Return GPU Output
         │        │
         │        └─► Exception (OOM, driver fault, ORT fail)
         │                 │
         │                 ▼ (Catch _ort_errors / cv2.error)
         │            [Log Fallback Event]
         │                 │
         └─────────────────┼──────────────┐
                           │              │
                           ▼              ▼
                 [Execute on CPU]   (Authoritative Reference)
                           │
                           ▼
                 [Return Output Without Failure]
```

Under NO circumstance does a GPU error crash the host application or abort a user's export batch.
The user is informed via non-modal notification, and execution smoothly proceeds on the CPU.

---

## 4. Documented Numerical Output Tolerance

GPU hardware acceleration (using FP16, Tensor Cores, or Fast Math compiler optimizations) produces
slight floating-point rounding variations compared to standard 64-bit/32-bit IEEE 754 CPU SIMD math.

To preserve color fidelity and prevent perceptible rendering artifacts, all accelerated pipelines
must adhere to strict numerical tolerance thresholds measured against CPU reference output:

| Metric | Tolerance Threshold | Photographic Justification |
|---|---|---|
| **Max Absolute Delta** | $\le \frac{2}{255} \approx 0.00784$ | Prevents any perceptible color banding or posterization on 8-bit displays. |
| **Mean Absolute Error (MAE)** | $< 0.002$ | Ensures overall image tonality remains indistinguishable from reference. |
| **Peak Signal-to-Noise Ratio (PSNR)** | $\ge 42.0\text{ dB}$ | Industry standard for high-fidelity, visually lossless photographic reconstruction. |
| **Structural Similarity Index (SSIM)** | $\ge 0.995$ | Guarantees that edge geometry, texture contrast, and structural details are preserved. |

These tolerances are validated automatically in `tests/test_gpu_benchmark_and_tolerance.py`.
Any acceleration path exceeding these bounds is rejected.
