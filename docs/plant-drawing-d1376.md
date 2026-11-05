# GFL A drawing integration

## PDF alignment review — 2026-11-05

The current model contains **219 footprints and facility areas**, including **99 reviewed additions** to the previous 120. The review reconstructed split CAD linework, inspected the resulting outlines over the rendered original PDF, and linked all non-gate locations in the existing 87-location directory. Six previously unnamed parts were linked to R-125 Plant, PVDF Plant and Fluoro Intermediate Plant. The material-entry corridor was corrected from a raised building to a ground reservation.

Additions include PTFE Warehouse and its adjoining wing, A-PTFE, PTPTFE, TFE Monomer I, CPP Office, Control Room, Central Workshop, refrigeration blocks, electrical substations, cooling towers, tank areas, both eastern ponds, the fire-water reservoir, and storage yards. PTPFA is represented as the source's open site plot around the separately drawn HGN and Semicon structures, rather than a fictional roof across the plot. Parking, proposed plots, contractor yards and the tank-farm reservation drawn across the southern road remain ground-level areas.

Reviewed geometry is stored in `src/features/map/reviewedFootprints.json` in original PDF coordinates, with source CAD path references and review notes. `scripts/build-plant-world.py` reapplies it when regenerating the model. Some open boundaries required reviewed closure/tracing; these are identified in the review notes. This is not a surveyed building/equipment inventory, and unknown heights and equipment arrangements remain illustrative.

Roads were retraced north of Control Room and below the fire-water reservoir. Road clearance was checked against every raised footprint before cleanup. Illustrative process equipment avoids mapped building/tank bounds. Roof/façade and location-coverage checks passed before the map test files were removed as requested. The rebuild script can regenerate the source overlay at `tmp/pdfs/world-footprints-check.png` for visual review. Historical counts below describe earlier revisions.

Source: GFL-COM-CIVL-LYOD-D1376.pdf, supplied by the user. One page, 1684 × 1191 PDF points. The title reads “BLOCK DIAGRAM OF GFL A”. The original file is copied without modification to public/maps/.

The map uses a high-resolution rendering of the actual drawing. Crop: (90, 90) to (1220, 1070) in PDF page coordinates. This retains the plant and southern extension while excluding the separate title block. The complete sheet remains available through Original PDF.

Both views use a 2000-unit width and proportionate height. Location conversion is x = (PDF x − 90) × 2000 / 1130 and y = (PDF y − 90) × 2000 / 1130. Three.js subtracts half the drawing width/height to center the sheet. It does not rotate, mirror, stretch, or reuse the old district coordinates.

87 selectable locations are anchored to manually reviewed PDF label groups. Each record retains its source text, source block indices, and original PDF anchor for auditing. Points identify labels, not surveyed equipment coordinates or facility footprints. Categories support directory navigation; no owners, district assignments, operational statuses, or permit counts are inferred from the drawing.

The original safety-district drawing remains accessible as Safety-district reference with its own source label and coordinate system. It is not overlaid on D1376.

The 3D world uses 123 extracted CAD outlines, 25 schematic road paths, boundary walls, industrial roofs/equipment, and 1,848 clustered vegetation positions rendered as instanced trees. All 87 directory locations support smooth camera focus, close-up visits, previous/next selection, and a pausable tour. Manual orbit/pan stops the tour. Building heights, tanks, rooftop equipment, tree dimensions, and road widths are illustrative; the source is a block diagram, not a surveyed 3D model. Complex or open CAD outlines are not reconstructed as verified building footprints. The model does not provide safe walking routes or building interiors. The 2D view provides pan, zoom, and the same labeled points. WebGL failure switches to 2D. The source PDF is available locally in the BSP application. PNG and PDF are included in the SAP binary upload rules.

Validation includes reversible PDF-to-map coordinate conversion, crop bounds, image aspect ratio, original PDF SHA-256 identity, southern extension coverage, and BSP asset integrity. A rendered close-up was inspected for PTPFA, Semicon, HGN, and the southern main gate. Browser automation timed out; live interaction and SAP upload verification remain pending.

Geometry can be regenerated with scripts/build-plant-world.py using PyMuPDF and the bundled source PDF. The extraction preview is written to tmp/pdfs/world-footprints-check.png. Footprints retain source path references; assembled line loops have generated path indices.

2026-11-04 world validation: TypeScript and 157 application tests passed. Browser preview attachment timed out, so visual 3D interaction verification remains pending.


Road and hover correction: retraced bends around D.I. Water and the eastern production areas against the PDF. Removed three road/gate annotation outlines from raised structures; two reserved plot outlines are now flat yards. The world has 120 outlines and 27 road paths. Road shoulders use source-corridor clearance rather than a single width; automated checks reject centerline crossings and shoulder overlap with raised footprints. Roofs and equipment inherit their footprint hover label. Unverified names are shown as “Unlabeled structure”, with a drawing reference, instead of guessing the nearest facility. Picking respects the nearest surface. Browser visual verification remains pending after the previous Computer Use URL-identification block.
