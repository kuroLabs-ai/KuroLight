import exifr from 'exifr';

export interface ParsedExifData {
  cameraMake?: string;
  cameraModel?: string;
  lensModel?: string;
  focalLength?: number;
  fNumber?: number;
  exposureTime?: string;
  iso?: number;
  dateTimeOriginal?: string;
  width?: number;
  height?: number;
  latitude?: number;
  longitude?: number;
}

/**
 * Parses photographic EXIF tags directly in the browser in <2ms using exifr.
 */
export async function parsePhotoExif(
  source: File | Blob | string
): Promise<ParsedExifData | null> {
  try {
    const raw = await exifr.parse(source, {
      tiff: true,
      exif: true,
      gps: true,
      mergeOutput: true,
    });

    if (!raw) return null;

    // Convert exposure time (e.g. 0.004) to standard fraction "1/250s"
    let exposureFraction: string | undefined;
    if (typeof raw.ExposureTime === 'number') {
      if (raw.ExposureTime < 1) {
        exposureFraction = `1/${Math.round(1 / raw.ExposureTime)}s`;
      } else {
        exposureFraction = `${raw.ExposureTime.toFixed(1)}s`;
      }
    }

    return {
      cameraMake: raw.Make,
      cameraModel: raw.Model,
      lensModel: raw.LensModel || raw.Lens,
      focalLength: raw.FocalLength,
      fNumber: raw.FNumber,
      exposureTime: exposureFraction,
      iso: raw.ISO || raw.ISOSpeedRatings,
      dateTimeOriginal: raw.DateTimeOriginal ? new Date(raw.DateTimeOriginal).toISOString() : undefined,
      width: raw.ExifImageWidth || raw.ImageWidth,
      height: raw.ExifImageHeight || raw.ImageHeight,
      latitude: raw.latitude,
      longitude: raw.longitude,
    };
  } catch (err) {
    console.warn('Failed to parse EXIF metadata client-side:', err);
    return null;
  }
}
