import { ImageAsset, SmartCollectionRules } from '../types';

export function sourceFolderForPath(sourcePath: string): string {
  const lastSeparator = Math.max(sourcePath.lastIndexOf('/'), sourcePath.lastIndexOf('\\'));
  if (lastSeparator < 0) return '.';
  if (lastSeparator === 0) return sourcePath.slice(0, 1);
  if (lastSeparator === 2 && /^[a-z]:/i.test(sourcePath)) {
    return sourcePath.slice(0, 3);
  }
  return sourcePath.slice(0, lastSeparator);
}

export function matchesSmartCollectionRules(
  asset: ImageAsset,
  rules: SmartCollectionRules,
): boolean {
  if (asset.rating < rules.minimum_rating) return false;
  if (rules.flag !== 'all' && asset.flag !== rules.flag) return false;

  if (rules.source_folder) {
    const assetFolder = sourceFolderForPath(asset.source_path);
    const isWindowsPath = asset.source_path.includes('\\') || /^[a-z]:/i.test(asset.source_path);
    if (
      isWindowsPath
        ? assetFolder.toLocaleLowerCase() !== rules.source_folder.toLocaleLowerCase()
        : assetFolder !== rules.source_folder
    ) {
      return false;
    }
  }

  const query = rules.search.trim().toLocaleLowerCase();
  if (!query) return true;
  const searchableValues = [
    asset.file_name,
    asset.camera_model,
    asset.lens_model,
    asset.metadata_overrides?.title,
    asset.metadata_overrides?.description,
    asset.metadata_overrides?.creator,
    asset.metadata_overrides?.copyright,
    asset.metadata_overrides?.usage_terms,
    ...(asset.metadata_overrides?.keywords ?? []),
  ];
  return searchableValues.some((value) => value?.toLocaleLowerCase().includes(query));
}
