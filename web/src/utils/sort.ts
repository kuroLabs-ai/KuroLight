export function compareAsciiInsensitive(left: string, right: string): number {
  const foldAscii = (value: string) =>
    value.replace(/[A-Z]/g, (character) => character.toLowerCase());
  const foldedLeft = foldAscii(left);
  const foldedRight = foldAscii(right);
  if (foldedLeft < foldedRight) return -1;
  if (foldedLeft > foldedRight) return 1;
  return 0;
}
