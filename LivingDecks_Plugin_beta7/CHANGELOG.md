# Changelog of the Blockbench plugin

## 0.1.6 (beta7)

- New in *Deck Settings* of the main deck: **The creature bumps into the world with its decks** (on by default). Since Living Decks
  beta21 a creature only goes where its decks have room - no gondola sinks into the ground. Switched off, the deck file gets
  `"world_collision": false`, for a creature that would get stuck (a boss with a fortress on its back). Applies to the whole creature,
  so parts do not have it.
- Import reads `world_collision`; files with it no longer show it as an extra field.

## 0.1.5 (beta6) - first public release

What the plugin can do in this version:

- Mark decks right in the model: a group `living_deck`, every cube in it is a zone. Zones with a free shape are groups of cubes.
- Several decks on one creature (**parts**), each with its own grid and its own bone. Needs Living Decks beta17 or newer.
- Preview in the 3D view, computed the way the mod does it: cells, margin, invisible railing, build volume and a label per zone.
- A shifted grid: the main floor may sit anywhere, so a deck that is 3 blocks wide is centered on the creature. Needs Living Decks
  beta16 or newer.
- Platform saddle settings, including "worn from the start".
- *Check Deck* lists everything the mod would reject. The same shows up in Blockbench's own warnings.
- Export as a deck file, to the clipboard or as a ready-to-use data pack (Minecraft 26.1). Import of existing deck files.
- Open the model of a creature straight from the `.jar` of its mod (GeckoLib models).
- English and German.
