import { ItemCatalog } from './item_catalog.js';

/**
 * InventoryManager handles party pack storage, hero equipment equipping/swapping,
 * ammunition tracking, consumable item usage, temple resuscitation, and shop transactions.
 */
export class InventoryManager {
  /**
   * Helper that searches across all living party members' personal inventories.
   */
  static findAcrossParty(state, predicate) {
    if (!state || !Array.isArray(state.party)) return [];
    return state.party
      .filter(h => h && h.hp > 0)
      .flatMap(h => (h.personalInventory || h.inventory || []).filter(predicate));
  }

  /**
   * Finds the first living hero carrying a specific item in their personal pack.
   */
  static findHeroCarryingItem(state, nameOrPredicate) {
    if (!state || !Array.isArray(state.party)) return null;
    const testFn = typeof nameOrPredicate === 'function'
      ? nameOrPredicate
      : (i) => (typeof i === 'string' ? i === nameOrPredicate : i && i.name === nameOrPredicate);

    for (let hIdx = 0; hIdx < state.party.length; hIdx++) {
      const hero = state.party[hIdx];
      if (!hero || hero.hp <= 0) continue;
      const inv = hero.personalInventory || hero.inventory || [];
      const itemIndex = inv.findIndex(testFn);
      if (itemIndex !== -1) {
        return { hero, heroIndex: hIdx, item: inv[itemIndex], itemIndex, inventory: inv };
      }
    }
    return null;
  }

  /**
   * Counts total ammunition available in personal hero inventory or across the party.
   */
  static getAmmoCount(state, ammoName, hero = null) {
    if (!ammoName) return 0;
    if (hero) {
      const inv = hero.personalInventory || hero.inventory || [];
      const personal = inv.find(i => (typeof i === 'string' ? i === ammoName : i && i.name === ammoName));
      return personal ? (personal.amount ?? personal.count ?? 1) : 0;
    }
    return this.getPartyItemQty(state, ammoName);
  }

  /**
   * Consumes ammunition first from personal hero inventory, then from other living allies.
   */
  static consumeAmmo(state, param1, param2, count = 1) {
    let hero = null;
    let ammoName = null;
    if (typeof param1 === 'string') {
      ammoName = param1;
      hero = param2;
    } else {
      hero = param1;
      ammoName = param2;
    }

    if (!ammoName) return { success: true, remaining: 0 };
    let toDeduct = count;
    if (hero) {
      const inv = hero.personalInventory || hero.inventory;
      if (Array.isArray(inv)) {
        const personal = inv.find(i => (typeof i === 'string' ? i === ammoName : i && i.name === ammoName));
        if (personal) {
          const qty = personal.amount ?? personal.count ?? 1;
          if (qty <= toDeduct) {
            hero.personalInventory = inv.filter(i => i !== personal);
            if (hero.inventory) hero.inventory = hero.personalInventory;
            toDeduct -= qty;
          } else {
            personal.amount = qty - toDeduct;
            if (personal.count !== undefined) personal.count = personal.amount;
            toDeduct = 0;
          }
        }
      }
    }
    if (toDeduct > 0) {
      this.removePartyItem(state, ammoName, toDeduct);
    }
    const remaining = this.getAmmoCount(state, ammoName, hero);
    return { success: true, remaining };
  }

  /**
   * Checks whether the hero currently has a ranged weapon equipped.
   */
  static hasRangedWeapon(state, hero) {
    return !!(hero && ItemCatalog.isRangedWeapon(hero.equippedWeapon, state.spec));
  }

  /**
   * Checks whether the hero is ready to shoot (has ranged weapon and sufficient ammo).
   */
  static canHeroShoot(state, hero) {
    if (!this.hasRangedWeapon(state, hero)) return false;
    const ammoType = ItemCatalog.getWeaponAmmoType(hero.equippedWeapon, state.spec);
    if (ammoType && this.getAmmoCount(state, ammoType, hero) <= 0) return false;
    return true;
  }

  /**
   * Lists all valid weapons available for a hero to equip from equipped slot and personal pack.
   */
  static getAvailableWeapons(state, heroIndex) {
    const hero = state.party[heroIndex];
    if (!hero) return [];
    const list = [];
    if (hero.equippedWeapon) {
      list.push({ name: hero.equippedWeapon, location: 'equipped', isEquipped: true });
    }
    const personalInv = hero.personalInventory || hero.inventory;
    if (Array.isArray(personalInv)) {
      personalInv.forEach(i => {
        const iName = typeof i === 'string' ? i : i?.name;
        if (!iName) return;
        if (ItemCatalog.isKnownWeapon(iName, state.spec)) {
          const chk = ItemCatalog.isClassAllowedItem(hero.classKey, iName);
          if (chk.allowed && !list.some(w => w.name === iName && w.location === 'personal')) {
            list.push({ name: iName, location: 'personal', isEquipped: false });
          }
        }
      });
    }
    return list;
  }

  /**
   * Swaps a hero's equipped weapon with another weapon from personal inventory.
   */
  static swapHeroWeapon(state, heroIndex, targetWeaponName = null) {
    const hero = state.party[heroIndex];
    if (!hero) return { success: false, reason: 'Invalid hero.' };
    const available = this.getAvailableWeapons(state, heroIndex);
    if (available.length <= 1) {
      return { success: false, reason: `${hero.name} has no alternate weapons to equip.` };
    }

    let nextWeapon = null;
    if (targetWeaponName) {
      nextWeapon = available.find(w => w.name === targetWeaponName && !w.isEquipped);
    } else {
      nextWeapon = available.find(w => !w.isEquipped && w.name !== hero.equippedWeapon) || available.find(w => !w.isEquipped);
    }

    if (!nextWeapon) {
      return { success: false, reason: 'No alternate weapon available.' };
    }

    const previousWeapon = hero.equippedWeapon;
    const newWeapon = nextWeapon.name;
    const inv = hero.personalInventory || hero.inventory || (hero.personalInventory = []);
    if (!hero.inventory) hero.inventory = inv;

    const slot = inv.find(i => (typeof i === 'string' ? i === newWeapon : i && i.name === newWeapon));
    if (slot) {
      if ((slot.amount || 1) <= 1) {
        hero.personalInventory = inv.filter(i => i !== slot);
        hero.inventory = hero.personalInventory;
      } else {
        slot.amount -= 1;
        if (slot.count !== undefined) slot.count = slot.amount;
      }
    }
    if (previousWeapon) {
      const prevSlot = (hero.personalInventory || inv).find(i => (typeof i === 'string' ? i === previousWeapon : i && i.name === previousWeapon));
      if (prevSlot) {
        prevSlot.amount = (prevSlot.amount || 1) + 1;
        if (prevSlot.count !== undefined) prevSlot.count = prevSlot.amount;
      } else {
        (hero.personalInventory || inv).push({ name: previousWeapon, amount: 1 });
      }
    }

    hero.equippedWeapon = newWeapon;

    // Synchronize combat commands for mid-combat weapon change
    if (state.combat && state.combat.active) {
      const isRanged = ItemCatalog.isRangedWeapon(newWeapon, state.spec);
      const activeCmd = state.combat.queuedCommands[heroIndex];
      const prevCmd = state.combat.previousCommands[heroIndex];

      if (isRanged) {
        if (activeCmd && activeCmd.type === 'ATTACK') activeCmd.type = 'SHOOT';
        if (prevCmd && prevCmd.type === 'ATTACK') prevCmd.type = 'SHOOT';
      } else {
        if (activeCmd && activeCmd.type === 'SHOOT') activeCmd.type = 'ATTACK';
        if (prevCmd && prevCmd.type === 'SHOOT') prevCmd.type = 'ATTACK';
      }
    }

    return {
      success: true,
      previousWeapon,
      newWeapon,
      isRanged: ItemCatalog.isRangedWeapon(newWeapon, state.spec)
    };
  }

  /**
   * Equips a weapon from personal inventory onto a hero.
   */
  static equipHeroWeapon(state, heroIndex, weaponName) {
    const hero = state.party[heroIndex];
    if (!hero || !weaponName) return { success: false, reason: 'Invalid hero or weapon.' };
    if (!ItemCatalog.isKnownWeapon(weaponName, state.spec)) return { success: false, reason: `"${weaponName}" is not a known weapon.` };

    const inv = hero.personalInventory || hero.inventory || (hero.personalInventory = []);
    if (!hero.inventory) hero.inventory = inv;
    const slot = inv.find(i => (typeof i === 'string' ? i === weaponName : i && i.name === weaponName));
    if (!slot || (typeof slot === 'object' && (slot.amount || 1) < 1)) return { success: false, reason: `${hero.name} does not carry ${weaponName}.` };

    if (typeof slot === 'object' && (slot.amount || 1) > 1) {
      slot.amount -= 1;
      if (slot.count !== undefined) slot.count = slot.amount;
    } else {
      hero.personalInventory = inv.filter(i => i !== slot);
      hero.inventory = hero.personalInventory;
    }

    if (hero.equippedWeapon) {
      const existing = (hero.personalInventory || []).find(i => (typeof i === 'string' ? i === hero.equippedWeapon : i && i.name === hero.equippedWeapon));
      if (existing && typeof existing === 'object') {
        existing.amount = (existing.amount || 1) + 1;
        if (existing.count !== undefined) existing.count = existing.amount;
      } else {
        (hero.personalInventory || []).push({ name: hero.equippedWeapon, amount: 1 });
      }
    }

    hero.equippedWeapon = weaponName;

    if (state.combat && state.combat.active) {
      const isRanged = ItemCatalog.isRangedWeapon(weaponName, state.spec);
      const activeCmd = state.combat.queuedCommands[heroIndex];
      const prevCmd = state.combat.previousCommands[heroIndex];

      if (isRanged) {
        if (activeCmd && activeCmd.type === 'ATTACK') activeCmd.type = 'SHOOT';
        if (prevCmd && prevCmd.type === 'ATTACK') prevCmd.type = 'SHOOT';
      } else {
        if (activeCmd && activeCmd.type === 'SHOOT') activeCmd.type = 'ATTACK';
        if (prevCmd && prevCmd.type === 'SHOOT') prevCmd.type = 'ATTACK';
      }
    }

    return { success: true, equipped: weaponName };
  }

  /**
   * Equips armor from personal inventory onto a hero.
   */
  static equipHeroArmor(state, heroIndex, armorName, getDexDefensiveAdjustmentFn) {
    const hero = state.party[heroIndex];
    if (!hero || !armorName) return { success: false, reason: 'Invalid hero or armor.' };
    const itemDef = ItemCatalog.getItemDef(armorName, state.spec);
    if (!itemDef || itemDef.kind !== 'armor') return { success: false, reason: `"${armorName}" is not valid armor.` };

    // Class armor restrictions in AD&D 2e:
    if (hero.classKey === 'mage' && itemDef.armorType !== 'unarmored') {
      return { success: false, reason: 'Mages cannot wear metallic or rigid armor while weaving somatic spells.' };
    }
    if (hero.classKey === 'thief' && itemDef.armorType !== 'light' && itemDef.armorType !== 'unarmored') {
      return { success: false, reason: 'Thieves cannot wear heavy armor without crippling thieving tradecraft.' };
    }

    const inv = hero.personalInventory || hero.inventory || (hero.personalInventory = []);
    if (!hero.inventory) hero.inventory = inv;
    const slot = inv.find(i => (typeof i === 'string' ? i === armorName : i && i.name === armorName));
    if (!slot || (typeof slot === 'object' && (slot.amount || 1) < 1)) return { success: false, reason: `${hero.name} does not carry ${armorName}.` };

    if (typeof slot === 'object' && (slot.amount || 1) > 1) {
      slot.amount -= 1;
      if (slot.count !== undefined) slot.count = slot.amount;
    } else {
      hero.personalInventory = inv.filter(i => i !== slot);
      hero.inventory = hero.personalInventory;
    }

    if (hero.equippedArmor && hero.equippedArmor.name && hero.equippedArmor.name !== "None (Unarmored)") {
      const existing = (hero.personalInventory || []).find(i => (typeof i === 'string' ? i === hero.equippedArmor.name : i && i.name === hero.equippedArmor.name));
      if (existing && typeof existing === 'object') {
        existing.amount = (existing.amount || 1) + 1;
        if (existing.count !== undefined) existing.count = existing.amount;
      } else {
        (hero.personalInventory || []).push({ name: hero.equippedArmor.name, amount: 1 });
      }
    }

    hero.equippedArmor = {
      id: itemDef.id,
      name: armorName,
      type: itemDef.armorType || 'medium',
      baseAc: itemDef.baseAc != null ? itemDef.baseAc : 10,
      description: itemDef.description || ''
    };
    this.recalculateHeroAC(hero, getDexDefensiveAdjustmentFn);
    return { success: true, equipped: armorName };
  }

  /**
   * Equips a shield from personal inventory onto a hero.
   */
  static equipHeroShield(state, heroIndex, shieldName, getDexDefensiveAdjustmentFn) {
    const hero = state.party[heroIndex];
    if (!hero || !shieldName) return { success: false, reason: 'Invalid hero or shield.' };
    const itemDef = ItemCatalog.getItemDef(shieldName, state.spec);
    if (!itemDef || itemDef.kind !== 'shield') return { success: false, reason: `"${shieldName}" is not a shield.` };

    if (hero.classKey === 'mage') {
      return { success: false, reason: 'Mages cannot wield shields without disrupting spellcraft somatic components.' };
    }
    if (hero.classKey === 'thief') {
      return { success: false, reason: 'Thieves cannot wield shields without hindering stealth and nimble evasion.' };
    }

    const inv = hero.personalInventory || hero.inventory || (hero.personalInventory = []);
    if (!hero.inventory) hero.inventory = inv;
    const slot = inv.find(i => (typeof i === 'string' ? i === shieldName : i && i.name === shieldName));
    if (!slot || (typeof slot === 'object' && (slot.amount || 1) < 1)) return { success: false, reason: `${hero.name} does not carry ${shieldName}.` };

    if (typeof slot === 'object' && (slot.amount || 1) > 1) {
      slot.amount -= 1;
      if (slot.count !== undefined) slot.count = slot.amount;
    } else {
      hero.personalInventory = inv.filter(i => i !== slot);
      hero.inventory = hero.personalInventory;
    }

    if (hero.equippedShield && hero.equippedShield.name) {
      const existing = (hero.personalInventory || []).find(i => (typeof i === 'string' ? i === hero.equippedShield.name : i && i.name === hero.equippedShield.name));
      if (existing && typeof existing === 'object') {
        existing.amount = (existing.amount || 1) + 1;
        if (existing.count !== undefined) existing.count = existing.amount;
      } else {
        (hero.personalInventory || []).push({ name: hero.equippedShield.name, amount: 1 });
      }
    }

    hero.equippedShield = {
      id: itemDef.id,
      name: shieldName,
      type: 'shield',
      acBonus: itemDef.acBonus || 1,
      description: itemDef.description || ''
    };
    this.recalculateHeroAC(hero, getDexDefensiveAdjustmentFn);
    return { success: true, equipped: shieldName };
  }

  /**
   * Equips boots (e.g. Boots of Elvenkind) from personal inventory onto a hero.
   */
  static equipHeroBoots(state, heroIndex, bootsName, getDexDefensiveAdjustmentFn) {
    const hero = state.party[heroIndex];
    if (!hero || !bootsName) return { success: false, reason: 'Invalid hero or boots.' };
    const itemDef = ItemCatalog.getItemDef(bootsName, state.spec);
    if (!itemDef || itemDef.kind !== 'boots') return { success: false, reason: `"${bootsName}" is not boots.` };

    const inv = hero.personalInventory || hero.inventory || (hero.personalInventory = []);
    if (!hero.inventory) hero.inventory = inv;
    const slot = inv.find(i => (typeof i === 'string' ? i === bootsName : i && i.name === bootsName));
    if (!slot || (typeof slot === 'object' && (slot.amount || 1) < 1)) return { success: false, reason: `${hero.name} does not carry ${bootsName}.` };

    if (typeof slot === 'object' && (slot.amount || 1) > 1) {
      slot.amount -= 1;
      if (slot.count !== undefined) slot.count = slot.amount;
    } else {
      hero.personalInventory = inv.filter(i => i !== slot);
      hero.inventory = hero.personalInventory;
    }

    if (hero.equippedBoots && hero.equippedBoots.name) {
      const existing = (hero.personalInventory || []).find(i => (typeof i === 'string' ? i === hero.equippedBoots.name : i && i.name === hero.equippedBoots.name));
      if (existing && typeof existing === 'object') {
        existing.amount = (existing.amount || 1) + 1;
        if (existing.count !== undefined) existing.count = existing.amount;
      } else {
        (hero.personalInventory || []).push({ name: hero.equippedBoots.name, amount: 1 });
      }
    }

    hero.equippedBoots = {
      id: itemDef.id,
      name: bootsName,
      type: 'boots',
      acBonus: itemDef.acBonus || 0,
      stealthBonus: itemDef.stealthBonus || 0,
      silentSteps: !!itemDef.silentSteps,
      description: itemDef.description || ''
    };
    this.recalculateHeroAC(hero, getDexDefensiveAdjustmentFn);
    return { success: true, equipped: bootsName };
  }

  /**
   * Equips gloves or gauntlets (e.g. Gloves of Ogre Strength) from personal inventory onto a hero.
   */
  static equipHeroGloves(state, heroIndex, glovesName) {
    const hero = state.party[heroIndex];
    if (!hero || !glovesName) return { success: false, reason: 'Invalid hero or gloves.' };
    const itemDef = ItemCatalog.getItemDef(glovesName, state.spec);
    if (!itemDef || itemDef.kind !== 'gloves') return { success: false, reason: `"${glovesName}" are not gloves.` };

    const inv = hero.personalInventory || hero.inventory || (hero.personalInventory = []);
    if (!hero.inventory) hero.inventory = inv;
    const slot = inv.find(i => (typeof i === 'string' ? i === glovesName : i && i.name === glovesName));
    if (!slot || (typeof slot === 'object' && (slot.amount || 1) < 1)) return { success: false, reason: `${hero.name} does not carry ${glovesName}.` };

    if (typeof slot === 'object' && (slot.amount || 1) > 1) {
      slot.amount -= 1;
      if (slot.count !== undefined) slot.count = slot.amount;
    } else {
      hero.personalInventory = inv.filter(i => i !== slot);
      hero.inventory = hero.personalInventory;
    }

    if (hero.equippedGloves && hero.equippedGloves.name) {
      const existing = (hero.personalInventory || []).find(i => (typeof i === 'string' ? i === hero.equippedGloves.name : i && i.name === hero.equippedGloves.name));
      if (existing && typeof existing === 'object') {
        existing.amount = (existing.amount || 1) + 1;
        if (existing.count !== undefined) existing.count = existing.amount;
      } else {
        (hero.personalInventory || []).push({ name: hero.equippedGloves.name, amount: 1 });
      }
    }

    hero.equippedGloves = {
      id: itemDef.id,
      name: glovesName,
      type: 'gloves',
      strengthSet: itemDef.strengthSet || 18,
      attackBonus: itemDef.attackBonus || 3,
      damageBonus: itemDef.damageBonus || 4,
      description: itemDef.description || ''
    };
    return { success: true, equipped: glovesName };
  }

  /**
   * Recalculates descending Armor Class (lower is better) based on armor base, shield, boots, and DEX.
   */
  static recalculateHeroAC(hero, getDexDefensiveAdjustmentFn) {
    const baseArmorAc = hero.equippedArmor?.baseAc != null ? hero.equippedArmor.baseAc : 10;
    const shieldBonus = hero.equippedShield ? (hero.equippedShield.acBonus || 1) : 0;
    const bootsBonus = hero.equippedBoots ? (hero.equippedBoots.acBonus || 0) : 0;
    const dexMod = getDexDefensiveAdjustmentFn ? getDexDefensiveAdjustmentFn(hero.attributes?.dexterity) : 0;
    hero.armorClass = baseArmorAc - shieldBonus - bootsBonus + dexMod;
    return hero.armorClass;
  }

  /**
   * Retrieves an item entry across living party members' personal inventories.
   */
  static getPartyItem(state, name) {
    if (name === 'Gold Pieces') {
      const gold = this.getPartyGold(state);
      return gold > 0 ? { name: 'Gold Pieces', amount: gold, type: 'currency' } : null;
    }
    const found = this.findHeroCarryingItem(state, name);
    return found ? found.item : null;
  }

  /**
   * Retrieves the total quantity of an item across all living party members' personal inventories.
   */
  static getPartyItemQty(state, name) {
    if (name === 'Gold Pieces') return this.getPartyGold(state);
    if (!state || !Array.isArray(state.party)) return 0;
    let total = 0;
    state.party.filter(h => h && h.hp > 0).forEach(h => {
      const inv = h.personalInventory || h.inventory || [];
      inv.forEach(i => {
        if (!i) return;
        const iName = typeof i === 'string' ? i : i.name;
        if (iName === name) {
          total += (typeof i === 'object') ? (i.amount ?? i.count ?? 1) : 1;
        }
      });
    });
    return total;
  }

  /**
   * Retrieves the current party gold pieces (shared ledger).
   */
  static getPartyGold(state) {
    if (!state) return 0;
    return typeof state.partyGold === 'number' ? state.partyGold : 0;
  }

  /**
   * Adds an item to a party member's personal inventory.
   * If gold, adds to shared state.partyGold.
   */
  static addPartyItem(state, name, amount = 1, preferredHeroIndex = null) {
    if (name === 'Gold Pieces') {
      state.partyGold = (state.partyGold || 0) + amount;
      return { name: 'Gold Pieces', amount: state.partyGold, type: 'currency' };
    }
    if (!state || !Array.isArray(state.party)) return null;
    let hero = null;
    if (preferredHeroIndex != null && state.party[preferredHeroIndex] && state.party[preferredHeroIndex].hp > 0) {
      hero = state.party[preferredHeroIndex];
    } else {
      hero = state.party.find(h => h && h.hp > 0) || state.party[0];
    }
    if (!hero) return null;
    return this.addItemToHero(hero, name, amount, state.spec);
  }

  /**
   * Adds an item directly to a hero's personalInventory.
   */
  static addItemToHero(hero, name, amount = 1, spec = null) {
    if (!hero) return null;
    if (!hero.personalInventory) hero.personalInventory = hero.inventory || [];
    if (!hero.inventory) hero.inventory = hero.personalInventory;
    const inv = hero.personalInventory;
    const def = ItemCatalog.getItemDef(name, spec);
    const qty = Math.max(1, amount | 0);
    const existing = inv.find(i => (typeof i === 'string' ? i === name : i && i.name === name));
    if (existing && typeof existing === 'object' && (def ? def.stackable !== false : true)) {
      const qtyKey = existing.amount !== undefined ? 'amount' : 'count';
      existing[qtyKey] = (existing[qtyKey] ?? 0) + qty;
      if (existing.count !== undefined && existing.amount !== undefined) existing.count = existing.amount;
      return existing;
    }
    const entry = { name, amount: qty };
    if (def && def.kind) entry.type = def.kind;
    inv.push(entry);
    return entry;
  }

  /**
   * Removes an item quantity across living party members' personal inventories.
   * If gold, deducts from state.partyGold.
   */
  static removePartyItem(state, name, amount = 1) {
    if (name === 'Gold Pieces') return this.spendGold(state, amount);
    if (!state || !Array.isArray(state.party)) return false;
    let needed = amount;
    if (this.getPartyItemQty(state, name) < amount) return false;

    const livingHeroes = state.party.filter(h => h && h.hp > 0);
    for (const hero of livingHeroes) {
      const inv = hero.personalInventory || hero.inventory || [];
      for (let i = 0; i < inv.length; i++) {
        const item = inv[i];
        if (!item) continue;
        const iName = typeof item === 'string' ? item : item.name;
        if (iName === name) {
          const qtyKey = (typeof item === 'object' && item.amount !== undefined) ? 'amount' : 'count';
          const have = (typeof item === 'object') ? (item[qtyKey] ?? 1) : 1;
          if (have <= needed) {
            needed -= have;
            inv.splice(i, 1);
            i--;
          } else {
            item[qtyKey] = have - needed;
            if (item.count !== undefined && item.amount !== undefined) item.count = item.amount;
            needed = 0;
          }
          if (needed <= 0) break;
        }
      }
      if (needed <= 0) break;
    }
    return needed <= 0;
  }

  /**
   * Spends party gold pieces from the shared partyGold ledger.
   */
  static spendGold(state, amount) {
    if (!state) return false;
    const current = this.getPartyGold(state);
    if (current < amount) return false;
    state.partyGold = current - amount;
    return true;
  }

  /**
   * Uses a consumable item (e.g. potion, torch, holy water, rations, thief tools).
   */
  static useConsumable(state, itemName, heroIndex = null) {
    const def = ItemCatalog.getItemDef(itemName, state.spec);
    if (!def || !def.usable) return { success: false, reason: `${itemName} cannot be used.` };
    if (this.getPartyItemQty(state, itemName) < 1) return { success: false, reason: `No ${itemName} carried by the party.` };
    if (state.combat && state.combat.active && def.useEffect === 'light') return { success: false, reason: 'Cannot light a torch in the middle of a melee.' };

    const hero = (heroIndex != null) ? state.party[heroIndex] : null;

    if (def.useEffect === 'heal') {
      if (!hero) return { success: false, reason: 'Choose an ally to drink the potion.' };
      if (hero.hp <= -10) return { success: false, reason: `${hero.name} is permanently dead (-10 HP) and cannot be revived by a potion.` };
      if (hero.hp >= hero.maxHp) return { success: false, reason: `${hero.name} is already at full health.` };
      
      const healed = Math.floor(Math.random() * 4) + 1 + 1; // 1d4+1
      const before = hero.hp;
      hero.hp = Math.min(hero.maxHp, hero.hp + healed);
      const actual = hero.hp - before;
      this.removePartyItem(state, itemName, 1);
      const wasInc = before <= 0;
      return {
        success: true,
        healed: actual,
        wasIncapacitated: wasInc,
        log: wasInc
          ? `❤️ Healing draught poured down ${hero.name}'s throat! Revived from incapacitation (+${actual} HP, now ${hero.hp}/${hero.maxHp})!`
          : `${hero.name} drinks a ${itemName} and recovers ${actual} HP (${hero.hp}/${hero.maxHp}).`
      };
    }

    if (def.useEffect === 'extra_heal') {
      if (!hero) return { success: false, reason: 'Choose an ally to drink the potion.' };
      if (hero.hp <= -10) return { success: false, reason: `${hero.name} is permanently dead (-10 HP) and cannot be revived.` };
      if (hero.hp >= hero.maxHp) return { success: false, reason: `${hero.name} is already at full health.` };
      
      // 3d8+3
      const healed = (Math.floor(Math.random() * 8) + 1) + (Math.floor(Math.random() * 8) + 1) + (Math.floor(Math.random() * 8) + 1) + 3;
      const before = hero.hp;
      hero.hp = Math.min(hero.maxHp, hero.hp + healed);
      const actual = hero.hp - before;
      this.removePartyItem(state, itemName, 1);
      const wasInc = before <= 0;
      return {
        success: true,
        healed: actual,
        wasIncapacitated: wasInc,
        log: wasInc
          ? `💖 Radiant Extra-Healing draught poured down ${hero.name}'s throat! Miraculously revived (+${actual} HP, now ${hero.hp}/${hero.maxHp})!`
          : `${hero.name} quaffs a Potion of Extra-Healing and surges with vitality (+${actual} HP, now ${hero.hp}/${hero.maxHp}).`
      };
    }

    if (def.useEffect === 'ogre_strength') {
      if (!hero) return { success: false, reason: 'Choose an ally to drink the potion.' };
      this.removePartyItem(state, itemName, 1);
      hero.tempAttackBonus = Math.max(hero.tempAttackBonus || 0, 3);
      hero.tempDamageBonus = Math.max(hero.tempDamageBonus || 0, 4);
      hero.tempAttackRounds = Math.max(hero.tempAttackRounds || 0, 30);
      hero.tempAttackSource = 'Potion of Ogre Strength';
      return {
        success: true,
        log: `💪 ${hero.name} drinks the Potion of Ogre Strength! Muscles surge with raw brute force (+3 to-hit, +4 melee damage for 30 exploration turns or combat)!`
      };
    }

    if (def.useEffect === 'giant_strength') {
      if (!hero) return { success: false, reason: 'Choose an ally to drink the potion.' };
      this.removePartyItem(state, itemName, 1);
      hero.tempAttackBonus = Math.max(hero.tempAttackBonus || 0, 4);
      hero.tempDamageBonus = Math.max(hero.tempDamageBonus || 0, 6);
      hero.tempAttackRounds = Math.max(hero.tempAttackRounds || 0, 30);
      hero.tempAttackSource = 'Potion of Giant Strength';
      return {
        success: true,
        log: `🏔️ ${hero.name} drinks the Potion of Giant Strength! Immense giant power surges through their limbs (+4 to-hit, +6 melee damage for 30 exploration turns or combat)!`
      };
    }

    if (def.useEffect === 'speed') {
      if (!hero) return { success: false, reason: 'Choose an ally to drink the potion.' };
      this.removePartyItem(state, itemName, 1);
      hero.tempAcBonus = Math.max(hero.tempAcBonus || 0, 2);
      hero.tempAcRounds = Math.max(hero.tempAcRounds || 0, 25);
      hero.tempAcSource = 'Potion of Speed';
      hero.tempAttackBonus = Math.max(hero.tempAttackBonus || 0, 2);
      hero.tempAttackRounds = Math.max(hero.tempAttackRounds || 0, 25);
      return {
        success: true,
        log: `⚡ ${hero.name} drinks the Potion of Speed! Swift reflexes blur reality (+2 to-hit, -2 AC warding for 25 exploration turns or combat)!`
      };
    }

    if (def.useEffect === 'invisibility') {
      if (!hero) return { success: false, reason: 'Choose an ally to drink the potion.' };
      this.removePartyItem(state, itemName, 1);
      hero.isStealth = true;
      hero.tempAcBonus = Math.max(hero.tempAcBonus || 0, 2);
      hero.tempAcRounds = Math.max(hero.tempAcRounds || 0, 30);
      hero.tempAcSource = 'Potion of Invisibility';
      return {
        success: true,
        log: `🌫️ ${hero.name} drinks the Potion of Invisibility and vanishes from sight! (Stealth & evasion active for 30 exploration turns).`
      };
    }

    if (def.useEffect === 'heroism') {
      if (!hero) return { success: false, reason: 'Choose an ally to drink the potion.' };
      this.removePartyItem(state, itemName, 1);
      hero.tempHp = (hero.tempHp || 0) + 10;
      hero.hp = hero.hp + 10;
      hero.tempAttackBonus = Math.max(hero.tempAttackBonus || 0, 2);
      hero.tempAttackRounds = Math.max(hero.tempAttackRounds || 0, 30);
      return {
        success: true,
        log: `🛡️ ${hero.name} quaffs the Potion of Heroism! Fearless fortitude fills their spirit (+10 temporary HP, +2 to-hit for 30 turns)!`
      };
    }

    if (def.useEffect === 'fire_resistance') {
      if (!hero) return { success: false, reason: 'Choose an ally to drink the potion.' };
      this.removePartyItem(state, itemName, 1);
      hero.fireResistance = 60;
      return {
        success: true,
        log: `🔥 ${hero.name} drinks the Potion of Fire Resistance! A cooling mystical aura wards against flames and scorch traps (60 turns).`
      };
    }

    if (def.useEffect === 'antidote') {
      if (!hero) return { success: false, reason: 'Choose an ally to drink the potion.' };
      this.removePartyItem(state, itemName, 1);
      hero.isPoisoned = false;
      hero.poisonRounds = 0;
      hero.poisonDamage = 0;
      hero.tempIntDrain = 0;
      return {
        success: true,
        log: `🌿 ${hero.name} drinks the Potion of Antidote! Toxins, venom, and incapacitating poisons are purged completely from their body!`
      };
    }

    if (def.useEffect === 'clairvoyance') {
      this.removePartyItem(state, itemName, 1);
      state.clairvoyanceUntil = (state.totalExplorationMinutes || 0) + 30;
      return {
        success: true,
        log: `👁️ The party drinks the Potion of Clairvoyance! Hidden secrets, concealed doors, and subterranean hazards are revealed in the mind's eye!`
      };
    }

    if (def.useEffect === 'levitation') {
      if (!hero) return { success: false, reason: 'Choose an ally to drink the potion.' };
      this.removePartyItem(state, itemName, 1);
      hero.isLevitating = 30;
      return {
        success: true,
        log: `🪶 ${hero.name} drinks the Potion of Levitation and drifts weightlessly above the ground! (Immune to pit traps and floor pressure plates for 30 turns).`
      };
    }

    if (def.useEffect === 'diminution') {
      if (!hero) return { success: false, reason: 'Choose an ally to drink the potion.' };
      this.removePartyItem(state, itemName, 1);
      hero.isStealth = true;
      hero.isDiminished = 30;
      return {
        success: true,
        log: `🔍 ${hero.name} drinks the Potion of Diminution and shrinks to 6 inches tall! (Evasion and stealth enabled for 30 turns).`
      };
    }

    if (def.useEffect === 'holy_water') {
      if (!hero) return { success: false, reason: 'Choose a hero to apply the blessing.' };
      this.removePartyItem(state, itemName, 1);
      if (hero.classKey === 'cleric') {
        hero.divineFavor = Math.min(hero.maxDivineFavor || 100, (hero.divineFavor || 0) + 8);
        if (hero.divineFavor > 0) hero.absoluteSilence = false;
        if (typeof state.syncClericEthos === 'function') {
          state.syncClericEthos(hero);
        }
        return { success: true, log: `${hero.name} anoints themselves with Holy Water. Divine Favor rises (+8).` };
      }
      hero.tempAttackBonus = (hero.tempAttackBonus || 0) + 1;
      hero.tempAttackRounds = Math.max(hero.tempAttackRounds || 0, 3);
      return { success: true, log: `${hero.name} is blessed with Holy Water (+1 to hit for a short time).` };
    }

    if (def.useEffect === 'light') {
      this.removePartyItem(state, itemName, 1);
      state.torchLitUntil = Math.max(Date.now(), state.torchLitUntil || 0) + 60 * 60 * 1000;
      state.isDirty = true;
      return { success: true, useEffect: 'light', log: `🔥 A torch is lit! Warm, flickering flames push back the dungeon darkness for 60 minutes (60 steps / 6 exploration turns).` };
    }

    if (def.useEffect === 'repair_tools') {
      const thief = state.party.find(p => p.classKey === 'thief');
      if (!thief) return { success: false, reason: 'No thief in the party.' };
      if ((thief.toolsDurability || 0) >= 100) return { success: false, reason: 'Tools are already in perfect condition.' };
      
      const hasTools = this.getPartyItemQty(state, 'Thief Tools') > 0;
      if (!hasTools) return { success: false, reason: 'No spare Thief Tools available in any hero pack.' };
      
      this.removePartyItem(state, 'Thief Tools', 1);
      thief.toolsDurability = 100;
      return { success: true, log: `${thief.name} refits a fresh set of tools. Durability restored to 100%.` };
    }
    return { success: false, reason: 'Unknown use effect.' };
  }

  /**
   * Temple Sanctuary Resuscitation: Cures an incapacitated ally for 100 GP, restoring them to 1 HP.
   */
  static cureIncapacitatedHeroAtTemple(state, heroIndex) {
    const hero = state.party[heroIndex];
    if (!hero) return { success: false, reason: "Hero not found." };
    if (hero.hp > 0) return { success: false, reason: `${hero.name} is conscious and does not need temple resuscitation.` };
    if (hero.hp <= -10) return { success: false, reason: `${hero.name} is permanently dead (-10 HP). Their soul has crossed the veil beyond standard temple care.` };

    const goldQty = this.getPartyGold(state);
    const COST = 100;
    if (goldQty < COST) {
      return { success: false, reason: `Insufficient gold for temple cure. Requires 100 GP (You have ${goldQty} GP).` };
    }

    this.spendGold(state, COST);
    hero.hp = 1; // Restored with 1 HP per AD&D rules

    return {
      success: true,
      heroName: hero.name,
      hp: hero.hp,
      maxHp: hero.maxHp,
      cost: COST,
      remainingGold: this.getPartyGold(state),
      log: `✨ Temple Resuscitation: The priests consecrate ${hero.name}'s wounds with sacred balm and prayers (-100 GP). Revived with 1 HP!`
    };
  }

  /**
   * Checks whether the party is within trading range of an adventure shop tile.
   */
  static isNearShop(state) {
    const shop = state.spec.shop;
    if (!shop || !shop.tile) return false;
    const [sx, sy] = shop.tile;
    const r = shop.radius != null ? shop.radius : 1;
    return Math.abs(state.player.x - sx) + Math.abs(state.player.y - sy) <= r;
  }

  /**
   * Returns the adventure shop tile coordinate if defined.
   */
  static getShopTile(state) {
    return (state.spec.shop && state.spec.shop.tile) ? state.spec.shop.tile : null;
  }

  /**
   * Sells an item from a hero's personal inventory at fair market value.
   */
  static sellItem(state, itemName, qty = 1, heroIndex = null, getDexDefensiveAdjustmentFn) {
    const def = ItemCatalog.getItemDef(itemName, state.spec);
    if (!def) return { success: false, reason: `Unknown item: ${itemName}` };
    if (def.kind === 'quest') return { success: false, reason: `"${itemName}" is an essential quest artifact and cannot be sold!` };
    if (def.kind === 'currency') return { success: false, reason: "Cannot sell coin currency." };

    let unitPrice = 0;
    if (def.kind === 'treasure' || def.kind === 'gem') {
      unitPrice = def.price || 30; // Full appraised treasure value
    } else {
      unitPrice = Math.max(1, Math.floor((def.price || 2) * 0.5)); // 50% for standard gear and provisions
    }

    const totalEarned = unitPrice * qty;
    let hero = null;
    if (heroIndex != null && heroIndex >= 0 && state.party[heroIndex]) {
      hero = state.party[heroIndex];
    } else {
      const carrier = this.findHeroCarryingItem(state, itemName);
      if (carrier) hero = carrier.hero;
    }

    if (!hero) {
      return { success: false, reason: `No hero carries ${itemName}.` };
    }

    const inv = hero.personalInventory || hero.inventory || [];
    const itemSlot = inv.find(i => (typeof i === 'string' ? i === itemName : i && i.name === itemName));
    if (!itemSlot) {
      return { success: false, reason: `${hero.name} does not have ${itemName} in their personal inventory.` };
    }

    const currentAmt = typeof itemSlot === 'string' ? 1 : (itemSlot.amount ?? itemSlot.count ?? 1);
    if (currentAmt < qty) {
      return { success: false, reason: `Not enough ${itemName} to sell.` };
    }

    if (typeof itemSlot === 'object') {
      const qtyKey = itemSlot.amount !== undefined ? 'amount' : 'count';
      itemSlot[qtyKey] = currentAmt - qty;
      if (itemSlot.count !== undefined && itemSlot.amount !== undefined) itemSlot.count = itemSlot[qtyKey];
      if (itemSlot[qtyKey] <= 0) {
        hero.personalInventory = inv.filter(i => i !== itemSlot);
        hero.inventory = hero.personalInventory;
      }
    } else {
      hero.personalInventory = inv.filter(i => i !== itemSlot);
      hero.inventory = hero.personalInventory;
    }

    // If hero has this weapon/armor/shield equipped and has no more in inventory, unequip it
    if (hero.equippedWeapon === itemName) {
      const stillHas = (hero.personalInventory || []).some(i => (typeof i === 'string' ? i === itemName : i.name === itemName));
      if (!stillHas) {
        hero.equippedWeapon = null;
      }
    }
    if (hero.equippedArmor && hero.equippedArmor.name === itemName) {
      const stillHas = (hero.personalInventory || []).some(i => (typeof i === 'string' ? i === itemName : i.name === itemName));
      if (!stillHas) {
        hero.equippedArmor = null;
        this.recalculateHeroAC(hero, getDexDefensiveAdjustmentFn);
      }
    }
    if (hero.equippedShield && hero.equippedShield.name === itemName) {
      const stillHas = (hero.personalInventory || []).some(i => (typeof i === 'string' ? i === itemName : i.name === itemName));
      if (!stillHas) {
        hero.equippedShield = null;
        this.recalculateHeroAC(hero, getDexDefensiveAdjustmentFn);
      }
    }
    if (hero.equippedBoots && hero.equippedBoots.name === itemName) {
      const stillHas = (hero.personalInventory || []).some(i => (typeof i === 'string' ? i === itemName : i.name === itemName));
      if (!stillHas) {
        hero.equippedBoots = null;
        this.recalculateHeroAC(hero, getDexDefensiveAdjustmentFn);
      }
    }
    if (hero.equippedGloves && hero.equippedGloves.name === itemName) {
      const stillHas = (hero.personalInventory || []).some(i => (typeof i === 'string' ? i === itemName : i.name === itemName));
      if (!stillHas) {
        hero.equippedGloves = null;
      }
    }

    state.partyGold = (state.partyGold || 0) + totalEarned;
    return {
      success: true,
      itemName,
      qty,
      unitPrice,
      totalEarned,
      fromSource: hero.name,
      heroName: hero.name
    };
  }

  /**
   * Purchases an item from a merchant, delivering into a hero's personalInventory.
   */
  static buyItem(state, itemName, qty = 1, heroIndex = null) {
    const def = ItemCatalog.getItemDef(itemName, state.spec);
    if (!def) return { success: false, reason: `Unknown item: ${itemName}` };
    if (def.kind === 'currency') return { success: false, reason: 'Cannot buy gold with gold.' };

    const total = (def.price || 0) * qty;
    if (this.getPartyGold(state) < total) return { success: false, reason: `Not enough gold (need ${total} gp).` };
    if (!this.spendGold(state, total)) return { success: false, reason: 'Payment failed.' };

    let hero = null;
    if (itemName === 'Thief Tools') {
      hero = state.party.find(p => p.classKey === 'thief');
      if (!hero) {
        state.partyGold = (state.partyGold || 0) + total;
        return { success: false, reason: 'No rogue or thief in the party to utilize Thief Tools.' };
      }
    } else {
      hero = (heroIndex != null && state.party[heroIndex]) ? state.party[heroIndex] : (state.party.find(p => p.hp > 0) || state.party[0]);
    }
    if (!hero) {
      state.partyGold = (state.partyGold || 0) + total;
      return { success: false, reason: 'No hero to receive the item.' };
    }

    this.addItemToHero(hero, itemName, qty, state.spec);
    if (itemName === 'Thief Tools' && hero.classKey === 'thief') hero.toolsDurability = 100;
    return { success: true, total, destination: 'personal', heroName: hero.name };
  }

  /**
   * Transfers an item between two heroes in the party.
   * If the sending hero had the item equipped (weapon/armor/shield), it is safely unequipped.
   */
  static transferItemBetweenHeroes(state, fromHeroIndex, toHeroIndex, itemName, amount = 1, getDexDefensiveAdjustmentFn = null) {
    if (fromHeroIndex === toHeroIndex) {
      return { success: false, reason: "Cannot hand an item to the same hero." };
    }
    const fromHero = state.party[fromHeroIndex];
    const toHero = state.party[toHeroIndex];
    if (!fromHero || !toHero) {
      return { success: false, reason: "Invalid party member selected." };
    }
    if (toHero.hp <= -10) {
      return { success: false, reason: `${toHero.name} has fallen in death and cannot hold gear.` };
    }

    const fromInv = fromHero.personalInventory || fromHero.inventory || [];
    const itemSlot = fromInv.find(i => (typeof i === 'string' ? i === itemName : i && i.name === itemName));
    if (!itemSlot) {
      return { success: false, reason: `${fromHero.name} does not possess ${itemName}.` };
    }

    const currentQty = typeof itemSlot === 'string' ? 1 : (itemSlot.amount ?? itemSlot.count ?? 1);
    const transferQty = Math.min(currentQty, Math.max(1, amount));

    // Deduct from sender
    if (typeof itemSlot === 'object') {
      const qtyKey = itemSlot.amount !== undefined ? 'amount' : 'count';
      itemSlot[qtyKey] = currentQty - transferQty;
      if (itemSlot.count !== undefined && itemSlot.amount !== undefined) itemSlot.count = itemSlot[qtyKey];
      if (itemSlot[qtyKey] <= 0) {
        fromHero.personalInventory = fromInv.filter(i => i !== itemSlot);
        fromHero.inventory = fromHero.personalInventory;
      }
    } else {
      fromHero.personalInventory = fromInv.filter(i => i !== itemSlot);
      fromHero.inventory = fromHero.personalInventory;
    }

    // Unequip if sender was wielding/wearing it and has none left
    const senderStillHas = (fromHero.personalInventory || []).some(i => (typeof i === 'string' ? i === itemName : i.name === itemName));
    if (!senderStillHas) {
      if (fromHero.equippedWeapon === itemName) {
        fromHero.equippedWeapon = null;
      }
      if (fromHero.equippedArmor && fromHero.equippedArmor.name === itemName) {
        fromHero.equippedArmor = null;
        this.recalculateHeroAC(fromHero, getDexDefensiveAdjustmentFn);
      }
      if (fromHero.equippedShield && fromHero.equippedShield.name === itemName) {
        fromHero.equippedShield = null;
        this.recalculateHeroAC(fromHero, getDexDefensiveAdjustmentFn);
      }
      if (fromHero.equippedBoots && fromHero.equippedBoots.name === itemName) {
        fromHero.equippedBoots = null;
        this.recalculateHeroAC(fromHero, getDexDefensiveAdjustmentFn);
      }
      if (fromHero.equippedGloves && fromHero.equippedGloves.name === itemName) {
        fromHero.equippedGloves = null;
      }
    }

    // Add to recipient
    this.addItemToHero(toHero, itemName, transferQty, state.spec);

    return {
      success: true,
      fromHeroName: fromHero.name,
      toHeroName: toHero.name,
      itemName,
      qty: transferQty,
      log: `🤝 ${fromHero.name} handed ${transferQty > 1 ? `${transferQty}× ` : ''}${itemName} to ${toHero.name}.`
    };
  }
}
