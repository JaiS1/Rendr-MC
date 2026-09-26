# Open-source landscape

A survey of related open-source projects, taken during the 2026 refresh. Star counts and activity dates are approximate.

## Closest related work (AI that builds in a browser-rendered world)

| Project | What it does | How Rendr's approach differs |
|---|---|---|
| [NoblerWorks-HQ/minecraft-agentic](https://github.com/NoblerWorks-HQ/minecraft-agentic) (6★, MIT) | Prompt → LLM plan → 4 Mineflayer bots build live in prismarine-viewer → optional vision critique + repair | Needs a real MC server, Docker and bots, and uses the stock viewer. Rendr's approach is browser-only with its own renderer |
| [mc-bench](https://github.com/mc-bench/orchestrator) (mcbench.ai, 168★) | LLMs write build code, which runs on server containers; humans vote on the results | One-shot builds for benchmarking, with no self-correction or editor. Its prompt set would make a good eval set |
| [ForgeScript-MC-Builder](https://github.com/yimeng-YM/ForgeScript-MC-Builder) (4★) | LLM → JS in QuickJS → three.js preview → .litematic | A static preview only: no live world and no critique loop |
| [CyniaAI/BuilderGPT](https://github.com/CyniaAI/BuilderGPT) (163★, Apache-2) | One-shot LLM → schematic | Same gap |
| [Mindcraft](https://github.com/mindcraft-bots/mindcraft) (5.8k★), [Voyager](https://github.com/MineDojo/Voyager) (7.2k★) | LLM agents that play survival | Aimed at gameplay, not architecture |

Research to cite: [APT (2411.17255)](https://arxiv.org/abs/2411.17255), which uses blueprints with reflection; [T2BM (2406.08751)](https://arxiv.org/abs/2406.08751), which runs refine → build → repair; and [MineCEraft (2608.28884)](https://arxiv.org/html/2608.28884), which finds LLMs unreliable at basic construction. That last result motivates the vision loop.

## Candidate dependencies

- [misode/deepslate](https://github.com/misode/deepslate) (MIT): block models, blockstates, resource packs, WebGL structure rendering
- [NBTify](https://github.com/Offroaders123/NBTify) (MIT): NBT library built for the web
- [PrismarineJS/minecraft-data](https://github.com/PrismarineJS/minecraft-data): block/state registry, used to validate agent output
- [prismarine-schematic](https://github.com/PrismarineJS/prismarine-schematic) (MIT): .schem export
- [prismarine-chunk](https://github.com/PrismarineJS/prismarine-chunk) (MIT): chunk data model

## Reference only (borrow ideas)

- Renderers: [prismarine-viewer](https://github.com/PrismarineJS/prismarine-viewer), [minecraft-web-client](https://github.com/zardoy/minecraft-web-client), [BlueMap](https://github.com/BlueMap-Minecraft/BlueMap) (LOD/tiling), [Chunky](https://github.com/chunky-dev/chunky) (beauty shots), [mcmap](https://github.com/spoutn1k/mcmap) (isometric)
- Engines: [DivineVoxelEngine](https://github.com/Divine-Star-Software/DivineVoxelEngine) (worker meshing), [noa](https://github.com/fenomas/noa), [greedy-mesher](https://github.com/mikolalysenko/greedy-mesher) / [ao-mesher](https://github.com/mikolalysenko/ao-mesher)
- Editors: [Amulet](https://github.com/Amulet-Team/Amulet-Map-Editor) (desktop), [SchematicWebViewer](https://github.com/EngineHub/SchematicWebViewer), [ObjToSchematic](https://github.com/LucasDower/ObjToSchematic) (mesh → blocks)
- Agent API design: [GDMC gdpc](https://github.com/avdstaaij/gdpc) and its [HTTP interface](https://github.com/Niels-NTG/gdmc_http_interface)

## What Rendr would build itself

1. A chunked renderer with greedy meshing, baked AO and meshing in web workers
2. A browser .mca/Anvil reader and a .litematic reader/writer (no mature JS library exists for .litematic)
3. A WorldEdit-style edit model: selections, undo/redo, brushes
4. An agent tool layer: high-level ops that expand into block diffs streamed over SSE
5. A multi-angle headless render for vision critique, plus an eval harness that scores builds with and without critique
