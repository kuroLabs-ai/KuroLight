# Library and project data

## Project catalog

Each project uses a SQLite catalog managed by `ProjectService`. The catalog
stores project and asset records, ratings and flags, collections, edit states,
history, and catalog metadata. Photos are referenced by source path; they are
not copied into the catalog or modified by editing.

The application remembers the last project path and can open a selected
`.kurolight` or `.klproj` project through the Windows file association when
installed with that optional installer task.

## Import and supported extensions

The library accepts these extensions:

```text
.jpg .jpeg .png .tif .tiff .webp .bmp .gif .ico
.ppm .pgm .pbm .pnm
.dng .cr2 .cr3 .nef .arw .orf .rw2 .pef .raf .srw
```

An accepted extension does not guarantee every file decodes. RAW support
depends on the `rawpy` installation, the camera format, and the file. The
decoder may use a raster fallback when the RAW decoder cannot process a file.

Import extracts available image metadata and creates a catalog asset and
thumbnail. Duplicate handling can match by normalized source path or by
content hash. Import settings can apply creator, copyright, and usage terms to
catalog metadata overrides.

## Metadata ownership

Original EXIF and other embedded source metadata are read but are not changed
by catalog edits. Catalog-only overrides include title, description, keywords,
creator, copyright, and usage terms.

KuroLight can explicitly import or export its metadata sidecar format. Sidecar
operations are user-initiated; they do not silently rewrite source metadata.
Exported image metadata is currently stripped.

## Collections, ratings, and deletion

The library supports ratings, pick/reject flags, folders, and collections.
Recently Deleted is a recoverable catalog state: the initial delete does not
delete the source photo from disk. Permanent deletion removes the catalog
record and is controlled by the confirmation preference.

Keep an independent backup of source photos. A project backup contains the
SQLite catalog, not the original image files.

## Cache and backup

The application cache stores generated thumbnails and other managed data. A
custom cache directory affects new cache activity after saving; it does not
move existing cache contents automatically.

Catalog backups use SQLite's backup API, are integrity-checked, and follow the
configured schedule and retention count. Backups cover the active project
database only.
