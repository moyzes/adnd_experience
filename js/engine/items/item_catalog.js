/**
 * ItemCatalog provides master catalogs and definition lookups for weapons, armor,
 * shields, consumables, ammo, gear, treasures, and quest items, along with
 * AD&D 2nd Edition class equipment restriction validations.
 */
export class ItemCatalog {
  /** Master weapon table — category drives ranged vs melee, damageType feeds mitigation. */
  static WEAPONS = {
    'Longsword': { category: 'melee', damageType: 'slashing', maxDmg: 8, weight: 4 },
    'Longsword +1': { category: 'melee', damageType: 'slashing', maxDmg: 9, magicBonus: 1, weight: 4 },
    'Longsword +2': { category: 'melee', damageType: 'slashing', maxDmg: 10, magicBonus: 2, weight: 4 },
    'Short Sword': { category: 'melee', damageType: 'slashing', maxDmg: 6, weight: 3 },
    'Short Sword +1': { category: 'melee', damageType: 'slashing', maxDmg: 7, magicBonus: 1, weight: 3 },
    'Short Sword +2': { category: 'melee', damageType: 'slashing', maxDmg: 8, magicBonus: 2, weight: 3 },
    'Dagger': { category: 'melee', damageType: 'piercing', maxDmg: 4, weight: 1 },
    'Dagger +1': { category: 'melee', damageType: 'piercing', maxDmg: 5, magicBonus: 1, weight: 1 },
    'Dagger +2': { category: 'melee', damageType: 'piercing', maxDmg: 6, magicBonus: 2, weight: 1 },
    'Warhammer': { category: 'melee', damageType: 'bludgeoning', maxDmg: 6, weight: 5 },
    'Warhammer +1': { category: 'melee', damageType: 'bludgeoning', maxDmg: 7, magicBonus: 1, weight: 5 },
    'Warhammer +2': { category: 'melee', damageType: 'bludgeoning', maxDmg: 8, magicBonus: 2, weight: 5 },
    'Quarterstaff': { category: 'melee', damageType: 'bludgeoning', maxDmg: 6, weight: 4 },
    'Quarterstaff +1': { category: 'melee', damageType: 'bludgeoning', maxDmg: 7, magicBonus: 1, weight: 4 },
    'Two-Handed Sword': { category: 'melee', damageType: 'slashing', maxDmg: 10, weight: 8 },
    'Two-Handed Sword +1': { category: 'melee', damageType: 'slashing', maxDmg: 11, magicBonus: 1, weight: 8 },
    'Two-Handed Sword +2': { category: 'melee', damageType: 'slashing', maxDmg: 12, magicBonus: 2, weight: 8 },
    'Mace': { category: 'melee', damageType: 'bludgeoning', maxDmg: 6, weight: 5 },
    'Mace +1': { category: 'melee', damageType: 'bludgeoning', maxDmg: 7, magicBonus: 1, weight: 5 },
    'Mace +2': { category: 'melee', damageType: 'bludgeoning', maxDmg: 8, magicBonus: 2, weight: 5 },
    'Halberd': { category: 'melee', damageType: 'slashing', maxDmg: 10, weight: 9 },
    'Halberd +1': { category: 'melee', damageType: 'slashing', maxDmg: 11, magicBonus: 1, weight: 9 },
    'Short Bow': { category: 'ranged', damageType: 'piercing', maxDmg: 6, ammoType: 'Arrows', weight: 3 },
    'Short Bow +1': { category: 'ranged', damageType: 'piercing', maxDmg: 7, magicBonus: 1, ammoType: 'Arrows', weight: 3 },
    'Shortbow': { category: 'ranged', damageType: 'piercing', maxDmg: 6, ammoType: 'Arrows', weight: 3 },
    'Long Bow': { category: 'ranged', damageType: 'piercing', maxDmg: 8, ammoType: 'Arrows', weight: 4 },
    'Long Bow +1': { category: 'ranged', damageType: 'piercing', maxDmg: 9, magicBonus: 1, ammoType: 'Arrows', weight: 4 },
    'Longbow': { category: 'ranged', damageType: 'piercing', maxDmg: 8, ammoType: 'Arrows', weight: 4 },
    'Crossbow': { category: 'ranged', damageType: 'piercing', maxDmg: 8, ammoType: 'Bolts', weight: 6 },
    'Crossbow +1': { category: 'ranged', damageType: 'piercing', maxDmg: 9, magicBonus: 1, ammoType: 'Bolts', weight: 6 },
    'Light Crossbow': { category: 'ranged', damageType: 'piercing', maxDmg: 6, ammoType: 'Bolts', weight: 5 },
    'Heavy Crossbow': { category: 'ranged', damageType: 'piercing', maxDmg: 8, ammoType: 'Bolts', weight: 7 },
    'Sling': { category: 'ranged', damageType: 'bludgeoning', maxDmg: 4, ammoType: 'Sling Bullets', weight: 1 },
    'Sling +1': { category: 'ranged', damageType: 'bludgeoning', maxDmg: 5, magicBonus: 1, ammoType: 'Sling Bullets', weight: 1 }
  };

  /** Master item catalog. Shops, loot, starting kits and use-handlers all key off this. */
  static ITEMS = {
    'Gold Pieces': { id: 'gold', kind: 'currency', scope: 'party', description: 'Coin of the realm.', stackable: true, usable: false, price: 1, weight: 0.01 },
    'Rations': { id: 'rations', kind: 'consumable', scope: 'party', description: 'Dried meat, hardtack and watered wine. Required to camp.', stackable: true, usable: false, price: 2, weight: 0.5 },
    'Torch': { id: 'torch', kind: 'consumable', scope: 'party', description: 'Burns for 60 minutes (60 steps / 6 exploration turns). Keeps the dark at bay.', stackable: true, usable: true, useEffect: 'light', price: 1, weight: 0.5 },
    'Healing Potion': { id: 'healing_potion', kind: 'consumable', scope: 'party', description: 'A bitter red draught. Restores 1d4+1 hit points.', stackable: true, usable: true, useEffect: 'heal', healDice: '1d4+1', price: 25, weight: 0.3 },
    'Potion of Healing': { id: 'potion_of_healing', kind: 'consumable', scope: 'party', description: 'A bitter red draught. Restores 1d4+1 hit points.', stackable: true, usable: true, useEffect: 'heal', healDice: '1d4+1', price: 25, weight: 0.3 },
    'Potion of Extra-Healing': { id: 'potion_extra_healing', kind: 'consumable', scope: 'party', description: 'A glowing scarlet elixir. Restores 3d8+3 hit points to severe wounds.', stackable: true, usable: true, useEffect: 'extra_heal', healDice: '3d8+3', price: 75, weight: 0.4 },
    'Potion of Ogre Strength': { id: 'potion_ogre_strength', kind: 'consumable', scope: 'party', description: 'Thick draught of brute might. Grants STR 18/00 (+3 to-hit, +4 melee damage for 30 exploration turns/combat).', stackable: true, usable: true, useEffect: 'ogre_strength', price: 120, weight: 0.5 },
    'Potion of Giant Strength': { id: 'potion_giant_strength', kind: 'consumable', scope: 'party', description: 'Foaming amber potion of hill giant blood (+4 to-hit, +6 melee damage for 30 turns/combat).', stackable: true, usable: true, useEffect: 'giant_strength', price: 200, weight: 0.5 },
    'Potion of Speed': { id: 'potion_speed', kind: 'consumable', scope: 'party', description: 'Sparkling effervescent elixir. Grants Haste (+2 AC and swift attack surge for 25 turns/combat).', stackable: true, usable: true, useEffect: 'speed', price: 150, weight: 0.3 },
    'Potion of Invisibility': { id: 'potion_invisibility', kind: 'consumable', scope: 'party', description: 'Shimmering clear fluid. Cloaks drinker in complete invisibility, guaranteeing surprise.', stackable: true, usable: true, useEffect: 'invisibility', price: 160, weight: 0.3 },
    'Potion of Heroism': { id: 'potion_heroism', kind: 'consumable', scope: 'party', description: 'Golden liquor of valor (+10 temporary Max HP and +2 to-hit bonus for 30 turns/combat).', stackable: true, usable: true, useEffect: 'heroism', price: 140, weight: 0.4 },
    'Potion of Fire Resistance': { id: 'potion_fire_res', kind: 'consumable', scope: 'party', description: 'Cool blue tincture. Halves all incoming fire damage and wards against burning traps.', stackable: true, usable: true, useEffect: 'fire_resistance', price: 100, weight: 0.4 },
    'Potion of Antidote': { id: 'potion_antidote', kind: 'consumable', scope: 'party', description: 'Cleansing herbal draught. Immediately neutralizes poisons and toxins.', stackable: true, usable: true, useEffect: 'antidote', price: 40, weight: 0.2 },
    'Potion of Neutralize Poison': { id: 'potion_neutralize_poison', kind: 'consumable', scope: 'party', description: 'Cleansing herbal draught. Immediately neutralizes poisons and toxins.', stackable: true, usable: true, useEffect: 'antidote', price: 40, weight: 0.2 },
    'Potion of Clairvoyance': { id: 'potion_clairvoyance', kind: 'consumable', scope: 'party', description: 'Opalescent brew that heightens senses, revealing hidden traps and secret doors.', stackable: true, usable: true, useEffect: 'clairvoyance', price: 90, weight: 0.3 },
    'Potion of Levitation': { id: 'potion_levitation', kind: 'consumable', scope: 'party', description: 'Weightless gaseous potion. Floats 1ft above ground, granting immunity to floor pit traps.', stackable: true, usable: true, useEffect: 'levitation', price: 80, weight: 0.3 },
    'Potion of Diminution': { id: 'potion_diminution', kind: 'consumable', scope: 'party', description: 'Shrinks the drinker to 6 inches, granting stealth and evasion through tight grates.', stackable: true, usable: true, useEffect: 'diminution', price: 70, weight: 0.2 },
    'Holy Water': { id: 'holy_water', kind: 'consumable', scope: 'party', description: 'Blessed vial. 2d4 damage vs undead or small blessing.', stackable: true, usable: true, useEffect: 'holy_water', price: 20, weight: 0.4 },
    'Arrows': { id: 'arrows', kind: 'ammo', scope: 'party', description: 'Bundle of arrows for bows.', stackable: true, usable: false, price: 1, unitLabel: 'arrow', weight: 0.05 },
    'Bolts': { id: 'bolts', kind: 'ammo', scope: 'party', description: 'Crossbow bolts.', stackable: true, usable: false, price: 1, unitLabel: 'bolt', weight: 0.05 },
    'Sling Bullets': { id: 'sling_bullets', kind: 'ammo', scope: 'party', description: 'Pouch of cast lead bullets and stones for slings.', stackable: true, usable: false, price: 1, unitLabel: 'bullet', weight: 0.05 },
    'Thief Tools': { id: 'thief_tools', kind: 'gear', scope: 'personal', description: 'Picks, probes and oil. Required for lockpicking and trap work. Degrades with use.', stackable: false, usable: true, useEffect: 'repair_tools', price: 30, weight: 2 },
    'Short Bow': { id: 'short_bow', kind: 'weapon', scope: 'personal', description: 'Light bow. Requires arrows.', stackable: false, usable: false, price: 25, weight: 3 },
    'Short Bow +1': { id: 'short_bow_1', kind: 'weapon', scope: 'personal', description: 'Enchanted light bow (+1 to-hit, +1 damage). Requires arrows.', stackable: false, usable: false, price: 150, weight: 3 },
    'Shortbow': { id: 'shortbow', kind: 'weapon', scope: 'personal', description: 'Light bow. Requires arrows.', stackable: false, usable: false, price: 25, weight: 3 },
    'Long Bow': { id: 'long_bow', kind: 'weapon', scope: 'personal', description: 'Powerful war bow with superior reach and impact. Requires arrows.', stackable: false, usable: false, price: 60, weight: 4 },
    'Long Bow +1': { id: 'long_bow_1', kind: 'weapon', scope: 'personal', description: 'Master-enchanted war bow (+1 to-hit, +1 damage). Requires arrows.', stackable: false, usable: false, price: 250, weight: 4 },
    'Longbow': { id: 'longbow', kind: 'weapon', scope: 'personal', description: 'Powerful war bow with superior reach and impact. Requires arrows.', stackable: false, usable: false, price: 60, weight: 4 },
    'Longsword': { id: 'longsword', kind: 'weapon', scope: 'personal', description: 'Standard martial blade.', stackable: false, usable: false, price: 15, weight: 4 },
    'Longsword +1': { id: 'longsword_1', kind: 'weapon', scope: 'personal', description: 'Magical steel blade glowing with blue aura (+1 to-hit, +1 damage).', stackable: false, usable: false, price: 180, weight: 4 },
    'Longsword +2': { id: 'longsword_2', kind: 'weapon', scope: 'personal', description: 'Heroic runic broadsword (+2 to-hit, +2 damage).', stackable: false, usable: false, price: 350, weight: 4 },
    'Dagger': { id: 'dagger', kind: 'weapon', scope: 'personal', description: 'Small blade, easily concealed.', stackable: false, usable: false, price: 2, weight: 1 },
    'Dagger +1': { id: 'dagger_1', kind: 'weapon', scope: 'personal', description: 'Keen enchanted stiletto (+1 to-hit, +1 damage).', stackable: false, usable: false, price: 90, weight: 1 },
    'Dagger +2': { id: 'dagger_2', kind: 'weapon', scope: 'personal', description: 'Master-forged silvered dagger (+2 to-hit, +2 damage).', stackable: false, usable: false, price: 200, weight: 1 },
    'Warhammer': { id: 'warhammer', kind: 'weapon', scope: 'personal', description: 'Bludgeoning weapon favored by clerics.', stackable: false, usable: false, price: 8, weight: 5 },
    'Warhammer +1': { id: 'warhammer_1', kind: 'weapon', scope: 'personal', description: 'Sanctified dwarven warhammer (+1 to-hit, +1 damage).', stackable: false, usable: false, price: 140, weight: 5 },
    'Warhammer +2': { id: 'warhammer_2', kind: 'weapon', scope: 'personal', description: 'Consecrated thunder-striking maul (+2 to-hit, +2 damage).', stackable: false, usable: false, price: 300, weight: 5 },
    'Quarterstaff': { id: 'quarterstaff', kind: 'weapon', scope: 'personal', description: 'Simple wooden staff.', stackable: false, usable: false, price: 2, weight: 4 },
    'Quarterstaff +1': { id: 'quarterstaff_1', kind: 'weapon', scope: 'personal', description: 'Reinforced oak staff imbued with magic (+1 to-hit, +1 damage).', stackable: false, usable: false, price: 80, weight: 4 },
    'Short Sword': { id: 'short_sword', kind: 'weapon', scope: 'personal', description: 'Light blade preferred by thieves.', stackable: false, usable: false, price: 8, weight: 3 },
    'Short Sword +1': { id: 'short_sword_1', kind: 'weapon', scope: 'personal', description: 'Quick silver-etched blade (+1 to-hit, +1 damage).', stackable: false, usable: false, price: 120, weight: 3 },
    'Short Sword +2': { id: 'short_sword_2', kind: 'weapon', scope: 'personal', description: 'Razor-honed shadow blade (+2 to-hit, +2 damage).', stackable: false, usable: false, price: 260, weight: 3 },
    'Two-Handed Sword': { id: 'two_handed_sword', kind: 'weapon', scope: 'personal', description: 'Massive greatsword requiring two hands to wield.', stackable: false, usable: false, price: 30, weight: 8 },
    'Two-Handed Sword +1': { id: 'two_handed_sword_1', kind: 'weapon', scope: 'personal', description: 'Gargantuan runic greatsword (+1 to-hit, +1 damage).', stackable: false, usable: false, price: 250, weight: 8 },
    'Two-Handed Sword +2': { id: 'two_handed_sword_2', kind: 'weapon', scope: 'personal', description: 'Legendary executioner blade (+2 to-hit, +2 damage).', stackable: false, usable: false, price: 480, weight: 8 },
    'Mace': { id: 'mace', kind: 'weapon', scope: 'personal', description: 'Heavy iron-headed bludgeon.', stackable: false, usable: false, price: 8, weight: 5 },
    'Mace +1': { id: 'mace_1', kind: 'weapon', scope: 'personal', description: 'Consecrated iron mace (+1 to-hit, +1 damage).', stackable: false, usable: false, price: 130, weight: 5 },
    'Mace +2': { id: 'mace_2', kind: 'weapon', scope: 'personal', description: 'Blessed sun mace (+2 to-hit, +2 damage).', stackable: false, usable: false, price: 280, weight: 5 },
    'Halberd': { id: 'halberd', kind: 'weapon', scope: 'personal', description: 'Long polearm combining axe blade and pike head.', stackable: false, usable: false, price: 18, weight: 9 },
    'Halberd +1': { id: 'halberd_1', kind: 'weapon', scope: 'personal', description: 'Tempered steel battle polearm (+1 to-hit, +1 damage).', stackable: false, usable: false, price: 200, weight: 9 },
    'Crossbow': { id: 'crossbow', kind: 'weapon', scope: 'personal', description: 'Mechanical ranged weapon firing heavy bolts.', stackable: false, usable: false, price: 35, weight: 6 },
    'Crossbow +1': { id: 'crossbow_1', kind: 'weapon', scope: 'personal', description: 'Precision dwarven arbalest (+1 to-hit, +1 damage).', stackable: false, usable: false, price: 220, weight: 6 },
    'Light Crossbow': { id: 'light_crossbow', kind: 'weapon', scope: 'personal', description: 'Light crossbow firing bolts.', stackable: false, usable: false, price: 30, weight: 5 },
    'Heavy Crossbow': { id: 'heavy_crossbow', kind: 'weapon', scope: 'personal', description: 'Heavy crossbow firing bolts.', stackable: false, usable: false, price: 50, weight: 7 },
    'Sling': { id: 'sling', kind: 'weapon', scope: 'personal', description: 'Simple leather strap weapon for hurling stones and lead bullets.', stackable: false, usable: false, price: 2, weight: 1 },
    'Sling +1': { id: 'sling_1', kind: 'weapon', scope: 'personal', description: 'Enchanted elven sling (+1 to-hit, +1 damage).', stackable: false, usable: false, price: 60, weight: 1 },
    'Leather Armor': { id: 'leather_armor', kind: 'armor', armorType: 'light', baseAc: 8, scope: 'personal', description: 'Cured and boiled animal hide. Light enough for thieves to move silently.', stackable: false, usable: false, price: 5, weight: 6 },
    'Leather Armor +1': { id: 'leather_armor_1', kind: 'armor', armorType: 'light', baseAc: 7, scope: 'personal', description: 'Supple enchanted leather offering superior warding (Base AC 7).', stackable: false, usable: false, price: 120, weight: 5 },
    'Studded Leather': { id: 'studded_leather', kind: 'armor', armorType: 'light', baseAc: 7, scope: 'personal', description: 'Tough leather reinforced with close-set steel rivets.', stackable: false, usable: false, price: 20, weight: 8 },
    'Studded Leather +1': { id: 'studded_leather_1', kind: 'armor', armorType: 'light', baseAc: 6, scope: 'personal', description: 'Enchanted riveted leather offering superior protection (Base AC 6).', stackable: false, usable: false, price: 200, weight: 7 },
    'Scale Mail': { id: 'scale_mail', kind: 'armor', armorType: 'medium', baseAc: 6, scope: 'personal', description: 'Overlapping brass and iron scales laced to leather.', stackable: false, usable: false, price: 45, weight: 12 },
    'Chain Mail': { id: 'chain_mail', kind: 'armor', armorType: 'medium', baseAc: 5, scope: 'personal', description: 'Interlinked steel rings worn over padded gambeson.', stackable: false, usable: false, price: 75, weight: 15 },
    'Chain Mail +1': { id: 'chain_mail_1', kind: 'armor', armorType: 'medium', baseAc: 4, scope: 'personal', description: 'Enchanted silver-steel chainmail links (Base AC 4).', stackable: false, usable: false, price: 320, weight: 12 },
    'Banded Mail': { id: 'banded_mail', kind: 'armor', armorType: 'heavy', baseAc: 4, scope: 'personal', description: 'Horizontal steel bands riveted to chain and leather.', stackable: false, usable: false, price: 90, weight: 20 },
    'Plate Mail': { id: 'plate_mail', kind: 'armor', armorType: 'heavy', baseAc: 3, scope: 'personal', description: 'Formed steel breastplate, rerebraces and greaves over chain.', stackable: false, usable: false, price: 150, weight: 28 },
    'Plate Mail +1': { id: 'plate_mail_1', kind: 'armor', armorType: 'heavy', baseAc: 2, scope: 'personal', description: 'Masterwork ensorcelled full plate suit (Base AC 2).', stackable: false, usable: false, price: 600, weight: 22 },
    'Field Plate': { id: 'field_plate', kind: 'armor', armorType: 'heavy', baseAc: 2, scope: 'personal', description: 'Master-forged articulate steel harness offering superior battlefield warding.', stackable: false, usable: false, price: 400, weight: 32 },
    'Small Shield': { id: 'small_shield', kind: 'shield', acBonus: 1, scope: 'personal', description: 'Light buckler strapped to the forearm. Deflects incoming blows (-1 AC).', stackable: false, usable: false, price: 7, weight: 3 },
    'Small Shield +1': { id: 'small_shield_1', kind: 'shield', acBonus: 2, scope: 'personal', description: 'Enchanted buckler deflecting lethal blows (-2 AC bonus).', stackable: false, usable: false, price: 110, weight: 2 },
    'Medium Shield': { id: 'medium_shield', kind: 'shield', acBonus: 1, scope: 'personal', description: 'Iron-banded heater shield turning aside weapon strikes (-1 AC).', stackable: false, usable: false, price: 10, weight: 5 },
    'Medium Shield +1': { id: 'medium_shield_1', kind: 'shield', acBonus: 2, scope: 'personal', description: 'Enchanted steel-rimmed heater shield turning aside heavy attacks (-2 AC bonus).', stackable: false, usable: false, price: 160, weight: 4 },
    'Consecrated Shield': { id: 'consecrated_shield', kind: 'shield', acBonus: 1, scope: 'personal', description: 'Blessed kite shield inscribed with sacred holy heraldry (-1 AC).', stackable: false, usable: false, price: 35, weight: 5 },
    'Consecrated Shield +1': { id: 'consecrated_shield_1', kind: 'shield', acBonus: 2, scope: 'personal', description: 'Sanctified radiant kite shield glowing with holy warding (-2 AC).', stackable: false, usable: false, price: 220, weight: 4 },
    "Scholar's Robes": { id: 'scholars_robes', kind: 'armor', armorType: 'unarmored', baseAc: 10, scope: 'personal', description: 'Woven wool and silk mantle allowing unhindered somatic casting.', stackable: false, usable: false, price: 5, weight: 2 },
    'Boots of Elvenkind': { id: 'boots_of_elvenkind', kind: 'boots', scope: 'personal', description: 'Soft elven leather boots. Tread in utter silence (+25% stealth, silences party movement from wandering ambushes, -1 AC warding).', stackable: false, usable: false, findOnly: true, price: 450, weight: 1, acBonus: 1, stealthBonus: 25, silentSteps: true },
    'Boots of Evenkind': { id: 'boots_of_evenkind', kind: 'boots', scope: 'personal', description: 'Soft elven leather boots. Tread in utter silence (+25% stealth, silences party movement from wandering ambushes, -1 AC warding).', stackable: false, usable: false, findOnly: true, price: 450, weight: 1, acBonus: 1, stealthBonus: 25, silentSteps: true },
    'Gloves of Ogre Strength': { id: 'gloves_of_ogre_strength', kind: 'gloves', scope: 'personal', description: 'Heavy iron-studded hide gauntlets. Imbues wearer with raw brute force: STR 18/00 (+3 to-hit, +4 melee damage, 180 lb load, superior door bashing).', stackable: false, usable: false, findOnly: true, price: 550, weight: 2, strengthSet: 18, attackBonus: 3, damageBonus: 4 },
    'Gauntlets of Ogre Power': { id: 'gauntlets_of_ogre_power', kind: 'gloves', scope: 'personal', description: 'Heavy iron-studded hide gauntlets. Imbues wearer with raw brute force: STR 18/00 (+3 to-hit, +4 melee damage, 180 lb load, superior door bashing).', stackable: false, usable: false, findOnly: true, price: 550, weight: 2, strengthSet: 18, attackBonus: 3, damageBonus: 4 },
    'Ancient Rubies': { id: 'rubies', kind: 'treasure', scope: 'party', description: 'Glittering faceted gemstones plundered from ancient vaults. High trade value.', stackable: true, usable: false, price: 50, weight: 1 },
    'Masterwork Whetstone': { id: 'masterwork_whetstone', kind: 'treasure', scope: 'party', description: 'Fine dwarven honing stone with a mirrored polish. Highly prized by smiths.', stackable: true, usable: false, price: 25, weight: 1 },
    'Astral Resonance Crystal': { id: 'astral_crystal', kind: 'treasure', scope: 'party', description: 'A glowing geode vibrating with latent astral hum. Sought after by arcanists.', stackable: true, usable: false, price: 40, weight: 1 },
    'Consecrated Dawn Chime': { id: 'dawn_chime', kind: 'treasure', scope: 'party', description: 'An ornate silver sanctuary bell once rung during morning prayer litanies.', stackable: true, usable: false, price: 30, weight: 1 },
    'Skeleton Keyblank': { id: 'skeleton_keyblank', kind: 'treasure', scope: 'party', description: 'Intricately notched brass keyblank crafted by master rogues.', stackable: true, usable: false, price: 35, weight: 1 },
    'Vale Family Signet': { id: 'vale_signet', kind: 'treasure', scope: 'party', description: 'Tarnished signet ring bearing the aristocratic crest of the Vale lineage.', stackable: true, usable: false, price: 20, weight: 1 },
    'Cracked Prayer Beads': { id: 'prayer_beads', kind: 'treasure', scope: 'party', description: 'Carved sandalwood beads imbued with decades of devotion.', stackable: true, usable: false, price: 8, weight: 1 },
    'Sun-Forged Relic of Dawn': { id: 'sun_relic', kind: 'quest', scope: 'party', description: 'A gleaming solar artifact consecrated in ancient times. Recovered from the goblin ruins.', stackable: false, usable: false, price: null, weight: 1 },
    'Ashen Crown of Binding': { id: 'ashen_crown', kind: 'quest', scope: 'party', description: 'A dark iron coronet pulsing with necromantic authority and bound souls.', stackable: false, usable: false, price: null, weight: 1 },
    'Highstone Signet Ring': { id: 'highstone_signet', kind: 'quest', scope: 'party', description: 'The official signet ring of Baron Justinian Vane of Highstone.', stackable: false, usable: false, price: null, weight: 1 },
    'Albright Signet Ring': { id: 'albright_signet', kind: 'quest', scope: 'party', description: 'The hereditary signet of Lord Raymond Albright of Oakhaven.', stackable: false, usable: false, price: null, weight: 1 },
    "Saint Vane's Blessed Greatsword": { id: 'saint_vane_sword', kind: 'quest', scope: 'party', description: 'An ancient consecrated greatsword glowing with righteous wrath.', stackable: false, usable: false, price: null, weight: 8 },
    'Saint Orlan’s Femur': { id: 'saint_orlan_femur', kind: 'quest', scope: 'party', description: 'A sanctified relic bone of the venerable martyr Saint Orlan.', stackable: false, usable: false, price: null, weight: 1 },
    'Cult Ledger': { id: 'cult_ledger', kind: 'quest', scope: 'party', description: 'A leather-bound journal deciphering forbidden cult conspiracies.', stackable: false, usable: false, price: null, weight: 1 }
  };

  /**
   * Helper to resolve the un-enchanted base name of an item (e.g. "Dagger +2" -> "Dagger").
   */
  static getBaseItemName(name) {
    if (!name) return '';
    return name.replace(/\s*\+\d+(\s*AC)?/i, '').trim();
  }

  /**
   * Extracts the magic enchantment bonus (+1, +2, etc.) from an item name.
   */
  static getMagicBonus(name) {
    if (!name) return 0;
    const match = name.match(/\+(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Evaluates whether a character class is permitted to equip or use a given item under AD&D 2e rules.
   */
  static isClassAllowedItem(classKey, itemName, itemDef = null) {
    if (!classKey || !itemName) return { allowed: true };
    const key = classKey.toLowerCase();
    const baseName = ItemCatalog.getBaseItemName(itemName);
    const def = itemDef || ItemCatalog.ITEMS[itemName] || ItemCatalog.ITEMS[baseName] || (ItemCatalog.WEAPONS[itemName] || ItemCatalog.WEAPONS[baseName] ? { kind: 'weapon' } : null);
    if (!def) return { allowed: true };

    const kind = def.kind;

    if (kind === 'boots' || kind === 'gloves') {
      return { allowed: true };
    }

    if (kind === 'gear' && baseName === 'Thief Tools') {
      if (key !== 'thief') return { allowed: false, reason: 'Only Thieves have training with lockpicks and trap probes.' };
      return { allowed: true };
    }

    if (kind === 'shield') {
      if (key === 'mage') return { allowed: false, reason: 'Mages cannot wield shields without disrupting somatic spellcasting.' };
      if (key === 'thief') return { allowed: false, reason: 'Thieves cannot wield shields without hindering agility and stealth.' };
      return { allowed: true };
    }

    if (kind === 'armor') {
      const type = def.armorType || 'medium';
      if (key === 'mage' && type !== 'unarmored') {
        return { allowed: false, reason: 'Mages cannot wear metallic armor while weaving somatic spells.' };
      }
      if (key === 'thief' && type !== 'light' && type !== 'unarmored') {
        return { allowed: false, reason: 'Thieves cannot wear heavy armor without crippling thieving tradecraft.' };
      }
      return { allowed: true };
    }

    if (kind === 'weapon') {
      if (key === 'fighter') return { allowed: true };
      if (key === 'cleric') {
        const allowedCleric = ['Warhammer', 'Mace', 'Quarterstaff', 'Sling', 'Flail', 'Club'];
        if (!allowedCleric.includes(baseName)) {
          return { allowed: false, reason: 'Clerical holy vows forbid shedding blood with edged or piercing weapons.' };
        }
        return { allowed: true };
      }
      if (key === 'thief') {
        const allowedThief = ['Dagger', 'Short Sword', 'Longsword', 'Short Bow', 'Crossbow', 'Sling', 'Club', 'Shortbow', 'Light Crossbow'];
        if (!allowedThief.includes(baseName)) {
          return { allowed: false, reason: 'Thieves are only trained in light, concealable, or ranged rogue weaponry.' };
        }
        return { allowed: true };
      }
      if (key === 'mage') {
        const allowedMage = ['Dagger', 'Quarterstaff', 'Sling', 'Dart'];
        if (!allowedMage.includes(baseName)) {
          return { allowed: false, reason: 'Mages lack martial conditioning required to wield heavier weapons.' };
        }
        return { allowed: true };
      }
    }

    return { allowed: true };
  }

  /**
   * Retrieves an item definition object by name, checking adventure spec overrides first,
   * then master item catalog, then weapon catalog, before generating a default treasure item.
   */
  static getItemDef(name, adventureSpec = null) {
    if (!name) return null;
    if (adventureSpec && adventureSpec.items && adventureSpec.items[name]) {
      const specItem = adventureSpec.items[name];
      return {
        weight: specItem.weight !== undefined ? specItem.weight : 1,
        ...specItem
      };
    }
    if (ItemCatalog.ITEMS[name]) return ItemCatalog.ITEMS[name];
    
    // Check base name in ITEMS
    const baseName = ItemCatalog.getBaseItemName(name);
    if (ItemCatalog.ITEMS[baseName]) {
      const baseDef = ItemCatalog.ITEMS[baseName];
      const magicBonus = ItemCatalog.getMagicBonus(name);
      return {
        ...baseDef,
        id: name.toLowerCase().replace(/\s+/g, '_'),
        name: name,
        price: baseDef.price ? Math.round(baseDef.price * (magicBonus > 0 ? (magicBonus + 1) * 2 : 1)) : 50,
        baseAc: baseDef.baseAc !== undefined ? Math.max(0, baseDef.baseAc - magicBonus) : undefined,
        acBonus: baseDef.acBonus !== undefined ? baseDef.acBonus + magicBonus : undefined
      };
    }

    if (ItemCatalog.WEAPONS[name]) {
      const w = ItemCatalog.WEAPONS[name];
      return {
        id: name.toLowerCase().replace(/\s+/g, '_'),
        name,
        kind: 'weapon',
        scope: 'personal',
        category: w.category || 'melee',
        damageType: w.damageType || 'slashing',
        price: 15 + (w.magicBonus || 0) * 100,
        weight: w.weight !== undefined ? w.weight : 4,
        description: `Martial ${w.category || 'weapon'}${w.magicBonus ? ` (+${w.magicBonus})` : ''}.`
      };
    }

    if (ItemCatalog.WEAPONS[baseName]) {
      const w = ItemCatalog.WEAPONS[baseName];
      const magicBonus = ItemCatalog.getMagicBonus(name);
      return {
        id: name.toLowerCase().replace(/\s+/g, '_'),
        name,
        kind: 'weapon',
        scope: 'personal',
        category: w.category || 'melee',
        damageType: w.damageType || 'slashing',
        price: 15 + (magicBonus || 0) * 120,
        weight: w.weight !== undefined ? w.weight : 4,
        magicBonus,
        description: `Martial ${w.category || 'weapon'}${magicBonus ? ` (+${magicBonus})` : ''}.`
      };
    }

    return {
      id: name.toLowerCase().replace(/\s+/g, '_'),
      name,
      kind: 'treasure',
      scope: 'party',
      price: 25,
      weight: 1,
      description: 'A valuable discovery recovered during the expedition.'
    };
  }

  /**
   * Checks whether a given weapon name is defined in adventure specs or master weapon catalog.
   */
  static isKnownWeapon(weaponName, adventureSpec = null) {
    if (!weaponName) return false;
    if (adventureSpec && adventureSpec.weapons && adventureSpec.weapons[weaponName]) return true;
    if (ItemCatalog.WEAPONS[weaponName]) return true;
    const base = ItemCatalog.getBaseItemName(weaponName);
    return !!(ItemCatalog.WEAPONS[base] || (adventureSpec && adventureSpec.weapons && adventureSpec.weapons[base]));
  }

  /**
   * Checks whether a given weapon belongs to the ranged category.
   */
  static isRangedWeapon(weaponName, adventureSpec = null) {
    if (!weaponName) return false;
    const base = ItemCatalog.getBaseItemName(weaponName);
    const def = (adventureSpec && adventureSpec.weapons && (adventureSpec.weapons[weaponName] || adventureSpec.weapons[base])) || ItemCatalog.WEAPONS[weaponName] || ItemCatalog.WEAPONS[base];
    return !!(def && def.category === 'ranged');
  }

  /**
   * Checks whether a hero is holding a valid melee weapon.
   */
  static canHeroMelee(hero, adventureSpec = null) {
    if (!hero || !hero.equippedWeapon) return false;
    const base = ItemCatalog.getBaseItemName(hero.equippedWeapon);
    const def = (adventureSpec && adventureSpec.weapons && (adventureSpec.weapons[hero.equippedWeapon] || adventureSpec.weapons[base])) || ItemCatalog.WEAPONS[hero.equippedWeapon] || ItemCatalog.WEAPONS[base];
    return !!(def && def.category === 'melee');
  }

  /**
   * Resolves the ammunition type required by a given weapon.
   */
  static getWeaponAmmoType(weaponName, adventureSpec = null) {
    if (!weaponName) return null;
    const norm = weaponName.trim();
    const base = ItemCatalog.getBaseItemName(norm);
    const def = (adventureSpec && adventureSpec.weapons && (adventureSpec.weapons[norm] || adventureSpec.weapons[base])) || ItemCatalog.WEAPONS[norm] || ItemCatalog.WEAPONS[base];
    if (def && (def.ammoType || def.ammo_type)) return def.ammoType || def.ammo_type;
    if (/short\s*bow/i.test(norm) || /long\s*bow/i.test(norm) || /composite\s*bow/i.test(norm) || /bow/i.test(norm)) return 'Arrows';
    if (/crossbow/i.test(norm) || /bolt/i.test(norm)) return 'Bolts';
    if (/sling/i.test(norm)) return 'Sling Bullets';
    return null;
  }

  /**
   * Resolves the damage type (slashing, bludgeoning, piercing) for a weapon.
   */
  static getWeaponDamageType(weaponName, fallback = 'slashing', adventureSpec = null) {
    if (!weaponName) return fallback;
    const base = ItemCatalog.getBaseItemName(weaponName);
    const def = (adventureSpec && adventureSpec.weapons && (adventureSpec.weapons[weaponName] || adventureSpec.weapons[base])) || ItemCatalog.WEAPONS[weaponName] || ItemCatalog.WEAPONS[base];
    return (def && def.damageType) || fallback;
  }

  /**
   * Resolves the maximum weapon base damage value (including magic bonus).
   */
  static getWeaponMaxDamage(weaponName, fallback = 8, adventureSpec = null) {
    if (!weaponName) return fallback;
    const base = ItemCatalog.getBaseItemName(weaponName);
    const magic = ItemCatalog.getMagicBonus(weaponName);
    const def = (adventureSpec && adventureSpec.weapons && (adventureSpec.weapons[weaponName] || adventureSpec.weapons[base])) || ItemCatalog.WEAPONS[weaponName] || ItemCatalog.WEAPONS[base];
    const baseDmg = (def && def.maxDmg) || fallback;
    return baseDmg + (def && def.magicBonus ? 0 : magic);
  }
}
