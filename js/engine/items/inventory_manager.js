import { ItemCatalog } from './item_catalog.js';

/**
 * InventoryManager handles party pack storage, hero equipment equipping/swapping,
 * ammunition tracking, consumable item usage, temple resuscitation, and shop transactions.
 */
export class InventoryManager {
  /**
   * Counts total ammunition available in personal hero inventory and shared party pack.
   */
  static getAmmoCount(state, ammoName, hero = null) {
    if (!ammoName) return 0;
    let count = this.getPartyItemQty(state, ammoName);
    if (hero && Array.isArray(hero.inventory)) {
      const personal = hero.inventory.find(i => (typeof i === 'string' ? i === ammoName : i && i.name === ammoName));
      if (personal) {
        count += personal.amount ?? personal.count ?? 1;
      }
    }
    return count;
  }

  /**
   * Consumes ammunition first from personal hero inventory, then from the shared party pack.
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
    if (hero && Array.isArray(hero.inventory)) {
      const personal = hero.inventory.find(i => (typeof i === 'string' ? i === ammoName : i && i.name === ammoName));
      if (personal) {
        const qty = personal.amount ?? personal.count ?? 1;
        if (qty <= toDeduct) {
          hero.inventory = hero.inventory.filter(i => i !== personal);
          toDeduct -= qty;
        } else {
          personal.amount = qty - toDeduct;
          toDeduct = 0;
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
   * Lists all valid weapons available for a hero to equip from equipped slot, personal pack, and party pack.
   */
  static getAvailableWeapons(state, heroIndex) {
    const hero = state.party[heroIndex];
    if (!hero) return [];
    const list = [];
    if (hero.equippedWeapon) {
      list.push({ name: hero.equippedWeapon, location: 'equipped', isEquipped: true });
    }
    if (Array.isArray(hero.inventory)) {
      hero.inventory.forEach(i => {
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
    if (Array.isArray(state.inventory)) {
      state.inventory.forEach(i => {
        const iName = typeof i === 'string' ? i : i?.name;
        if (!iName) return;
        if (ItemCatalog.isKnownWeapon(iName, state.spec)) {
          const chk = ItemCatalog.isClassAllowedItem(hero.classKey, iName);
          if (chk.allowed && !list.some(w => w.name === iName)) {
            list.push({ name: iName, location: 'party', isEquipped: false });
          }
        }
      });
    }
    return list;
  }

  /**
   * Swaps a hero's equipped weapon with another weapon from personal or party inventory.
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

    if (nextWeapon.location === 'personal') {
      const slot = hero.inventory.find(i => (typeof i === 'string' ? i === newWeapon : i && i.name === newWeapon));
      if (slot) {
        if ((slot.amount || 1) <= 1) hero.inventory = hero.inventory.filter(i => i !== slot);
        else slot.amount -= 1;
      }
      if (previousWeapon) {
        const prevSlot = hero.inventory.find(i => (typeof i === 'string' ? i === previousWeapon : i && i.name === previousWeapon));
        if (prevSlot) prevSlot.amount = (prevSlot.amount || 1) + 1;
        else hero.inventory.push({ name: previousWeapon, amount: 1 });
      }
    } else if (nextWeapon.location === 'party') {
      this.removePartyItem(state, newWeapon, 1);
      if (previousWeapon) {
        this.addPartyItem(state, previousWeapon, 1);
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

    const inv = hero.inventory || (hero.inventory = []);
    const slot = inv.find(i => i.name === weaponName);
    if (!slot || (slot.amount || 1) < 1) return { success: false, reason: `${hero.name} does not carry ${weaponName}.` };

    if ((slot.amount || 1) <= 1) hero.inventory = inv.filter(i => i !== slot);
    else slot.amount -= 1;

    if (hero.equippedWeapon) {
      const existing = hero.inventory.find(i => i.name === hero.equippedWeapon);
      if (existing) existing.amount = (existing.amount || 1) + 1;
      else hero.inventory.push({ name: hero.equippedWeapon, amount: 1 });
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

    const inv = hero.inventory || (hero.inventory = []);
    const slot = inv.find(i => i.name === armorName);
    if (!slot || (slot.amount || 1) < 1) return { success: false, reason: `${hero.name} does not carry ${armorName}.` };

    if ((slot.amount || 1) <= 1) hero.inventory = inv.filter(i => i !== slot);
    else slot.amount -= 1;

    if (hero.equippedArmor && hero.equippedArmor.name && hero.equippedArmor.name !== "None (Unarmored)") {
      const existing = hero.inventory.find(i => i.name === hero.equippedArmor.name);
      if (existing) existing.amount = (existing.amount || 1) + 1;
      else hero.inventory.push({ name: hero.equippedArmor.name, amount: 1 });
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

    const inv = hero.inventory || (hero.inventory = []);
    const slot = inv.find(i => i.name === shieldName);
    if (!slot || (slot.amount || 1) < 1) return { success: false, reason: `${hero.name} does not carry ${shieldName}.` };

    if ((slot.amount || 1) <= 1) hero.inventory = inv.filter(i => i !== slot);
    else slot.amount -= 1;

    if (hero.equippedShield && hero.equippedShield.name) {
      const existing = hero.inventory.find(i => i.name === hero.equippedShield.name);
      if (existing) existing.amount = (existing.amount || 1) + 1;
      else hero.inventory.push({ name: hero.equippedShield.name, amount: 1 });
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
   * Recalculates descending Armor Class (lower is better) based on armor base, shield, and DEX.
   */
  static recalculateHeroAC(hero, getDexDefensiveAdjustmentFn) {
    const baseArmorAc = hero.equippedArmor?.baseAc != null ? hero.equippedArmor.baseAc : 10;
    const shieldBonus = hero.equippedShield ? (hero.equippedShield.acBonus || 1) : 0;
    const dexMod = getDexDefensiveAdjustmentFn ? getDexDefensiveAdjustmentFn(hero.attributes?.dexterity) : 0;
    hero.armorClass = baseArmorAc - shieldBonus + dexMod;
    return hero.armorClass;
  }

  /**
   * Retrieves an item entry from the shared party pack.
   */
  static getPartyItem(state, name) {
    if (!state.inventory) state.inventory = [];
    return state.inventory.find(i => i.name === name) || null;
  }

  /**
   * Retrieves the quantity of an item in the shared party pack.
   */
  static getPartyItemQty(state, name) {
    const item = this.getPartyItem(state, name);
    return item ? (item.amount ?? item.count ?? 0) : 0;
  }

  /**
   * Retrieves the current party gold pieces.
   */
  static getPartyGold(state) {
    return this.getPartyItemQty(state, 'Gold Pieces');
  }

  /**
   * Adds an item into the shared party pack (or increments stack).
   */
  static addPartyItem(state, name, amount = 1) {
    if (!state.inventory) state.inventory = [];
    const def = ItemCatalog.getItemDef(name, state.spec);
    const qty = Math.max(1, amount | 0);
    const existing = this.getPartyItem(state, name);
    if (existing && (def ? def.stackable !== false : true)) {
      existing.amount = (existing.amount ?? existing.count ?? 0) + qty;
      if (existing.count !== undefined) existing.count = existing.amount;
      return existing;
    }
    const entry = { name, amount: qty };
    if (def && def.kind) entry.type = def.kind;
    state.inventory.push(entry);
    return entry;
  }

  /**
   * Removes an item quantity from the shared party pack.
   */
  static removePartyItem(state, name, amount = 1) {
    const item = this.getPartyItem(state, name);
    if (!item) return false;
    const qtyKey = item.amount !== undefined ? 'amount' : 'count';
    const have = item[qtyKey] ?? 0;
    if (have < amount) return false;
    item[qtyKey] = have - amount;
    if (item[qtyKey] <= 0) state.inventory = state.inventory.filter(i => i !== item);
    return true;
  }

  /**
   * Spends party gold pieces.
   */
  static spendGold(state, amount) {
    return this.removePartyItem(state, 'Gold Pieces', amount);
  }

  /**
   * Uses a consumable item (e.g. potion, torch, holy water, rations, thief tools).
   */
  static useConsumable(state, itemName, heroIndex = null) {
    const def = ItemCatalog.getItemDef(itemName, state.spec);
    if (!def || !def.usable) return { success: false, reason: `${itemName} cannot be used.` };
    if (this.getPartyItemQty(state, itemName) < 1) return { success: false, reason: `No ${itemName} left in the pack.` };
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
          : `${hero.name} drinks a Healing Potion and recovers ${actual} HP (${hero.hp}/${hero.maxHp}).`
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
      
      const personal = (thief.inventory || []).find(i => i.name === 'Thief Tools');
      const fromParty = this.getPartyItemQty(state, 'Thief Tools') > 0;
      
      if (!fromParty && !personal) return { success: false, reason: 'No spare Thief Tools available.' };
      
      if (fromParty) this.removePartyItem(state, 'Thief Tools', 1);
      else {
        if ((personal.amount || 1) <= 1) thief.inventory = thief.inventory.filter(i => i !== personal);
        else personal.amount -= 1;
      }
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

    this.removePartyItem(state, "Gold Pieces", COST);
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
   * Sells an item from party pack or personal hero inventory at fair market value.
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
    let fromSource = 'Party Pack';
    let heroName = '';

    if (heroIndex != null && heroIndex >= 0 && state.party[heroIndex]) {
      const hero = state.party[heroIndex];
      heroName = hero.name;
      fromSource = hero.name;
      if (!hero.inventory) hero.inventory = [];
      const itemSlot = hero.inventory.find(i => (typeof i === 'string' ? i === itemName : i.name === itemName));
      if (!itemSlot) return { success: false, reason: `${hero.name} does not have ${itemName} in their inventory.` };
      
      const currentAmt = typeof itemSlot === 'string' ? 1 : (itemSlot.amount || 1);
      if (currentAmt < qty) return { success: false, reason: `Not enough ${itemName} to sell.` };
      
      if (typeof itemSlot === 'object') {
        itemSlot.amount = currentAmt - qty;
        if (itemSlot.amount <= 0) {
          hero.inventory = hero.inventory.filter(i => i !== itemSlot);
        }
      } else {
        hero.inventory = hero.inventory.filter(i => i !== itemSlot);
      }

      // If hero has this weapon/armor/shield equipped and has no more in inventory, unequip it
      if (hero.equippedWeapon === itemName) {
        const stillHas = hero.inventory.some(i => (typeof i === 'string' ? i === itemName : i.name === itemName));
        if (!stillHas) {
          hero.equippedWeapon = null;
        }
      }
      if (hero.equippedArmor && hero.equippedArmor.name === itemName) {
        const stillHas = hero.inventory.some(i => (typeof i === 'string' ? i === itemName : i.name === itemName));
        if (!stillHas) {
          hero.equippedArmor = null;
          this.recalculateHeroAC(hero, getDexDefensiveAdjustmentFn);
        }
      }
      if (hero.equippedShield && hero.equippedShield.name === itemName) {
        const stillHas = hero.inventory.some(i => (typeof i === 'string' ? i === itemName : i.name === itemName));
        if (!stillHas) {
          hero.equippedShield = null;
          this.recalculateHeroAC(hero, getDexDefensiveAdjustmentFn);
        }
      }
    } else {
      // Selling from Party Pack
      const partyQty = this.getPartyItemQty(state, itemName);
      if (partyQty < qty) return { success: false, reason: `Party pack does not have ${qty}× ${itemName}.` };
      const ok = this.removePartyItem(state, itemName, qty);
      if (!ok) return { success: false, reason: `Could not remove ${itemName} from party pack.` };
    }

    this.addPartyItem(state, 'Gold Pieces', totalEarned);
    return {
      success: true,
      itemName,
      qty,
      unitPrice,
      totalEarned,
      fromSource,
      heroName
    };
  }

  /**
   * Purchases an item from a merchant, delivering to personal pack or shared party pack.
   */
  static buyItem(state, itemName, qty = 1, heroIndex = null) {
    const def = ItemCatalog.getItemDef(itemName, state.spec);
    if (!def) return { success: false, reason: `Unknown item: ${itemName}` };
    if (def.kind === 'currency') return { success: false, reason: 'Cannot buy gold with gold.' };

    const total = (def.price || 0) * qty;
    if (this.getPartyGold(state) < total) return { success: false, reason: `Not enough gold (need ${total} gp).` };
    if (!this.spendGold(state, total)) return { success: false, reason: 'Payment failed.' };

    if (def.scope === 'personal') {
      let hero = null;
      if (itemName === 'Thief Tools') {
        hero = state.party.find(p => p.classKey === 'thief');
        if (!hero) {
          this.addPartyItem(state, 'Gold Pieces', total);
          return { success: false, reason: 'No rogue or thief in the party to utilize Thief Tools.' };
        }
      } else {
        hero = heroIndex != null ? state.party[heroIndex] : (state.party.find(p => p.hp > 0) || state.party[0]);
      }
      if (!hero) {
        this.addPartyItem(state, 'Gold Pieces', total);
        return { success: false, reason: 'No hero to receive the item.' };
      }
      if (!hero.inventory) hero.inventory = [];
      const existing = hero.inventory.find(i => i.name === itemName);
      if (existing) {
        existing.amount = (existing.amount || 1) + qty;
      } else {
        hero.inventory.push({ name: itemName, amount: qty });
      }
      if (itemName === 'Thief Tools' && hero.classKey === 'thief') hero.toolsDurability = 100;
      return { success: true, total, destination: 'personal', heroName: hero.name };
    }

    this.addPartyItem(state, itemName, qty);
    return { success: true, total, destination: 'party' };
  }
}
