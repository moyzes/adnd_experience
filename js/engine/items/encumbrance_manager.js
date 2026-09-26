import { ItemCatalog } from './item_catalog.js';

/**
 * EncumbranceManager calculates carry capacity, personal gear load, shared party load,
 * and resulting encumbrance tiers for heroes and the adventuring party under AD&D 2e rules.
 *
 * The party does NOT average encumbrance: the single slowest / most severe tier among
 * all living party members sets the marching pace for the entire party.
 */
export class EncumbranceManager {
  /**
   * Calculates STR-based carry capacity for a hero.
   * Formula: capacity = (15 + (strength - 10)) * 2, floored at a minimum of 10.
   * Accepts either a hero object or a numeric strength value.
   *
   * Sanity Check:
   * A STR-13 Fighter wearing Chain Mail (15) + Small Shield (3) + Longsword (4) = 22 Load
   * has capacity = (15 + (13 - 10)) * 2 = 36.
   * Load ratio: 22 / 36 = 61.1% of capacity (Unencumbered, within the 60–75% target range).
   */
  static getCapacity(heroOrStrength) {
    let strength = 10;
    if (typeof heroOrStrength === 'number') {
      strength = heroOrStrength;
    } else if (heroOrStrength && heroOrStrength.attributes && typeof heroOrStrength.attributes.strength === 'number') {
      strength = heroOrStrength.attributes.strength;
    }
    if (heroOrStrength && typeof heroOrStrength === 'object' && heroOrStrength.equippedGloves && (heroOrStrength.equippedGloves.strengthSet || heroOrStrength.equippedGloves.name?.toLowerCase().includes('ogre'))) {
      strength = Math.max(strength, heroOrStrength.equippedGloves.strengthSet || 18);
    }
    const raw = (15 + (strength - 10)) * 2;
    return Math.max(10, raw);
  }

  /**
   * Sums the personal weight of a hero's equipped weapon, armor, shield, boots, gloves,
   * and any items they carry individually in their personal pack (personalInventory).
   */
  static getHeroPersonalLoad(hero) {
    if (!hero) return 0;
    let personalLoad = 0;

    // 1. Equipped Weapon
    if (hero.equippedWeapon) {
      const def = ItemCatalog.getItemDef(hero.equippedWeapon);
      if (def && typeof def.weight === 'number') {
        personalLoad += def.weight;
      }
    }

    // 2. Equipped Armor
    if (hero.equippedArmor && hero.equippedArmor.name && hero.equippedArmor.name !== 'None (Unarmored)') {
      const def = ItemCatalog.getItemDef(hero.equippedArmor.name);
      if (def && typeof def.weight === 'number') {
        personalLoad += def.weight;
      } else if (typeof hero.equippedArmor.weight === 'number') {
        personalLoad += hero.equippedArmor.weight;
      }
    }

    // 3. Equipped Shield
    if (hero.equippedShield && hero.equippedShield.name && hero.equippedShield.name !== 'none' && !hero.equippedShield.name.startsWith('None')) {
      const def = ItemCatalog.getItemDef(hero.equippedShield.name);
      if (def && typeof def.weight === 'number') {
        personalLoad += def.weight;
      } else if (typeof hero.equippedShield.weight === 'number') {
        personalLoad += hero.equippedShield.weight;
      }
    }

    // 4. Equipped Boots
    if (hero.equippedBoots && hero.equippedBoots.name) {
      const def = ItemCatalog.getItemDef(hero.equippedBoots.name);
      if (def && typeof def.weight === 'number') {
        personalLoad += def.weight;
      }
    }

    // 5. Equipped Gloves
    if (hero.equippedGloves && hero.equippedGloves.name) {
      const def = ItemCatalog.getItemDef(hero.equippedGloves.name);
      if (def && typeof def.weight === 'number') {
        personalLoad += def.weight;
      }
    }

    // 4. Items in hero's personal inventory
    const personalItems = hero.personalInventory || hero.inventory;
    if (Array.isArray(personalItems)) {
      for (const item of personalItems) {
        if (!item) continue;
        const name = typeof item === 'string' ? item : item.name;
        const qty = typeof item === 'object' ? (item.amount ?? item.count ?? 1) : 1;
        const itemObjWeight = (typeof item === 'object' && typeof item.weight === 'number') ? item.weight : null;
        const def = ItemCatalog.getItemDef(name);
        const w = itemObjWeight != null ? itemObjWeight : (def && def.weight != null ? def.weight : 1);
        personalLoad += w * qty;
      }
    }

    return personalLoad;
  }

  /**
   * Calculates shared party burden (party treasury coins + downed ally surcharge).
   * Note: With the removal of the shared state.inventory array, all carried items,
   * provisions, and equipment reside directly in heroes' personal inventories.
   */
  static getPartySharedLoad(state) {
    if (!state) return 0;
    let sharedLoad = 0;

    // Party Gold weight (100 coins = 1 lb, so weight = 0.01 per GP)
    const partyGold = (typeof state.partyGold === 'number') ? state.partyGold : 0;
    if (partyGold > 0) {
      sharedLoad += (partyGold * 0.01);
    }

    // Downed ally surcharge: carrying an unconscious or fallen comrade adds 10 Load to shared burden
    if (Array.isArray(state.party)) {
      const livingCount = state.party.filter(p => p && p.hp > 0).length;
      if (livingCount > 0) {
        const downedAllies = state.party.filter(p => p && p.hp <= 0 && p.hp > -10).length;
        if (downedAllies > 0) {
          sharedLoad += (downedAllies * 10);
        }
      }
    }

    return sharedLoad;
  }

  /**
   * Calculates a hero's total load: their personal load plus an even split
   * of getPartySharedLoad() across all currently living party members (hp > 0).
   * If the party has 1 living member, they carry 100% of the shared load.
   * Accepts (hero, state) or (state, hero).
   */
  static getHeroTotalLoad(arg1, arg2) {
    const hero = (arg1 && arg1.attributes) ? arg1 : (arg2 && arg2.attributes ? arg2 : arg1);
    const state = (arg1 && Array.isArray(arg1.party)) ? arg1 : (arg2 && Array.isArray(arg2.party) ? arg2 : null);

    if (!hero) return 0;
    const personalLoad = this.getHeroPersonalLoad(hero);
    if (!state || !Array.isArray(state.party)) return personalLoad;

    const livingMembers = state.party.filter(p => p && p.hp > 0);
    const livingCount = Math.max(1, livingMembers.length);
    const sharedLoad = this.getPartySharedLoad(state);
    const sharedShare = sharedLoad / livingCount;

    return personalLoad + sharedShare;
  }

  /**
   * Computes the load ratio (totalLoad / capacity) for a specific hero and returns their tier.
   *
   * Tiers:
   * - unencumbered (ratio < 1.0):   timeMultiplier 0,    isLoud false, acPenalty 0, stealthLocked false
   * - burdened      (ratio 1.0–1.5): timeMultiplier 1,    isLoud true,  acPenalty 0, stealthLocked false
   * - overloaded    (ratio 1.5–2.0): timeMultiplier 2,    isLoud true,  acPenalty 1, stealthLocked true
   * - immobile      (ratio > 2.0):   timeMultiplier null, isLoud true,  acPenalty 1, stealthLocked true
   * Accepts (hero, state) or (state, hero).
   */
  static getTier(arg1, arg2) {
    const hero = (arg1 && arg1.attributes) ? arg1 : (arg2 && arg2.attributes ? arg2 : arg1);
    const state = (arg1 && Array.isArray(arg1.party)) ? arg1 : (arg2 && Array.isArray(arg2.party) ? arg2 : null);

    const totalLoad = this.getHeroTotalLoad(hero, state);
    const capacity = this.getCapacity(hero);
    const ratio = totalLoad / (capacity || 1);

    if (ratio > 2.0) {
      return {
        tier: 'immobile',
        timeMultiplier: null,
        isLoud: true,
        acPenalty: 1,
        stealthLocked: true,
        ratio,
        totalLoad,
        capacity
      };
    }
    if (ratio >= 1.5) {
      return {
        tier: 'overloaded',
        timeMultiplier: 2,
        isLoud: true,
        acPenalty: 1,
        stealthLocked: true,
        ratio,
        totalLoad,
        capacity
      };
    }
    if (ratio >= 1.0) {
      return {
        tier: 'burdened',
        timeMultiplier: 1,
        isLoud: true,
        acPenalty: 0,
        stealthLocked: false,
        ratio,
        totalLoad,
        capacity
      };
    }
    return {
      tier: 'unencumbered',
      timeMultiplier: 0,
      isLoud: false,
      acPenalty: 0,
      stealthLocked: false,
      ratio,
      totalLoad,
      capacity
    };
  }

  /**
   * Computes the party-wide encumbrance tier.
   * The party does NOT average encumbrance: compute getTier() for every living party member
   * and return the single MOST SEVERE tier among them (immobile > overloaded > burdened > unencumbered).
   */
  static getPartyTier(state) {
    const defaultTier = {
      tier: 'unencumbered',
      timeMultiplier: 0,
      isLoud: false,
      acPenalty: 0,
      stealthLocked: false,
      ratio: 0,
      totalLoad: 0,
      capacity: 10
    };

    if (!state || !Array.isArray(state.party) || state.party.length === 0) {
      return defaultTier;
    }

    const livingMembers = state.party.filter(p => p && p.hp > 0);
    const membersToCheck = livingMembers.length > 0 ? livingMembers : state.party;

    const SEVERITY_ORDER = ['immobile', 'overloaded', 'burdened', 'unencumbered'];

    let worstTier = null;
    let worstSeverityIndex = 999;

    for (const hero of membersToCheck) {
      const heroTier = this.getTier(hero, state);
      const severityIndex = SEVERITY_ORDER.indexOf(heroTier.tier);
      if (severityIndex !== -1 && severityIndex < worstSeverityIndex) {
        worstSeverityIndex = severityIndex;
        worstTier = heroTier;
      }
    }

    return worstTier || defaultTier;
  }
}
