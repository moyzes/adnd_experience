import { SpellRegistry } from '../spell_registry.js';
import { InventoryManager } from '../items/inventory_manager.js';
import { AlignmentManager } from '../characters/alignment_manager.js';

/**
 * RestManager handles Vancian spell study/memorization, Cleric divine favor
 * and prayer communion, dungeon rest cycles, campfire healing, hazard/ambush checks,
 * and exploration spellcasting.
 */
export class RestManager {
  /**
   * Resolves a full rest cycle for the entire party using living members' personal inventories.
   */
  static restParty(state) {
    // Find rations across living party members' personal inventories
    const carrier = InventoryManager.findHeroCarryingItem(state, i => {
      const name = ((typeof i === 'string' ? i : i?.name) || "").toLowerCase();
      return name.includes("ration") || name.includes("food");
    });

    if (!carrier) return { success: false, reason: "The party has no Rations left to camp!" };

    const { hero, item, inventory } = carrier;
    const qtyKey = item.amount !== undefined ? 'amount' : (item.count !== undefined ? 'count' : 'amount');
    const currentQty = item[qtyKey] !== undefined ? item[qtyKey] : 1;

    if (currentQty <= 1) {
      hero.personalInventory = inventory.filter(i => i !== item);
      hero.inventory = hero.personalInventory;
    } else {
      item[qtyKey] = currentQty - 1;
      if (item.count !== undefined && item.amount !== undefined) item.count = item.amount;
    }

    const recoveries = [];
    state.party.forEach(member => {
      if (member.hp <= 0) {
        recoveries.push({ name: member.name, hpGained: 0, note: 'stabilized only' });
        return;
      }

      const conBonus = Math.floor(((member.attributes && member.attributes.constitution) || 10) - 10) / 2;
      const base = Math.max(3, Math.floor(member.maxHp * 0.35));
      const gained = Math.max(2, Math.floor(base + conBonus));
      const before = member.hp;
      member.hp = Math.min(member.maxHp, member.hp + gained);

      member.tempAcBonus = 0; member.tempAcRounds = 0;
      member.tempAttackBonus = 0; member.tempAttackRounds = 0;

      if (member.classKey === 'mage') {
        member.cognition = member.maxCognition;
        member.hasStudiedSinceRest = false;
        if (member.tempIntDrain) {
          member.attributes.intelligence = (member.attributes.intelligence || 10) + member.tempIntDrain;
          member.tempIntDrain = 0;
        }
      }
      if (member.classKey === 'cleric') {
        member.divineFavor = Math.min(member.maxDivineFavor, (member.divineFavor || 0) + 12);
        if (member.divineFavor > 0) member.absoluteSilence = false;
        member.hasPrayedSinceRest = false;
        this.syncClericEthos(state, member);
      }

      recoveries.push({ name: member.name, hpGained: member.hp - before, hp: member.hp, maxHp: member.maxHp });
    });

    state.torchLitUntil = 0;
    state.lightSpellUntil = 0;
    state.totalExplorationMinutes = (state.totalExplorationMinutes || 0) + 480;
    state.isDirty = true;

    return { success: true, remainingRations: rationItem[qtyKey] || 0, recoveries };
  }

  /**
   * Spatial check for night ambushes during rest based on living enemy encounter proximity.
   */
  static checkRestAmbush(state) {
    const incomplete = (state.spec.encounters || []).filter(e => !e.completed);
    if (incomplete.length === 0) return null;

    const px = state.player.x, py = state.player.y;
    const nearby = incomplete.filter(e => Math.abs((e.x || 0) - px) + Math.abs((e.y || 0) - py) <= 4);

    const chance = nearby.length > 0 ? 35 : 12;
    if (Math.random() * 100 >= chance) return null;

    const pool = nearby.length > 0 ? nearby : incomplete;
    pool.sort((a, b) => (Math.abs(a.x - px) + Math.abs(a.y - py)) - (Math.abs(b.x - px) + Math.abs(b.y - py)));
    return pool[0];
  }

  /**
   * Calculates moral tax / divine favor adjustments for party dialogue choices and actions.
   */
  static applyMoralTax(state, baseTax, activeSpeaker, customMultiplier = null) {
    if (!baseTax || baseTax === 0) return;

    // Convert moral tax into 2D alignment vector and evaluate against party and deity ethos
    const orderDelta = baseTax > 0 ? Math.max(1, Math.round(baseTax * 0.4)) : Math.min(-1, Math.round(baseTax * 0.4));
    const moralityDelta = baseTax > 0 ? Math.max(1, Math.round(baseTax * 0.6)) : Math.min(-1, Math.round(baseTax * 0.6));
    const tags = baseTax > 0
      ? ['mercy', 'heal_wounded', 'uphold_law', 'relieve_suffering', 'nurture_life']
      : ['cruelty', 'ruthless_dominance', 'instill_fear', 'extortion', 'eliminate_rival'];

    AlignmentManager.recordMoralAction(state, activeSpeaker, {
      orderDelta,
      moralityDelta,
      reason: baseTax > 0 ? 'Virtuous conduct' : 'Ruthless transgression',
      tags,
      isClericDirect: (activeSpeaker && activeSpeaker.classKey === 'cleric')
    });
  }

  /**
   * Directly modifies a Cleric's Divine Favor pool and synchronizes their communion threshold ethos.
   */
  static modifyDivineFavor(state, delta) {
    const cleric = state.party.find(p => p.classKey === 'cleric');
    if (!cleric) return;
    cleric.divineFavor = Math.max(0, Math.min(cleric.maxDivineFavor, cleric.divineFavor + delta));
    this.syncClericEthos(state, cleric);
  }

  /**
   * Synchronizes the Cleric's ethos description with divine favor thresholds.
   */
  static syncClericEthos(state, cleric) {
    if (!cleric) return;
    const concordance = AlignmentManager.calculateEthosConcordance(cleric);
    if (concordance) {
      cleric.ethosStatus = `${concordance.statusLabel} (${concordance.deity.name})`;
      cleric.ethosConcordance = concordance.concordancePct;
    } else {
      const thresholds = state.classesSpec?.archetypes?.cleric?.divine_favor?.thresholds || [
        { min: 75, max: 100, status: "Full Communion" },
        { min: 25, max: 74, status: "Strained Communion" },
        { min: 1, max: 24, status: "Faltering Link" },
        { min: 0, max: 0, status: "Absolute Silence" }
      ];
      const current = thresholds.find(t => cleric.divineFavor >= t.min && cleric.divineFavor <= t.max);
      if (current) cleric.ethosStatus = current.status;
    }
  }

  /**
   * Cleric commits prayers during divine petitioning/communion.
   */
  static studyClericPrayers(state) {
    const cleric = state.party.find(p => p.classKey === 'cleric');
    if (!cleric) return { success: false, reason: "No cleric in party." };
    if (state.combat && state.combat.active) return { success: false, reason: "Cannot petition during combat!" };
    if (cleric.divineFavor <= 0 || cleric.absoluteSilence) return { success: false, reason: "Absolute Silence — the deity does not answer." };
    if (!cleric.spells.some(s => s.spent)) return { success: false, reason: "Today's prayers are already granted and held." };

    let restored = 0;
    if (cleric.divineFavor < 25) {
      const spent = cleric.spells.filter(s => s.spent);
      const allow = Math.max(1, Math.ceil(spent.length / 2));
      spent.slice(0, allow).forEach(s => { s.spent = false; restored++; });
    } else {
      cleric.spells.forEach(s => { if (s.spent) { s.spent = false; restored++; } });
    }
    cleric.hasPrayedSinceRest = true;
    this.syncClericEthos(state, cleric);
    return { success: true, restored, status: cleric.ethosStatus, divineFavor: cleric.divineFavor };
  }

  /**
   * Invokes an out-of-combat exploration prayer for the Cleric.
   */
  static castClericPrayer(state, spellIndex, targetHeroIndex = null) {
    const cleric = state.party.find(p => p.classKey === 'cleric');
    if (!cleric) return { success: false, reason: "No cleric in party." };
    if (cleric.hp <= 0) return { success: false, reason: "The cleric is incapacitated and cannot invoke prayers." };
    if (cleric.divineFavor <= 0 || cleric.absoluteSilence) return { success: false, reason: "Absolute Silence — no divine power flows." };
    if (!cleric.spells[spellIndex] || cleric.spells[spellIndex].spent) return { success: false, reason: "That prayer was already invoked today." };

    const spell = cleric.spells[spellIndex];
    return SpellRegistry.resolveExplorationSpell(cleric, spell, {
      party: state.party,
      targetHeroIndex,
      state: state
    });
  }

  /**
   * Casts an out-of-combat exploration spell for the Mage.
   */
  static castMageSpell(state, spellIndex) {
    const mage = state.party.find(p => p.classKey === 'mage');
    if (!mage) return { success: false, reason: "No mage in party." };
    if (mage.hp <= 0) return { success: false, reason: "The mage is incapacitated!" };
    if (!mage.spells[spellIndex] || mage.spells[spellIndex].spent) return { success: false, reason: "Spell already spent or invalid!" };

    const spell = mage.spells[spellIndex];
    const res = SpellRegistry.resolveExplorationSpell(mage, spell, {
      party: state.party,
      targetHeroIndex: null,
      state: state
    });

    if (res.success) {
      // No burden refund. Spent construct still occupies capacity until rest.
      return {
        ...res,
        currentCognition: mage.cognition,
        log: res.log
          ? `${res.log} The construct is gone; its burden remains until rest.`
          : `✨ ${mage.name} releases ${spell.name}! The construct is gone; its burden remains until rest.`
      };
    }

    return res;
  }

  /**
   * Mage studies grimoire to seat spell constructs into cognition.
   */
  static studyGrimoire(state, targetSpellIndex = null) {
    const mage = state.party.find(p => p.classKey === 'mage');
    if (!mage) return { success: false, reason: "No mage in party." };
    if (state.combat && state.combat.active) return { success: false, reason: "Cannot study the grimoire during combat!" };

    // Synchronize spells array with grimoire if needed
    if (mage.grimoire && Array.isArray(mage.grimoire)) {
      if (!mage.spells) mage.spells = [];
      mage.grimoire.forEach(gSpell => {
        if (!mage.spells.some(s => s.id === gSpell.id)) {
          mage.spells.push({ ...gSpell, spent: true });
        }
      });
    }

    let toMemorize = [];
    let skipped = [];

    if (targetSpellIndex !== null && targetSpellIndex !== undefined) {
      const sp = mage.spells[targetSpellIndex];
      if (!sp) return { success: false, reason: "Spell construct not found in grimoire." };
      if (!sp.spent) return { success: false, reason: `${sp.name} is already memorized in active mind.` };
      
      const load = sp.cognitive_load || 20;
      const currentCognition = mage.cognition !== undefined ? mage.cognition : (mage.maxCognition || 100);
      if (load > currentCognition) {
        return {
          success: false,
          reason: `Insufficient cognitive capacity (${currentCognition} remaining, ${load} required). Seating ${sp.name} would exceed your mind's limits. Rest to clear mental strain before seating more formulas.`
        };
      }
      toMemorize = [sp];
    } else {
      const unmemorized = mage.spells.filter(s => s.spent);
      if (unmemorized.length === 0) return { success: false, reason: "All prepared constructs from the grimoire are already held in mind." };

      const zone = state.getCurrentZone ? state.getCurrentZone() : 'dungeon';
      const inField = zone !== 'town';
      if (inField && unmemorized.length > 1) {
        return {
          success: false,
          reason: "In the field, seat one formula at a time. Study All is for sanctuary."
        };
      }

      // Safe Vancian memory seating:
      // Fill active cognition up to the 100 capacity threshold without lethal brain burn
      let availableCognition = mage.cognition !== undefined ? mage.cognition : (mage.maxCognition || 100);
      for (const sp of unmemorized) {
        const load = sp.cognitive_load || 20;
        if (load <= availableCognition) {
          toMemorize.push(sp);
          availableCognition -= load;
        } else {
          skipped.push(sp);
        }
      }

      if (toMemorize.length === 0) {
        const minReq = Math.min(...unmemorized.map(s => s.cognitive_load || 20));
        return {
          success: false,
          reason: `No additional formulas fit in active memory (${mage.cognition || 0} Cognition available, next requires ${minReq}). Rest to clear mental strain before seating further spells.`
        };
      }
    }

    const minutes = toMemorize.reduce((sum, s) => sum + 10 * Math.max(1, s.level || s.tier || 1), 0);
    const turnResult = state.advanceExplorationTurn(minutes, "Study Grimoire", false);

    const cognitiveCost = toMemorize.reduce((sum, s) => sum + (s.cognitive_load || 20), 0);
    let brainBurnDamage = 0;
    let intBruise = false;
    const currentCog = mage.cognition !== undefined ? mage.cognition : (mage.maxCognition || 100);
    const overflow = Math.max(0, cognitiveCost - currentCog);

    if (overflow > 0) {
      brainBurnDamage = overflow;
      mage.cognition = 0;
      mage.hp = Math.max(0, mage.hp - brainBurnDamage);
      if (!mage.tempIntDrain) {
        mage.tempIntDrain = 1;
        mage.attributes.intelligence = Math.max(3, (mage.attributes.intelligence || 10) - 1);
        intBruise = true;
      }
      if (mage.hp <= 0) {
        return {
          success: false,
          reason: `${mage.name} collapses mid-formula. The construct was not seated.`,
          brainBurnDamage,
          intBruise,
          minutes,
          turnResult,
          collapsed: true,
          currentCognition: mage.cognition,
          mageHp: mage.hp
        };
      }
    } else {
      mage.cognition = Math.max(0, currentCog - cognitiveCost);
    }

    toMemorize.forEach(s => { s.spent = false; });
    mage.hasStudiedSinceRest = true;

    return {
      success: true,
      cognitiveCost,
      brainBurnDamage,
      intBruise,
      minutes,
      turnResult,
      rememorized: toMemorize.map(s => s.name),
      skipped: skipped.map(s => s.name),
      currentCognition: mage.cognition,
      mageHp: mage.hp
    };
  }

  /**
   * Sums the total cognitive capacity consumed by active (unspent) memorized spells.
   */
  static getCognitiveLoad(hero) {
    if (!hero || hero.classKey !== 'mage' || !hero.spells) return 0;
    return hero.spells.reduce((acc, s) => acc + (s.spent ? 0 : (s.cognitive_load || 20)), 0);
  }
}
