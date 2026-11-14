# Examples

All examples use the same simple stand-in model of a ghast in game size (a body of 4 x 4 x 4 blocks with tentacles and a small demo
texture made for these examples). In the game the decks sit on Minecraft's Happy Ghast (`minecraft:happy_ghast`).

| File | What it is |
|---|---|
| `happy_ghast_three_zones.bbmodel` | A model with **three zones**: `top` on the body (the main floor, 4 x 6, spruce), `left` and `right` on the flanks (3 x 6 each, two blocks lower, dark oak, with a margin on the outer sides). |
| `happy_ghast_three_zones.json` | The deck file the plugin exports from that model. |
| `happy_ghast_gondola.bbmodel` | A model with a **gondola** instead of a deck on top: one deck five blocks below the belly (5 x 5, dark oak). Its grid is shifted by half a block so that it hangs centered. |
| `happy_ghast_gondola.json` | The deck file the plugin exports from that model. |
| `LD-Ghast-Gondola/` | The same deck as a **data pack**, with a starting build for the gondola (chains at the corners, a fence as railing). |

## Open a model

Install the plugin, then open a `.bbmodel` in Blockbench (File > Open Model). The menu **Living Decks** shows the preview and the
settings; **Check Deck** lists the zones, **Export Deck File (.json)...** writes the deck file.

From the three zones you can walk down from the top to the flanks without a railing in between (2 blocks). To get back up, place a
block at the edge and jump, or put a ladder against the edge of the upper deck.

## Try the data pack in the game

1. Install Living Decks (NeoForge 26.1.2).
2. Copy the folder `LD-Ghast-Gondola` into `saves/<world>/datapacks/` and enter the world again (or run `/reload`).
3. Spawn a **new** Happy Ghast and right-click it with a platform saddle (3 planks on top, below them leather, saddle, leather).
   A ghast that already had a deck keeps what was built on it and does not get the starting build again.
4. Press **F3+B** to see floor and railing.

Only one deck file per creature type is used. If you have another data pack that gives the Happy Ghast a deck, switch one of the two
off.
