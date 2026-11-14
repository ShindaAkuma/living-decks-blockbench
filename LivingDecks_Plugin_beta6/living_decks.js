/*
 * Living Decks - Blockbench plugin (0.1.5, beta6)
 *
 * Mark the decks for the Minecraft mod "Living Decks" right in the model of a creature: a group "living_deck" holds cubes as zones
 * (top of a cube = floor of the zone, footprint = its cells). The plugin previews margin, railing and build volume the way the mod
 * computes them, checks the rules of the deck file and exports it (as a single file or as a ready-to-use data pack). Existing deck
 * files can be imported, and the models of modded creatures can be opened straight from the .jar of their mod (GeckoLib).
 *
 * Layout in the outliner:
 *   living_deck            group - the main deck (settings: creature, railing, saddle ...)
 *     top                  cube  - zone 0, the main floor (always the first zone)
 *     left                 cube  - zone 1 (rectangle)
 *     bow                  group - zone 2 with a free shape: all cubes inside it together (pattern)
 *     solids               group - solid boxes (towers, walls)
 *   living_deck_head       group - a part (Living Decks beta17 or newer): another deck on the same creature with its own grid
 *     main                 cube  - its main floor      and - if the group sits inside a bone - its own movement. The deck file
 *                                                      describes the whole creature: the main deck and below it its parts ("parts").
 *
 * Units: 16 pixels = 1 block (adjustable), the way the mod reads the model space: +x right, +y up, -z front.
 * The first zone sets the grid of the deck: its corner does not have to sit on whole blocks (floor.x and floor.z of the deck file,
 * Living Decks beta16 or newer) - all other zones are whole blocks away from it.
 *
 * Copyright (c) 2026 xxXShindaXxx. All rights reserved.
 * Free to use, also for commercial projects. The deck files and data packs you export are yours. Redistributing this file is not
 * permitted - the full terms are in the file LICENSE that comes with this plugin.
 */
(function () {
    'use strict';

    const ID = 'living_decks';
    const VERSION = '0.1.5';
    const BUILD = 'beta6';
    /** Name of the property on groups and cubes - it is only stored in the .bbmodel where it is set */
    const PROP = 'living_deck';
    const ROOT_NAME = 'living_deck';
    const ROOT_PATTERN = /^living[ _-]?decks?$/i;
    const SOLIDS_NAME = 'solids';
    const SOLIDS_PATTERN = /^solids?$/i;
    const ID_PATTERN = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;
    const TAG_OR_ID_PATTERN = /^#?[a-z0-9_.-]+:[a-z0-9_./-]+$/;
    /** Name of a part (Living Decks beta17 or newer): the game saves what is built on the part under this name */
    const PART_PATTERN = /^[a-z0-9_]{1,32}$/;

    /** Limits of the deck file, as the mod checks them (DeckDefinition, DeckLayout, LdConfig) */
    const LIMITS = Object.freeze({
        MAX_ZONES: 32, MAX_LEVEL: 128, MAX_SIDE: 256, MAX_PATTERN_CELLS: 16384, MAX_HEIGHT: 64, MAX_BLOCKS: 16384, MAX_SOLIDS: 64,
        MAX_BONE_NAME: 64, MAX_FLOOR_SIDE: 512, MIN_THICKNESS: 1 / 16, MAX_THICKNESS: 1, DEFAULT_THICKNESS: 0.125,
        DEFAULT_SAFE_DROP: 3, MAX_SAFE_DROP: 256, STEP_UP: 1, RIM_MIN: 0.125, RIM_HEIGHT: 1.1, DEFAULT_HEIGHT: 16, MAX_GRID: 250000, MAX_ORIGIN: 1,
        MAX_PARTS: 16, MAX_PART_NAME: 32
    });

    /**
     * Settings of a deck (on its group). A model can have several deck groups (since beta4): the one with an empty "part" is the
     * main deck, every other one a part with that name. Creature, saddle, scale and file name apply to the whole creature and are set
     * at the main deck - they are not read from a part.
     */
    const DEFAULT_SETTINGS = Object.freeze({
        deck: true, part: '', entity: '', rim: true, safe_drop: LIMITS.DEFAULT_SAFE_DROP, max_blocks: 0, saddle: 'none', saddle_item: '',
        saddle_owner_only: false, saddle_equipped: false, block: '', follow_bone: true, pivot_mode: 'auto', pivot: [0, 0, 0], scale: 1, structure_id: '',
        structure_rotation: 'none', structure_offset: [0, 0, 0], structure_zone: 0, namespace: '', file: '', extra: {}
    });

    //region Texts

    const TEXT = {
        en: {
            'plugin.description': 'Mark the decks of a creature right in its model and export the deck file for the Minecraft mod Living Decks.',
            'menu': 'Living Decks',
            'action.open_mod': 'Open Model from Mod (.jar)...',
            'action.open_mod.desc': 'Opens the model of a creature straight from a mod file (GeckoLib models), ready to mark its deck',
            'action.create': 'Create Deck...',
            'action.create.desc': 'Adds the group "living_deck" with a first zone on top of the model',
            'action.add_part': 'Add Part...',
            'action.add_part.desc': 'Adds another deck to this creature with its own grid and its own bone, e.g. on the head (Living Decks beta17 or newer)',
            'action.add_zone': 'Add Zone...',
            'action.add_zone.desc': 'Adds another build area (a cube inside the deck group)',
            'action.zone_settings': 'Zone Settings...',
            'action.zone_settings.desc': 'Build height, margin, railing and visible floor of the selected zones',
            'action.deck_settings': 'Deck Settings...',
            'action.deck_settings.desc': 'Creature, railing, saddle and other settings of the whole deck',
            'action.align': 'Align Zones to Main Floor',
            'action.align.desc': 'Keeps the main floor where it is and moves all other zones onto its grid (whole blocks from its corner) and whole blocks above or below it',
            'action.snap': 'Snap Zones to Block Grid',
            'action.snap.desc': 'Moves all zones onto whole blocks of the model (x, z), so the grid of the deck is no longer shifted, and whole blocks above or below the main floor',
            'action.check': 'Check Deck',
            'action.check.desc': 'Lists everything the mod would reject or that looks unintended',
            'action.export': 'Export Deck File (.json)...',
            'action.export.desc': 'Writes the deck file for data/<namespace>/livingdecks/decks/',
            'action.export_pack': 'Export as Data Pack (.zip)...',
            'action.export_pack.desc': 'Writes a ready-to-use data pack - put the zip into the datapacks folder of a world',
            'action.copy': 'Copy Deck File to Clipboard',
            'action.import': 'Import Deck File...',
            'action.import.desc': 'Reads a Living Decks deck file and builds its zones in this model',
            'action.preview': 'Show Deck Preview',
            'action.preview.desc': 'Margin, railing and zone names in the 3D view',
            'action.volumes': 'Show Build Volumes',
            'action.volumes.desc': 'Outlines of the space that can be built on each zone',
            'action.help': 'How It Works',
            'label.main': 'main floor',
            'dialog.create.title': 'Create Living Deck',
            'dialog.zone.title': 'Zone Settings',
            'dialog.add_zone.title': 'Add Zone',
            'dialog.deck.title': 'Deck Settings',
            'dialog.part.title': 'Add Part',
            'dialog.part_settings.title': 'Settings of Part "%0"',
            'dialog.check.title': 'Check Deck',
            'dialog.pack.title': 'Export Data Pack',
            'dialog.help.title': 'Living Decks - How It Works',
            'dialog.open_mod.title': 'Open Model from Mod',
            'field.entity': 'Creature (entity id)',
            'field.entity.desc': 'For example minecraft:happy_ghast or mymod:my_boss',
            'field.block': 'Visible floor (block id)',
            'field.block.desc': 'For example minecraft:spruce_planks. Empty = invisible floor (the model shows it)',
            'field.zone_block.desc': 'Empty = like the deck',
            'field.size': 'Size (width, length in blocks)',
            'field.floor_y': 'Floor height (blocks)',
            'field.in_bone': 'Put into the selected bone "%0" (the deck follows its animation)',
            'field.name': 'Name',
            'field.from': 'Corner (x, z in blocks)',
            'field.from.desc': 'Decimals are fine: the corner of the main floor sets the grid of the deck',
            'field.zone_from.desc': 'Is moved onto the grid of the deck (whole blocks from the corner of the main floor)',
            'field.level': 'Height above (+) or below (-) the main floor (blocks)',
            'field.max_height': 'Build height (layers)',
            'field.max_height.desc': '0 = setting of the server (16)',
            'field.margin': 'Margin (left, front, right, back in blocks)',
            'field.margin.desc': 'How far the floor sticks out beyond the zone at free edges - the railing stands on it',
            'field.rim': 'Railing',
            'field.rim.default': 'Like the deck',
            'field.rim.on': 'On',
            'field.rim.off': 'Off',
            'field.deck_rim': 'Invisible railing at free edges',
            'field.safe_drop': 'Safe drop (blocks)',
            'field.safe_drop.desc': 'No railing towards a zone that lies up to this many blocks lower',
            'field.max_blocks': 'Block limit of the deck',
            'field.max_blocks.desc': '0 = setting of the server (2048)',
            'field.saddle': 'Platform saddle',
            'field.saddle.none': 'Not needed (deck is always there)',
            'field.saddle.platform': 'Platform saddle of Living Decks',
            'field.saddle.custom': 'Own item or tag',
            'field.saddle_item': 'Item id or #tag',
            'field.saddle_owner': 'Only the owner of a tamed creature',
            'field.saddle_equipped': 'Worn from the start (the creature gets it by itself, beta17 or newer)',
            'field.part': 'Name of the part',
            'field.part.desc': 'a-z, 0-9 and _ (1 to 32 characters). The game saves what is built on the part under this name - renaming means starting empty.',
            'info.part_main': 'Creature, saddle and scale are set at the main deck and apply to every part.',
            'info.part_bone': 'Select the bone the part sits on before opening this dialog (e.g. the head) - the part follows it in game.',
            'deck.main': 'Main deck',
            'deck.part': 'Part "%0"',
            'field.follow_bone': 'Deck follows its bone "%0" (GeckoLib)',
            'field.follow_bone.none': 'Deck follows a bone (put the deck group into the bone first)',
            'field.pivot_mode': 'Pivot',
            'field.pivot_mode.auto': 'Automatic',
            'field.pivot_mode.custom': 'Own value',
            'field.pivot': 'Pivot (x, y, z in blocks)',
            'field.scale': 'Blocks per 16 pixels',
            'field.scale.desc': '1 for models in game size (GeckoLib). 4 if a vanilla model is drawn 4 times larger in game',
            'field.structure_id': 'Starting build (structure id)',
            'field.structure_id.desc': 'Optional, for example mymod:fortress (data/<namespace>/structure/...)',
            'field.structure_rotation': 'Rotation of the starting build',
            'field.structure_offset': 'Offset of the starting build (cells)',
            'field.structure_zone': 'Zone of the starting build (number)',
            'field.namespace': 'Namespace of the data pack',
            'field.file': 'File name (without .json)',
            'field.pack_name': 'Name of the pack',
            'field.description': 'Description',
            'field.format': 'Minecraft version',
            'field.model': 'Model',
            'field.mod_entity': 'Creature',
            'field.mod_entity.desc': 'Entity ids from the language file of the mod. Your choice is suggested under "Create Deck..."',
            'field.mod_entity.other': 'Another one (enter it under "Create Deck...")',
            'field.mod_texture': 'Load the texture with the same name',
            'info.zone': '%0 zone(s) selected: %1',
            'info.extra': '%0 more field(s) of the imported file are kept: %1',
            'info.shifted': 'The corner is not on whole blocks: the grid of this deck is shifted (floor.x / floor.z in the deck file). Living Decks reads that from beta16 on.',
            'info.offset': 'Grid of the deck: shifted by x %0, z %1 blocks - the corner of the main floor sets it.',
            'info.open_mod': '%0: %1 model(s), %2 creature(s)',
            'msg.no_project': 'Open a model first.',
            'msg.no_deck': 'This model has no deck yet. Use "Create Deck..." first.',
            'msg.has_deck': 'This model already has a deck (group "%0").',
            'msg.no_zone_selected': 'Select one or more zones of the deck first.',
            'msg.created': 'Deck created',
            'msg.part_created': 'Part "%0" created',
            'msg.part_name': 'A part needs a name: a-z, 0-9 and _ (1 to 32 characters).',
            'msg.part_exists': 'This model already has a part named "%0".',
            'msg.part_needs_main': 'Create the main deck first ("Create Deck...") - parts are added to it.',
            'msg.main_exists': 'This model already has a main deck (group "%0") - any further deck needs a part name.',
            'field.part.desc_deck': 'Empty = the main deck. Otherwise this deck is a part: a-z, 0-9 and _ (1 to 32 characters). The game saves what is built on a part under its name - renaming means starting empty.',
            'msg.zone_added': 'Zone added',
            'msg.snapped': '%0 cube(s) moved onto the grid',
            'msg.snapped_none': 'Everything is on the grid already',
            'msg.aligned': '%0 cube(s) aligned to the main floor',
            'msg.aligned_none': 'Everything is aligned already',
            'msg.no_models': 'No GeckoLib models (.geo.json) in this file. Mods that build their models in code have no model file: create the deck in an empty model and enter size and height by hand.',
            'msg.mod_unreadable': 'This file cannot be read as a mod (.jar or .zip):',
            'msg.model_unreadable': 'This model cannot be read:',
            'msg.model_format': 'not a Bedrock or GeckoLib geometry ("minecraft:geometry" is missing)',
            'msg.model_opened': 'Model opened: %0',
            'msg.model_empty': 'The model is open, but it has no cubes that Blockbench can show - this mod draws the creature from its own data. The bones are there: create the deck anyway (select a bone first if the deck should follow it) and enter size and height by hand.',
            'msg.copied': 'Deck file copied',
            'msg.imported': 'Deck imported: %0 zone(s)',
            'msg.imported_parts': 'Deck imported: %0 zone(s) in the main deck and %1 part(s)',
            'msg.errors': 'The deck has errors - fix them before exporting:',
            'msg.replace': 'This model already has a deck. Replace it (and all its parts) with the imported one?',
            'msg.replace.yes': 'Replace',
            'msg.invalid_file': 'This is not a readable deck file:',
            'check.ok': 'No problems found.',
            'check.summary': '%0 zone(s), %1 cells, main floor at y = %2',
            'check.decks': 'This creature carries %0 decks: the main deck and %1 part(s).',
            'check.zone': 'Zone %0 "%1": height %2, %3 x %4, %5 cells%6',
            'check.zone.pattern': ', free shape',
            'undo.create': 'Create Living Deck',
            'undo.create_part': 'Add Living Decks Part',
            'undo.add_zone': 'Add deck zone',
            'undo.zone_settings': 'Change deck zone',
            'undo.deck_settings': 'Change deck settings',
            'undo.snap': 'Snap deck zones',
            'undo.align': 'Align deck zones',
            'undo.import': 'Import Living Deck',
            'p.no_zones': 'The deck has no zones - put a cube into the group "%0".',
            'p.too_many_zones': 'At most %0 zones, found %1.',
            'p.zone_empty': 'Zone "%0" has no cubes.',
            'p.zone_rotated': 'Zone "%0" is rotated (the cube or a group above it). Decks lie straight in the model.',
            'p.zone_grid': 'Zone "%0" is not on the grid of the deck (whole blocks from the corner of the main floor). Use "Align Zones to Main Floor".',
            'p.main_size': 'Main floor "%0": its width and length must be whole blocks (the grid starts at its corner). Use "Align Zones to Main Floor".',
            'p.zone_level': 'Zone "%0": its floor must lie whole blocks above or below the main floor (now %1). Use "Align Zones to Main Floor".',
            'p.grid_shifted': 'The grid of the deck is shifted by x %0, z %1 blocks (floor.x / floor.z) - the corner of the main floor sets it. Needs Living Decks beta16 or newer.',
            'p.zone_tops': 'Zone "%0": its cubes have different heights - all tops must be level.',
            'p.zone_far': 'Zone "%0": at most %1 blocks above or below the main floor (now %2).',
            'p.zone_big': 'Zone "%0" is larger than %1 blocks.',
            'p.pattern_cells': 'The free-shaped zones together are larger than %0 cells (%1).',
            'p.zone_height': 'Zone "%0": build height from 1 to %1 (now %2).',
            'p.zone_margin': 'Zone "%0": the margin needs numbers from 0.',
            'p.zone_floor_big': 'Zone "%0": floor larger than %1 blocks.',
            'p.zone_block': 'Zone "%0": "%1" is not a block id (namespace:name).',
            'p.zone_thickness': 'Zone "%0": the visible floor is 1 to 16 pixels thick (now %1) - the nearest value is written.',
            'p.zone_overlap': 'Zones "%0" and "%1" overlap at the same height - there "%0" counts.',
            'p.zone_no_room': 'Zone "%0" has no room to build under zone "%1" (their floors are too close).',
            'p.zone_inflate': 'Zone "%0": "Inflate" is ignored.',
            'p.entity_missing': 'No creature set - enter the entity id in the deck settings.',
            'p.entity_invalid': '"%0" is not an entity id (namespace:name).',
            'p.block_invalid': 'Visible floor of the deck: "%0" is not a block id (namespace:name).',
            'p.safe_drop': 'Safe drop from 0 to %0 (now %1).',
            'p.max_blocks': 'Block limit from 1 to %0 (now %1).',
            'p.scale': 'Blocks per 16 pixels must be greater than 0.',
            'p.saddle_item': 'Own saddle: "%0" is not an item id or #tag (namespace:name).',
            'p.structure_id': 'Starting build: "%0" is not a structure id (namespace:name).',
            'p.structure_zone': 'Starting build: zone %0 does not exist (the deck has %1).',
            'p.bone_name': 'Bone name longer than %0 characters: "%1".',
            'p.solids_many': 'At most %0 solid boxes, found %1.',
            'p.solid_rotated': 'Solid box "%0" is rotated - it is written straight.',
            'p.solid_empty': 'Solid box "%0" is empty.',
            'p.stray': '"%0" in the deck group is ignored (only cubes and groups of cubes count).',
            'p.no_main': 'This model has parts but no main deck: one deck group needs an empty part name (Deck Settings).',
            'p.two_mains': 'Two main decks (groups "%0" and "%1"): give one of them a part name (Deck Settings) or remove it.',
            'p.part_name': 'The part name "%0" is not valid: a-z, 0-9 and _ (1 to 32 characters).',
            'p.part_dup': 'Two parts are named "%0" - every part needs its own name.',
            'p.too_many_parts': 'Too many parts: %0 (at most %1).',
            'p.layout_big': 'The shape is too fine-grained for the preview.',
            'in.not_object': 'the file is not a JSON object',
            'in.entity': '"entity" is missing',
            'in.parts': '"parts" must be a list of decks',
            'in.parts_many': 'too many parts: %0 (at most %1)',
            'in.part_name': 'parts[%0]: "name" is missing or not valid (a-z, 0-9 and _, 1 to 32 characters)',
            'in.part_dup': 'parts[%0]: the name "%1" is used twice',
            'in.part': 'parts[%0] (%1): %2',
            'in.floor': '"floor" with "y" is missing',
            'in.floor_pair': 'floor: "from" and "to" belong together',
            'in.floor_offset': 'floor.x and floor.z (offset of the grid) range from -1 to 1',
            'in.floor_offset_build': 'floor.x and floor.z (offset of the grid) only exist together with "zones", not with "build"',
            'in.build_floor': '"build" needs the floor as a rectangle: floor.from and floor.to',
            'in.floor_rect': 'floor.from and floor.to only exist together with "build"',
            'in.no_area': 'no build area: "build" or "zones" is missing',
            'in.zone_shape': 'zones[%0]: needs "from" and "to" (rectangle) or "pattern"',
            'in.zone_both': 'zones[%0]: either "from" and "to" or "pattern", not both',
            'in.zone_empty': 'zones[%0]: the zone is empty',
            'in.pattern_sign': 'zones[%0]: pattern may only contain "#" and "."',
            'in.margin': 'zones[%0]: "margin" is a number or [left, front, right, back]',
            'in.number': '"%0" needs numbers',
            'help.text': [
                'A deck is a group named <b>living_deck</b>. Every <b>cube</b> in it is a zone: its top is the floor you stand on, its footprint are the cells you can build on. The first zone is the main floor.',
                'A <b>group of cubes</b> inside the deck is one zone with a free shape (L, ring, triangle from steps). A group named <b>solids</b> holds solid boxes (towers, walls).',
                '16 pixels are one block. The <b>main floor</b> may sit anywhere, as long as it is whole blocks wide and long: its corner sets the grid of the deck (Living Decks beta16 or newer). All other zones lie whole blocks from it, level with it or whole blocks above or below. "Align Zones to Main Floor" does that for you; "Snap Zones to Block Grid" puts everything onto whole blocks of the model instead.',
                'The preview shows what the mod makes of it: the <b>margin</b> (floor beyond the cells), the <b>railing</b> (yellow) at free edges and the <b>build volume</b> of each zone. Where one zone meets another that is level, up to 3 blocks lower or one block higher, there is no railing.',
                'Put the deck group into a bone and the deck follows that bone in game (GeckoLib). The deck group and its cubes are not exported with the model.',
                '<b>Parts</b> (Living Decks beta17 or newer): a creature can carry several decks - one on the back, one on the head. "Add Part..." creates another deck group with a name; it has its own grid, its own settings and follows its own bone. Creature and saddle are set at the main deck. Whatever you do in the menu applies to the deck you have selected something in. Parts are not joined to each other - for one connected floor on the same bone use zones.',
                '<b>Creatures of other mods:</b> "Open Model from Mod (.jar)..." opens a GeckoLib model straight from the mod file and suggests the entity id. Mods that build their models in code have no model file - make the deck in an empty model and enter size and height by hand.',
                '"Export Deck File" writes the file for <b>data/&lt;namespace&gt;/livingdecks/decks/</b> of your mod. "Export as Data Pack" writes a zip you can drop into the <b>datapacks</b> folder of a world.'
            ]
        },
        de: {
            'plugin.description': 'Die Decks eines Wesens direkt im Modell markieren und die Deck-Datei f\u00fcr den Minecraft-Mod Living Decks schreiben.',
            'menu': 'Living Decks',
            'action.open_mod': 'Modell aus Mod \u00f6ffnen (.jar)...',
            'action.open_mod.desc': '\u00d6ffnet das Modell eines Wesens direkt aus einer Mod-Datei (GeckoLib-Modelle), bereit zum Markieren des Decks',
            'action.create': 'Deck anlegen...',
            'action.create.desc': 'Legt die Gruppe "living_deck" mit einer ersten Zone oben auf dem Modell an',
            'action.add_part': 'Teil hinzuf\u00fcgen...',
            'action.add_part.desc': 'Legt ein weiteres Deck an diesem Wesen an, mit eigenem Raster und eigenem Bone, z. B. auf dem Kopf (Living Decks ab beta17)',
            'action.add_zone': 'Zone hinzuf\u00fcgen...',
            'action.add_zone.desc': 'Eine weitere Baufl\u00e4che (ein W\u00fcrfel in der Deck-Gruppe)',
            'action.zone_settings': 'Zone einstellen...',
            'action.zone_settings.desc': 'Bauh\u00f6he, Rand, Gel\u00e4nder und sichtbarer Boden der gew\u00e4hlten Zonen',
            'action.deck_settings': 'Deck einstellen...',
            'action.deck_settings.desc': 'Wesen, Gel\u00e4nder, Sattel und alles, was f\u00fcr das ganze Deck gilt',
            'action.align': 'Zonen am Hauptboden ausrichten',
            'action.align.desc': 'L\u00e4sst den Hauptboden, wo er ist, und schiebt alle anderen Zonen in sein Raster (ganze Bl\u00f6cke ab seiner Ecke) und ganze Bl\u00f6cke \u00fcber oder unter ihn',
            'action.snap': 'Zonen ins Blockraster setzen',
            'action.snap.desc': 'Schiebt alle Zonen auf ganze Bl\u00f6cke des Modells (x, z) - das Raster des Decks ist dann nicht mehr verschoben - und ganze Bl\u00f6cke \u00fcber oder unter den Hauptboden',
            'action.check': 'Deck pr\u00fcfen',
            'action.check.desc': 'Zeigt alles, was der Mod ablehnen w\u00fcrde oder nach einem Versehen aussieht',
            'action.export': 'Deck-Datei exportieren (.json)...',
            'action.export.desc': 'Schreibt die Deck-Datei f\u00fcr data/<namespace>/livingdecks/decks/',
            'action.export_pack': 'Als Datapack exportieren (.zip)...',
            'action.export_pack.desc': 'Schreibt ein fertiges Datapack - die Zip-Datei in den Ordner datapacks einer Welt legen',
            'action.copy': 'Deck-Datei in die Zwischenablage',
            'action.import': 'Deck-Datei importieren...',
            'action.import.desc': 'Liest eine Deck-Datei von Living Decks und baut ihre Zonen in dieses Modell',
            'action.preview': 'Deck-Vorschau anzeigen',
            'action.preview.desc': 'Rand, Gel\u00e4nder und Namen der Zonen im 3D-Fenster',
            'action.volumes': 'Bauraum anzeigen',
            'action.volumes.desc': 'Umriss des Raums, in dem auf jeder Zone gebaut werden darf',
            'action.help': 'So geht es',
            'label.main': 'Hauptboden',
            'dialog.create.title': 'Living Deck anlegen',
            'dialog.zone.title': 'Zone einstellen',
            'dialog.add_zone.title': 'Zone hinzuf\u00fcgen',
            'dialog.deck.title': 'Deck einstellen',
            'dialog.part.title': 'Teil hinzuf\u00fcgen',
            'dialog.part_settings.title': 'Teil "%0" einstellen',
            'dialog.check.title': 'Deck pr\u00fcfen',
            'dialog.pack.title': 'Datapack exportieren',
            'dialog.help.title': 'Living Decks - so geht es',
            'dialog.open_mod.title': 'Modell aus Mod \u00f6ffnen',
            'field.entity': 'Wesen (Entity-ID)',
            'field.entity.desc': 'Zum Beispiel minecraft:happy_ghast oder meinmod:mein_boss',
            'field.block': 'Sichtbarer Boden (Block-ID)',
            'field.block.desc': 'Zum Beispiel minecraft:spruce_planks. Leer = unsichtbarer Boden (das Modell zeigt ihn)',
            'field.zone_block.desc': 'Leer = wie das Deck',
            'field.size': 'Gr\u00f6\u00dfe (Breite, L\u00e4nge in Bl\u00f6cken)',
            'field.floor_y': 'H\u00f6he des Bodens (Bl\u00f6cke)',
            'field.in_bone': 'In den gew\u00e4hlten Bone "%0" legen (das Deck folgt seiner Animation)',
            'field.name': 'Name',
            'field.from': 'Ecke (x, z in Bl\u00f6cken)',
            'field.from.desc': 'Kommazahlen sind erlaubt: die Ecke des Hauptbodens legt das Raster des Decks fest',
            'field.zone_from.desc': 'Wird ins Raster des Decks geschoben (ganze Bl\u00f6cke ab der Ecke des Hauptbodens)',
            'field.level': 'H\u00f6he \u00fcber (+) oder unter (-) dem Hauptboden (Bl\u00f6cke)',
            'field.max_height': 'Bauh\u00f6he (Schichten)',
            'field.max_height.desc': '0 = Einstellung des Servers (16)',
            'field.margin': 'Rand (links, vorn, rechts, hinten in Bl\u00f6cken)',
            'field.margin.desc': 'So weit ragt der Boden an freien Kanten \u00fcber die Zone hinaus - darauf steht das Gel\u00e4nder',
            'field.rim': 'Gel\u00e4nder',
            'field.rim.default': 'Wie das Deck',
            'field.rim.on': 'An',
            'field.rim.off': 'Aus',
            'field.deck_rim': 'Unsichtbares Gel\u00e4nder an freien Kanten',
            'field.safe_drop': 'Sicherer Fall (Bl\u00f6cke)',
            'field.safe_drop.desc': 'Kein Gel\u00e4nder zu einer Zone, die bis zu so viele Bl\u00f6cke tiefer liegt',
            'field.max_blocks': 'H\u00f6chstzahl Bl\u00f6cke auf dem Deck',
            'field.max_blocks.desc': '0 = Einstellung des Servers (2048)',
            'field.saddle': 'Plattformsattel',
            'field.saddle.none': 'Nicht n\u00f6tig (das Deck ist immer da)',
            'field.saddle.platform': 'Plattformsattel von Living Decks',
            'field.saddle.custom': 'Eigener Gegenstand oder Tag',
            'field.saddle_item': 'Gegenstand-ID oder #Tag',
            'field.saddle_owner': 'Nur der Besitzer eines gez\u00e4hmten Wesens',
            'field.saddle_equipped': 'Von Anfang an (das Wesen bekommt ihn von selbst, ab beta17)',
            'field.part': 'Name des Teils',
            'field.part.desc': 'a-z, 0-9 und _ (1 bis 32 Zeichen). Unter diesem Namen speichert das Spiel, was auf dem Teil gebaut ist - umbenennen hei\u00dft leer neu anfangen.',
            'info.part_main': 'Wesen, Sattel und Ma\u00dfstab stehen am Hauptdeck und gelten f\u00fcr jedes Teil.',
            'info.part_bone': 'Vor dem \u00d6ffnen den Bone ausw\u00e4hlen, auf dem das Teil sitzt (z. B. den Kopf) - das Teil folgt ihm im Spiel.',
            'deck.main': 'Hauptdeck',
            'deck.part': 'Teil "%0"',
            'field.follow_bone': 'Deck folgt seinem Bone "%0" (GeckoLib)',
            'field.follow_bone.none': 'Deck folgt einem Bone (dazu die Deck-Gruppe in den Bone legen)',
            'field.pivot_mode': 'Drehpunkt',
            'field.pivot_mode.auto': 'Automatisch',
            'field.pivot_mode.custom': 'Eigener Wert',
            'field.pivot': 'Drehpunkt (x, y, z in Bl\u00f6cken)',
            'field.scale': 'Bl\u00f6cke je 16 Pixel',
            'field.scale.desc': '1 f\u00fcr Modelle in Spielgr\u00f6\u00dfe (GeckoLib). 4, wenn ein Vanilla-Modell im Spiel viermal so gro\u00df gezeichnet wird',
            'field.structure_id': 'Bau zum Start (Struktur-ID)',
            'field.structure_id.desc': 'Auf Wunsch, zum Beispiel meinmod:festung (data/<namespace>/structure/...)',
            'field.structure_rotation': 'Drehung des Baus zum Start',
            'field.structure_offset': 'Versatz des Baus zum Start (Zellen)',
            'field.structure_zone': 'Zone des Baus zum Start (Nummer)',
            'field.namespace': 'Namespace des Datapacks',
            'field.file': 'Dateiname (ohne .json)',
            'field.pack_name': 'Name des Pakets',
            'field.description': 'Beschreibung',
            'field.format': 'Minecraft-Fassung',
            'field.model': 'Modell',
            'field.mod_entity': 'Wesen',
            'field.mod_entity.desc': 'Entity-IDs aus der Sprachdatei des Mods. Die Wahl wird bei "Deck anlegen..." vorgeschlagen',
            'field.mod_entity.other': 'Ein anderes (bei "Deck anlegen..." eintragen)',
            'field.mod_texture': 'Bild mit gleichem Namen laden',
            'info.zone': '%0 Zone(n) gew\u00e4hlt: %1',
            'info.extra': '%0 weitere Angabe(n) der importierten Datei bleiben erhalten: %1',
            'info.shifted': 'Die Ecke liegt nicht auf ganzen Bl\u00f6cken: das Raster dieses Decks ist verschoben (floor.x / floor.z in der Deck-Datei). Living Decks liest das ab beta16.',
            'info.offset': 'Raster des Decks: um x %0, z %1 Bl\u00f6cke verschoben - die Ecke des Hauptbodens legt es fest.',
            'info.open_mod': '%0: %1 Modell(e), %2 Wesen',
            'msg.no_project': 'Erst ein Modell \u00f6ffnen.',
            'msg.no_deck': 'Dieses Modell hat noch kein Deck. Erst "Deck anlegen..." benutzen.',
            'msg.has_deck': 'Dieses Modell hat schon ein Deck (Gruppe "%0").',
            'msg.no_zone_selected': 'Erst eine oder mehrere Zonen des Decks ausw\u00e4hlen.',
            'msg.created': 'Deck angelegt',
            'msg.part_created': 'Teil "%0" angelegt',
            'msg.part_name': 'Ein Teil braucht einen Namen: a-z, 0-9 und _ (1 bis 32 Zeichen).',
            'msg.part_exists': 'Dieses Modell hat schon ein Teil mit dem Namen "%0".',
            'msg.part_needs_main': 'Erst das Hauptdeck anlegen ("Deck anlegen...") - Teile kommen dazu.',
            'msg.main_exists': 'Dieses Modell hat schon ein Hauptdeck (Gruppe "%0") - jedes weitere Deck braucht einen Teil-Namen.',
            'field.part.desc_deck': 'Leer = das Hauptdeck. Sonst ist dieses Deck ein Teil: a-z, 0-9 und _ (1 bis 32 Zeichen). Unter dem Namen speichert das Spiel, was auf dem Teil gebaut ist - umbenennen hei\u00dft leer neu anfangen.',
            'msg.zone_added': 'Zone hinzugef\u00fcgt',
            'msg.snapped': '%0 W\u00fcrfel ins Raster gesetzt',
            'msg.snapped_none': 'Alles liegt schon im Raster',
            'msg.aligned': '%0 W\u00fcrfel am Hauptboden ausgerichtet',
            'msg.aligned_none': 'Alles ist schon ausgerichtet',
            'msg.no_models': 'Keine GeckoLib-Modelle (.geo.json) in dieser Datei. Mods, die ihre Modelle im Code bauen, haben keine Modell-Datei: das Deck in einem leeren Modell anlegen und Gr\u00f6\u00dfe und H\u00f6he von Hand eintragen.',
            'msg.mod_unreadable': 'Diese Datei l\u00e4sst sich nicht als Mod lesen (.jar oder .zip):',
            'msg.model_unreadable': 'Dieses Modell l\u00e4sst sich nicht lesen:',
            'msg.model_format': 'keine Bedrock- oder GeckoLib-Geometrie ("minecraft:geometry" fehlt)',
            'msg.model_opened': 'Modell ge\u00f6ffnet: %0',
            'msg.model_empty': 'Das Modell ist offen, enth\u00e4lt aber keine W\u00fcrfel, die Blockbench zeigen kann - dieser Mod zeichnet das Wesen aus eigenen Daten. Die Bones sind da: das Deck trotzdem anlegen (soll es einem Bone folgen, diesen vorher ausw\u00e4hlen) und Gr\u00f6\u00dfe und H\u00f6he von Hand eintragen.',
            'msg.copied': 'Deck-Datei kopiert',
            'msg.imported': 'Deck importiert: %0 Zone(n)',
            'msg.imported_parts': 'Deck importiert: %0 Zone(n) im Hauptdeck und %1 Teil(e)',
            'msg.errors': 'Das Deck hat Fehler - vor dem Export beheben:',
            'msg.replace': 'Dieses Modell hat schon ein Deck. Samt allen Teilen durch das importierte ersetzen?',
            'msg.replace.yes': 'Ersetzen',
            'msg.invalid_file': 'Das ist keine lesbare Deck-Datei:',
            'check.ok': 'Keine Probleme gefunden.',
            'check.summary': '%0 Zone(n), %1 Zellen, Hauptboden bei y = %2',
            'check.decks': 'Dieses Wesen tr\u00e4gt %0 Decks: das Hauptdeck und %1 Teil(e).',
            'check.zone': 'Zone %0 "%1": H\u00f6he %2, %3 x %4, %5 Zellen%6',
            'check.zone.pattern': ', freie Form',
            'undo.create': 'Living Deck anlegen',
            'undo.create_part': 'Living-Decks-Teil anlegen',
            'undo.add_zone': 'Deck-Zone hinzuf\u00fcgen',
            'undo.zone_settings': 'Deck-Zone \u00e4ndern',
            'undo.deck_settings': 'Deck-Einstellungen \u00e4ndern',
            'undo.snap': 'Deck-Zonen ins Raster setzen',
            'undo.align': 'Deck-Zonen ausrichten',
            'undo.import': 'Living Deck importieren',
            'p.no_zones': 'Das Deck hat keine Zonen - einen W\u00fcrfel in die Gruppe "%0" legen.',
            'p.too_many_zones': 'H\u00f6chstens %0 Zonen, gefunden %1.',
            'p.zone_empty': 'Zone "%0" hat keine W\u00fcrfel.',
            'p.zone_rotated': 'Zone "%0" ist gedreht (der W\u00fcrfel oder eine Gruppe dar\u00fcber). Decks liegen gerade im Modell.',
            'p.zone_grid': 'Zone "%0" liegt nicht im Raster des Decks (ganze Bl\u00f6cke ab der Ecke des Hauptbodens). "Zonen am Hauptboden ausrichten" hilft.',
            'p.main_size': 'Hauptboden "%0": Breite und L\u00e4nge m\u00fcssen ganze Bl\u00f6cke sein (das Raster beginnt an seiner Ecke). "Zonen am Hauptboden ausrichten" hilft.',
            'p.zone_level': 'Zone "%0": ihr Boden muss ganze Bl\u00f6cke \u00fcber oder unter dem Hauptboden liegen (jetzt %1). "Zonen am Hauptboden ausrichten" hilft.',
            'p.grid_shifted': 'Das Raster des Decks ist um x %0, z %1 Bl\u00f6cke verschoben (floor.x / floor.z) - die Ecke des Hauptbodens legt es fest. Braucht Living Decks ab beta16.',
            'p.zone_tops': 'Zone "%0": ihre W\u00fcrfel sind verschieden hoch - alle Oberseiten m\u00fcssen auf einer H\u00f6he liegen.',
            'p.zone_far': 'Zone "%0": h\u00f6chstens %1 Bl\u00f6cke \u00fcber oder unter dem Hauptboden (jetzt %2).',
            'p.zone_big': 'Zone "%0" ist gr\u00f6\u00dfer als %1 Bl\u00f6cke.',
            'p.pattern_cells': 'Die Zonen mit freier Form sind zusammen gr\u00f6\u00dfer als %0 Zellen (%1).',
            'p.zone_height': 'Zone "%0": Bauh\u00f6he von 1 bis %1 (jetzt %2).',
            'p.zone_margin': 'Zone "%0": der Rand braucht Zahlen ab 0.',
            'p.zone_floor_big': 'Zone "%0": Boden gr\u00f6\u00dfer als %1 Bl\u00f6cke.',
            'p.zone_block': 'Zone "%0": "%1" ist keine Block-ID (namespace:name).',
            'p.zone_thickness': 'Zone "%0": der sichtbare Boden ist 1 bis 16 Pixel dick (jetzt %1) - geschrieben wird der n\u00e4chste Wert.',
            'p.zone_overlap': 'Die Zonen "%0" und "%1" \u00fcberlappen auf gleicher H\u00f6he - dort z\u00e4hlt "%0".',
            'p.zone_no_room': 'Zone "%0" hat unter Zone "%1" keinen Platz zum Bauen (die B\u00f6den liegen zu dicht).',
            'p.zone_inflate': 'Zone "%0": "Inflate" wird nicht beachtet.',
            'p.entity_missing': 'Kein Wesen angegeben - die Entity-ID in den Deck-Einstellungen eintragen.',
            'p.entity_invalid': '"%0" ist keine Entity-ID (namespace:name).',
            'p.block_invalid': 'Sichtbarer Boden des Decks: "%0" ist keine Block-ID (namespace:name).',
            'p.safe_drop': 'Sicherer Fall von 0 bis %0 (jetzt %1).',
            'p.max_blocks': 'H\u00f6chstzahl Bl\u00f6cke von 1 bis %0 (jetzt %1).',
            'p.scale': 'Bl\u00f6cke je 16 Pixel muss gr\u00f6\u00dfer als 0 sein.',
            'p.saddle_item': 'Eigener Sattel: "%0" ist keine Gegenstand-ID und kein #Tag (namespace:name).',
            'p.structure_id': 'Bau zum Start: "%0" ist keine Struktur-ID (namespace:name).',
            'p.structure_zone': 'Bau zum Start: Zone %0 gibt es nicht (das Deck hat %1).',
            'p.bone_name': 'Bone-Name l\u00e4nger als %0 Zeichen: "%1".',
            'p.solids_many': 'H\u00f6chstens %0 feste Quader, gefunden %1.',
            'p.solid_rotated': 'Fester Quader "%0" ist gedreht - geschrieben wird er gerade.',
            'p.solid_empty': 'Fester Quader "%0" ist leer.',
            'p.stray': '"%0" in der Deck-Gruppe wird nicht beachtet (es z\u00e4hlen nur W\u00fcrfel und Gruppen aus W\u00fcrfeln).',
            'p.no_main': 'Dieses Modell hat Teile, aber kein Hauptdeck: bei einer Deck-Gruppe muss der Name des Teils leer sein (Deck einstellen).',
            'p.two_mains': 'Zwei Hauptdecks (Gruppen "%0" und "%1"): eines davon braucht einen Teil-Namen (Deck einstellen) oder muss weg.',
            'p.part_name': 'Der Teil-Name "%0" geht nicht: a-z, 0-9 und _ (1 bis 32 Zeichen).',
            'p.part_dup': 'Zwei Teile hei\u00dfen "%0" - jedes Teil braucht seinen eigenen Namen.',
            'p.too_many_parts': 'Zu viele Teile: %0 (h\u00f6chstens %1).',
            'p.layout_big': 'Die Form ist f\u00fcr die Vorschau zu kleinteilig.',
            'in.not_object': 'die Datei ist kein JSON-Objekt',
            'in.entity': '"entity" fehlt',
            'in.parts': '"parts" muss eine Liste von Decks sein',
            'in.parts_many': 'zu viele Teile: %0 (h\u00f6chstens %1)',
            'in.part_name': 'parts[%0]: "name" fehlt oder geht nicht (a-z, 0-9 und _, 1 bis 32 Zeichen)',
            'in.part_dup': 'parts[%0]: den Namen "%1" gibt es zweimal',
            'in.part': 'parts[%0] (%1): %2',
            'in.floor': '"floor" mit "y" fehlt',
            'in.floor_pair': 'floor: "from" und "to" geh\u00f6ren zusammen',
            'in.floor_offset': 'floor.x und floor.z (Versatz des Rasters) reichen von -1 bis 1',
            'in.floor_offset_build': 'floor.x und floor.z (Versatz des Rasters) gibt es nur zusammen mit "zones", nicht mit "build"',
            'in.build_floor': '"build" braucht den Boden als Rechteck: floor.from und floor.to',
            'in.floor_rect': 'floor.from und floor.to gibt es nur zusammen mit "build"',
            'in.no_area': 'keine Baufl\u00e4che: "build" oder "zones" fehlt',
            'in.zone_shape': 'zones[%0]: braucht "from" und "to" (Rechteck) oder "pattern"',
            'in.zone_both': 'zones[%0]: entweder "from" und "to" oder "pattern", nicht beides',
            'in.zone_empty': 'zones[%0]: die Zone ist leer',
            'in.pattern_sign': 'zones[%0]: pattern darf nur "#" und "." enthalten',
            'in.margin': 'zones[%0]: "margin" ist eine Zahl oder [links, vorn, rechts, hinten]',
            'in.number': '"%0" braucht Zahlen',
            'help.text': [
                'Ein Deck ist eine Gruppe mit dem Namen <b>living_deck</b>. Jeder <b>W\u00fcrfel</b> darin ist eine Zone: seine Oberseite ist der Boden, auf dem man steht, sein Grundriss sind die Zellen, auf denen gebaut wird. Die erste Zone ist der Hauptboden.',
                'Eine <b>Gruppe aus W\u00fcrfeln</b> im Deck ist eine Zone mit freier Form (L, Ring, Dreieck aus Stufen). Eine Gruppe mit dem Namen <b>solids</b> enth\u00e4lt feste Quader (T\u00fcrme, W\u00e4nde).',
                '16 Pixel sind ein Block. Der <b>Hauptboden</b> darf \u00fcberall liegen, solange er ganze Bl\u00f6cke breit und lang ist: seine Ecke legt das Raster des Decks fest (Living Decks ab beta16). Alle anderen Zonen liegen ganze Bl\u00f6cke davon entfernt, gleich hoch oder ganze Bl\u00f6cke dar\u00fcber oder darunter. "Zonen am Hauptboden ausrichten" erledigt das; "Zonen ins Blockraster setzen" schiebt stattdessen alles auf ganze Bl\u00f6cke des Modells.',
                'Die Vorschau zeigt, was der Mod daraus macht: den <b>Rand</b> (Boden \u00fcber die Zellen hinaus), das <b>Gel\u00e4nder</b> (gelb) an freien Kanten und den <b>Bauraum</b> jeder Zone. Wo eine Zone an eine andere grenzt, die gleich hoch, bis 3 Bl\u00f6cke tiefer oder einen Block h\u00f6her liegt, steht kein Gel\u00e4nder.',
                'Liegt die Deck-Gruppe in einem Bone, folgt das Deck im Spiel diesem Bone (GeckoLib). Die Deck-Gruppe und ihre W\u00fcrfel werden nicht mit dem Modell exportiert.',
                '<b>Teile</b> (Living Decks ab beta17): ein Wesen kann mehrere Decks tragen - eines auf dem R\u00fccken, eines auf dem Kopf. "Teil hinzuf\u00fcgen..." legt eine weitere Deck-Gruppe mit einem Namen an; sie hat ihr eigenes Raster, ihre eigenen Einstellungen und folgt ihrem eigenen Bone. Wesen und Sattel stehen am Hauptdeck. Was du im Men\u00fc tust, gilt f\u00fcr das Deck, in dem du etwas ausgew\u00e4hlt hast. Teile h\u00e4ngen nicht zusammen - f\u00fcr einen durchgehenden Boden auf demselben Bone gibt es Zonen.',
                '<b>Wesen anderer Mods:</b> "Modell aus Mod \u00f6ffnen (.jar)..." \u00f6ffnet ein GeckoLib-Modell direkt aus der Mod-Datei und schl\u00e4gt die Entity-ID vor. Mods, die ihre Modelle im Code bauen, haben keine Modell-Datei - dort das Deck in einem leeren Modell anlegen und Gr\u00f6\u00dfe und H\u00f6he von Hand eintragen.',
                '"Deck-Datei exportieren" schreibt die Datei f\u00fcr <b>data/&lt;namespace&gt;/livingdecks/decks/</b> deines Mods. "Als Datapack exportieren" schreibt eine Zip-Datei f\u00fcr den Ordner <b>datapacks</b> einer Welt.'
            ]
        }
    };

    function language() {
        return typeof Language !== 'undefined' && TEXT[Language.code] ? Language.code : 'en';
    }

    /** Text in the language of Blockbench (German or English); %0, %1 ... are replaced. */
    function tr(key, ...args) {
        let text = TEXT[language()][key];

        if (text === undefined)
            text = TEXT.en[key];

        if (typeof text !== 'string')
            return text === undefined ? key : text;

        args.forEach((arg, i) => {
            text = text.split('%' + i).join(String(arg));
        });
        return text;
    }

    //endregion
    //region Core (without Blockbench: works with numbers only - also runs in the tests)

    const Core = {
        LIMITS,
        DEFAULT_SETTINGS,

        /** A number for the file: at most 4 decimal places, without -0. */
        round(value) {
            const rounded = Math.round(value * 10000) / 10000;
            return rounded === 0 ? 0 : rounded;
        },

        near(a, b, eps) {
            return Math.abs(a - b) <= (eps === undefined ? 1.0e-3 : eps);
        },

        /**
         * Shift of the grid for an edge, in blocks: its rest to the nearest whole block, from above -0.5 to 0.5 (this is how the deck
         * file writes it as floor.x and floor.z). If the edge is as good as on a whole block, it is 0.
         */
        offset(value) {
            if (typeof value !== 'number' || !isFinite(value))
                return 0;

            const rest = Core.round(value - Math.round(value));

            if (Math.abs(rest) < 1.0e-3)
                return 0;

            return rest <= -0.5 ? 0.5 : rest;
        },

        isId(text) {
            return typeof text === 'string' && ID_PATTERN.test(text);
        },

        /** Settings with all defaults (what is missing or has the wrong type comes from there). */
        settings(raw) {
            const out = {};

            for (const key in DEFAULT_SETTINGS) {
                const fallback = DEFAULT_SETTINGS[key];
                const value = raw ? raw[key] : undefined;

                if (Array.isArray(fallback))
                    out[key] = Array.isArray(value) && value.length === fallback.length && value.every(v => typeof v === 'number' && isFinite(v)) ? value.slice() : fallback.slice();
                else if (fallback !== null && typeof fallback === 'object')
                    out[key] = value !== null && typeof value === 'object' && !Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : {};
                else
                    out[key] = typeof value === typeof fallback && (typeof value !== 'number' || isFinite(value)) ? value : fallback;
            }

            return out;
        },

        /** Settings of a zone with defaults: build height (0 = server), margin [left, front, right, back], railing, block. */
        zoneSettings(raw) {
            const margin = raw && Array.isArray(raw.margin) && raw.margin.length === 4 && raw.margin.every(v => typeof v === 'number' && isFinite(v)) ? raw.margin.slice() : [0, 0, 0, 0];
            return {
                max_height: raw && typeof raw.max_height === 'number' && isFinite(raw.max_height) ? Math.round(raw.max_height) : 0,
                margin,
                rim: raw && (raw.rim === 'on' || raw.rim === 'off') ? raw.rim : 'default',
                block: raw && typeof raw.block === 'string' ? raw.block.trim() : ''
            };
        },

        /**
         * From the model (sizes in pixels) to the description of the deck in blocks, as it goes into the file - and everything that is
         * wrong with it.
         * @param model { settings, unit, bone, zones: [{ name, rects: [{x0, z0, x1, z1, top, bottom, rotated, inflate}], settings }],
         *                solids: [{ name, from, to, rotated }], strays: [name], rootName } - one of the decks of the model: the main deck
         *                or a part (settings.part). How the decks belong together is checked by arrange.
         * @return { problems, errors, floorY, originX, originZ, zones, solids } - the cells of the zones (minX ... maxZ) count in the grid of
         *         the deck: the cell (0, 0) starts in the model at (originX, originZ) blocks
         */
        resolve(model, text) {
            const t = text || tr;
            const problems = [];
            const problem = (level, key, zone, ...args) => problems.push({ level, text: t(key, ...args), zone: zone === undefined ? -1 : zone });
            const settings = model.settings;
            // Creature, saddle and scale apply to the whole creature: a part does not have them and they are not checked there
            const isPart = (settings.part || '') !== '';
            const unit = model.unit;
            const zones = [];
            let floorTop = 0;
            // Shift of the grid in blocks: the corner of the main floor sets it (floor.x, floor.z - Living Decks beta16 or newer)
            let originX = 0, originZ = 0;

            if (!isPart && !(settings.scale > 0))
                problem('error', 'p.scale');

            for (const stray of model.strays || [])
                problem('info', 'p.stray', -1, stray);

            if (!model.zones.length)
                problem('error', 'p.no_zones', -1, model.rootName || ROOT_NAME);

            if (model.zones.length > LIMITS.MAX_ZONES)
                problem('error', 'p.too_many_zones', -1, LIMITS.MAX_ZONES, model.zones.length);

            model.zones.forEach((source, index) => {
                const own = Core.zoneSettings(source.settings);
                const zone = {
                    name: source.name, y: 0, minX: 0, minZ: 0, maxX: 0, maxZ: 0, grid: null, pattern: null, cells: 0, usable: false,
                    maxHeight: null, margin: own.margin.map(m => Core.round(Math.max(0, m))), rimOwn: own.rim === 'default' ? null : own.rim,
                    rim: own.rim === 'default' ? !!settings.rim : own.rim === 'on', blockOwn: own.block, block: own.block || (settings.block || '').trim(),
                    thickness: LIMITS.DEFAULT_THICKNESS, top: 0, aligned: true,
                    contains(x, z) {
                        if (!this.usable || x < this.minX || x >= this.maxX || z < this.minZ || z >= this.maxZ)
                            return false;

                        return this.grid === null || this.grid[z - this.minZ][x - this.minX] === 1;
                    }
                };
                zones.push(zone);

                const rects = source.rects.filter(r => Math.abs(r.x1 - r.x0) > 1.0e-6 && Math.abs(r.z1 - r.z0) > 1.0e-6);

                if (!rects.length) {
                    problem('error', 'p.zone_empty', index, source.name);
                    return;
                }

                if (rects.some(r => r.rotated))
                    problem('error', 'p.zone_rotated', index, source.name);

                if (rects.some(r => r.inflate))
                    problem('info', 'p.zone_inflate', index, source.name);

                zone.top = rects[0].top;

                if (rects.some(r => !Core.near(r.top, zone.top)))
                    problem('error', 'p.zone_tops', index, source.name);

                if (index === 0) {
                    floorTop = zone.top;
                    originX = Core.offset(Math.min(rects[0].x0, rects[0].x1) / unit);
                    originZ = Core.offset(Math.min(rects[0].z0, rects[0].z1) / unit);
                }

                // Height: whole blocks above or below the main floor
                const level = (zone.top - floorTop) / unit;
                zone.y = Math.round(level);

                if (!Core.near(level, zone.y)) {
                    zone.aligned = false;
                    problem('error', 'p.zone_level', index, source.name, Core.round(level));
                }

                if (Math.abs(zone.y) > LIMITS.MAX_LEVEL)
                    problem('error', 'p.zone_far', index, source.name, LIMITS.MAX_LEVEL, zone.y);

                // Cells: all cubes of the zone together, counted in the grid of the deck (whole blocks from the corner of the main floor)
                let onGrid = true;
                const cells = rects.map(r => {
                    const raw = [Math.min(r.x0, r.x1) / unit - originX, Math.min(r.z0, r.z1) / unit - originZ, Math.max(r.x0, r.x1) / unit - originX,
                                 Math.max(r.z0, r.z1) / unit - originZ];
                    const snapped = raw.map(Math.round);
                    onGrid = onGrid && raw.every((v, i) => Core.near(v, snapped[i]));
                    return snapped;
                }).filter(c => c[2] > c[0] && c[3] > c[1]);

                if (!onGrid) {
                    zone.aligned = false;
                    problem('error', index === 0 && rects.length === 1 ? 'p.main_size' : 'p.zone_grid', index, source.name);
                }

                if (!cells.length) {
                    problem('error', 'p.zone_empty', index, source.name);
                    return;
                }

                zone.minX = Math.min(...cells.map(c => c[0]));
                zone.minZ = Math.min(...cells.map(c => c[1]));
                zone.maxX = Math.max(...cells.map(c => c[2]));
                zone.maxZ = Math.max(...cells.map(c => c[3]));
                const width = zone.maxX - zone.minX;
                const depth = zone.maxZ - zone.minZ;

                if (width > LIMITS.MAX_SIDE || depth > LIMITS.MAX_SIDE) {
                    problem('error', 'p.zone_big', index, source.name, LIMITS.MAX_SIDE);
                    return;
                }

                const grid = [];

                for (let z = 0; z < depth; z++)
                    grid.push(new Uint8Array(width));

                for (const c of cells) {
                    for (let z = c[1]; z < c[3]; z++)
                        grid[z - zone.minZ].fill(1, c[0] - zone.minX, c[2] - zone.minX);
                }

                let count = 0;

                for (const row of grid) {
                    for (let x = 0; x < width; x++)
                        count += row[x];
                }

                zone.cells = count;
                zone.usable = true;

                if (count < width * depth) {
                    zone.grid = grid;
                    zone.pattern = grid.map(row => Array.from(row, cell => cell ? '#' : '.').join(''));
                }

                // Settings
                if (own.max_height !== 0) {
                    if (own.max_height < 1 || own.max_height > LIMITS.MAX_HEIGHT)
                        problem('error', 'p.zone_height', index, source.name, LIMITS.MAX_HEIGHT, own.max_height);
                    else
                        zone.maxHeight = own.max_height;
                }

                if (own.margin.some(m => m < 0))
                    problem('error', 'p.zone_margin', index, source.name);

                if (width + zone.margin[0] + zone.margin[2] > LIMITS.MAX_FLOOR_SIDE || depth + zone.margin[1] + zone.margin[3] > LIMITS.MAX_FLOOR_SIDE)
                    problem('error', 'p.zone_floor_big', index, source.name, LIMITS.MAX_FLOOR_SIDE);

                if (own.block && !Core.isId(own.block))
                    problem('error', 'p.zone_block', index, source.name, own.block);

                // Thickness of the visible plate: as thick as the cube
                const thickness = Math.abs(rects[0].top - rects[0].bottom) / unit;
                zone.thickness = Core.round(Math.min(LIMITS.MAX_THICKNESS, Math.max(LIMITS.MIN_THICKNESS, thickness)));

                if (zone.block && !Core.near(thickness, zone.thickness, 1.0e-4))
                    problem('warning', 'p.zone_thickness', index, source.name, Core.round(thickness * 16));
            });

            if (originX !== 0 || originZ !== 0)
                problem('info', 'p.grid_shifted', -1, originX, originZ);

            // The deck as a whole
            const entity = (settings.entity || '').trim();

            if (isPart) {
                // set at the main deck
            }
            else if (!entity)
                problem('error', 'p.entity_missing');
            else if (!Core.isId(entity))
                problem('error', 'p.entity_invalid', -1, entity);

            if ((settings.block || '').trim() && !Core.isId(settings.block.trim()))
                problem('error', 'p.block_invalid', -1, settings.block.trim());

            if (!(settings.safe_drop >= 0 && settings.safe_drop <= LIMITS.MAX_SAFE_DROP) || settings.safe_drop !== Math.round(settings.safe_drop))
                problem('error', 'p.safe_drop', -1, LIMITS.MAX_SAFE_DROP, settings.safe_drop);

            if (settings.max_blocks !== 0 && (!(settings.max_blocks >= 1 && settings.max_blocks <= LIMITS.MAX_BLOCKS) || settings.max_blocks !== Math.round(settings.max_blocks)))
                problem('error', 'p.max_blocks', -1, LIMITS.MAX_BLOCKS, settings.max_blocks);

            if (!isPart && settings.saddle === 'custom' && !TAG_OR_ID_PATTERN.test((settings.saddle_item || '').trim()))
                problem('error', 'p.saddle_item', -1, (settings.saddle_item || '').trim());

            const structure = (settings.structure_id || '').trim();

            if (structure) {
                if (!Core.isId(structure))
                    problem('error', 'p.structure_id', -1, structure);

                if (!(settings.structure_zone >= 0 && settings.structure_zone < Math.max(1, zones.length)))
                    problem('error', 'p.structure_zone', -1, settings.structure_zone, zones.length);
            }

            if (model.bone && settings.follow_bone && model.bone.name.length > LIMITS.MAX_BONE_NAME)
                problem('error', 'p.bone_name', -1, LIMITS.MAX_BONE_NAME, model.bone.name);

            let patternCells = 0;

            for (const zone of zones) {
                if (zone.usable && zone.pattern)
                    patternCells += (zone.maxX - zone.minX) * (zone.maxZ - zone.minZ);
            }

            if (patternCells > LIMITS.MAX_PATTERN_CELLS)
                problem('error', 'p.pattern_cells', -1, LIMITS.MAX_PATTERN_CELLS, patternCells);

            // Zones among each other: cells used twice, no room below a higher zone
            for (let a = 0; a < zones.length; a++) {
                for (let b = a + 1; b < zones.length; b++) {
                    const first = zones[a], second = zones[b];

                    if (!first.usable || !second.usable || !Core.touching(first, second))
                        continue;

                    if (first.y === second.y)
                        problem('warning', 'p.zone_overlap', b, first.name, second.name);
                    else if (Math.abs(first.y - second.y) === 1)
                        problem('warning', 'p.zone_no_room', first.y < second.y ? a : b, first.y < second.y ? first.name : second.name, first.y < second.y ? second.name : first.name);
                }
            }

            // Solid boxes
            const solids = [];

            for (const solid of model.solids || []) {
                const from = [0, 1, 2].map(i => Core.round(Math.min(solid.from[i], solid.to[i]) / unit));
                const to = [0, 1, 2].map(i => Core.round(Math.max(solid.from[i], solid.to[i]) / unit));

                if (from.some((v, i) => to[i] - v <= 0)) {
                    problem('warning', 'p.solid_empty', -1, solid.name);
                    continue;
                }

                if (solid.rotated)
                    problem('warning', 'p.solid_rotated', -1, solid.name);

                solids.push({ name: solid.name, from, to });
            }

            if (solids.length > LIMITS.MAX_SOLIDS)
                problem('error', 'p.solids_many', -1, LIMITS.MAX_SOLIDS, solids.length);

            return { problems, floorY: Core.round(floorTop / unit), originX, originZ, zones, solids, errors: problems.filter(p => p.level === 'error').length };
        },

        /** Do two zones share a column? */
        touching(a, b) {
            const x0 = Math.max(a.minX, b.minX), x1 = Math.min(a.maxX, b.maxX), z0 = Math.max(a.minZ, b.minZ), z1 = Math.min(a.maxZ, b.maxZ);

            for (let z = z0; z < z1; z++) {
                for (let x = x0; x < x1; x++) {
                    if (a.contains(x, z) && b.contains(x, z))
                        return true;
                }
            }

            return false;
        },

        /**
         * The deck file as an object, in the order in which it is read. Only what differs from the default of the mod is written.
         * @param parts finished entries of the parts (see compileAll) - without it a deck without parts
         */
        compile(resolved, settings, bone, unit, parts) {
            const zones = resolved.zones.filter(zone => zone.usable);
            const deckBlock = (settings.block || '').trim();
            const visible = zones.some(zone => zone.block);
            const deckThickness = visible && zones.length ? zones[0].thickness : LIMITS.DEFAULT_THICKNESS;
            const extra = settings.extra && typeof settings.extra === 'object' ? settings.extra : {};
            const deck = {};
            deck.entity = (settings.entity || '').trim();

            if (settings.pivot_mode === 'custom')
                deck.pivot = settings.pivot.map(Core.round);
            else if (bone && settings.follow_bone)
                deck.pivot = bone.pivot.map(v => Core.round(v / unit));

            deck.floor = { y: resolved.floorY };

            // Shift of the grid - only if there is one (Living Decks reads it from beta16 on)
            if (resolved.originX)
                deck.floor.x = resolved.originX;

            if (resolved.originZ)
                deck.floor.z = resolved.originZ;

            if (deckBlock)
                deck.floor.block = deckBlock;

            if (visible && !Core.near(deckThickness, LIMITS.DEFAULT_THICKNESS, 1.0e-6))
                deck.floor.thickness = deckThickness;

            deck.zones = zones.map(zone => {
                const out = {};

                if (zone.y !== 0)
                    out.y = zone.y;

                if (zone.pattern) {
                    out.origin = [zone.minX, zone.minZ];
                    out.pattern = zone.pattern.slice();
                }
                else {
                    out.from = [zone.minX, zone.minZ];
                    out.to = [zone.maxX, zone.maxZ];
                }

                if (zone.maxHeight !== null)
                    out.max_height = zone.maxHeight;

                if (zone.margin.some(m => m > 0))
                    out.margin = zone.margin.every(m => m === zone.margin[0]) ? zone.margin[0] : zone.margin.slice();

                if (zone.rimOwn !== null && zone.rim !== !!settings.rim)
                    out.rim = zone.rim;

                if (zone.blockOwn && zone.blockOwn !== deckBlock)
                    out.block = zone.blockOwn;

                if (zone.block && !Core.near(zone.thickness, deckThickness, 1.0e-6))
                    out.thickness = zone.thickness;

                return out;
            });

            if (settings.max_blocks > 0)
                deck.max_blocks = Math.round(settings.max_blocks);

            if (settings.rim)
                deck.rim = true;

            if (settings.safe_drop !== LIMITS.DEFAULT_SAFE_DROP)
                deck.safe_drop = Math.round(settings.safe_drop);

            if (resolved.solids.length)
                deck.solids = resolved.solids.map(solid => ({ from: solid.from.slice(), to: solid.to.slice() }));

            if (bone && settings.follow_bone)
                deck.bone = bone.name;

            const structure = (settings.structure_id || '').trim();

            if (structure) {
                const rotation = settings.structure_rotation || 'none';
                const offset = settings.structure_offset.map(Math.round);
                const zone = Math.round(settings.structure_zone) || 0;

                if (rotation === 'none' && offset.every(v => v === 0) && zone === 0) {
                    deck.structure = structure;
                }
                else {
                    deck.structure = { id: structure };

                    if (rotation !== 'none')
                        deck.structure.rotation = rotation;

                    if (offset.some(v => v !== 0))
                        deck.structure.offset = offset;

                    if (zone !== 0)
                        deck.structure.zone = zone;
                }
            }

            // Saddle: as short as possible - true, "mod:item" or in full with owner_only and equipped (since beta17)
            if (settings.saddle === 'platform' || settings.saddle === 'custom') {
                const item = settings.saddle === 'custom' ? (settings.saddle_item || '').trim() : null;

                if (!settings.saddle_owner_only && !settings.saddle_equipped) {
                    deck.saddle = item === null ? true : item;
                }
                else {
                    deck.saddle = {};

                    if (item !== null)
                        deck.saddle.item = item;

                    if (settings.saddle_equipped)
                        deck.saddle.equipped = true;

                    if (settings.saddle_owner_only)
                        deck.saddle.owner_only = true;
                }
            }

            if (parts && parts.length)
                deck.parts = parts;

            // What the plugin does not know (from an imported file) is kept
            for (const key in extra) {
                if (!(key in deck))
                    deck[key] = JSON.parse(JSON.stringify(extra[key]));
            }

            return deck;
        },

        /** Is this a valid name of a part (a-z, 0-9 and _, 1 to 32 characters - as the mod checks)? */
        isPartName(text) {
            return typeof text === 'string' && PART_PATTERN.test(text);
        },

        /**
         * Put the decks of a model in order (since beta4): the main deck - the one with an empty part name - first, then the parts in the
         * order of the model. Plus everything that is wrong with how they are divided up.
         * @param models decks as they are in the model (each with settings.part and rootName)
         * @return { order: [indices into models, main deck first], main: index or -1, problems: [{ level, text, deck }], errors } - deck is
         *         the index of the deck concerned (-1 = the whole model)
         */
        arrange(models, text) {
            const t = text || tr;
            const problems = [];
            const mains = [], parts = [];
            models.forEach((model, i) => ((model.settings.part || '') === '' ? mains : parts).push(i));

            if (!mains.length && parts.length)
                problems.push({ level: 'error', text: t('p.no_main'), deck: -1 });

            for (let i = 1; i < mains.length; i++)
                problems.push({ level: 'error', text: t('p.two_mains', models[mains[0]].rootName, models[mains[i]].rootName), deck: mains[i] });

            const seen = new Set();

            for (const i of parts) {
                const name = models[i].settings.part;

                if (!PART_PATTERN.test(name))
                    problems.push({ level: 'error', text: t('p.part_name', name), deck: i });
                else if (seen.has(name))
                    problems.push({ level: 'error', text: t('p.part_dup', name), deck: i });

                seen.add(name);
            }

            if (parts.length > LIMITS.MAX_PARTS)
                problems.push({ level: 'error', text: t('p.too_many_parts', parts.length, LIMITS.MAX_PARTS), deck: -1 });

            return { order: mains.slice(0, 1).concat(parts), main: mains.length ? mains[0] : -1, problems, errors: problems.length > 0 };
        },

        /**
         * The deck file for the whole creature: the main deck as before, below it its parts as "parts" (Living Decks beta17 or newer). A
         * part is written like a deck, with "name" instead of "entity" and without a saddle - both apply to the whole creature.
         * @param decks [{ resolved, settings, bone, unit }] - the main deck first, then the parts
         */
        compileAll(decks) {
            const parts = decks.slice(1).map(entry => {
                const compiled = Core.compile(entry.resolved, Object.assign({}, entry.settings, { entity: '', saddle: 'none' }), entry.bone, entry.unit);
                const part = { name: entry.settings.part };

                for (const key of Object.keys(compiled)) {
                    if (key !== 'entity' && key !== 'saddle' && key !== 'name' && key !== 'parts')
                        part[key] = compiled[key];
                }

                return part;
            });
            const main = decks[0];
            return Core.compile(main.resolved, main.settings, main.bone, main.unit, parts);
        },

        /** The deck file as text: one field per line, zones and boxes one line each, patterns row by row. */
        stringify(deck) {
            const number = value => String(Core.round(value));
            const inline = value => {
                if (Array.isArray(value))
                    return '[' + value.map(inline).join(', ') + ']';

                if (value !== null && typeof value === 'object') {
                    const keys = Object.keys(value);
                    return keys.length ? '{ ' + keys.map(key => JSON.stringify(key) + ': ' + inline(value[key])).join(', ') + ' }' : '{}';
                }

                return typeof value === 'number' ? number(value) : JSON.stringify(value);
            };
            const zoneText = (zone, pad) => {
                if (!zone.pattern)
                    return pad + inline(zone);

                const before = {}, after = {};
                let seen = false;

                for (const key of Object.keys(zone)) {
                    if (key === 'pattern')
                        seen = true;
                    else
                        (seen ? after : before)[key] = zone[key];
                }

                const head = Object.keys(before).map(key => JSON.stringify(key) + ': ' + inline(before[key])).join(', ');
                const tail = Object.keys(after).map(key => JSON.stringify(key) + ': ' + inline(after[key])).join(', ');
                const rows = zone.pattern.map(row => pad + '    ' + JSON.stringify(row)).join(',\n');
                return pad + '{ ' + (head ? head + ',\n' + pad + '  ' : '') + '"pattern": [\n' + rows + '\n' + pad + '  ]' + (tail ? ',\n' + pad + '  ' + tail : '') + ' }';
            };
            // The fields of a deck, indented by pad - for the file itself and for each of its parts
            const body = (object, pad) => {
                const lines = [];

                for (const key of Object.keys(object)) {
                    const value = object[key];

                    if (key === 'zones' && Array.isArray(value))
                        lines.push(pad + '"zones": [\n' + value.map(zone => zoneText(zone, pad + '  ')).join(',\n') + '\n' + pad + ']');
                    else if (key === 'solids' && Array.isArray(value))
                        lines.push(pad + '"solids": [\n' + value.map(solid => pad + '  ' + inline(solid)).join(',\n') + '\n' + pad + ']');
                    else if (key === 'parts' && Array.isArray(value) && value.length && value.every(part => part !== null && typeof part === 'object' && !Array.isArray(part)))
                        lines.push(pad + '"parts": [\n' + value.map(part => pad + '  {\n' + body(part, pad + '    ').join(',\n') + '\n' + pad + '  }').join(',\n') + '\n' + pad + ']');
                    else if (key === 'entity' || key === 'name' || key === 'pivot' || key === 'floor' || key === 'structure' || key === 'saddle' || typeof value !== 'object' || value === null)
                        lines.push(pad + JSON.stringify(key) + ': ' + inline(value));
                    else
                        lines.push(pad + JSON.stringify(key) + ': ' + JSON.stringify(value, null, 2).split('\n').join('\n' + pad));
                }

                return lines;
            };

            return '{\n' + body(deck, '  ').join(',\n') + '\n}\n';
        },

        /**
         * Read a deck file the way the mod does (old notation with floor rectangle and build, zones, or both) - including its parts
         * (since beta4): each one is read like a deck, its name is in settings.part.
         * @return { problems: [text], settings, floorY, originX, originZ, zones: [{ name, y, rects: [[x0, z0, x1, z1]], thickness, settings }],
         *           solids, bone, pivot, parts: [the same per part] } - the rectangles of the zones count in the grid of the deck (cells),
         *           originX and originZ are its shift
         */
        parse(json, text) {
            const t = text || tr;
            const main = Core.parseDeck(json, t);

            if (main.problems.length)
                return main;

            main.parts = [];

            if (json.parts === undefined)
                return main;

            if (!Array.isArray(json.parts))
                return { problems: [t('in.parts')] };

            if (json.parts.length > LIMITS.MAX_PARTS)
                return { problems: [t('in.parts_many', json.parts.length, LIMITS.MAX_PARTS)] };

            const names = new Set();

            for (let i = 0; i < json.parts.length; i++) {
                const entry = json.parts[i];

                if (entry === null || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.name !== 'string' || !PART_PATTERN.test(entry.name))
                    return { problems: [t('in.part_name', i)] };

                if (names.has(entry.name))
                    return { problems: [t('in.part_dup', i, entry.name)] };

                names.add(entry.name);
                // Written like a deck; creature and saddle apply to the whole creature and are only set at the main deck
                const copy = Object.assign({}, entry, { entity: json.entity });
                delete copy.name;
                delete copy.saddle;
                delete copy.parts;
                const part = Core.parseDeck(copy, t);

                if (part.problems.length)
                    return { problems: part.problems.map(problem => t('in.part', i, entry.name, problem)) };

                part.settings.part = entry.name;
                part.settings.entity = '';
                main.parts.push(part);
            }

            return main;
        },

        /** Read one deck - the file itself (without its parts) or one of its parts. See parse. */
        parseDeck(json, text) {
            const t = text || tr;
            const problems = [];
            const fail = (key, ...args) => {
                problems.push(t(key, ...args));
                return { problems };
            };
            const numbers = (value, count) => Array.isArray(value) && value.length === count && value.every(v => typeof v === 'number' && isFinite(v));

            if (json === null || typeof json !== 'object' || Array.isArray(json))
                return fail('in.not_object');

            if (typeof json.entity !== 'string')
                return fail('in.entity');

            const floor = json.floor;

            if (floor === null || typeof floor !== 'object' || typeof floor.y !== 'number' || !isFinite(floor.y))
                return fail('in.floor');

            if ((floor.from !== undefined) !== (floor.to !== undefined))
                return fail('in.floor_pair');

            // Shift of the grid (since beta16): the cell (0, 0) starts in the model at (floor.x, floor.z)
            for (const axis of ['x', 'z']) {
                if (floor[axis] !== undefined && (typeof floor[axis] !== 'number' || !isFinite(floor[axis])))
                    return fail('in.number', 'floor.' + axis);
            }

            const originX = floor.x === undefined ? 0 : floor.x, originZ = floor.z === undefined ? 0 : floor.z;

            if (Math.abs(originX) > LIMITS.MAX_ORIGIN || Math.abs(originZ) > LIMITS.MAX_ORIGIN)
                return fail('in.floor_offset');

            const settings = Core.settings(null);
            settings.entity = json.entity;
            settings.rim = json.rim === true;
            settings.block = typeof floor.block === 'string' ? floor.block : '';
            const deckThickness = typeof floor.thickness === 'number' ? floor.thickness : LIMITS.DEFAULT_THICKNESS;
            const zones = [];
            const zoneSettings = (maxHeight, margin, rim, block) => ({
                max_height: typeof maxHeight === 'number' ? maxHeight : 0, margin,
                rim: typeof rim === 'boolean' && rim !== settings.rim ? (rim ? 'on' : 'off') : 'default',
                block: typeof block === 'string' && block !== settings.block ? block : ''
            });

            if (json.build !== undefined) {
                const build = json.build;

                if (floor.from === undefined)
                    return fail('in.build_floor');

                // The old notation gives the floor as a rectangle in the model - its grid always sits at the origin
                if (originX !== 0 || originZ !== 0)
                    return fail('in.floor_offset_build');

                if (!numbers(floor.from, 2) || !numbers(floor.to, 2))
                    return fail('in.number', 'floor.from / floor.to');

                if (build === null || typeof build !== 'object' || !numbers(build.from, 2) || !numbers(build.to, 2))
                    return fail('in.number', 'build.from / build.to');

                const minX = Math.min(floor.from[0], floor.to[0]), minZ = Math.min(floor.from[1], floor.to[1]);
                const maxX = Math.max(floor.from[0], floor.to[0]), maxZ = Math.max(floor.from[1], floor.to[1]);
                const x0 = Math.min(build.from[0], build.to[0]), z0 = Math.min(build.from[1], build.to[1]);
                const x1 = Math.max(build.from[0], build.to[0]), z1 = Math.max(build.from[1], build.to[1]);
                // The strip between build area and floor edge is the margin of the zone
                const margin = [Math.max(0, x0 - minX), Math.max(0, z0 - minZ), Math.max(0, maxX - x1), Math.max(0, maxZ - z1)].map(Core.round);
                zones.push({ name: 'main', y: 0, rects: [[x0, z0, x1, z1]], thickness: deckThickness, settings: zoneSettings(build.max_height, margin, undefined, undefined) });

                if (typeof build.max_blocks === 'number')
                    settings.max_blocks = build.max_blocks;
            }
            else if (floor.from !== undefined) {
                return fail('in.floor_rect');
            }
            else if (!Array.isArray(json.zones) || !json.zones.length) {
                return fail('in.no_area');
            }

            const list = Array.isArray(json.zones) ? json.zones : [];

            for (let i = 0; i < list.length; i++) {
                const entry = list[i];

                if (entry === null || typeof entry !== 'object')
                    return fail('in.zone_shape', i);

                let rects;

                if (entry.from !== undefined || entry.to !== undefined) {
                    if (entry.pattern !== undefined || entry.origin !== undefined)
                        return fail('in.zone_both', i);

                    if (!numbers(entry.from, 2) || !numbers(entry.to, 2))
                        return fail('in.zone_shape', i);

                    const x0 = Math.min(entry.from[0], entry.to[0]), z0 = Math.min(entry.from[1], entry.to[1]);
                    const x1 = Math.max(entry.from[0], entry.to[0]), z1 = Math.max(entry.from[1], entry.to[1]);

                    if (x1 <= x0 || z1 <= z0)
                        return fail('in.zone_empty', i);

                    rects = [[x0, z0, x1, z1]];
                }
                else {
                    if (!Array.isArray(entry.pattern) || !entry.pattern.length || entry.pattern.some(row => typeof row !== 'string'))
                        return fail('in.zone_shape', i);

                    if (entry.pattern.some(row => /[^#. ]/.test(row)))
                        return fail('in.pattern_sign', i);

                    const width = Math.max(...entry.pattern.map(row => row.length));
                    // Without origin centered on the origin (for an odd size half a cell towards -x/-z)
                    const originX = numbers(entry.origin, 2) ? entry.origin[0] : Math.floor(-width / 2);
                    const originZ = numbers(entry.origin, 2) ? entry.origin[1] : Math.floor(-entry.pattern.length / 2);
                    rects = Core.rectangles(entry.pattern).map(r => [originX + r[0], originZ + r[1], originX + r[2], originZ + r[3]]);

                    if (!rects.length)
                        return fail('in.zone_empty', i);
                }

                let margin = [0, 0, 0, 0];

                if (typeof entry.margin === 'number')
                    margin = [entry.margin, entry.margin, entry.margin, entry.margin];
                else if (numbers(entry.margin, 4))
                    margin = entry.margin.slice();
                else if (entry.margin !== undefined)
                    return fail('in.margin', i);

                zones.push({
                    name: zones.length === 0 ? 'main' : 'zone_' + zones.length, y: typeof entry.y === 'number' ? Math.round(entry.y) : 0, rects,
                    thickness: typeof entry.thickness === 'number' ? entry.thickness : deckThickness,
                    settings: zoneSettings(entry.max_height, margin.map(Core.round), entry.rim, entry.block)
                });
            }

            if (typeof json.max_blocks === 'number')
                settings.max_blocks = json.max_blocks;

            if (typeof json.safe_drop === 'number')
                settings.safe_drop = json.safe_drop;

            // Saddle: true, "mod:item" / "#mod:tag" or { item, owner_only }
            if (json.saddle === true) {
                settings.saddle = 'platform';
            }
            else if (typeof json.saddle === 'string') {
                settings.saddle = 'custom';
                settings.saddle_item = json.saddle;
            }
            else if (json.saddle !== null && typeof json.saddle === 'object') {
                settings.saddle = typeof json.saddle.item === 'string' && json.saddle.item !== 'livingdecks:platform_saddle' ? 'custom' : 'platform';
                settings.saddle_item = settings.saddle === 'custom' ? json.saddle.item : '';
                settings.saddle_owner_only = json.saddle.owner_only === true;
                settings.saddle_equipped = json.saddle.equipped === true;
            }

            if (typeof json.structure === 'string') {
                settings.structure_id = json.structure;
            }
            else if (json.structure !== null && typeof json.structure === 'object' && typeof json.structure.id === 'string') {
                settings.structure_id = json.structure.id;
                settings.structure_rotation = typeof json.structure.rotation === 'string' ? json.structure.rotation : 'none';
                settings.structure_offset = numbers(json.structure.offset, 3) ? json.structure.offset.slice() : [0, 0, 0];
                settings.structure_zone = typeof json.structure.zone === 'number' ? json.structure.zone : 0;
            }

            const solids = [];

            for (const solid of Array.isArray(json.solids) ? json.solids : []) {
                if (solid && numbers(solid.from, 3) && numbers(solid.to, 3))
                    solids.push({ from: solid.from.slice(), to: solid.to.slice() });
            }

            const known = ['entity', 'pivot', 'floor', 'build', 'zones', 'rim', 'solids', 'bone', 'structure', 'saddle', 'max_blocks', 'safe_drop', 'parts'];

            for (const key of Object.keys(json)) {
                if (!known.includes(key))
                    settings.extra[key] = JSON.parse(JSON.stringify(json[key]));
            }

            return {
                problems, settings, floorY: floor.y, originX, originZ, zones, solids, bone: typeof json.bone === 'string' ? json.bone : null,
                pivot: numbers(json.pivot, 3) ? json.pivot.slice() : null
            };
        },

        /**
         * What is built into the model for a deck file that was read: per zone its cubes in pixels (top = floor of the zone, as thick as
         * the visible plate, moved by the shift of the grid), the solid boxes and the settings of the deck.
         * @param findBone name of a bone -> { name, pivot (pixels) } or null if the model does not have it
         * @return { settings, bone, zones: [{ name, settings, cubes: [{ from, to }] }], solids: [{ name, from, to }] }
         */
        plan(parsed, unit, findBone) {
            const settings = Core.settings(parsed.settings);
            const sameVector = (a, b) => a.every((v, i) => Core.near(v, b[i], 1.0e-4));
            const ox = parsed.originX || 0, oz = parsed.originZ || 0;
            let bone = null;

            if (parsed.bone !== null) {
                bone = findBone ? findBone(parsed.bone) : null;

                if (bone) {
                    settings.follow_bone = true;

                    if (parsed.pivot && !sameVector(parsed.pivot, bone.pivot.map(v => v / unit))) {
                        settings.pivot_mode = 'custom';
                        settings.pivot = parsed.pivot.slice();
                    }
                }
                else {
                    // The model does not have this bone: name and pivot stay as they are in the file
                    settings.extra.bone = parsed.bone;

                    if (parsed.pivot) {
                        settings.pivot_mode = 'custom';
                        settings.pivot = parsed.pivot.slice();
                    }
                }
            }
            else if (parsed.pivot && parsed.zones.length) {
                // Without a value the mod takes the middle of the floor of the first zone (including its margin)
                const first = parsed.zones[0];
                const m = first.settings.margin;
                const minX = Math.min(...first.rects.map(r => r[0])), minZ = Math.min(...first.rects.map(r => r[1]));
                const maxX = Math.max(...first.rects.map(r => r[2])), maxZ = Math.max(...first.rects.map(r => r[3]));
                const standard = [(minX - m[0] + maxX + m[2]) / 2 + ox, parsed.floorY + first.y, (minZ - m[1] + maxZ + m[3]) / 2 + oz];

                if (!sameVector(parsed.pivot, standard)) {
                    settings.pivot_mode = 'custom';
                    settings.pivot = parsed.pivot.slice();
                }
            }

            const zones = parsed.zones.map(zone => {
                const top = (parsed.floorY + zone.y) * unit;
                const thickness = Math.min(LIMITS.MAX_THICKNESS, Math.max(LIMITS.MIN_THICKNESS, zone.thickness)) * unit;
                return {
                    name: zone.name, settings: Core.zoneSettings(zone.settings),
                    cubes: zone.rects.map(r => ({ from: [(r[0] + ox) * unit, top - thickness, (r[1] + oz) * unit], to: [(r[2] + ox) * unit, top, (r[3] + oz) * unit] }))
                };
            });
            const solids = parsed.solids.map((solid, i) => ({
                name: 'solid_' + (i + 1), from: [0, 1, 2].map(k => Math.min(solid.from[k], solid.to[k]) * unit), to: [0, 1, 2].map(k => Math.max(solid.from[k], solid.to[k]) * unit)
            }));
            return { settings, bone, zones, solids };
        },

        /** Split a pattern into as few rectangles [x0, z0, x1, z1] as possible (row by row, equal pieces extended downwards). */
        rectangles(pattern) {
            const rows = pattern.length;
            const width = Math.max(0, ...pattern.map(row => row.length));
            const used = [];
            const out = [];

            for (let z = 0; z < rows; z++)
                used.push(new Uint8Array(width));

            const cell = (x, z) => pattern[z].charAt(x) === '#' && !used[z][x];

            for (let z = 0; z < rows; z++) {
                for (let x = 0; x < width; x++) {
                    if (!cell(x, z))
                        continue;

                    let x1 = x;

                    while (x1 < width && cell(x1, z))
                        x1++;

                    let z1 = z + 1;

                    for (; z1 < rows; z1++) {
                        let full = true;

                        for (let i = x; i < x1 && full; i++)
                            full = cell(i, z1);

                        if (!full)
                            break;
                    }

                    for (let j = z; j < z1; j++)
                        used[j].fill(1, x, x1);

                    out.push([x, z, x1, z1]);
                }
            }

            return out;
        },

        /**
         * The layout as the mod computes it (DeckLayout): per level, which piece of floor belongs to whom (cells and margin at free
         * edges) and where the railing stands. An edge is free if the floor does not continue behind it on any zone - no floor on the
         * same level, up to safeDrop lower or one step higher.
         * @return { complete, plates: [{zone, level, x0, z0, x1, z1, margin}], rims: [{level, x0, z0, x1, z1}],
         *           edges: [{zone, level, x0, z0, x1, z1}] }
         */
        layout(zones, safeDrop) {
            const levels = new Map();
            const result = { complete: true, plates: [], rims: [], edges: [] };

            zones.forEach((zone, index) => {
                if (!zone.usable)
                    return;

                if (!levels.has(zone.y))
                    levels.set(zone.y, []);

                levels.get(zone.y).push(index);
            });

            for (const level of Array.from(levels.keys()).sort((a, b) => a - b)) {
                if (!Core.layoutLevel(zones, levels.get(level), level, safeDrop, result)) {
                    return { complete: false, plates: [], rims: [], edges: [] };
                }
            }

            return result;
        },

        layoutLevel(zones, members, level, safeDrop, result) {
            const LEFT = 1, FRONT = 2, RIGHT = 4, BACK = 8;
            const open = (x, z) => !zones.some(zone => zone.usable && zone.y >= level - safeDrop && zone.y <= level + LIMITS.STEP_UP && zone.contains(x, z));
            const rim = (zone, margin) => zone.rim ? Math.max(margin, LIMITS.RIM_MIN) : 0;
            const owners = new Map();
            const xSet = new Set(), zSet = new Set();
            const perZone = [];
            const addEdges = (set, edge, margin, rimWidth) => {
                if (margin !== 0)
                    set.add(edge + margin);

                if (rimWidth !== 0)
                    set.add(edge + rimWidth);
            };

            for (const member of members) {
                const zone = zones[member];
                const m = zone.margin;
                const cells = [];

                for (let z = zone.minZ; z < zone.maxZ; z++) {
                    for (let x = zone.minX; x < zone.maxX; x++) {
                        if (!zone.contains(x, z))
                            continue;

                        const key = x + ',' + z;

                        if (!owners.has(key))
                            owners.set(key, [x, z, member]);

                        const flags = (open(x - 1, z) ? LEFT : 0) | (open(x, z - 1) ? FRONT : 0) | (open(x + 1, z) ? RIGHT : 0) | (open(x, z + 1) ? BACK : 0);
                        cells.push([x, z, flags]);
                        xSet.add(x);
                        xSet.add(x + 1);
                        zSet.add(z);
                        zSet.add(z + 1);

                        if (flags & LEFT)
                            addEdges(xSet, x, -m[0], -rim(zone, m[0]));

                        if (flags & RIGHT)
                            addEdges(xSet, x + 1, m[2], rim(zone, m[2]));

                        if (flags & FRONT)
                            addEdges(zSet, z, -m[1], -rim(zone, m[1]));

                        if (flags & BACK)
                            addEdges(zSet, z + 1, m[3], rim(zone, m[3]));
                    }
                }

                perZone.push({ member, cells });
            }

            const snapped = set => {
                const sorted = Array.from(set).sort((a, b) => a - b);
                const out = [];

                for (const value of sorted) {
                    if (!out.length || value - out[out.length - 1] > 1.0e-7)
                        out.push(value);
                }

                return out;
            };
            const xs = snapped(xSet), zs = snapped(zSet);
            const nx = xs.length - 1, nz = zs.length - 1;

            if (nx < 1 || nz < 1)
                return true;

            if (nx * nz > LIMITS.MAX_GRID)
                return false;

            // Index of the edge with this value
            const index = (sorted, value) => {
                let low = 0, high = sorted.length - 1;

                while (low < high) {
                    const middle = (low + high) >> 1;

                    if (sorted[middle] < value - 1.0e-7)
                        low = middle + 1;
                    else
                        high = middle;
                }

                return low;
            };
            const owner = new Int32Array(nx * nz).fill(-1);
            const cell = new Uint8Array(nx * nz);
            const fill = (target, x0, z0, x1, z1, value) => {
                const ix0 = index(xs, x0), ix1 = index(xs, x1), iz0 = index(zs, z0), iz1 = index(zs, z1);

                for (let iz = iz0; iz < iz1; iz++) {
                    for (let ix = ix0; ix < ix1; ix++)
                        value(target, iz * nx + ix);
                }
            };

            for (const [x, z, member] of owners.values()) {
                fill(owner, x, z, x + 1, z + 1, (target, i) => {
                    target[i] = member;
                    cell[i] = 1;
                });
            }

            // Margin: every cell reaches on by the margin at its free edges (also around corners); what already belongs to someone stays
            for (const { member, cells } of perZone) {
                const m = zones[member].margin;

                if (m.every(value => value <= 0))
                    continue;

                for (const [x, z, flags] of cells) {
                    if (!flags)
                        continue;

                    fill(owner, x - (flags & LEFT ? m[0] : 0), z - (flags & FRONT ? m[1] : 0), x + 1 + (flags & RIGHT ? m[2] : 0), z + 1 + (flags & BACK ? m[3] : 0), (target, i) => {
                        if (target[i] < 0)
                            target[i] = member;
                    });
                }
            }

            // Railing: one strip per side in front of the free edge; left and right reach around the corner. Never on cells of this level.
            const railing = new Uint8Array(nx * nz);

            for (const { member, cells } of perZone) {
                const zone = zones[member];

                if (!zone.rim)
                    continue;

                const m = zone.margin;
                const left = rim(zone, m[0]), front = rim(zone, m[1]), right = rim(zone, m[2]), back = rim(zone, m[3]);
                const mark = (target, i) => {
                    if (!cell[i])
                        target[i] = 1;
                };

                for (const [x, z, flags] of cells) {
                    const z0 = z - (flags & FRONT ? front : 0), z1 = z + 1 + (flags & BACK ? back : 0);

                    if (flags & LEFT)
                        fill(railing, x - left, z0, x, z1, mark);

                    if (flags & RIGHT)
                        fill(railing, x + 1, z0, x + 1 + right, z1, mark);

                    if (flags & FRONT)
                        fill(railing, x, z - front, x + 1, z, mark);

                    if (flags & BACK)
                        fill(railing, x, z + 1, x + 1, z + 1 + back, mark);
                }
            }

            // Equal fields into rectangles
            const merge = (values, empty, same, emit) => {
                const done = new Uint8Array(nx * nz);

                for (let iz = 0; iz < nz; iz++) {
                    for (let ix = 0; ix < nx; ix++) {
                        const start = iz * nx + ix;

                        if (done[start] || values[start] === empty)
                            continue;

                        let ix1 = ix + 1;

                        while (ix1 < nx && !done[iz * nx + ix1] && same(start, iz * nx + ix1))
                            ix1++;

                        let iz1 = iz + 1;

                        for (; iz1 < nz; iz1++) {
                            let full = true;

                            for (let i = ix; i < ix1 && full; i++)
                                full = !done[iz1 * nx + i] && same(start, iz1 * nx + i);

                            if (!full)
                                break;
                        }

                        for (let j = iz; j < iz1; j++)
                            done.fill(1, j * nx + ix, j * nx + ix1);

                        emit(start, xs[ix], zs[iz], xs[ix1], zs[iz1]);
                    }
                }
            };

            merge(owner, -1, (a, b) => owner[a] === owner[b] && cell[a] === cell[b],
                  (i, x0, z0, x1, z1) => result.plates.push({ zone: owner[i], level, x0, z0, x1, z1, margin: !cell[i] }));
            merge(railing, 0, (a, b) => railing[a] === railing[b], (i, x0, z0, x1, z1) => result.rims.push({ level, x0, z0, x1, z1 }));

            // Outer edges of the floor per zone
            for (let iz = 0; iz < nz; iz++) {
                for (let ix = 0; ix < nx; ix++) {
                    const zone = owner[iz * nx + ix];

                    if (zone < 0)
                        continue;

                    if (ix === 0 || owner[iz * nx + ix - 1] !== zone)
                        result.edges.push({ zone, level, x0: xs[ix], z0: zs[iz], x1: xs[ix], z1: zs[iz + 1] });

                    if (ix === nx - 1 || owner[iz * nx + ix + 1] !== zone)
                        result.edges.push({ zone, level, x0: xs[ix + 1], z0: zs[iz], x1: xs[ix + 1], z1: zs[iz + 1] });

                    if (iz === 0 || owner[(iz - 1) * nx + ix] !== zone)
                        result.edges.push({ zone, level, x0: xs[ix], z0: zs[iz], x1: xs[ix + 1], z1: zs[iz] });

                    if (iz === nz - 1 || owner[(iz + 1) * nx + ix] !== zone)
                        result.edges.push({ zone, level, x0: xs[ix], z0: zs[iz + 1], x1: xs[ix + 1], z1: zs[iz + 1] });
                }
            }

            return true;
        },

        /**
         * Build space of a zone: per cell as many layers from its floor as are free - up to the build height or up to below the floor
         * of a higher zone (which is one block thick and the ceiling for the lower one).
         * @return float array [depth][width] over the rectangle of the zone (0 = no cell)
         */
        heights(zones, index, defaultHeight) {
            const zone = zones[index];
            const limit = zone.maxHeight === null ? defaultHeight : zone.maxHeight;
            const out = [];

            for (let z = zone.minZ; z < zone.maxZ; z++) {
                const row = new Int32Array(zone.maxX - zone.minX);

                for (let x = zone.minX; x < zone.maxX; x++) {
                    if (!zone.contains(x, z))
                        continue;

                    let free = limit;

                    zones.forEach((other, i) => {
                        // Floor of the other zone: the layer directly below its build area
                        if (i !== index && other.usable && other.y - 1 >= zone.y && other.contains(x, z))
                            free = Math.min(free, other.y - 1 - zone.y);
                    });
                    row[x - zone.minX] = Math.max(0, free);
                }

                out.push(row);
            }

            return out;
        },

        /**
         * The GeckoLib models of a mod from the file names in its .jar: everything below assets/<modid>/ that ends in .geo.json
         * (GeckoLib 5: geckolib/models/..., older: geo/...).
         * @return [{ path, modid, name, label }] - first what lies in a folder entity (creatures), then the rest (armor, items,
         *         blocks), each sorted by mod and name
         */
        modModels(paths) {
            const out = [];

            for (const path of paths) {
                const match = /^assets\/([^/]+)\/(.+)\.geo\.json$/i.exec(path);

                if (!match)
                    continue;

                const inner = match[2].replace(/^(geckolib\/models|geckolib\/geo|geckolib|geo|models)\//i, '');
                out.push({ path, modid: match[1], name: inner.split('/').pop(), label: match[1] + ': ' + inner, rank: /(^|\/)entit(y|ies)\//i.test(inner) ? 0 : 1 });
            }

            out.sort((a, b) => a.rank - b.rank || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
            return out.map(model => ({ path: model.path, modid: model.modid, name: model.name, label: model.label }));
        },

        /**
         * The creatures of a mod from its language file: every key "entity.<modid>.<name>" (without further dots) is a creature
         * <modid>:<name>.
         * @param langs { modid: content of assets/<modid>/lang/en_us.json as an object }
         */
        modEntities(langs) {
            const out = [];

            for (const modid of Object.keys(langs || {})) {
                const lang = langs[modid];
                const prefix = 'entity.' + modid + '.';

                if (lang === null || typeof lang !== 'object')
                    continue;

                for (const key of Object.keys(lang)) {
                    const name = key.startsWith(prefix) ? key.slice(prefix.length) : '';

                    if (name && /^[a-z0-9_-]+$/.test(name) && !out.includes(modid + ':' + name))
                        out.push(modid + ':' + name);
                }
            }

            return out.sort();
        },

        /** The creature that most likely belongs to a model: same mod and same name, otherwise the most similar name - or ''. */
        matchEntity(model, entities) {
            const own = entities.filter(id => id.startsWith(model.modid + ':'));
            const name = model.name.toLowerCase();

            if (own.includes(model.modid + ':' + name))
                return model.modid + ':' + name;

            // The name of the model is part of the name of the creature or the other way round: the longest common piece wins
            let best = '', length = 0;

            for (const id of own) {
                const path = id.slice(model.modid.length + 1);
                const common = path.includes(name) ? name.length : name.includes(path) ? path.length : 0;

                if (common > length) {
                    best = id;
                    length = common;
                }
            }

            return length >= 3 ? best : '';
        },

        /**
         * The texture for a model in the .jar: below assets/<modid>/textures/ with the same name, preferably in a folder entity -
         * or null.
         */
        matchTexture(model, paths) {
            const prefix = 'assets/' + model.modid + '/textures/';
            const wanted = model.name.toLowerCase() + '.png';
            const found = paths.filter(path => path.startsWith(prefix) && path.toLowerCase().split('/').pop() === wanted);

            if (!found.length)
                return null;

            const rank = path => (/\/entity\//.test(path) ? 0 : 1000) + path.length;
            return found.sort((a, b) => rank(a) - rank(b))[0];
        }
    };

    //endregion

    // For tests outside Blockbench (Node): only the core
    if (typeof globalThis !== 'undefined' && globalThis.__LIVING_DECKS_TEST__ && typeof globalThis.__LIVING_DECKS_TEST__ === 'object') {
        globalThis.__LIVING_DECKS_TEST__.Core = Core;
        globalThis.__LIVING_DECKS_TEST__.tr = tr;
    }

    if (typeof Plugin === 'undefined' || typeof Blockbench === 'undefined')
        return;

    //region Blockbench: the deck in the model

    /** Colors of the zones (marker colors of Blockbench; yellow is kept for the railing) */
    const ZONE_COLORS = [0, 2, 6, 4, 8, 7, 5, 3, 9];
    const RIM_COLOR = 0xF4D714;
    const PACK_FORMATS = {
        '26.1': { label: 'Minecraft 26.1', pack: { min_format: 101, max_format: 101 } }
    };

    function hasProject() {
        return typeof Project === 'object' && Project !== null && typeof Group !== 'undefined' && Array.isArray(Group.all);
    }

    function getData(node) {
        const value = node ? node[PROP] : null;
        return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
    }

    function isRoot(node) {
        if (!(node instanceof Group))
            return false;

        const data = getData(node);
        return (data !== null && data.deck === true) || ROOT_PATTERN.test(node.name);
    }

    /** The deck groups of the model (another one inside a deck would be a zone, not a deck). */
    function findRoots() {
        if (!hasProject())
            return [];

        return Group.all.filter(group => {
            if (!isRoot(group))
                return false;

            for (let node = group.parent; node && node !== 'root'; node = node.parent) {
                if (isRoot(node))
                    return false;
            }

            return true;
        });
    }

    /** Settings of a deck group with all defaults. */
    function settingsOf(root) {
        return Core.settings(getData(root));
    }

    /** The main deck of the model: the deck group without a part name (the first one if there are several), otherwise null. */
    function findMain(roots) {
        return (roots || findRoots()).find(root => settingsOf(root).part === '') || null;
    }

    /**
     * The deck concerned right now (since beta4 a model can have several): the one in which something is selected - otherwise the
     * main deck, otherwise the first deck group.
     */
    function findRoot() {
        const roots = findRoots();

        if (roots.length < 2)
            return roots[0] || null;

        for (const node of (Group.multi_selected || []).concat(Outliner.selected || [])) {
            for (let n = node; n && n !== 'root'; n = n.parent) {
                if (roots.includes(n))
                    return n;
            }
        }

        return findMain(roots) || roots[0];
    }

    /** What a deck is called when several are mentioned: "main deck" or part "name". */
    function deckLabel(settings) {
        return settings.part === '' ? tr('deck.main') : tr('deck.part', settings.part);
    }

    /** The zone a node belongs to (the node itself or the group directly inside the deck), otherwise null. */
    function zoneOf(node, root) {
        for (let n = node; n && n !== 'root'; n = n.parent) {
            if (n.parent === root)
                return (n instanceof Cube || n instanceof Group) && !(n instanceof Group && SOLIDS_PATTERN.test(n.name)) ? n : null;
        }

        return null;
    }

    function selectedZones(root) {
        const zones = [];
        const add = node => {
            const zone = zoneOf(node, root);

            if (zone && !zones.includes(zone))
                zones.push(zone);
        };

        (Outliner.selected || []).forEach(add);
        (Group.multi_selected || []).forEach(add);
        return root.children.filter(child => zones.includes(child));
    }

    function isRotated(node) {
        for (let n = node; n && n !== 'root'; n = n.parent) {
            if (Array.isArray(n.rotation) && n.rotation.some(value => Math.abs(value) > 1.0e-4))
                return true;
        }

        return false;
    }

    function cubesOf(group) {
        const cubes = [];
        group.forEachChild(child => cubes.push(child), Cube);
        return cubes;
    }

    /**
     * A deck as it stands in the outliner (sizes in pixels) - the input for the core. The scale applies to the whole creature: a part
     * uses that of the main deck.
     * @param main the main deck if it was already looked up (null = there is none); without it, it is looked up
     */
    function readModel(root, main) {
        const settings = settingsOf(root);
        const owner = settings.part === '' ? null : (main === undefined ? findMain() : main);
        const scale = owner && owner !== root ? settingsOf(owner).scale : settings.scale;
        const unit = 16 / (scale > 0 ? scale : 1);
        const parent = Format && Format.bone_rig && root.parent instanceof Group ? root.parent : null;
        const model = {
            settings, unit, bone: parent ? { name: parent.name, pivot: parent.origin.slice() } : null, rootName: root.name, strays: [], zones: [], solids: []
        };
        const rect = cube => ({
            x0: cube.from[0], z0: cube.from[2], x1: cube.to[0], z1: cube.to[2], top: Math.max(cube.from[1], cube.to[1]), bottom: Math.min(cube.from[1], cube.to[1]),
            rotated: isRotated(cube), inflate: cube.inflate || 0
        });

        for (const child of root.children) {
            if (child instanceof Cube) {
                model.zones.push({ name: child.name, node: child, settings: getData(child) || {}, rects: [rect(child)], color: child.color });
            }
            else if (child instanceof Group && SOLIDS_PATTERN.test(child.name)) {
                for (const cube of cubesOf(child))
                    model.solids.push({ name: cube.name, from: cube.from.slice(), to: cube.to.slice(), rotated: isRotated(cube) });
            }
            else if (child instanceof Group) {
                const cubes = cubesOf(child);
                model.zones.push({ name: child.name, node: child, settings: getData(child) || {}, rects: cubes.map(rect), color: cubes.length ? cubes[0].color : 0 });
            }
            else {
                model.strays.push(child.name);
            }
        }

        return model;
    }

    /**
     * All decks of the model, read and checked.
     * @return { roots, main: the main deck or null, decks: [{ root, model, resolved }] - the main deck first, then the parts (this is
     *           their order in the file), others: deck groups that do not go into the file (a second main deck),
     *           problems: [{ level, text, root }] - what is wrong with the division into main deck and parts,
     *           errors: number of all errors (the division and each deck by itself) }
     */
    function readAll() {
        const roots = findRoots();
        const main = findMain(roots);
        const all = roots.map(root => {
            const model = readModel(root, main);
            return { root, model, resolved: Core.resolve(model) };
        });
        const arranged = Core.arrange(all.map(entry => entry.model));
        const decks = arranged.order.map(i => all[i]);
        const problems = arranged.problems.map(problem => ({ level: problem.level, text: problem.text, root: problem.deck >= 0 ? roots[problem.deck] : null }));
        return {
            roots, main: arranged.main >= 0 ? all[arranged.main] : null, decks, others: all.filter(entry => !decks.includes(entry)), problems,
            errors: problems.filter(problem => problem.level === 'error').length + all.reduce((sum, entry) => sum + entry.resolved.errors, 0)
        };
    }

    /**
     * The deck file for the model - for the whole creature: the main deck and below it its parts (since beta4).
     * @return { model, resolved, deck, text, decks, others, problems, errors } - model and resolved are those of the main deck, decks all
     *         decks of the file (see readAll). If the division is wrong (no main deck, duplicate names) there is no file:
     *         deck is null and text is empty.
     */
    function compileDeck() {
        const all = readAll();
        const main = all.main;
        let deck = null;

        if (main && !all.problems.some(problem => problem.level === 'error'))
            deck = Core.compileAll(all.decks.map(entry => ({ resolved: entry.resolved, settings: entry.model.settings, bone: entry.model.bone, unit: entry.model.unit })));

        return {
            model: main ? main.model : null, resolved: main ? main.resolved : null, deck, text: deck ? Core.stringify(deck) : '', decks: all.decks, others: all.others,
            problems: all.problems, errors: all.errors
        };
    }

    function fileName(settings) {
        const own = (settings.file || '').trim();

        if (own)
            return own;

        const path = (settings.entity || '').split(':')[1] || 'deck';
        return path.replace(/[^a-z0-9_.-]/g, '_') || 'deck';
    }

    //endregion
    //region Blockbench: changes (everything with undo)

    /** Color of the next zone: the one after the color of the last (a part does not start with the first color - see createDeck). */
    function nextColor(root) {
        const zones = root ? root.children.filter(child => child instanceof Cube || (child instanceof Group && !SOLIDS_PATTERN.test(child.name))) : [];
        const last = zones.length ? zones[zones.length - 1] : null;
        const first = last instanceof Group ? cubesOf(last)[0] : last;
        const index = first ? ZONE_COLORS.indexOf(first.color) : -1;
        return ZONE_COLORS[(index >= 0 ? index + 1 : zones.length) % ZONE_COLORS.length];
    }

    function newCube(name, from, to, color) {
        const cube = new Cube({ name, from, to, color, export: false });

        // Without a texture: the zone shows in its marker color
        for (const key in cube.faces)
            cube.faces[key].texture = false;

        return cube;
    }

    function selectOnly(node) {
        unselectAllElements();

        for (const group of (Group.multi_selected || []).slice())
            group.unselect();

        node.select();
        updateSelection();
    }

    function updateNodes(cubes, groups) {
        Canvas.updateView({ elements: cubes, groups, element_aspects: { transform: true, geometry: true, faces: true, visibility: true }, selection: true });
    }

    /** The corner of the main floor in pixels [x, z]: the grid of the deck counts from it. Without a main floor the origin. */
    function gridReference(model) {
        const main = model.zones.length ? model.zones[0].rects[0] : null;
        return main ? [Math.min(main.x0, main.x1), Math.min(main.z0, main.z1)] : [0, 0];
    }

    /** Put a value (pixels) onto whole blocks from a reference edge. */
    function snapTo(value, reference, unit) {
        return reference + Math.round((value - reference) / unit) * unit;
    }

    /** Name of the group of a deck: living_deck, for a part followed by its name. */
    function rootName(part) {
        return part ? ROOT_NAME + '_' + part : ROOT_NAME;
    }

    /**
     * Create a deck: its group and the first zone. With options.part a part - another deck on the same creature, with its own
     * grid and its own bone (since beta4, Living Decks beta17 or newer) -, otherwise the main deck.
     * @param options { entity, block, from: [x, z] (blocks, decimals allowed: the corner sets the grid of the deck),
     *                  size: [width, length], floorY (blocks), parent (group or null), rim (on by default),
     *                  saddle ('none', 'platform' or 'custom'), saddle_item, saddle_owner_only, saddle_equipped,
     *                  part (name of the part: a-z, 0-9 and _ - creature and saddle are then set at the main deck and not here) }
     */
    function createDeck(options) {
        const part = typeof options.part === 'string' ? options.part.trim() : '';
        const roots = findRoots();
        const main = part ? findMain(roots) : null;
        // The scale of the creature is set at the main deck
        const scale = main ? settingsOf(main).scale : 1;
        const unit = 16 / (scale > 0 ? scale : 1);
        const parent = options.parent instanceof Group ? options.parent : 'root';
        const top = options.floorY * unit;
        const from = options.from || [-Math.floor(options.size[0] / 2), -Math.floor(options.size[1] / 2)];
        Undo.initEdit({ outliner: true, elements: [], groups: [], selection: true });
        const root = new Group({ name: rootName(part), origin: parent instanceof Group ? parent.origin.slice() : [0, top, 0], export: false });
        root[PROP] = Object.assign(Core.settings(null), {
            part, entity: part ? '' : (options.entity || '').trim(), block: (options.block || '').trim(), rim: options.rim === undefined ? true : !!options.rim,
            saddle: !part && (options.saddle === 'platform' || options.saddle === 'custom') ? options.saddle : 'none', saddle_item: part ? '' : (options.saddle_item || '').trim(),
            saddle_owner_only: !part && !!options.saddle_owner_only, saddle_equipped: !part && !!options.saddle_equipped
        });
        root.isOpen = true;
        root.addTo(parent).init();
        // Every deck starts with a different color - this tells main deck and parts apart in the model
        const cube = newCube('main', [from[0] * unit, top - LIMITS.DEFAULT_THICKNESS * unit, from[1] * unit], [(from[0] + options.size[0]) * unit, top, (from[1] + options.size[1]) * unit],
                             ZONE_COLORS[(part ? roots.length : 0) % ZONE_COLORS.length]);
        cube[PROP] = Core.zoneSettings(null);
        cube.addTo(root).init();
        selectOnly(cube);
        updateNodes([cube], [root]);
        Undo.finishEdit(tr(part ? 'undo.create_part' : 'undo.create'), { outliner: true, elements: [cube], groups: [root], selection: true });
        refreshOverlay(true);
        return root;
    }

    /**
     * Add a zone (a cube in the deck). It goes into the grid of the deck: whole blocks from the corner of the main floor.
     * @param options { name, from: [x, z] (blocks in the model), size: [width, length], level (blocks above the main floor), settings }
     */
    function addZone(root, options) {
        const model = readModel(root);
        const unit = model.unit;
        const main = model.zones.length ? model.zones[0].rects[0] : null;
        const floorTop = main ? main.top : 0;
        const thickness = main ? Math.max(1, main.top - main.bottom) : LIMITS.DEFAULT_THICKNESS * unit;
        const top = floorTop + Math.round(options.level || 0) * unit;
        const reference = gridReference(model);
        const x0 = snapTo(options.from[0] * unit, reference[0], unit), z0 = snapTo(options.from[1] * unit, reference[1], unit);
        Undo.initEdit({ outliner: true, elements: [], groups: [root], selection: true });
        const cube = newCube(options.name || 'zone', [x0, top - thickness, z0], [x0 + options.size[0] * unit, top, z0 + options.size[1] * unit], nextColor(root));
        cube[PROP] = Core.zoneSettings(options.settings);
        cube.addTo(root).init();
        selectOnly(cube);
        updateNodes([cube], [root]);
        Undo.finishEdit(tr('undo.add_zone'), { outliner: true, elements: [cube], groups: [root], selection: true });
        refreshOverlay(true);
        return cube;
    }

    /** Change settings of zones ({ max_height, margin, rim, block } - what is missing stays). */
    function setZoneSettings(nodes, values) {
        const cubes = nodes.filter(node => node instanceof Cube);
        const groups = nodes.filter(node => node instanceof Group);

        // First fill all of them with defaults so that undo finds the old state
        for (const node of nodes) {
            if (!getData(node))
                node[PROP] = Core.zoneSettings(null);
        }

        Undo.initEdit({ elements: cubes, groups });

        for (const node of nodes)
            node[PROP] = Core.zoneSettings(Object.assign({}, getData(node), values));

        Undo.finishEdit(tr('undo.zone_settings'), { elements: cubes, groups });
        refreshOverlay(true);
    }

    /**
     * Change settings of a deck (what is missing stays). With values.part the main deck becomes a part or the other way round; if the
     * group still has its name from when it was created, it gets the matching new one.
     */
    function setDeckSettings(root, values) {
        if (!getData(root))
            root[PROP] = Core.settings(null);

        const before = settingsOf(root).part;
        Undo.initEdit({ groups: [root] });
        root[PROP] = Core.settings(Object.assign({}, getData(root), values, { deck: true }));
        const after = root[PROP].part;

        if (after !== before && root.name === rootName(before))
            root.name = rootName(after);

        Undo.finishEdit(tr('undo.deck_settings'), { groups: [root] });
        refreshOverlay(true);
    }

    /**
     * Put all zones into the grid (x and z), the height onto whole blocks above or below the main floor.
     * @param toMain true: the main floor stays where it is - its corner is the reference, so the grid of the deck may be shifted;
     *               otherwise whole blocks of the model (no shift afterwards)
     * @return number of cubes moved
     */
    function snapZones(root, toMain) {
        const model = readModel(root);
        const unit = model.unit;
        const reference = toMain ? gridReference(model) : [0, 0];
        const cubes = [];

        for (const child of root.children) {
            if (child instanceof Cube)
                cubes.push(child);
            else if (child instanceof Group && !SOLIDS_PATTERN.test(child.name))
                cubes.push(...cubesOf(child));
        }

        if (!cubes.length)
            return 0;

        const floorTop = Math.max(cubes[0].from[1], cubes[0].to[1]);
        const changes = [];

        for (const cube of cubes) {
            const top = Math.max(cube.from[1], cube.to[1]);
            const shift = floorTop + snapTo(top - floorTop, 0, unit) - top;
            const from = [snapTo(cube.from[0], reference[0], unit), cube.from[1] + shift, snapTo(cube.from[2], reference[1], unit)];
            const to = [snapTo(cube.to[0], reference[0], unit), cube.to[1] + shift, snapTo(cube.to[2], reference[1], unit)];

            // Never shrink to nothing: at least one cell
            for (const axis of [0, 2]) {
                if (to[axis] === from[axis])
                    to[axis] = from[axis] + unit;
            }

            if (from.some((v, i) => Math.abs(v - cube.from[i]) > 1.0e-6) || to.some((v, i) => Math.abs(v - cube.to[i]) > 1.0e-6))
                changes.push({ cube, from, to });
        }

        if (!changes.length)
            return 0;

        const changed = changes.map(change => change.cube);
        Undo.initEdit({ elements: changed });

        for (const change of changes) {
            change.cube.from.splice(0, 3, ...change.from);
            change.cube.to.splice(0, 3, ...change.to);
        }

        Canvas.updateView({ elements: changed, element_aspects: { transform: true, geometry: true }, selection: true });
        Undo.finishEdit(tr(toMain ? 'undo.align' : 'undo.snap'), { elements: changed });
        refreshOverlay(true);
        return changes.length;
    }

    /**
     * Build a deck file that was read into the model (an existing deck is replaced).
     * @return { root, zones } or { problems } for a file that cannot be read
     */
    function importDeck(json) {
        const parsed = Core.parse(json);

        if (parsed.problems.length)
            return { problems: parsed.problems };

        // The file describes the whole creature: all decks of the model make way for the main deck and the parts of the file
        const olds = findRoots();
        const oldMain = findMain(olds) || olds[0] || null;
        const scale = oldMain ? settingsOf(oldMain).scale : 1;
        const unit = 16 / (scale > 0 ? scale : 1);
        const findBone = name => {
            const group = Format && Format.bone_rig ? Group.all.find(g => g.name === name && !isRoot(g) && !olds.some(old => g.isChildOf(old, 128))) : null;
            return group ? { name: group.name, pivot: group.origin.slice(), group } : null;
        };
        const plans = [parsed].concat(parsed.parts || []).map(deck => Core.plan(deck, unit, findBone));
        const oldCubes = [], oldGroups = [];

        for (const old of olds) {
            oldCubes.push(...cubesOf(old));
            oldGroups.push(old);
            old.forEachChild(child => oldGroups.push(child), Group);
        }

        Undo.initEdit({ outliner: true, elements: oldCubes, groups: oldGroups, selection: true });

        for (const old of olds)
            old.remove(false);

        const cubes = [], groups = [];
        const roots = plans.map((plan, index) => {
            plan.settings.scale = scale;
            return buildDeck(plan, index, cubes, groups);
        });
        updateNodes(cubes, groups);
        Undo.finishEdit(tr('undo.import'), { outliner: true, elements: cubes, groups, selection: true });
        refreshOverlay(true);
        return { root: roots[0], roots, zones: plans[0].zones.length, parts: plans.length - 1 };
    }

    /** Put a deck from a plan (Core.plan) into the model: its group - below its bone if there is one -, the zones and the solid boxes. */
    function buildDeck(plan, number, cubes, groups) {
        const parent = plan.bone ? plan.bone.group : 'root';
        const first = plan.zones.length && plan.zones[0].cubes.length ? plan.zones[0].cubes[0] : null;
        const root = new Group({ name: rootName(plan.settings.part), origin: plan.bone ? plan.bone.pivot.slice() : [0, first ? first.to[1] : 0, 0], export: false });
        root[PROP] = plan.settings;
        root.isOpen = true;
        root.addTo(parent).init();
        groups.push(root);

        plan.zones.forEach((zone, index) => {
            // Every deck starts with a different color (as when creating)
            const color = ZONE_COLORS[(number + index) % ZONE_COLORS.length];

            if (zone.cubes.length === 1) {
                const cube = newCube(zone.name, zone.cubes[0].from, zone.cubes[0].to, color);
                cube[PROP] = zone.settings;
                cube.addTo(root).init();
                cubes.push(cube);
                return;
            }

            // Free shape: a group of cubes
            const group = new Group({ name: zone.name, origin: root.origin.slice(), export: false });
            group[PROP] = zone.settings;
            group.addTo(root).init();
            groups.push(group);
            zone.cubes.forEach((box, i) => {
                const cube = newCube(zone.name + '_' + (i + 1), box.from, box.to, color);
                cube.addTo(group).init();
                cubes.push(cube);
            });
        });

        if (plan.solids.length) {
            const group = new Group({ name: SOLIDS_NAME, origin: root.origin.slice(), export: false });
            group.addTo(root).init();
            groups.push(group);

            for (const solid of plan.solids) {
                const cube = newCube(solid.name, solid.from, solid.to, 9);
                cube.addTo(group).init();
                cubes.push(cube);
            }
        }

        return root;
    }

    /**
     * Files of a data pack with the deck file of the creature (main deck and parts):
     * { 'pack.mcmeta': text, 'data/<namespace>/livingdecks/decks/<file>.json': text }.
     * @param root no longer needed (the deck up to beta3) - the file always describes the whole creature
     */
    function packFiles(root, options) {
        const compiled = compileDeck();
        const format = PACK_FORMATS[options.format] || PACK_FORMATS['26.1'];
        const files = {};
        files['pack.mcmeta'] = JSON.stringify({ pack: Object.assign({ description: options.description || 'Living Decks' }, format.pack) }, null, 2) + '\n';
        files['data/' + options.namespace + '/livingdecks/decks/' + options.file + '.json'] = compiled.text;
        return files;
    }

    //endregion
    //region Blockbench: models from mod files

    /** Creatures that were picked when opening from a mod file - the suggestion for "Create Deck" (per project, not saved) */
    const entityHints = new WeakMap();

    /**
     * Look through a mod file (.jar): its GeckoLib models and, from the language file, its creatures.
     * @param data content of the file (ArrayBuffer, Uint8Array or Blob) or an already opened JSZip
     * @return Promise<{ zip, paths, models, entities }>
     */
    function readMod(data) {
        const opened = data instanceof JSZip ? Promise.resolve(data) : JSZip.loadAsync(data);
        return opened.then(zip => {
            const paths = Object.keys(zip.files).filter(path => !zip.files[path].dir);
            const models = Core.modModels(paths);
            const modids = models.map(model => model.modid).filter((id, i, all) => all.indexOf(id) === i);
            const files = modids.map(id => [id, zip.file('assets/' + id + '/lang/en_us.json')]).filter(entry => entry[1]);
            return Promise.all(files.map(entry => entry[1].async('string'))).then(texts => {
                const langs = {};

                texts.forEach((text, i) => {
                    try {
                        langs[files[i][0]] = JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text);
                    }
                    catch (error) {
                        // Unreadable language file: no suggestions for this mod then
                    }
                });
                return { zip, paths, models, entities: Core.modEntities(langs) };
            });
        });
    }

    /**
     * Open a model from a mod file as a new project (format "Bedrock Entity" - this is how GeckoLib models are written).
     * @param mod from readMod, model one of its entries
     * @param options { entity (suggestion for "Create Deck"), texture (false = without texture) }
     * @return Promise<{ project, texture, empty }> texture: path of the loaded texture in the .jar or null; empty: the model has nothing
     *         Blockbench can show (the mod draws the creature from its own data)
     */
    function openModModel(mod, model, options) {
        const wanted = options || {};
        return mod.zip.file(model.path).async('string').then(text => {
            const json = JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text);
            const codec = [Codecs.bedrock, Codecs.bedrock_old].find(candidate => candidate && candidate.load_filter && Condition(candidate.load_filter.condition, json));

            if (!codec)
                throw new Error(tr('msg.model_format'));

            // The path only serves to pick the format (entity, not block). It is not remembered - the file is inside the .jar
            codec.load(json, { path: 'assets/' + model.modid + '/models/entity/' + model.name + '.geo.json', no_file: true });
            const project = Project;
            project.name = model.name;

            if ((wanted.entity || '').trim())
                entityHints.set(project, wanted.entity.trim());

            // With several geometries in one file Blockbench asks first - then nothing is loaded here yet
            const geometries = json['minecraft:geometry'];
            const empty = Project === project && !(Array.isArray(geometries) && geometries.length > 1) && shapes(null).length === 0;
            const texture = wanted.texture === false || empty ? null : Core.matchTexture(model, mod.paths);

            if (!texture)
                return { project, texture: null, empty };

            return mod.zip.file(texture).async('base64').then(data => {
                if (Project !== project)
                    return { project, texture: null, empty };

                new Texture({ name: texture.split('/').pop() }).fromDataURL('data:image/png;base64,' + data).add(false);
                return { project, texture, empty };
            });
        });
    }

    function openModDialog(mod, fileName) {
        const models = {}, entities = { _other: tr('field.mod_entity.other') };
        mod.models.forEach((model, i) => {
            models['m' + i] = model.label;
        });
        mod.entities.forEach(id => {
            entities[id] = id;
        });
        const modelOf = key => mod.models[parseInt(String(key).slice(1), 10)] || mod.models[0];
        const guess = key => Core.matchEntity(modelOf(key), mod.entities) || '_other';
        let chosen = 'm0';
        const dialog = new Dialog({
            id: 'living_decks_open_mod', title: tr('dialog.open_mod.title'), width: 640,
            form: {
                info: { type: 'info', text: tr('info.open_mod', escapeHtml(fileName), mod.models.length, mod.entities.length) },
                model: { label: tr('field.model'), type: 'select', options: models, value: chosen },
                entity: { label: tr('field.mod_entity'), description: tr('field.mod_entity.desc'), type: 'select', options: entities, value: guess(chosen) },
                texture: { label: tr('field.mod_texture'), type: 'checkbox', value: true }
            },
            onFormChange(form) {
                // Another model picked: suggest the creature for it
                if (form.model !== chosen) {
                    chosen = form.model;
                    dialog.setFormValues({ entity: guess(chosen) }, false);
                }
            },
            onConfirm(result) {
                const model = modelOf(result.model);
                openModModel(mod, model, { entity: result.entity === '_other' ? '' : result.entity, texture: !!result.texture })
                    .then(opened => opened.empty ? Blockbench.showMessageBox({ title: 'Living Decks', icon: 'info', message: tr('msg.model_empty') }) : message(tr('msg.model_opened', model.label)))
                    .catch(error => Blockbench.showMessageBox({ title: 'Living Decks', icon: 'error', message: tr('msg.model_unreadable') + '\n\n' + (error && error.message || error) }));
            }
        });
        dialog.show();
        return dialog;
    }

    function openMod() {
        Blockbench.import({ resource_id: 'living_decks_mod', extensions: ['jar', 'zip'], type: 'Minecraft Mod', readtype: 'buffer' }, files => {
            if (!files || !files.length)
                return;

            readMod(files[0].content).then(mod => {
                if (!mod.models.length)
                    return Blockbench.showMessageBox({ title: 'Living Decks', icon: 'info', message: tr('msg.no_models') });

                openModDialog(mod, files[0].name);
            }).catch(error => Blockbench.showMessageBox({ title: 'Living Decks', icon: 'error', message: tr('msg.mod_unreadable') + '\n\n' + (error && error.message || error) }));
        });
    }

    //endregion
    //region Blockbench: preview in the 3D view

    /** layers: one layer { root, group } per deck of the model - each hangs on its deck group and moves with its bone */
    const overlay = { container: null, layers: [], signature: '', enabled: true, volumes: true, timer: null, reported: false, matrix: null };

    function report(error) {
        if (!overlay.reported) {
            overlay.reported = true;
            console.error('Living Decks:', error);
        }
    }

    function clearOverlay() {
        const container = overlay.container;

        if (!container)
            return;

        const empty = node => {
            for (let i = node.children.length - 1; i >= 0; i--) {
                const child = node.children[i];
                node.remove(child);

                if (child.children && child.children.length)
                    empty(child);

                if (child.geometry)
                    child.geometry.dispose();

                if (child.material) {
                    if (child.material.map)
                        child.material.map.dispose();

                    child.material.dispose();
                }
            }
        };
        empty(container);
        overlay.layers.length = 0;
    }

    function zoneColor(index) {
        const color = markerColors[index % markerColors.length];
        return new THREE.Color(color ? color.standard : '#ffffff');
    }

    /** Label with the name of a zone and its level. */
    function makeLabel(text, color, unit) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const font = 'bold 40px sans-serif';
        context.font = font;
        const width = Math.ceil(context.measureText(text).width) + 32;
        const height = 64;
        canvas.width = width;
        canvas.height = height;
        context.font = font;
        context.textBaseline = 'middle';
        context.fillStyle = 'rgba(24, 26, 32, 0.82)';
        const r = 14;
        context.beginPath();
        context.moveTo(r, 0);
        context.lineTo(width - r, 0);
        context.quadraticCurveTo(width, 0, width, r);
        context.lineTo(width, height - r);
        context.quadraticCurveTo(width, height, width - r, height);
        context.lineTo(r, height);
        context.quadraticCurveTo(0, height, 0, height - r);
        context.lineTo(0, r);
        context.quadraticCurveTo(0, 0, r, 0);
        context.fill();
        context.fillStyle = '#' + color.getHexString();
        context.fillText(text, 16, height / 2 + 2);
        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
        const size = 0.62 * unit;
        sprite.scale.set(size * width / height, size, 1);
        sprite.renderOrder = 1000;
        return sprite;
    }

    /**
     * Draw the preview of a deck into its layer.
     * @param several the model has several decks: the labels of a part then show its name
     */
    function buildOverlay(container, model, several) {
        const resolved = Core.resolve(model);
        const prefix = several && model.settings.part ? model.settings.part + ': ' : '';
        const zones = resolved.zones;
        const unit = model.unit;
        const layout = Core.layout(zones, model.settings.safe_drop);
        const first = zones.find(zone => zone.usable);
        const floorTop = zones.length && zones[0].usable ? zones[0].top : (first ? first.top - first.y * unit : 0);
        const yOf = level => floorTop + level * unit;
        const lines = new Map(), faces = new Map();
        const bucket = (map, color, opacity) => {
            const key = color.getHexString() + '|' + opacity;

            if (!map.has(key))
                map.set(key, { color, opacity, positions: [] });

            return map.get(key).positions;
        };
        // Computed in the grid of the deck, drawn moved by its shift (the corner of the main floor sets it)
        const ox = resolved.originX * unit, oz = resolved.originZ * unit;
        const line = (color, opacity, x0, y0, z0, x1, y1, z1) => bucket(lines, color, opacity).push(x0 + ox, y0, z0 + oz, x1 + ox, y1, z1 + oz);
        const quad = (color, opacity, ...corners) => {
            const [a, b, c, d] = corners.map(point => [point[0] + ox, point[1], point[2] + oz]);
            bucket(faces, color, opacity).push(...a, ...b, ...c, ...a, ...c, ...d);
        };
        const colors = model.zones.map(zone => zoneColor(zone.color));
        const rimColor = new THREE.Color(RIM_COLOR);
        const dark = new THREE.Color(0x101216);
        // Just above the cube of the zone (otherwise the area flickers against its top)
        const lift = unit * 0.02, lineLift = unit * 0.03;

        // Floor: the cells strongly in the color of the zone (in many formats the cube below carries the texture of the model), the margin
        // paler, the outer edge as a line, the cells as a grid
        for (const plate of layout.plates) {
            const y = yOf(plate.level) + lift;
            quad(colors[plate.zone], plate.margin ? 0.4 : 0.8, [plate.x0 * unit, y, plate.z0 * unit], [plate.x0 * unit, y, plate.z1 * unit], [plate.x1 * unit, y, plate.z1 * unit],
                 [plate.x1 * unit, y, plate.z0 * unit]);
        }

        for (const edge of layout.edges) {
            const y = yOf(edge.level) + lineLift;
            line(colors[edge.zone], 1.0, edge.x0 * unit, y, edge.z0 * unit, edge.x1 * unit, y, edge.z1 * unit);
        }

        zones.forEach((zone, index) => {
            if (!zone.usable)
                return;

            const y = yOf(zone.y) + lineLift;

            for (let z = zone.minZ; z < zone.maxZ; z++) {
                for (let x = zone.minX; x < zone.maxX; x++) {
                    if (!zone.contains(x, z))
                        continue;

                    if (zone.contains(x + 1, z))
                        line(dark, 0.35, (x + 1) * unit, y, z * unit, (x + 1) * unit, y, (z + 1) * unit);

                    if (zone.contains(x, z + 1))
                        line(dark, 0.35, x * unit, y, (z + 1) * unit, (x + 1) * unit, y, (z + 1) * unit);
                }
            }

            // Label above the middle
            const level = index === 0 ? String.fromCharCode(177) + '0' : (zone.y > 0 ? '+' + zone.y : String(zone.y)).replace('-', String.fromCharCode(8722));
            const label = makeLabel(prefix + zone.name + '  ' + level, colors[index], unit);
            label.position.set((zone.minX + zone.maxX) / 2 * unit + ox, yOf(zone.y) + 1.75 * unit, (zone.minZ + zone.maxZ) / 2 * unit + oz);
            container.add(label);
        });

        // Railing: as high as in the default of the server
        for (const rim of layout.rims) {
            const y0 = yOf(rim.level) + lift, y1 = yOf(rim.level) + LIMITS.RIM_HEIGHT * unit;
            const x0 = rim.x0 * unit, x1 = rim.x1 * unit, z0 = rim.z0 * unit, z1 = rim.z1 * unit;
            quad(rimColor, 0.12, [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]);
            quad(rimColor, 0.12, [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]);
            quad(rimColor, 0.12, [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [x1, y0, z1]);
            quad(rimColor, 0.12, [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]);
            quad(rimColor, 0.12, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]);
            line(rimColor, 0.9, x0, y1, z0, x1, y1, z0);
            line(rimColor, 0.9, x1, y1, z0, x1, y1, z1);
            line(rimColor, 0.9, x1, y1, z1, x0, y1, z1);
            line(rimColor, 0.9, x0, y1, z1, x0, y1, z0);
        }

        // Build space: top edge per level and the corners
        if (overlay.volumes) {
            zones.forEach((zone, index) => {
                if (!zone.usable)
                    return;

                const heights = Core.heights(zones, index, LIMITS.DEFAULT_HEIGHT);
                const width = zone.maxX - zone.minX, depth = zone.maxZ - zone.minZ;
                const at = (x, z) => x < 0 || z < 0 || x >= width || z >= depth ? 0 : heights[z][x];
                const color = colors[index];
                const base = yOf(zone.y);

                for (let z = 0; z < depth; z++) {
                    for (let x = 0; x < width; x++) {
                        const h = at(x, z);

                        if (h <= 0)
                            continue;

                        const y = base + h * unit;
                        const x0 = (zone.minX + x) * unit, x1 = x0 + unit, z0 = (zone.minZ + z) * unit, z1 = z0 + unit;

                        if (at(x - 1, z) !== h)
                            line(color, 0.6, x0, y, z0, x0, y, z1);

                        if (at(x + 1, z) !== h)
                            line(color, 0.6, x1, y, z0, x1, y, z1);

                        if (at(x, z - 1) !== h)
                            line(color, 0.6, x0, y, z0, x1, y, z0);

                        if (at(x, z + 1) !== h)
                            line(color, 0.6, x0, y, z1, x1, y, z1);
                    }
                }

                // Verticals at every bend of the outline
                for (let z = 0; z <= depth; z++) {
                    for (let x = 0; x <= width; x++) {
                        const a = at(x - 1, z - 1), b = at(x, z - 1), c = at(x - 1, z), d = at(x, z);

                        if ((a === b && c === d) || (a === c && b === d))
                            continue;

                        line(color, 0.6, (zone.minX + x) * unit, base, (zone.minZ + z) * unit, (zone.minX + x) * unit, base + Math.max(a, b, c, d) * unit, (zone.minZ + z) * unit);
                    }
                }
            });
        }

        for (const entry of faces.values()) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(entry.positions, 3));
            const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
                color: entry.color, transparent: true, opacity: entry.opacity, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4,
                polygonOffsetUnits: -4
            }));
            mesh.renderOrder = 10;
            container.add(mesh);
        }

        for (const entry of lines.values()) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(entry.positions, 3));
            const segments = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: entry.color, transparent: entry.opacity < 1, opacity: entry.opacity }));
            segments.renderOrder = 11;
            container.add(segments);
        }
    }

    /**
     * The preview of every deck hangs on its deck group: it moves with its bone (also in animations) without being part of the
     * model.
     */
    function updateOverlayMatrix() {
        if (!overlay.container)
            return;

        for (const layer of overlay.layers) {
            const root = layer.root, mesh = root.mesh;

            if (!mesh) {
                layer.group.visible = false;
                continue;
            }

            mesh.updateWorldMatrix(true, false);
            layer.group.matrix.copy(mesh.matrixWorld);
            overlay.matrix.makeTranslation(-root.origin[0], -root.origin[1], -root.origin[2]);
            layer.group.matrix.multiply(overlay.matrix);
            layer.group.matrixWorldNeedsUpdate = true;
            layer.group.visible = root.visibility !== false;
        }
    }

    function refreshOverlay(force) {
        if (overlay.timer !== null) {
            clearTimeout(overlay.timer);
            overlay.timer = null;
        }

        try {
            const container = overlay.container;

            if (!container)
                return;

            // All decks of the model at once: the main deck and each part on its bone
            const all = overlay.enabled ? findRoots() : [];
            const roots = all.filter(root => root.mesh);

            if (!roots.length) {
                if (container.children.length || overlay.layers.length)
                    clearOverlay();

                overlay.signature = '';
                return;
            }

            if (container.parent !== scene)
                scene.add(container);

            const main = findMain(all);
            const models = roots.map(root => readModel(root, main));
            const signature = JSON.stringify([Project.uuid, overlay.volumes, language(), models.map((model, i) => [
                roots[i].uuid, model.settings, model.unit, model.zones.map(zone => [zone.name, zone.color, zone.rects, zone.settings])
            ])]);

            if (force || signature !== overlay.signature || overlay.layers.length !== roots.length || overlay.layers.some((layer, i) => layer.root !== roots[i])) {
                clearOverlay();
                overlay.signature = signature;
                roots.forEach((root, i) => {
                    const group = new THREE.Object3D();
                    group.matrixAutoUpdate = false;
                    container.add(group);
                    overlay.layers.push({ root, group });
                    buildOverlay(group, models[i], roots.length > 1);
                });
            }

            updateOverlayMatrix();
        }
        catch (error) {
            report(error);
        }
    }

    function scheduleRefresh() {
        if (overlay.timer === null)
            overlay.timer = setTimeout(() => refreshOverlay(false), 30);
    }

    //endregion
    //region Blockbench: dialogs

    function message(text) {
        Blockbench.showQuickMessage(text, 2200);
    }

    function escapeHtml(text) {
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function requireRoot() {
        if (!hasProject()) {
            message(tr('msg.no_project'));
            return null;
        }

        const root = findRoot();

        if (!root)
            message(tr('msg.no_deck'));

        return root;
    }

    function zoneForm(settings) {
        return {
            max_height: { label: tr('field.max_height'), description: tr('field.max_height.desc'), type: 'number', value: settings.max_height, min: 0, max: LIMITS.MAX_HEIGHT, step: 1 },
            margin: { label: tr('field.margin'), description: tr('field.margin.desc'), type: 'vector', dimensions: 4, value: settings.margin.slice(), min: 0, step: 0.125 },
            rim: { label: tr('field.rim'), type: 'select', options: { default: tr('field.rim.default'), on: tr('field.rim.on'), off: tr('field.rim.off') }, value: settings.rim },
            block: { label: tr('field.block'), description: tr('field.zone_block.desc'), type: 'text', value: settings.block, placeholder: 'minecraft:spruce_planks' }
        };
    }

    function zoneValues(form) {
        return { max_height: Math.round(form.max_height || 0), margin: form.margin.map(value => Math.max(0, Core.round(value || 0))), rim: form.rim, block: (form.block || '').trim() };
    }

    /** The cubes and meshes of the model that show something: visible and with an extent (a cube of size 0 is just a point). */
    function shapes(within) {
        const meshes = typeof Mesh !== 'undefined' && Array.isArray(Mesh.all) ? Mesh.all : [];
        const decks = findRoots();
        return Cube.all.filter(cube => cube.from.some((value, i) => Math.abs(cube.to[i] - value) > 1.0e-6)).concat(meshes)
                       .filter(element => !decks.some(deck => element.isChildOf(deck, 128)) && !(within && !element.isChildOf(within, 128)) && element.visibility !== false
                                          && element.mesh && element.mesh.geometry);
    }

    /**
     * Outline of the model without its decks, in pixels - as it stands (rotated bones included); null = empty.
     * @param within only what lies in this group (a bone a part goes onto) - without it the whole model
     */
    function modelBounds(within) {
        const all = new THREE.Box3(), part = new THREE.Box3();
        let any = false;

        for (const element of shapes(within)) {
            element.mesh.updateWorldMatrix(true, false);
            element.mesh.geometry.computeBoundingBox();

            if (!element.mesh.geometry.boundingBox)
                continue;

            all.union(part.copy(element.mesh.geometry.boundingBox).applyMatrix4(element.mesh.matrixWorld));
            any = true;
        }

        return any ? { min: all.min.toArray(), max: all.max.toArray() } : null;
    }

    /**
     * Suggestion along one axis for an outline in pixels: as many cells as the outline is wide in whole blocks (at least
     * one), centered below it - the corner rounded to half blocks. A creature that is 3 blocks wide gets a deck from -1.5 to 1.5 this way:
     * centered, with a shifted grid.
     * @return [corner in blocks, number of cells]
     */
    function suggestSpan(low, high) {
        // Exactly half blocks round down: rather a deck that just does not reach the edge than one that sticks out
        const size = Math.max(1, Math.round((high - low) / 16 - 1.0e-6));
        const from = Math.round(((low + high) / 32 - size / 2) * 2) / 2;
        return [from === 0 ? 0 : from, size];
    }

    /**
     * Suggestion without a visible model (some mods draw their creatures from their own data - then the model only has bones): a floor
     * of this size centered above the pivot of the bone, the corner rounded to half blocks. From there it is moved into place.
     * @return { from: [x, z], floorY } in blocks
     */
    function suggestAtBone(bone, unit, size) {
        const corner = (center, cells) => {
            const value = Math.round((center / unit - cells / 2) * 2) / 2;
            return value === 0 ? 0 : value;
        };
        return { from: [corner(bone.origin[0], size[0]), corner(bone.origin[2], size[1])], floorY: Core.round(bone.origin[1] / unit) };
    }

    /** The selected bone a new deck can go into: not a deck and nothing inside a deck - otherwise null. */
    function selectedBone() {
        const selected = Format.bone_rig && Group.first_selected instanceof Group ? Group.first_selected : null;
        return selected && !findRoots().some(root => selected === root || selected.isChildOf(root, 128)) ? selected : null;
    }

    /**
     * The fields for the saddle - the same when creating and in the settings of the deck.
     * @param only shows them only while this is true for the inputs (the saddle is set at the main deck - a part does not have the fields)
     */
    function saddleFields(settings, only) {
        const shown = only || (() => true);
        return {
            saddle: {
                label: tr('field.saddle'), type: 'select', options: { none: tr('field.saddle.none'), platform: tr('field.saddle.platform'), custom: tr('field.saddle.custom') },
                value: settings.saddle, condition: form => shown(form)
            },
            saddle_item: { label: tr('field.saddle_item'), type: 'text', value: settings.saddle_item, placeholder: 'mymod:platform_saddle', condition: form => shown(form) && form.saddle === 'custom' },
            saddle_owner_only: { label: tr('field.saddle_owner'), type: 'checkbox', value: settings.saddle_owner_only, condition: form => shown(form) && form.saddle !== 'none' },
            saddle_equipped: { label: tr('field.saddle_equipped'), type: 'checkbox', value: settings.saddle_equipped, condition: form => shown(form) && form.saddle !== 'none' }
        };
    }

    function openCreateDialog() {
        if (!hasProject())
            return message(tr('msg.no_project'));

        const existing = findMain();

        if (existing)
            return message(tr('msg.has_deck', existing.name));

        const bounds = modelBounds(null);
        const bone = selectedBone();
        const defaults = Core.settings(null);
        let from = [-2, -2], size = [4, 4], floorY = 1;

        if (bounds) {
            const x = suggestSpan(bounds.min[0], bounds.max[0]), z = suggestSpan(bounds.min[2], bounds.max[2]);
            from = [x[0], z[0]];
            size = [x[1], z[1]];
            floorY = Core.round(bounds.max[1] / 16 + LIMITS.DEFAULT_THICKNESS);
        }
        else if (bone) {
            ({ from, floorY } = suggestAtBone(bone, 16, size));
        }

        const form = {
            entity: { label: tr('field.entity'), description: tr('field.entity.desc'), type: 'text', value: entityHints.get(Project) || '', placeholder: 'minecraft:happy_ghast' },
            block: { label: tr('field.block'), description: tr('field.block.desc'), type: 'text', value: '', placeholder: 'minecraft:spruce_planks' },
            from: { label: tr('field.from'), description: tr('field.from.desc'), type: 'vector', dimensions: 2, value: from, step: 0.5 },
            size: { label: tr('field.size'), type: 'vector', dimensions: 2, value: size, min: 1, max: LIMITS.MAX_SIDE, step: 1 },
            floor_y: { label: tr('field.floor_y'), type: 'number', value: floorY, step: 0.125 },
            shifted: { type: 'info', text: tr('info.shifted'), condition: values => Array.isArray(values.from) && values.from.some(value => Core.offset(value || 0) !== 0) }
        };

        if (bone)
            form.in_bone = { label: tr('field.in_bone', bone.name), type: 'checkbox', value: !isRotated(bone) };

        // Railing and saddle right here: both decide how the deck shows up in the game
        Object.assign(form, { line: '_', rim: { label: tr('field.deck_rim'), type: 'checkbox', value: defaults.rim } }, saddleFields(defaults));

        new Dialog({
            id: 'living_decks_create', title: tr('dialog.create.title'), width: 600, form,
            onConfirm(result) {
                createDeck({
                    entity: result.entity, block: result.block, from: result.from.map(value => Core.round(value || 0)), size: result.size.map(value => Math.max(1, Math.round(value))),
                    floorY: result.floor_y, parent: bone && result.in_bone ? bone : null, rim: !!result.rim, saddle: result.saddle, saddle_item: result.saddle_item,
                    saddle_owner_only: !!result.saddle_owner_only, saddle_equipped: !!result.saddle_equipped
                });
                message(tr('msg.created'));
            }
        }).show();
    }

    /** Suggestion for the name of a new part: the name of the bone if it works as a name and is free - otherwise part_1, part_2 ... */
    function suggestPartName(bone, taken) {
        const fromBone = bone ? bone.name.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, LIMITS.MAX_PART_NAME) : '';

        if (Core.isPartName(fromBone) && !taken.includes(fromBone))
            return fromBone;

        for (let i = 1; ; i++) {
            if (!taken.includes('part_' + i))
                return 'part_' + i;
        }
    }

    /** Add a part: another deck on the same creature, with its own grid and - in the selected bone - its own movement. */
    function openPartDialog() {
        if (!hasProject())
            return message(tr('msg.no_project'));

        const roots = findRoots();
        const main = findMain(roots);

        if (!main)
            return message(tr('msg.part_needs_main'));

        // The selected bone carries the part - unless it is a deck itself or lies inside one
        const bone = selectedBone();
        const mainSettings = settingsOf(main);
        const unit = 16 / (mainSettings.scale > 0 ? mainSettings.scale : 1);
        // Suggestion: on top of the bone, otherwise on top of the whole model
        const bounds = (bone ? modelBounds(bone) : null) || modelBounds(null);
        let from = [-1, -1], size = [2, 2], floorY = 1;

        if (bounds) {
            const x = suggestSpan(bounds.min[0] * 16 / unit, bounds.max[0] * 16 / unit), z = suggestSpan(bounds.min[2] * 16 / unit, bounds.max[2] * 16 / unit);
            from = [x[0], z[0]];
            size = [x[1], z[1]];
            floorY = Core.round(bounds.max[1] / unit + LIMITS.DEFAULT_THICKNESS);
        }
        else if (bone) {
            ({ from, floorY } = suggestAtBone(bone, unit, size));
        }

        const taken = roots.map(root => settingsOf(root).part).filter(name => name !== '');
        const form = {
            part: { label: tr('field.part'), description: tr('field.part.desc'), type: 'text', value: suggestPartName(bone, taken), placeholder: 'head' },
            main_info: { type: 'info', text: tr('info.part_main') },
            block: { label: tr('field.block'), description: tr('field.block.desc'), type: 'text', value: mainSettings.block, placeholder: 'minecraft:spruce_planks' },
            from: { label: tr('field.from'), description: tr('field.from.desc'), type: 'vector', dimensions: 2, value: from, step: 0.5 },
            size: { label: tr('field.size'), type: 'vector', dimensions: 2, value: size, min: 1, max: LIMITS.MAX_SIDE, step: 1 },
            floor_y: { label: tr('field.floor_y'), type: 'number', value: floorY, step: 0.125 },
            shifted: { type: 'info', text: tr('info.shifted'), condition: values => Array.isArray(values.from) && values.from.some(value => Core.offset(value || 0) !== 0) }
        };

        if (bone)
            form.in_bone = { label: tr('field.in_bone', bone.name), type: 'checkbox', value: !isRotated(bone) };
        else if (Format.bone_rig)
            form.bone_info = { type: 'info', text: tr('info.part_bone') };

        Object.assign(form, { line: '_', rim: { label: tr('field.deck_rim'), type: 'checkbox', value: mainSettings.rim } });

        new Dialog({
            id: 'living_decks_part', title: tr('dialog.part.title'), width: 600, form,
            onConfirm(result) {
                const part = (result.part || '').trim();

                // The dialog stays open until the name is right
                if (!Core.isPartName(part)) {
                    message(tr('msg.part_name'));
                    return false;
                }

                if (findRoots().some(root => settingsOf(root).part === part)) {
                    message(tr('msg.part_exists', part));
                    return false;
                }

                createDeck({
                    part, block: result.block, from: result.from.map(value => Core.round(value || 0)), size: result.size.map(value => Math.max(1, Math.round(value))),
                    floorY: result.floor_y, parent: bone && result.in_bone ? bone : null, rim: !!result.rim
                });
                message(tr('msg.part_created', part));
            }
        }).show();
    }

    function openAddZoneDialog() {
        const root = requireRoot();

        if (!root)
            return;

        const resolved = Core.resolve(readModel(root));
        const usable = resolved.zones.filter(zone => zone.usable);
        const main = usable[0];
        // Suggestion: to the right of everything, as long as the main floor - in blocks of the model (the grid of the deck can be shifted)
        const from = [Core.round((usable.length ? Math.max(...usable.map(zone => zone.maxX)) : 0) + resolved.originX), Core.round((main ? main.minZ : 0) + resolved.originZ)];
        const size = [3, main ? main.maxZ - main.minZ : 3];
        const form = Object.assign({
            name: { label: tr('field.name'), type: 'text', value: 'zone_' + (root.children.length + 1) },
            from: { label: tr('field.from'), description: tr('field.zone_from.desc'), type: 'vector', dimensions: 2, value: from, step: 1 },
            size: { label: tr('field.size'), type: 'vector', dimensions: 2, value: size, min: 1, max: LIMITS.MAX_SIDE, step: 1 },
            level: { label: tr('field.level'), type: 'number', value: 0, min: -LIMITS.MAX_LEVEL, max: LIMITS.MAX_LEVEL, step: 1 },
            line: '_'
        }, zoneForm(Core.zoneSettings(null)));

        new Dialog({
            id: 'living_decks_add_zone', title: tr('dialog.add_zone.title'), width: 580, form,
            onConfirm(result) {
                addZone(root, {
                    name: (result.name || 'zone').trim() || 'zone', from: result.from.map(value => value || 0), size: result.size.map(value => Math.max(1, Math.round(value))),
                    level: Math.round(result.level || 0), settings: zoneValues(result)
                });
                message(tr('msg.zone_added'));
            }
        }).show();
    }

    function openZoneDialog() {
        const root = requireRoot();

        if (!root)
            return;

        const nodes = selectedZones(root);

        if (!nodes.length)
            return message(tr('msg.no_zone_selected'));

        const form = Object.assign({ info: { type: 'info', text: tr('info.zone', nodes.length, nodes.map(node => node.name).join(', ')) } }, zoneForm(Core.zoneSettings(getData(nodes[0]))));

        new Dialog({
            id: 'living_decks_zone', title: tr('dialog.zone.title'), width: 580, form,
            onConfirm(result) {
                setZoneSettings(nodes, zoneValues(result));
            }
        }).show();
    }

    function openDeckDialog() {
        const root = requireRoot();

        if (!root)
            return;

        const model = readModel(root);
        const s = model.settings;
        const resolved = Core.resolve(model);
        const structure = form => !!(form.structure_id || '').trim();
        // Creature, saddle and scale apply to the whole creature and are set at the main deck: while a part name is entered they are missing
        const isMain = form => !(form.part || '').trim();
        const extraKeys = Object.keys(s.extra || {});
        const form = {
            part: { label: tr('field.part'), description: tr('field.part.desc_deck'), type: 'text', value: s.part, placeholder: tr('deck.main') },
            part_info: { type: 'info', text: tr('info.part_main'), condition: values => !isMain(values) },
            entity: { label: tr('field.entity'), description: tr('field.entity.desc'), type: 'text', value: s.entity, placeholder: 'minecraft:happy_ghast', condition: isMain },
            ...saddleFields(s, isMain),
            line1: '_',
            block: { label: tr('field.block'), description: tr('field.block.desc'), type: 'text', value: s.block, placeholder: 'minecraft:spruce_planks' },
            rim: { label: tr('field.deck_rim'), type: 'checkbox', value: s.rim },
            safe_drop: { label: tr('field.safe_drop'), description: tr('field.safe_drop.desc'), type: 'number', value: s.safe_drop, min: 0, max: LIMITS.MAX_SAFE_DROP, step: 1 },
            max_blocks: { label: tr('field.max_blocks'), description: tr('field.max_blocks.desc'), type: 'number', value: s.max_blocks, min: 0, max: LIMITS.MAX_BLOCKS, step: 1 },
            line2: '_',
            follow_bone: { label: model.bone ? tr('field.follow_bone', model.bone.name) : tr('field.follow_bone.none'), type: 'checkbox', value: s.follow_bone },
            pivot_mode: { label: tr('field.pivot_mode'), type: 'select', options: { auto: tr('field.pivot_mode.auto'), custom: tr('field.pivot_mode.custom') }, value: s.pivot_mode },
            pivot: { label: tr('field.pivot'), type: 'vector', dimensions: 3, value: s.pivot.slice(), step: 0.125, condition: f => f.pivot_mode === 'custom' },
            scale: { label: tr('field.scale'), description: tr('field.scale.desc'), type: 'number', value: s.scale, min: 0.0625, max: 64, step: 0.5, condition: isMain },
            line3: '_',
            structure_id: { label: tr('field.structure_id'), description: tr('field.structure_id.desc'), type: 'text', value: s.structure_id, placeholder: 'mymod:fortress' },
            structure_rotation: {
                label: tr('field.structure_rotation'), type: 'select', value: s.structure_rotation, condition: structure,
                options: { none: 'none', clockwise_90: 'clockwise_90', '180': '180', counterclockwise_90: 'counterclockwise_90' }
            },
            structure_offset: { label: tr('field.structure_offset'), type: 'vector', dimensions: 3, value: s.structure_offset.slice(), step: 1, condition: structure },
            structure_zone: { label: tr('field.structure_zone'), type: 'number', value: s.structure_zone, min: 0, max: LIMITS.MAX_ZONES - 1, step: 1, condition: structure }
        };

        if (resolved.originX || resolved.originZ)
            form.offset = { type: 'info', text: tr('info.offset', resolved.originX, resolved.originZ) };

        if (extraKeys.length)
            form.extra = { type: 'info', text: tr('info.extra', extraKeys.length, extraKeys.join(', ')) };

        new Dialog({
            id: 'living_decks_deck', title: s.part ? tr('dialog.part_settings.title', s.part) : tr('dialog.deck.title'), width: 620, form,
            onConfirm(result) {
                const part = (result.part || '').trim();
                const others = findRoots().filter(other => other !== root);

                // The dialog stays open until the division is right: one main deck, every part with its own name
                if (part && !Core.isPartName(part)) {
                    message(tr('msg.part_name'));
                    return false;
                }

                if (part && others.some(other => settingsOf(other).part === part)) {
                    message(tr('msg.part_exists', part));
                    return false;
                }

                if (!part && findMain(others)) {
                    message(tr('msg.main_exists', findMain(others).name));
                    return false;
                }

                const values = {
                    part, block: (result.block || '').trim(), rim: !!result.rim, safe_drop: Math.round(result.safe_drop || 0), max_blocks: Math.round(result.max_blocks || 0),
                    follow_bone: !!result.follow_bone, pivot_mode: result.pivot_mode, pivot: (result.pivot || s.pivot).map(value => Core.round(value || 0)),
                    structure_id: (result.structure_id || '').trim(), structure_rotation: result.structure_rotation || 'none',
                    structure_offset: (result.structure_offset || s.structure_offset).map(value => Math.round(value || 0)), structure_zone: Math.round(result.structure_zone || 0)
                };

                // Only at the main deck: a part keeps what was once entered there (it is not read)
                if (!part) {
                    Object.assign(values, {
                        entity: (result.entity || '').trim(), saddle: result.saddle, saddle_item: (result.saddle_item || '').trim(), saddle_owner_only: !!result.saddle_owner_only,
                        saddle_equipped: !!result.saddle_equipped, scale: result.scale > 0 ? result.scale : 1
                    });
                }

                setDeckSettings(root, values);
            }
        }).show();
    }

    function problemLines(problems) {
        const icons = { error: 'error', warning: 'warning', info: 'info' };
        const colors = { error: 'var(--color-error, #e24b4a)', warning: 'var(--color-warning, #ef9f27)', info: 'var(--color-subtle_text, #888)' };
        return problems.map(problem => '<p style="display: flex; gap: 8px; margin: 4px 0;"><i class="material-icons icon" style="color: ' + colors[problem.level] + ';">' + icons[problem.level]
                                       + '</i><span>' + escapeHtml(problem.text) + '</span></p>');
    }

    /** Everything that is wrong with the decks of the model - the main deck and each part by itself, plus their division. */
    function openCheckDialog(headline) {
        if (!requireRoot())
            return;

        const all = readAll();
        const entries = all.decks.concat(all.others);
        const several = entries.length > 1;
        const lines = [];

        if (headline)
            lines.push('<p><b>' + escapeHtml(headline) + '</b></p>');

        // Hints (such as the shifted grid) are not problems
        if (!all.problems.length && !entries.some(entry => entry.resolved.problems.some(problem => problem.level !== 'info')))
            lines.push('<p>' + escapeHtml(tr('check.ok')) + '</p>');

        lines.push(...problemLines(all.problems));

        if (several && all.main)
            lines.push('<p style="margin-top: 8px;">' + escapeHtml(tr('check.decks', all.decks.length, all.decks.length - 1)) + '</p>');

        for (const entry of entries) {
            const resolved = entry.resolved;

            if (several)
                lines.push('<p style="margin-top: 14px;"><b>' + escapeHtml(deckLabel(entry.model.settings)) + '</b> <span style="color: var(--color-subtle_text);">(' + escapeHtml(entry.root.name) + ')</span></p>');

            lines.push(...problemLines(resolved.problems));
            const usable = resolved.zones.filter(zone => zone.usable);
            lines.push('<p style="margin-top: ' + (several ? 4 : 12) + 'px;">' + escapeHtml(tr('check.summary', usable.length, usable.reduce((sum, zone) => sum + zone.cells, 0), resolved.floorY)) + '</p>');
            resolved.zones.forEach((zone, index) => {
                if (zone.usable)
                    lines.push('<p style="margin: 2px 0; color: var(--color-subtle_text);">' + escapeHtml(tr('check.zone', index, zone.name, zone.y, zone.maxX - zone.minX, zone.maxZ - zone.minZ, zone.cells,
                                                                                                             zone.pattern ? tr('check.zone.pattern') : '')) + '</p>');
            });
        }

        new Dialog({ id: 'living_decks_check', title: tr('dialog.check.title'), width: 640, lines, singleButton: true }).show();
    }

    function exportDeck() {
        if (!requireRoot())
            return;

        const compiled = compileDeck();

        if (compiled.errors)
            return openCheckDialog(tr('msg.errors'));

        Blockbench.export({ resource_id: 'living_decks', type: 'Living Decks Deck', extensions: ['json'], name: fileName(compiled.model.settings), content: compiled.text });
    }

    function copyDeck() {
        if (!requireRoot())
            return;

        const compiled = compileDeck();

        if (compiled.errors)
            return openCheckDialog(tr('msg.errors'));

        if (typeof Clipbench !== 'undefined' && typeof Clipbench.setText === 'function')
            Clipbench.setText(compiled.text);
        else if (navigator.clipboard)
            navigator.clipboard.writeText(compiled.text);

        message(tr('msg.copied'));
    }

    function openPackDialog() {
        if (!requireRoot())
            return;

        const compiled = compileDeck();

        if (compiled.errors)
            return openCheckDialog(tr('msg.errors'));

        // Namespace and file name apply to the whole creature: they are remembered at the main deck
        const root = compiled.decks[0].root;
        const s = compiled.model.settings;
        const file = fileName(s);
        const formats = {};

        for (const key in PACK_FORMATS)
            formats[key] = PACK_FORMATS[key].label;

        new Dialog({
            id: 'living_decks_pack', title: tr('dialog.pack.title'), width: 580,
            form: {
                namespace: { label: tr('field.namespace'), type: 'text', value: s.namespace || 'mydecks' },
                file: { label: tr('field.file'), type: 'text', value: file },
                pack_name: { label: tr('field.pack_name'), type: 'text', value: 'LD-' + file },
                description: { label: tr('field.description'), type: 'text', value: 'Living Decks: ' + (s.entity || file) },
                format: { label: tr('field.format'), type: 'select', options: formats, value: Object.keys(formats)[0] }
            },
            onConfirm(result) {
                const namespace = (result.namespace || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '_') || 'mydecks';
                const name = (result.file || '').trim().toLowerCase().replace(/[^a-z0-9_./-]/g, '_') || file;
                const files = packFiles(root, { namespace, file: name, description: result.description, format: result.format });
                const data = getData(root) || {};

                // Remember for next time (in the model)
                if (data.namespace !== namespace || data.file !== name) {
                    root[PROP] = Object.assign(Core.settings(data), { namespace, file: name });
                    Project.saved = false;
                }

                const zip = new JSZip();

                for (const path in files)
                    zip.file(path, files[path]);

                zip.generateAsync({ type: 'blob' }).then(content => {
                    Blockbench.export({ resource_id: 'living_decks_pack', type: 'Zip Archive', extensions: ['zip'], name: (result.pack_name || 'LD-' + name).trim(), content, savetype: 'zip' });
                });
            }
        }).show();
    }

    function runImport(text) {
        let json;

        try {
            json = JSON.parse(text);
        }
        catch (error) {
            return Blockbench.showMessageBox({ title: 'Living Decks', icon: 'error', message: tr('msg.invalid_file') + '\n\n' + error.message });
        }

        const result = importDeck(json);

        if (result.problems)
            return Blockbench.showMessageBox({ title: 'Living Decks', icon: 'error', message: tr('msg.invalid_file') + '\n\n' + result.problems.join('\n') });

        message(result.parts ? tr('msg.imported_parts', result.zones, result.parts) : tr('msg.imported', result.zones));
    }

    function openImport() {
        if (!hasProject())
            return message(tr('msg.no_project'));

        Blockbench.import({ resource_id: 'living_decks', extensions: ['json'], type: 'Living Decks Deck' }, files => {
            if (!files || !files.length)
                return;

            if (!findRoot())
                return runImport(files[0].content);

            Blockbench.showMessageBox({ title: 'Living Decks', icon: 'warning', message: tr('msg.replace'), buttons: [tr('msg.replace.yes'), 'dialog.cancel'], confirm: 0, cancel: 1 }, button => {
                if (button === 0)
                    runImport(files[0].content);
            });
        });
    }

    function openHelp() {
        const lines = tr('help.text').map(paragraph => '<p style="margin: 8px 0;">' + paragraph + '</p>');
        lines.push('<p style="margin-top: 14px; color: var(--color-subtle_text);">Living Decks ' + VERSION + ' (' + BUILD + ')</p>');
        new Dialog({ id: 'living_decks_help', title: tr('dialog.help.title'), width: 640, lines, singleButton: true }).show();
    }

    //endregion
    //region Blockbench: register and unregister

    const parts = { properties: [], actions: [], menu: null, check: null, listeners: [] };

    function listen(names, handler) {
        Blockbench.on(names, handler);
        parts.listeners.push([names, handler]);
    }

    function action(id, options) {
        const item = new Action(id, Object.assign({ category: 'living_decks' }, options));
        parts.actions.push(item);
        return item;
    }

    /**
     * If another build of this plugin is still running (a newer file was loaded without removing the old one), unregister that one first -
     * otherwise menu, actions and preview would be there twice. The own build is recognized by its unregister function.
     */
    function retireOthers() {
        if (typeof Plugins === 'undefined' || !Array.isArray(Plugins.all))
            return;

        for (const other of Plugins.all.filter(plugin => plugin && plugin.id === ID && typeof plugin.onunload === 'function' && plugin.onunload !== teardown)) {
            try {
                other.onunload();
            }
            catch (error) {
                console.error('Living Decks:', error);
            }

            const index = Plugins.all.indexOf(other);

            if (index >= 0)
                Plugins.all.splice(index, 1);
        }
    }

    function setup() {
        retireOthers();
        const editable = () => hasProject() && !!Format && Format.id !== 'image' && Format.id !== 'skin';
        const withDeck = () => editable() && !!findRoot();

        // Property on groups and cubes: without a default value, so that it is only saved where a deck has set it
        parts.properties.push(new Property(Group, 'object', PROP, { exposed: false, reset() {} }));
        parts.properties.push(new Property(Cube, 'object', PROP, { exposed: false, reset() {} }));

        action('living_decks_open_mod', { name: tr('action.open_mod'), description: tr('action.open_mod.desc'), icon: 'unarchive', condition: () => typeof JSZip !== 'undefined', click: openMod });
        action('living_decks_create', { name: tr('action.create'), description: tr('action.create.desc'), icon: 'add_box', condition: () => editable() && !findMain(), click: openCreateDialog });
        action('living_decks_add_zone', { name: tr('action.add_zone'), description: tr('action.add_zone.desc'), icon: 'library_add', condition: withDeck, click: openAddZoneDialog });
        action('living_decks_add_part', { name: tr('action.add_part'), description: tr('action.add_part.desc'), icon: 'dashboard_customize', condition: () => editable() && !!findMain(), click: openPartDialog });
        const zoneAction = action('living_decks_zone_settings', {
            name: tr('action.zone_settings'), description: tr('action.zone_settings.desc'), icon: 'tune',
            condition: () => { const root = editable() ? findRoot() : null; return !!root && selectedZones(root).length > 0; }, click: openZoneDialog
        });
        const deckAction = action('living_decks_deck_settings', { name: tr('action.deck_settings'), description: tr('action.deck_settings.desc'), icon: 'settings', condition: withDeck, click: openDeckDialog });
        action('living_decks_align', {
            name: tr('action.align'), description: tr('action.align.desc'), icon: 'border_inner', condition: withDeck,
            click() {
                const root = requireRoot();

                if (root) {
                    const count = snapZones(root, true);
                    message(count ? tr('msg.aligned', count) : tr('msg.aligned_none'));
                }
            }
        });
        action('living_decks_snap', {
            name: tr('action.snap'), description: tr('action.snap.desc'), icon: 'grid_on', condition: withDeck,
            click() {
                const root = requireRoot();

                if (root) {
                    const count = snapZones(root, false);
                    message(count ? tr('msg.snapped', count) : tr('msg.snapped_none'));
                }
            }
        });
        action('living_decks_check', { name: tr('action.check'), description: tr('action.check.desc'), icon: 'check_circle', condition: withDeck, click: () => openCheckDialog() });
        const exportAction = action('living_decks_export', { name: tr('action.export'), description: tr('action.export.desc'), icon: 'insert_drive_file', condition: withDeck, click: exportDeck });
        action('living_decks_export_pack', { name: tr('action.export_pack'), description: tr('action.export_pack.desc'), icon: 'archive', condition: () => withDeck() && typeof JSZip !== 'undefined', click: openPackDialog });
        action('living_decks_copy', { name: tr('action.copy'), icon: 'content_copy', condition: withDeck, click: copyDeck });
        const importAction = action('living_decks_import', { name: tr('action.import'), description: tr('action.import.desc'), icon: 'folder_open', condition: editable, click: openImport });
        const previewToggle = new Toggle('living_decks_preview', {
            name: tr('action.preview'), description: tr('action.preview.desc'), icon: 'visibility', category: 'living_decks', default: true, save_on_restart: true,
            onChange(value) {
                overlay.enabled = value;
                refreshOverlay(true);
            }
        });
        const volumeToggle = new Toggle('living_decks_volumes', {
            name: tr('action.volumes'), description: tr('action.volumes.desc'), icon: '3d_rotation', category: 'living_decks', default: true, save_on_restart: true,
            onChange(value) {
                overlay.volumes = value;
                refreshOverlay(true);
            }
        });
        parts.actions.push(previewToggle, volumeToggle);
        overlay.enabled = previewToggle.value !== false;
        overlay.volumes = volumeToggle.value !== false;
        action('living_decks_help', { name: tr('action.help'), icon: 'help_outline', click: openHelp });

        // Own menu next to "Tools", plus export and import where people look for them, and the settings in the right-click menu
        parts.menu = new BarMenu('living_decks', [
            'living_decks_open_mod', '_', 'living_decks_create', 'living_decks_add_zone', 'living_decks_add_part', '_', 'living_decks_zone_settings', 'living_decks_deck_settings', 'living_decks_align',
            'living_decks_snap', 'living_decks_check', '_', 'living_decks_export', 'living_decks_export_pack', 'living_decks_copy', 'living_decks_import', '_',
            'living_decks_preview', 'living_decks_volumes', '_', 'living_decks_help'
        ], { name: tr('menu') });
        MenuBar.addMenu(parts.menu, 'tools');
        MenuBar.addAction(exportAction, 'file.export');
        MenuBar.addAction(importAction, 'file.import');
        Cube.prototype.menu.addAction(zoneAction, '#settings');
        Group.prototype.menu.addAction(zoneAction, '#settings');
        Group.prototype.menu.addAction(deckAction, '#settings');

        // Preview
        overlay.container = new THREE.Object3D();
        overlay.container.name = 'living_decks_overlay';
        overlay.container.matrixAutoUpdate = false;
        overlay.matrix = new THREE.Matrix4();
        overlay.reported = false;
        Canvas.gizmos.push(overlay.container);
        listen('update_view finished_edit undo redo select_project load_project setup_project new_project close_project update_selection select_mode', scheduleRefresh);
        listen('display_animation_frame', updateOverlayMatrix);

        // Errors of the deck where Blockbench shows all warnings
        parts.check = new ValidatorCheck('living_decks', {
            update_triggers: ['update_selection', 'finished_edit'],
            run() {
                const all = readAll();

                if (!all.roots.length)
                    return;

                const entries = all.decks.concat(all.others);
                const report = (problem, where) => {
                    if (problem.level === 'error')
                        this.fail({ message: 'Living Decks' + where + ': ' + problem.text });
                    else if (problem.level === 'warning')
                        this.warn({ message: 'Living Decks' + where + ': ' + problem.text });
                };

                for (const problem of all.problems)
                    report(problem, '');

                // With several decks it says which one is meant
                for (const entry of entries) {
                    for (const problem of entry.resolved.problems)
                        report(problem, entries.length > 1 ? ' (' + deckLabel(entry.model.settings) + ')' : '');
                }
            }
        });

        // For scripts and other tools. findRoot: the deck concerned right now; findMain: the main deck; compile: the file for the
        // whole creature (main deck and parts)
        window.LivingDecks = {
            version: VERSION, build: BUILD, Core, findRoot, findRoots, findMain, readModel, readAll, compile: compileDeck, createDeck, addZone, setZoneSettings,
            setDeckSettings, snapZones, alignZones: root => snapZones(root, true), importDeck, packFiles, readMod, openModModel, selectedZones,
            refresh: () => refreshOverlay(true), overlay
        };
        refreshOverlay(true);
    }

    function teardown() {
        for (const [names, handler] of parts.listeners)
            Blockbench.removeListener(names, handler);

        parts.listeners.length = 0;

        if (overlay.timer !== null) {
            clearTimeout(overlay.timer);
            overlay.timer = null;
        }

        if (overlay.container) {
            clearOverlay();

            if (overlay.container.parent)
                overlay.container.parent.remove(overlay.container);

            Canvas.gizmos.remove(overlay.container);
            overlay.container = null;
            overlay.signature = '';
        }

        if (parts.check) {
            parts.check.delete();
            parts.check = null;
        }

        if (parts.menu) {
            parts.menu.delete();
            parts.menu = null;
        }

        for (const item of parts.actions)
            item.delete();

        parts.actions.length = 0;
        MenuBar.update();

        for (const property of parts.properties)
            property.delete();

        parts.properties.length = 0;
        delete window.LivingDecks;
    }

    Plugin.register(ID, {
        title: 'Living Decks',
        author: 'xxXShindaXxx',
        description: tr('plugin.description'),
        about: 'Decks for the Minecraft mod **Living Decks**: a group named `living_deck` holds the zones - every cube is a build area, its top is the floor. '
               + 'A creature can carry several decks (parts), each with its own grid and its own bone. '
               + 'The plugin previews margin, railing and build volume the way the mod computes them, checks the rules of the deck file and exports it '
               + '(as a single file or as a ready-to-use data pack). Existing deck files can be imported, and the models of modded creatures can be opened '
               + 'straight from the .jar of their mod (GeckoLib).\n\nMenu **Living Decks** > *How It Works* explains the details.',
        icon: 'directions_boat',
        version: VERSION,
        variant: 'both',
        min_version: '5.0.0',
        await_loading: true,
        tags: ['Minecraft: Java Edition'],
        onload: setup,
        onunload: teardown
    });
})();
