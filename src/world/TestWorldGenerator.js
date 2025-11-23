import { BLOCKS } from "../core/BlockRegistry";

export const CHUNK_SIZE = 16;

export class TestWorldGenerator {
  generateTestChunk() {
    const ids = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);
    const metadata = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);

    const setBlock = (x, y, z, blockId, meta = 0) => {
      if (
        x >= 0 &&
        x < CHUNK_SIZE &&
        y >= 0 &&
        y < CHUNK_SIZE &&
        z >= 0 &&
        z < CHUNK_SIZE
      ) {
        const index = x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
        ids[index] = blockId;
        metadata[index] = meta;
      }
    };

    // Floor (Bedrock)
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        setBlock(x, 0, z, BLOCKS.BEDROCK.id);
      }
    }

    // Showcase all blocks in a grid (with gaps)
    const allBlocks = Object.values(BLOCKS).filter(
      (b) => b.id !== BLOCKS.AIR.id
    );

    // Start from (1, 1, 1)
    // Spacing: Every 2 blocks
    let currentX = 1;
    let currentZ = 1;

    allBlocks.forEach((block) => {
      setBlock(currentX, 1, currentZ, block.id);

      currentX += 2;
      if (currentX >= CHUNK_SIZE - 1) {
        currentX = 1;
        currentZ += 2;
      }
    });

    // Special Test Area (Row 13-15) for Orientation Showcase
    // Stairs
    const stairZ = 13;
    setBlock(1, 1, stairZ, BLOCKS.OAK_STAIRS.id, 0); // East
    setBlock(3, 1, stairZ, BLOCKS.OAK_STAIRS.id, 1); // West
    setBlock(5, 1, stairZ, BLOCKS.OAK_STAIRS.id, 2); // South
    setBlock(7, 1, stairZ, BLOCKS.OAK_STAIRS.id, 3); // North

    // Slabs
    const slabZ = 14;
    setBlock(1, 1, slabZ, BLOCKS.OAK_SLAB.id, 0); // Bottom
    setBlock(3, 1, slabZ, BLOCKS.OAK_SLAB.id, 8); // Top (Bit 3)

    // Ladder Test (Attaching to blocks)
    const ladderZ = 12;
    // Block at 5,1,11
    setBlock(5, 1, 11, BLOCKS.STONE_BRICKS.id);
    // Ladder at 5,1,12 attaching to North (Z-1) -> Meta 2 (North)
    setBlock(5, 1, 12, BLOCKS.LADDER.id, 2);

    // Rail Test
    setBlock(7, 1, 12, BLOCKS.RAIL.id);
    setBlock(8, 1, 12, BLOCKS.RAIL.id);

    return { ids, metadata };
  }
}

export const testWorldGenerator = new TestWorldGenerator();
