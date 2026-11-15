import React, { useState } from 'react';
import { AssetMetadataOverrides, ImageAsset } from '../../types';
import { GalleryThumbnail } from './GalleryThumbnail';
import { 
  Star, 
  Flag, 
  SlidersHorizontal, 
  FileText,
  PanelRightClose,
  Save,
} from 'lucide-react';

interface GalleryInspectorProps {
  selectedAssets: ImageAsset[];
  onOpenInLightbox: (id: string) => void;
  onSetRating: (rating: number) => void;
  onSetFlag: (flag: string) => void;
  onSaveMetadataOverrides: (
    assetId: string,
    overrides: AssetMetadataOverrides,
  ) => Promise<AssetMetadataOverrides>;
  width?: number;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const GalleryInspector: React.FC<GalleryInspectorProps> = ({
  selectedAssets,
  onOpenInLightbox,
  onSetRating,
  onSetFlag,
  onSaveMetadataOverrides,
  width = 288,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'exif' | 'metadata'>('overview');

  const count = selectedAssets.length;
  const single = count === 1 ? selectedAssets[0] : null;

  // Single asset calculations
  const meta = single?.metadata || {};
  const fileSizeMb = single?.file_size ? (single.file_size / (1024 * 1024)).toFixed(2) : '—';
  const dimensionsStr = single?.width && single?.height ? `${single.width} × ${single.height} px` : '—';
  const megapixelsStr = single?.width && single?.height 
    ? `${((single.width * single.height) / 1000000).toFixed(1)} MP` 
    : '—';
  
  const cameraStr = meta.camera_model || single?.camera_model || meta.camera_make || '—';
  const lensStr = meta.lens_model || single?.lens_model || '—';

  const exposureParts: string[] = [];
  if (meta.focal_length_mm || single?.focal_length) exposureParts.push(`${meta.focal_length_mm || single?.focal_length}mm`);
  if (meta.aperture_f_number || single?.f_number) exposureParts.push(`ƒ/${meta.aperture_f_number || single?.f_number}`);
  if (meta.shutter_speed_str || single?.shutter_speed) exposureParts.push(`${meta.shutter_speed_str || single?.shutter_speed}`);
  if (meta.iso || single?.iso) exposureParts.push(`ISO ${meta.iso || single?.iso}`);
  const exposureStr = exposureParts.length > 0 ? exposureParts.join(' • ') : '—';

  // Batch calculations
  const totalSizeBytes = selectedAssets.reduce((acc, a) => acc + (a.file_size || 0), 0);
  const totalSizeMb = (totalSizeBytes / (1024 * 1024)).toFixed(1);
  const uniqueFormats = Array.from(new Set(selectedAssets.map(a => (a.format || 'IMG').toUpperCase())));

  // EXIF table fields
  const exifFields = single ? [
    { label: 'File Name', value: single.file_name },
    { label: 'Format', value: (meta.format || single.format || 'RAW/JPEG').toUpperCase() },
    { label: 'Dimensions', value: dimensionsStr },
    { label: 'Megapixels', value: megapixelsStr },
    { label: 'File Size', value: `${fileSizeMb} MB` },
    { label: 'Camera Make', value: meta.camera_make || '—' },
    { label: 'Camera Model', value: cameraStr },
    { label: 'Lens Model', value: lensStr },
    { label: 'Focal Length', value: meta.focal_length_mm ? `${meta.focal_length_mm} mm` : '—' },
    { label: 'Aperture', value: meta.aperture_f_number ? `ƒ/${meta.aperture_f_number}` : '—' },
    { label: 'Shutter Speed', value: meta.shutter_speed_str || '—' },
    { label: 'ISO Sensitivity', value: meta.iso ? `ISO ${meta.iso}` : '—' },
    { label: 'Exposure Bias', value: meta.exposure_compensation != null ? `${meta.exposure_compensation > 0 ? '+' : ''}${meta.exposure_compensation} EV` : '—' },
    { label: 'Capture Date', value: single.date_taken || '—' },
    { label: 'Source Path', value: single.source_path },
  ] : [];

  if (isCollapsed) return null;

  return (
    <div
      style={{ width: `${width}px` }}
      className="bg-obsidian-card border-l border-obsidian-border flex flex-col h-full select-none text-xs flex-shrink-0 transition-[width] duration-75 overflow-hidden"
    >
      {/* ── Header ── */}
      <div className="p-3 border-b border-obsidian-border flex items-center justify-between">
        <span className="font-bold text-[11px] tracking-wider text-obsidian-textMut truncate">
          {count === 0 && 'IMAGE METADATA'}
          {count === 1 && 'IMAGE METADATA'}
          {count > 1 && `BATCH SELECTION (${count})`}
        </span>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            title="Collapse Inspector"
            className="p-1 rounded hover:bg-obsidian-hover hover:text-white text-obsidian-textMut transition-colors"
          >
            <PanelRightClose size={13} />
          </button>
        )}
      </div>

      {count === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-obsidian-textMut">
          <FileText size={36} className="mb-2 opacity-30" />
          <p className="font-medium text-xs">No photograph selected</p>
          <p className="text-[11px] mt-1 text-obsidian-textMut/70">
            Click on any photo in the library to inspect its EXIF details and apply ratings.
          </p>
        </div>
      )}

      {count > 0 && (
        <div className="flex-1 flex flex-col p-3 overflow-y-auto space-y-3">
          {/* ── Preview Thumbnail (for single selection) ── */}
          {single && (
            <div
              className="w-full h-48 rounded-lg bg-obsidian-deep/95 overflow-hidden border border-obsidian-border relative group flex items-center justify-center p-1 cursor-pointer transition-all hover:border-obsidian-accent/60"
              onClick={() => onOpenInLightbox(single.id)}
              title="Click to inspect in Lightbox"
            >
              <GalleryThumbnail
                key={single.id}
                assetId={single.id}
                alt={single.file_name}
                className="h-full w-full flex items-center justify-center"
                objectFit="contain"
                fallback={<span className="text-obsidian-textMut font-mono text-xs">NO PREVIEW</span>}
              />
              <div className="absolute top-2 left-2 bg-black/80 backdrop-blur-sm px-1.5 py-0.5 rounded text-[10px] font-mono text-white border border-white/10 shadow-sm pointer-events-none">
                {(meta.format || single.format || 'IMG').toUpperCase()}
              </div>
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                <span className="bg-obsidian-surface/90 text-white text-[11px] font-medium px-2.5 py-1 rounded-md shadow-lg border border-obsidian-border">
                  Open in Lightbox ↗
                </span>
              </div>
            </div>
          )}

          {/* ── Rating & Flag Action Bar ── */}
          <div className="bg-obsidian-deep p-2.5 rounded-lg border border-obsidian-border space-y-2">
            {/* Rating Stars */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-obsidian-textMut">RATING</span>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => {
                  const currRating = single ? single.rating : 0;
                  const isFilled = star <= currRating;
                  return (
                    <button
                      key={star}
                      onClick={() => onSetRating(star === currRating ? 0 : star)}
                      className={`p-1 rounded transition-colors ${
                        isFilled
                          ? 'text-yellow-400 hover:text-yellow-300'
                          : 'text-obsidian-borderLt hover:text-yellow-400/80'
                      }`}
                      title={`Rate ${star} Stars`}
                    >
                      <Star size={14} className={isFilled ? 'fill-current' : ''} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Flag Buttons */}
            <div className="flex items-center justify-between pt-1 border-t border-obsidian-border/50">
              <span className="text-[10px] font-bold text-obsidian-textMut">FLAG</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onSetFlag('flagged')}
                  className={`px-2 py-0.5 rounded text-[10.5px] font-medium flex items-center gap-1 transition-colors ${
                    single?.flag === 'flagged'
                      ? 'bg-blue-600 text-white font-bold'
                      : 'bg-obsidian-elevated text-obsidian-textSec hover:text-white'
                  }`}
                  title="Mark as Pick (P)"
                >
                  <Flag size={11} className={single?.flag === 'flagged' ? 'fill-current' : ''} />
                  <span>Pick</span>
                </button>
                <button
                  onClick={() => onSetFlag('unflagged')}
                  className={`px-2 py-0.5 rounded text-[10.5px] font-medium transition-colors ${
                    !single?.flag || single.flag === 'unflagged'
                      ? 'bg-obsidian-active text-white'
                      : 'bg-obsidian-elevated text-obsidian-textSec hover:text-white'
                  }`}
                  title="Remove Flag (U)"
                >
                  Clear
                </button>
                <button
                  onClick={() => onSetFlag('rejected')}
                  className={`px-2 py-0.5 rounded text-[10.5px] font-medium flex items-center gap-1 transition-colors ${
                    single?.flag === 'rejected'
                      ? 'bg-red-700 text-white font-bold'
                      : 'bg-obsidian-elevated text-obsidian-textSec hover:text-red-400'
                  }`}
                  title="Mark as Reject (X)"
                >
                  <span>✕ Reject</span>
                </button>
              </div>
            </div>
          </div>

          {/* ── Single Asset Details Tab ── */}
          {single && (
            <div className="flex-1 flex flex-col">
              <div className="flex border-b border-obsidian-border mb-2">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`flex-1 py-1 text-center font-bold text-[10.5px] transition-colors border-b-2 ${
                    activeTab === 'overview'
                      ? 'border-obsidian-accent text-white'
                      : 'border-transparent text-obsidian-textMut hover:text-obsidian-textSec'
                  }`}
                >
                  Overview
                </button>
                <button
                  onClick={() => setActiveTab('exif')}
                  className={`flex-1 py-1 text-center font-bold text-[10.5px] transition-colors border-b-2 ${
                    activeTab === 'exif'
                      ? 'border-obsidian-accent text-white'
                      : 'border-transparent text-obsidian-textMut hover:text-obsidian-textSec'
                  }`}
                >
                  Technical EXIF
                </button>
                <button
                  onClick={() => setActiveTab('metadata')}
                  className={`flex-1 py-1 text-center font-bold text-[10.5px] transition-colors border-b-2 ${
                    activeTab === 'metadata'
                      ? 'border-obsidian-accent text-white'
                      : 'border-transparent text-obsidian-textMut hover:text-obsidian-textSec'
                  }`}
                >
                  Edit Metadata
                </button>
              </div>

              {activeTab === 'overview' ? (
                <div className="space-y-2 text-[11px]">
                  <div>
                    <span className="text-obsidian-textMut block text-[10px] font-bold">FILENAME</span>
                    <span className="text-white font-medium break-all">{single.file_name}</span>
                  </div>

                  <div>
                    <span className="text-obsidian-textMut block text-[10px] font-bold">CAMERA</span>
                    <span className="text-white">{cameraStr}</span>
                  </div>

                  <div>
                    <span className="text-obsidian-textMut block text-[10px] font-bold">LENS</span>
                    <span className="text-white">{lensStr}</span>
                  </div>

                  <div>
                    <span className="text-obsidian-textMut block text-[10px] font-bold">EXPOSURE</span>
                    <span className="text-obsidian-accent font-mono">{exposureStr}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <span className="text-obsidian-textMut block text-[10px] font-bold">DIMENSIONS</span>
                      <span className="text-white">{dimensionsStr}</span>
                    </div>
                    <div>
                      <span className="text-obsidian-textMut block text-[10px] font-bold">RESOLUTION</span>
                      <span className="text-white">{megapixelsStr}</span>
                    </div>
                    <div>
                      <span className="text-obsidian-textMut block text-[10px] font-bold">FILE SIZE</span>
                      <span className="text-white">{fileSizeMb} MB</span>
                    </div>
                    <div>
                      <span className="text-obsidian-textMut block text-[10px] font-bold">DATE TAKEN</span>
                      <span className="text-white truncate block">{single.date_taken || '—'}</span>
                    </div>
                  </div>
                </div>
              ) : activeTab === 'exif' ? (
                <div className="space-y-1.5 text-[10.5px] overflow-y-auto max-h-60 pr-1">
                  {exifFields.map((f, i) => (
                    <div key={i} className="flex justify-between py-1 border-b border-obsidian-border/40 gap-2">
                      <span className="text-obsidian-textMut flex-shrink-0">{f.label}</span>
                      <span className="text-white text-right font-mono truncate" title={String(f.value || '')}>{f.value || '—'}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              <div hidden={activeTab !== 'metadata'}>
                <MetadataOverridesEditor
                  key={single.id}
                  asset={single}
                  onSave={onSaveMetadataOverrides}
                />
              </div>
            </div>
          )}

          {/* ── Batch Selection Summary ── */}
          {count > 1 && (
            <div className="flex-1 space-y-2.5 text-[11px] bg-obsidian-deep/50 p-3 rounded-lg border border-obsidian-border">
              <div>
                <span className="text-obsidian-textMut block text-[10px] font-bold">SELECTED COUNT</span>
                <span className="text-white font-semibold text-sm">{count} Photographs</span>
              </div>
              <div>
                <span className="text-obsidian-textMut block text-[10px] font-bold">TOTAL SIZE</span>
                <span className="text-white">{totalSizeMb} MB</span>
              </div>
              <div>
                <span className="text-obsidian-textMut block text-[10px] font-bold">FORMATS</span>
                <span className="text-white">{uniqueFormats.join(', ') || '—'}</span>
              </div>
              <p className="text-[10px] text-obsidian-textMut/80 leading-relaxed pt-2 border-t border-obsidian-border">
                Rating and Flag buttons above will be applied to all {count} selected photographs.
              </p>
            </div>
          )}

          {/* ── Open in Lightbox Action Button ── */}
          <div className="pt-2">
            <button
              onClick={() => onOpenInLightbox(selectedAssets[0].id)}
              className="w-full py-2 px-3 bg-obsidian-accent hover:bg-blue-600 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-colors"
            >
              <SlidersHorizontal size={14} />
              <span>{count > 1 ? 'Open First in Lightbox ➔' : 'Open in Lightbox ➔'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

interface MetadataOverridesEditorProps {
  asset: ImageAsset;
  onSave: (
    assetId: string,
    overrides: AssetMetadataOverrides,
  ) => Promise<AssetMetadataOverrides>;
}

const MetadataOverridesEditor: React.FC<MetadataOverridesEditorProps> = ({ asset, onSave }) => {
  const [title, setTitle] = useState(asset.metadata_overrides?.title ?? '');
  const [description, setDescription] = useState(asset.metadata_overrides?.description ?? '');
  const [keywords, setKeywords] = useState((asset.metadata_overrides?.keywords ?? []).join('\n'));
  const [creator, setCreator] = useState(asset.metadata_overrides?.creator ?? '');
  const [copyright, setCopyright] = useState(asset.metadata_overrides?.copyright ?? '');
  const [usageTerms, setUsageTerms] = useState(asset.metadata_overrides?.usage_terms ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const updated = await onSave(asset.id, {
        title,
        description,
        keywords: keywords.split(/\r?\n/).map((keyword) => keyword.trim()).filter(Boolean),
        creator,
        copyright,
        usage_terms: usageTerms,
      });
      setTitle(updated.title);
      setDescription(updated.description);
      setKeywords(updated.keywords.join('\n'));
      setCreator(updated.creator);
      setCopyright(updated.copyright);
      setUsageTerms(updated.usage_terms);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-2 text-[10.5px]">
      <p className="text-[10px] text-obsidian-textMut">
        Stored in this catalog only. Source images and sidecars are not changed.
      </p>
      <label className="block">
        <span className="mb-1 block font-bold text-obsidian-textMut">TITLE</span>
        <input
          value={title}
          onChange={(event) => { setTitle(event.target.value); setSaved(false); }}
          maxLength={256}
          className="w-full rounded border border-obsidian-border bg-obsidian-deep px-2 py-1 text-white select-text"
        />
      </label>
      <label className="block">
        <span className="mb-1 block font-bold text-obsidian-textMut">DESCRIPTION</span>
        <textarea
          value={description}
          onChange={(event) => { setDescription(event.target.value); setSaved(false); }}
          maxLength={5000}
          rows={3}
          className="w-full resize-y rounded border border-obsidian-border bg-obsidian-deep px-2 py-1 text-white select-text"
        />
      </label>
      <label className="block">
        <span className="mb-1 block font-bold text-obsidian-textMut">KEYWORDS (ONE PER LINE)</span>
        <textarea
          value={keywords}
          onChange={(event) => { setKeywords(event.target.value); setSaved(false); }}
          rows={3}
          className="w-full resize-y rounded border border-obsidian-border bg-obsidian-deep px-2 py-1 text-white select-text"
        />
      </label>
      <label className="block">
        <span className="mb-1 block font-bold text-obsidian-textMut">CREATOR / PHOTOGRAPHER</span>
        <input
          value={creator}
          onChange={(event) => { setCreator(event.target.value); setSaved(false); }}
          maxLength={256}
          className="w-full rounded border border-obsidian-border bg-obsidian-deep px-2 py-1 text-white select-text"
        />
      </label>
      <label className="block">
        <span className="mb-1 block font-bold text-obsidian-textMut">COPYRIGHT</span>
        <input
          value={copyright}
          onChange={(event) => { setCopyright(event.target.value); setSaved(false); }}
          maxLength={512}
          className="w-full rounded border border-obsidian-border bg-obsidian-deep px-2 py-1 text-white select-text"
        />
      </label>
      <label className="block">
        <span className="mb-1 block font-bold text-obsidian-textMut">USAGE TERMS</span>
        <input
          value={usageTerms}
          onChange={(event) => { setUsageTerms(event.target.value); setSaved(false); }}
          maxLength={512}
          className="w-full rounded border border-obsidian-border bg-obsidian-deep px-2 py-1 text-white select-text"
        />
      </label>
      <button
        type="submit"
        disabled={saving}
        className="flex w-full items-center justify-center gap-1.5 rounded bg-obsidian-accent px-2 py-1.5 font-bold text-white disabled:cursor-wait disabled:opacity-60"
      >
        <Save size={12} />
        {saving ? 'Saving…' : 'Save Catalog Metadata'}
      </button>
      {saved && <p role="status" className="text-green-400">Metadata saved to catalog.</p>}
      {error && <p role="alert" className="break-words text-red-400">{error}</p>}
    </form>
  );
};
