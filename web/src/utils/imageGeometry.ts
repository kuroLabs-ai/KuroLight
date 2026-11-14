import type { GeometrySettings } from '@/interfaces/edit';

export function getGeometryRotation(geometry: GeometrySettings): number {
  return geometry.rotation + geometry.straighten;
}

export function getRotatedImageDimensions(
  width: number,
  height: number,
  rotationDegrees: number
): { width: number; height: number } {
  const radians = (rotationDegrees * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  return {
    width: Math.max(1, Math.ceil(height * sine + width * cosine - 1e-9)),
    height: Math.max(1, Math.ceil(height * cosine + width * sine - 1e-9)),
  };
}

export function rotatedUvToImageUv(
  uv: { x: number; y: number },
  width: number,
  height: number,
  rotationDegrees: number,
  horizontalFlip: boolean,
  verticalFlip: boolean
): { x: number; y: number } {
  const maxDimension = Math.max(width, height, 1);
  const sourceScaleX = width / maxDimension;
  const sourceScaleY = height / maxDimension;
  const rotatedDimensions = getRotatedImageDimensions(width, height, rotationDegrees);
  const rotatedScaleX = rotatedDimensions.width / maxDimension;
  const rotatedScaleY = rotatedDimensions.height / maxDimension;
  const radians = (rotationDegrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const outputX = (uv.x - 0.5) * rotatedScaleX;
  const outputY = (uv.y - 0.5) * rotatedScaleY;
  let x = 0.5 + (cosine * outputX - sine * outputY) / sourceScaleX;
  let y = 0.5 + (sine * outputX + cosine * outputY) / sourceScaleY;
  if (horizontalFlip) x = 1 - x;
  if (verticalFlip) y = 1 - y;
  return { x, y };
}

export function imageUvToRotatedUv(
  uv: { x: number; y: number },
  width: number,
  height: number,
  rotationDegrees: number,
  horizontalFlip: boolean,
  verticalFlip: boolean
): { x: number; y: number } {
  const maxDimension = Math.max(width, height, 1);
  const sourceScaleX = width / maxDimension;
  const sourceScaleY = height / maxDimension;
  const rotatedDimensions = getRotatedImageDimensions(width, height, rotationDegrees);
  const rotatedScaleX = rotatedDimensions.width / maxDimension;
  const rotatedScaleY = rotatedDimensions.height / maxDimension;
  const radians = (rotationDegrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const sourceX = (horizontalFlip ? 1 - uv.x : uv.x) - 0.5;
  const sourceY = (verticalFlip ? 1 - uv.y : uv.y) - 0.5;
  const outputX =
    (cosine * sourceX * sourceScaleX + sine * sourceY * sourceScaleY) / rotatedScaleX;
  const outputY =
    (-sine * sourceX * sourceScaleX + cosine * sourceY * sourceScaleY) / rotatedScaleY;
  return { x: 0.5 + outputX, y: 0.5 + outputY };
}
