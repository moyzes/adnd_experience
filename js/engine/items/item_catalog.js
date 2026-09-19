/**
 * ItemCatalog provides master catalogs and definition lookups for weapons, armor,
 * shields, consumables, ammo, gear, treasures, and quest items, along with
 * AD&D 2nd Edition class equipment restriction validations.
 */
export class ItemCatalog {
  /** Master weapon table — category drives ranged vs melee, damageType feeds mitigation. */
  static WEAPONS = {
    'Longsword': { category: 'melee', damageType: 'slashing', maxDmg: 8 },
    'Short Sword': { category: 'melee', damageType: 'slashing', maxDmg: 6 },
    'Dagger': { category: 'melee', damageType: 'piercing', maxDmg: 4 },
    'Warhammer': { category: 'melee', damageType: 'bludgeoning', maxDmg: 6 },
    'Quarterstaff': { category: 'melee', damageType: 'bludgeoning', maxDmg: 6 },
    'Two-Handed Sword': { category: 'melee', damageType: 'slashing', maxDmg: 10 },
    'Mace': { category: 'melee', damageType: 'bludgeoning', maxDmg: 6 },
    'Halberd': { category: 'melee', damageType: 'slashing', maxDmg: 10 },
    'Short Bow': { category: 'ranged', damageType: 'piercing', maxDmg: 6, ammoType: 'Arrows' },
    'Shortbow': { category: 'ranged', damageType: 'piercing', maxDmg: 6, ammoType: 'Arrows' },
    'Long Bow': { category: 'ranged', damageType: 'piercing', maxDmg: 8, ammoType: 'Arrows' },
    'Longbow': { category: 'ranged', damageType: 'piercing', maxDmg: 8, ammoType: 'Arrows' },
    'Crossbow': { category: 'ranged', damageType: 'piercing', maxDmg: 8, ammoType: 'Bolts' },
    'Light Crossbow': { category: 'ranged', damageType: 'piercing', maxDmg: 6, ammoType: 'Bolts' },
    'Heavy Crossbow': { category: 'ranged', damageType: 'piercing', maxDmg: 8, ammoType: 'Bolts' },
    'Sling': { category: 'ranged', damageType: 'bludgeoning', maxDmg: 4, ammoType: 'Sling Bullets' }
  };

  /** Master item catalog. Shops, loot, starting kits and use-handlers all key off this. */
  static ITEMS = {
    'Gold Pieces': { id: 'gold', kind: 'currency', scope: 'party', description: 'Coin of the realm.', stackable: true, usable: false, price: 1 },
    'Rations': { id: 'rations', kind: 'consumable', scope: 'party', description: 'Dried meat, hardtack and watered wine. Required to camp.', stackable: true, usable: false, price: 2 },
    'Torch': { id: 'torch', kind: 'consumable', scope: 'party', description: 'Burns for 60 minutes (60 steps / 6 exploration turns). Keeps the dark at bay.', stackable: true, usable: true, useEffect: 'light', price: 1 },
    'Healing Potion': { id: 'healing_potion', kind: 'consumable', scope: 'party', description: 'A bitter red draught. Restores 1d4+1 hit points.', stackable: true, usable: true, useEffect: 'heal', healDice: '1d4+1', price: 25 },
    'Holy Water': { id: 'holy_water', kind: 'consumable', scope: 'party', description: 'Blessed vial. 2d4 damage vs undead or small blessing.', stackable: true, usable: true, useEffect: 'holy_water', price: 20 },
    'Arrows': { id: 'arrows', kind: 'ammo', scope: 'party', description: 'Bundle of arrows for bows.', stackable: true, usable: false, price: 1, unitLabel: 'arrow' },
    'Bolts': { id: 'bolts', kind: 'ammo', scope: 'party', description: 'Crossbow bolts.', stackable: true, usable: false, price: 1, unitLabel: 'bolt' },
    'Sling Bullets': { id: 'sling_bullets', kind: 'ammo', scope: 'party', description: 'Pouch of cast lead bullets and stones for slings.', stackable: true, usable: false, price: 1, unitLabel: 'bullet' },
    'Thief Tools': { id: 'thief_tools', kind: 'gear', scope: 'personal', description: 'Picks, probes and oil. Required for lockpicking and trap work. Degrades with use.', stackable: false, usable: true, useEffect: 'repair_tools', price: 30 },
    'Short Bow': { id: 'short_bow', kind: 'weapon', scope: 'personal', description: 'Light bow. Requires arrows.', stackable: false, usable: false, price: 25 },
    'Shortbow': { id: 'shortbow', kind: 'weapon', scope: 'personal', description: 'Light bow. Requires arrows.', stackable: false, usable: false, price: 25 },
    'Long Bow': { id: 'long_bow', kind: 'weapon', scope: 'personal', description: 'Powerful war bow with superior reach and impact. Requires arrows.', stackable: false, usable: false, price: 60 },
    'Longbow': { id: 'longbow', kind: 'weapon', scope: 'personal', description: 'Powerful war bow with superior reach and impact. Requires arrows.', stackable: false, usable: false, price: 60 },
    'Longsword': { id: 'longsword', kind: 'weapon', scope: 'personal', description: 'Standard martial blade.', stackable: false, usable: false, price: 15 },
    'Dagger': { id: 'dagger', kind: 'weapon', scope: 'personal', description: 'Small blade, easily concealed.', stackable: false, usable: false, price: 2 },
    'Warhammer': { id: 'warhammer', kind: 'weapon', scope: 'personal', description: 'Bludgeoning weapon favored by clerics.', stackable: false, usable: false, price: 8 },
    'Quarterstaff': { id: 'quarterstaff', kind: 'weapon', scope: 'personal', description: 'Simple wooden staff.', stackable: false, usable: false, price: 2 },
    'Short Sword': { id: 'short_sword', kind: 'weapon', scope: 'personal', description: 'Light blade preferred by thieves.', stackable: false, usable: false, price: 8 },
    'Two-Handed Sword': { id: 'two_handed_sword', kind: 'weapon', scope: 'personal', description: 'Massive greatsword requiring two hands to wield.', stackable: false, usable: false, price: 30 },
    'Mace': { id: 'mace', kind: 'weapon', scope: 'personal', description: 'Heavy iron-headed bludgeon.', stackable: false, usable: false, price: 8 },
    'Halberd': { id: 'halberd', kind: 'weapon', scope: 'personal', description: 'Long polearm combining axe blade and pike head.', stackable: false, usable: false, price: 18 },
    'Crossbow': { id: 'crossbow', kind: 'weapon', scope: 'personal', description: 'Mechanical ranged weapon firing heavy bolts.', stackable: false, usable: false, price: 35 },
    'Light Crossbow': { id: 'light_crossbow', kind: 'weapon', scope: 'personal', description: 'Light crossbow firing bolts.', stackable: false, usable: false, price: 30 },
    'Heavy Crossbow': { id: 'heavy_crossbow', kind: 'weapon', scope: 'personal', description: 'Heavy crossbow firing bolts.', stackable: false, usable: false, price: 50 },
    'Sling': { id: 'sling', kind: 'weapon', scope: 'personal', description: 'Simple leather strap weapon for hurling stones and lead bullets.', stackable: false, usable: false, price: 2 },
    'Leather Armor': { id: 'leather_armor', kind: 'armor', armorType: 'light', baseAc: 8, scope: 'personal', description: 'Cured and boiled animal hide. Light enough for thieves to move silently.', stackable: false, usable: false, price: 5 },
    'Studded Leather': { id: 'studded_leather', kind: 'armor', armorType: 'light', baseAc: 7, scope: 'personal', description: 'Tough leather reinforced with close-set steel rivets.', stackable: false, usable: false, price: 20 },
    'Scale Mail': { id: 'scale_mail', kind: 'armor', armorType: 'medium', baseAc: 6, scope: 'personal', description: 'Overlapping brass and iron scales laced to leather.', stackable: false, usable: false, price: 45 },
    'Chain Mail': { id: 'chain_mail', kind: 'armor', armorType: 'medium', baseAc: 5, scope: 'personal', description: 'Interlinked steel rings worn over padded gambeson.', stackable: false, usable: false, price: 75 },
    'Banded Mail': { id: 'banded_mail', kind: 'armor', armorType: 'heavy', baseAc: 4, scope: 'personal', description: 'Horizontal steel bands riveted to chain and leather.', stackable: false, usable: false, price: 90 },
    'Plate Mail': { id: 'plate_mail', kind: 'armor', armorType: 'heavy', baseAc: 3, scope: 'personal', description: 'Formed steel breastplate, rerebraces and greaves over chain.', stackable: false, usable: false, price: 150 },
    'Field Plate': { id: 'field_plate', kind: 'armor', armorType: 'heavy', baseAc: 2, scope: 'personal', description: 'Master-forged articulate steel harness offering superior battlefield warding.', stackable: false, usable: false, price: 400 },
    'Small Shield': { id: 'small_shield', kind: 'shield', acBonus: 1, scope: 'personal', description: 'Light buckler strapped to the forearm. Deflects incoming blows (-1 AC).', stackable: false, usable: false, price: 7 },
    'Medium Shield': { id: 'medium_shield', kind: 'shield', acBonus: 1, scope: 'personal', description: 'Iron-banded heater shield turning aside weapon strikes (-1 AC).', stackable: false, usable: false, price: 10 },
    'Consecrated Shield': { id: 'consecrated_shield', kind: 'shield', acBonus: 1, scope: 'personal', description: 'Blessed kite shield inscribed with sacred holy heraldry (-1 AC).', stackable: false, usable: false, price: 35 },
    "Scholar's Robes": { id: 'scholars_robes', kind: 'armor', armorType: 'unarmored', baseAc: 10, scope: 'personal', description: 'Woven wool and silk mantle allowing unhindered somatic casting.', stackable: false, usable: false, price: 5 },
    'Ancient Rubies': { id: 'rubies', kind: 'treasure', scope: 'party', description: 'Glittering faceted gemstones plundered from ancient vaults. High trade value.', stackable: true, usable: false, price: 50 },
    'Masterwork Whetstone': { id: 'masterwork_whetstone', kind: 'treasure', scope: 'party', description: 'Fine dwarven honing stone with a mirrored polish. Highly prized by smiths.', stackable: true, usable: false, price: 25 },
    'Astral Resonance Crystal': { id: 'astral_crystal', kind: 'treasure', scope: 'party', description: 'A glowing geode vibrating with latent astral hum. Sought after by arcanists.', stackable: true, usable: false, price: 40 },
    'Consecrated Dawn Chime': { id: 'dawn_chime', kind: 'treasure', scope: 'party', description: 'An ornate silver sanctuary bell once rung during morning prayer litanies.', stackable: true, usable: false, price: 30 },
    'Skeleton Keyblank': { id: 'skeleton_keyblank', kind: 'treasure', scope: 'party', description: 'Intricately notched brass keyblank crafted by master rogues.', stackable: true, usable: false, price: 35 },
    'Vale Family Signet': { id: 'vale_signet', kind: 'treasure', scope: 'party', description: 'Tarnished signet ring bearing the aristocratic crest of the Vale lineage.', stackable: true, usable: false, price: 20 },
    'Cracked Prayer Beads': { id: 'prayer_beads', kind: 'treasure', scope: 'party', description: 'Carved sandalwood beads imbued with decades of devotion.', stackable: true, usable: false, price: 8 },
    'Sun-Forged Relic of Dawn': { id: 'sun_relic', kind: 'quest', scope: 'party', description: 'A gleaming solar artifact consecrated in ancient times. Recovered from the goblin ruins.', stackable: false, usable: false, price: null },
    'Ashen Crown of Binding': { id: 'ashen_crown', kind: 'quest', scope: 'party', description: 'A dark iron coronet pulsing with necromantic authority and bound souls.', stackable: false, usable: false, price: null },
    'Highstone Signet Ring': { id: 'highstone_signet', kind: 'quest', scope: 'party', description: 'The official signet ring of Baron Justinian Vane of Highstone.', stackable: false, usable: false, price: null },
    'Albright Signet Ring': { id: 'albright_signet', kind: 'quest', scope: 'party', description: 'The hereditary signet of Lord Raymond Albright of Oakhaven.', stackable: false, usable: false, price: null },
    "Saint Vane's Blessed Greatsword": { id: 'saint_vane_sword', kind: 'quest', scope: 'party', description: 'An ancient consecrated greatsword glowing with righteous wrath.', stackable: false, usable: false, price: null },
    'Saint Orlan’s Femur': { id: 'saint_orlan_femur', kind: 'quest', scope: 'party', description: 'A sanctified relic bone of the venerable martyr Saint Orlan.', stackable: false, usable: false, price: null },
    'Cult Ledger': { id: 'cult_ledger', kind: 'quest', scope: 'party', description: 'A leather-bound journal deciphering forbidden cult conspiracies.', stackable: false, usable: false, price: null }
  };

  /**
   * Evaluates whether a character class is permitted to equip or use a given item under AD&D 2e rules.
   */
  static isClassAllowedItem(classKey, itemName, itemDef = null) {
    if (!classKey || !itemName) return { allowed: true };
    const key = classKey.toLowerCase();
    const def = itemDef || ItemCatalog.ITEMS[itemName] || (ItemCatalog.WEAPONS[itemName] ? { kind: 'weapon' } : null);
    if (!def) return { allowed: true };

    const kind = def.kind;

    if (kind === 'gear' && itemName === 'Thief Tools') {
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
        if (!allowedCleric.includes(itemName)) {
          return { allowed: false, reason: 'Clerical holy vows forbid shedding blood with edged or piercing weapons.' };
        }
        return { allowed: true };
      }
      if (key === 'thief') {
        const allowedThief = ['Dagger', 'Short Sword', 'Longsword', 'Short Bow', 'Crossbow', 'Sling', 'Club'];
        if (!allowedThief.includes(itemName)) {
          return { allowed: false, reason: 'Thieves are only trained in light, concealable, or ranged rogue weaponry.' };
        }
        return { allowed: true };
      }
      if (key === 'mage') {
        const allowedMage = ['Dagger', 'Quarterstaff', 'Sling', 'Dart'];
        if (!allowedMage.includes(itemName)) {
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
      return adventureSpec.items[name];
    }
    if (ItemCatalog.ITEMS[name]) return ItemCatalog.ITEMS[name];
    if (ItemCatalog.WEAPONS[name]) {
      const w = ItemCatalog.WEAPONS[name];
      return {
        id: name.toLowerCase().replace(/\s+/g, '_'),
        name,
        kind: 'weapon',
        scope: 'personal',
        category: w.category || 'melee',
        damageType: w.damageType || 'slashing',
        price: 15,
        description: `Martial ${w.category || 'weapon'}.`
      };
    }
    return {
      id: name.toLowerCase().replace(/\s+/g, '_'),
      name,
      kind: 'treasure',
      scope: 'party',
      price: 25,
      description: 'A valuable discovery recovered during the expedition.'
    };
  }

  /**
   * Checks whether a given weapon name is defined in adventure specs or master weapon catalog.
   */
  static isKnownWeapon(weaponName, adventureSpec = null) {
    if (adventureSpec && adventureSpec.weapons && adventureSpec.weapons[weaponName]) return true;
    return !!ItemCatalog.WEAPONS[weaponName];
  }

  /**
   * Checks whether a given weapon belongs to the ranged category.
   */
  static isRangedWeapon(weaponName, adventureSpec = null) {
    const def = (adventureSpec && adventureSpec.weapons && adventureSpec.weapons[weaponName]) || ItemCatalog.WEAPONS[weaponName];
    return !!(def && def.category === 'ranged');
  }

  /**
   * Checks whether a hero is holding a valid melee weapon.
   */
  static canHeroMelee(hero, adventureSpec = null) {
    if (!hero || !hero.equippedWeapon) return false;
    const def = (adventureSpec && adventureSpec.weapons && adventureSpec.weapons[hero.equippedWeapon]) || ItemCatalog.WEAPONS[hero.equippedWeapon];
    return !!(def && def.category === 'melee');
  }

  /**
   * Resolves the ammunition type required by a given weapon.
   */
  static getWeaponAmmoType(weaponName, adventureSpec = null) {
    if (!weaponName) return null;
    const norm = weaponName.trim();
    const def = (adventureSpec && adventureSpec.weapons && (adventureSpec.weapons[norm] || adventureSpec.weapons[norm.replace(/\s+/g, ' ')])) || ItemCatalog.WEAPONS[norm];
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
    const def = (adventureSpec && adventureSpec.weapons && adventureSpec.weapons[weaponName]) || ItemCatalog.WEAPONS[weaponName];
    return (def && def.damageType) || fallback;
  }

  /**
   * Resolves the maximum weapon base damage value.
   */
  static getWeaponMaxDamage(weaponName, fallback = 8, adventureSpec = null) {
    const def = (adventureSpec && adventureSpec.weapons && adventureSpec.weapons[weaponName]) || ItemCatalog.WEAPONS[weaponName];
    return (def && def.maxDmg) || fallback;
  }
}
