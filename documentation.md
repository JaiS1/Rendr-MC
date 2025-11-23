# Project Documentation: Gemini Minecraft Viewer

## Overview

This project is a real-time WebGL Minecraft World Viewer built with **React**, **Three.js (React-Three-Fiber)**, and **Zustand**. It is designed to load, parse, and render Minecraft world data (.mca files) interactively in the browser.

## Core Rendering Architecture

### 1. Asset Management (`src/core/TextureManager.js`)

- **Strategy**: Runtime texture atlas generation.
- **Input**: Individual block textures from `public/textures/block/` and standard entity skins (e.g., `public/textures/entity/chest/`).
- **Processing**:
  - Loads all registered block textures.
  - **Dynamic Texture Composition**: Slices and recomposes entity skins (e.g., `entity/chest/normal.png`) into standard block faces (`chest_front`, `chest_side`, `chest_top`) to support block-based rendering of complex models.
  - Packs images into a single `CanvasTexture` atlas.
  - Generates a `uvMap` (name -> `{uMin, uMax, vMin, vMax}`) for geometry mapping.
- **Visual Style**: Enforces `NearestFilter` for crisp, pixel-perfect rendering.

### 2. Block Registry (`src/core/BlockRegistry.js`)

- Central dictionary (`BLOCKS`) defining block properties for ~140 implemented blocks:
  - `id`: Numeric ID matching internal chunk data.
  - `name`: Display name.
  - `texture`: Texture filename(s). Supports single string or object `{top, bottom, side}`.
  - `isTransparent`: Affects face culling (e.g., Glass, Water, Leaves).
  - `isFluid`: Triggers custom fluid geometry logic.
  - `geometry`: Type definition driving the mesher:
    - `cube`: Standard block.
    - `fluid`: Water/Lava with height logic.
    - `stairs`, `slab`: Partial blocks with orientation support.
    - `cross`: Diagonal planes (Flowers, Saplings).
    - `rail`, `ladder`, `trapdoor`: Thin 3D shapes with specific depth.
    - `custom`: Special handling (e.g., Chest).

### 3. Geometry Engine (`src/core/ChunkMesher.js`)

- **Approach**: Generates a **single BufferGeometry per chunk** (16x16x16) to minimize draw calls.
- **Input**: Takes `{ ids, metadata }` arrays to support block state (orientation/type).
- **Face Culling**:
  - Checks neighbors (x±1, y±1, z±1).
  - Skips faces hidden by opaque blocks.
  - Handles special cases for Fluids (cull against same fluid) and Transparency.
- **Geometry Factories**:
  - **Cube**: Standard blocks. Handles custom sizes (e.g., Chest is 0.875, centered X/Z, grounded Y).
  - **Fluid**: Adjusts height based on neighbor (1.0 if water above, 0.9 otherwise).
  - **Stairs**: Complex UV mapping (partial textures) to prevent squishing. Supports 4 cardinal directions (North, South, East, West) via metadata.
  - **Slabs**: Supports Top/Bottom placement via metadata. Correctly maps bottom-half UVs for side faces.
  - **Cross**: Renders two diagonal planes for plants.
  - **Thin Blocks (Rail/Ladder/Trapdoor)**: Renders using `addBox` with small thickness (e.g., 0.05) to provide physical depth rather than flat planes.
- **Tinting**:
  - Applies vertex colors.
  - **Foliage**: Green tint for Oak, Birch, Spruce, Jungle, Acacia, Dark Oak leaves.
  - **Grass**: Green tint on **Top Face ONLY**.
  - **Water**: Blue tint.

### 4. World Generation (`src/world/TestWorldGenerator.js`)

- Generates a procedural "Test Chunk" designed to verify rendering logic.
- **Return Format**: `{ ids, metadata }` (Uint8Arrays).
- **Content**:
  - **Block Grid**: Systematically places all registered blocks in a grid with spacing for inspection.
  - **Functional Showcase**: Specific area testing Stairs (all rotations), Slabs (Top/Bottom), Rails, and Ladders (wall attachment).
  - **Geometry Tests**: Fluids, Floating blocks, Transparent blocks.

### 5. Scene & Interaction (`src/components/WorldScene.jsx`)

- **Camera**: `OrthographicCamera` at isometric position (20, 20, 20).
- **Controls (RTS Style)**:
  - **Primary**: `MapControls` (Pan only).
    - **Left Click + Drag**: Pan map.
    - **Right Click**: Disabled (rotation disabled on main canvas).
    - **Zoom**: Mouse wheel.
  - **Keyboard**: WASD movement (screen-relative/world-aligned).
  - **Edge Scrolling**: Moves camera when mouse nears screen edge (Threshold: 15px, Speed: 15).
- **Gizmo Interaction**:
  - **GizmoViewcube**: Interactive cube in top-right.
  - **Rotation**: Click and drag the cube to rotate the view freely.
  - **Snap**: Click faces/edges to snap to specific angles.
  - **Layering**: Includes a semi-transparent background plane correctly layered behind the 3D gizmo.
- **Raycaster**:
  - Custom logic to map Ray intersection -> Voxel Coordinate.
  - Includes epsilon adjustment to prevent Z-fighting precision errors.
  - Filters out Air blocks.
- **UI**:
  - **Tooltip**: Shows Block Name, ID, and Coordinates.

## Current Status (Phase 1.8 Complete: RTS Controls)

- [x] **Rendering Core**: Operational with texture atlas & tinting.
- [x] **Complex Geometry**: Stairs, Slabs, Cross, Thin blocks, Chests.
- [x] **Block Library**: Expanded to ~140 blocks.
- [x] **Metadata Support**: Rotation/type data.
- [x] **Controls**: RTS-style camera (WASD, Edge Scroll, Drag Pan).
- [x] **Gizmo**: Interactive Cube for rotation, properly layered.

## Known Issues & Open Items

1.  **Fluid Physics**: Water is static; no flow logic.
2.  **Lighting**: Basic `Ambient` + `Directional`. No voxel-based lighting (AO, sky light, block light) yet.
3.  **Culling Edge Cases**: Glass next to Glass logic is simplified.

## Future Plans

- **Phase 2: MCA Parsing**: Implement `NBT` parsing to read actual `.mca` Region files from disk.
- **Phase 3: Infinite World**: Implement dynamic chunk loading/unloading based on camera position.
- **Advanced Rendering**:
  - Ambient Occlusion (AO) baking in vertex colors.
  - Transparency Sorting (alpha blending issues with multiple transparent layers).
  - Custom Shaders for water animation.
