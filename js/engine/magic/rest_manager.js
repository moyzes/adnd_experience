import { SpellRegistry } from '../spell_registry.js';

/**
 * RestManager handles Vancian spell study/memorization, Cleric divine favor
 * and prayer communion, wilderness vs dungeon rest cycles, and campfire healing/hazard checks.
 */
export class RestManager {
  /**
   * Memorizes a specific spell into the Mage's active cognitive constructs.
   */
  static memorizeSpell(state, heroIndex, spellId) {
    const hero = state.party[heroIndex];
    if (!hero || hero.classKey !== 'mage') {
      return { success: false, reason: "Hero is not a Mage." };
    }

    const grimoireSpell = hero.grimoire?.find(s => s.id === spellId);
    if (!grimoireSpell) {
      return { success: false, reason: "Spell is not transcribed in this grimoire." };
    }

    const currentLoad = this.getCognitiveLoad(hero);
    const available = (hero.maxCognition || 100) - currentLoad;
    const required = grimoireSpell.cognitive_load || 20;

    if (required > available) {
      return { success: false, reason: `Insufficient cognitive capacity (${available} left, requires ${required}).` };
    }

    let unspentInstance = hero.spells.find(s => s.id === spellId && s.spent);
    if (unspentInstance) {
      unspentInstance.spent = false;
    } else {
      hero.spells.push({
        id: grimoireSpell.id,
        name: grimoireSpell.name,
        level: grimoireSpell.level || grimoireSpell.tier || 1,
        tier: grimoireSpell.tier || grimoireSpell.level || 1,
        cognitive_load: grimoireSpell.cognitive_load || 20,
        casting_time: grimoireSpell.casting_time || 'normal',
        target: grimoireSpell.target || 'single_enemy',
        effect: grimoireSpell.effect ? { ...grimoireSpell.effect } : null,
        description: grimoireSpell.description || '',
        sfx: grimoireSpell.sfx || 'magic_missile',
        spent: false
      });
    }

    state.addLog(`✨ ${hero.name} committed ${grimoireSpell.name} to active memory (Load: ${this.getCognitiveLoad(hero)}/${hero.maxCognition || 100}).`, "info");
    return { success: true };
  }

  /**
   * Unmemorizes / releases an active spell construct from memory to free cognitive load.
   */
  static unmemorizeSpell(state, heroIndex, spellIndex) {
    const hero = state.party[heroIndex];
    if (!hero || hero.classKey !== 'mage') {
      return { success: false, reason: "Hero is not a Mage." };
    }

    if (!hero.spells || !hero.spells[spellIndex]) {
      return { success: false, reason: "Spell construct not found." };
    }

    const removedSpell = hero.spells.splice(spellIndex, 1)[0];
    state.addLog(`💨 ${hero.name} released ${removedSpell.name} from memory (Load: ${this.getCognitiveLoad(hero)}/${hero.maxCognition || 100}).`, "info");
    return { success: true };
  }

  /**
   * Sums the total cognitive capacity consumed by active (unspent) memorized spells.
   */
  static getCognitiveLoad(hero) {
    if (!hero || hero.classKey !== 'mage' || !hero.spells) return 0;
    return hero.spells.reduce((acc, s) => acc + (s.spent ? 0 : (s.cognitive_load || 20)), 0);
  }

  /**
   * Cleric commits prayers during communion/rest.
   */
  static communePrayers(state, heroIndex, prayerIds) {
    const hero = state.party[heroIndex];
    if (!hero || hero.classKey !== 'cleric') {
      return { success: false, reason: "Hero is not a Cleric." };
    }

    hero.spells = [];
    prayerIds.forEach(id => {
      const spellDef = SpellRegistry.getSpell(id);
      if (spellDef) {
        hero.spells.push({
          id: spellDef.id,
          name: spellDef.name,
          level: spellDef.level || spellDef.tier || 1,
          target: spellDef.target || 'ally',
          effect: spellDef.effect ? { ...spellDef.effect } : null,
          description: spellDef.description || '',
          spent: false
        });
      }
    });

    hero.divineFavor = hero.maxDivineFavor || 100;
    hero.ethosStatus = "Full Communion";
    hero.hasPrayedSinceRest = true;
    state.addLog(`🙏 ${hero.name} renewed sacred communion with the Divine (+Favor restored, prayers prepared).`, "success");
    return { success: true };
  }

  /**
   * Resolves a full rest cycle for the entire party (Safe Inn, Camp, or Dungeon).
   */
  static restParty(state, isCamp = false) {
    // Check if in active combat
    if (state.combat && state.combat.inCombat) {
      state.addLog("❌ Cannot rest while in combat!", "warning");
      return { success: false, reason: "In combat" };
    }

    // Check dungeon rest hazard / ambush roll
    if (isCamp && state.currentFloor !== 'town' && Math.random() < 0.20) {
      state.addLog("⚠️ Night Ambush! The party's rest was interrupted by wandering dungeon stalkers!", "danger");
      state.triggerRandomEncounter();
      return { success: false, reason: "Ambushed during rest" };
    }

    // Advance game time
    state.turn += 48; // 8 hours of rest
    state.timeOfDay = (state.timeOfDay + 8) % 24;

    // Consume rations if in dungeon camp
    if (isCamp && state.currentFloor !== 'town') {
      let rationsConsumed = 0;
      state.party.forEach(hero => {
        const rationItem = hero.inventory?.find(i => i.name.toLowerCase().includes('ration'));
        if (rationItem && rationItem.amount > 0) {
          rationItem.amount -= 1;
          rationsConsumed++;
          if (rationItem.amount <= 0) {
            hero.inventory = hero.inventory.filter(i => i !== rationItem);
          }
        }
      });
      if (rationsConsumed > 0) {
        state.addLog(`🍖 Party consumed ${rationsConsumed} iron rations during camp.`, "info");
      }
    }

    // Restore Party Vitals & Resources
    state.party.forEach(hero => {
      // Natural HP healing (AD&D 2e: 1 HP/level per full rest, or full if safe inn)
      const hpRecovery = isCamp ? Math.max(2, hero.level * 2) : hero.maxHp;
      hero.hp = Math.min(hero.maxHp, hero.hp + hpRecovery);

      // Cleanse temporary status effects & debuffs
      hero.tempAcBonus = 0;
      hero.tempAcRounds = 0;
      hero.tempAcSource = null;
      hero.tempAttackBonus = 0;
      hero.tempAttackRounds = 0;

      // Mage: Restore cognition pool and study readiness
      if (hero.classKey === 'mage') {
        hero.cognition = hero.maxCognition || 100;
        hero.hasStudiedSinceRest = true;
        // Refresh prepared spells
        if (hero.spells) {
          hero.spells.forEach(s => { s.spent = false; });
        }
      }

      // Cleric: Restore Divine Favor & prayer slots
      if (hero.classKey === 'cleric') {
        hero.divineFavor = hero.maxDivineFavor || 100;
        hero.ethosStatus = "Full Communion";
        hero.hasPrayedSinceRest = true;
        if (hero.spells) {
          hero.spells.forEach(s => { s.spent = false; });
        }
      }

      // Thief: Reset stealth stance & tool durability maintenance
      if (hero.classKey === 'thief') {
        hero.isStealth = false;
      }
    });

    state.addLog(isCamp ? "⛺ The party finishes resting at camp. Health, spells, and divine favor restored." : "🛏️ The party awakens fully refreshed and restored from the Inn.", "success");
    return { success: true };
  }
}
