import { ProgressionManager } from '../characters/progression_manager.js';
import { SpellRegistry } from '../spell_registry.js';

/**
 * ExplorationManager encapsulates dungeon time progression, wandering monster patrol checks,
 * rogue tradecraft (stealth, pickpocketing, locks, traps, scouting), obstacle bashing,
 * saving throw resolutions, and ancient rune decodation.
 */
export class ExplorationManager {
  /**
   * Advances exploration clock in 10-minute dungeon turns, updates light/torch durations,
   * and rolls for wandering monster patrols.
   */
  static advanceExplorationTurn(state, minutes = 10, sourceAction = "Exploration", isLoud = false) {
    if (state.combat && state.combat.inCombat) return;

    state.turnMinutes = (state.turnMinutes || 0) + minutes;
    const turnsPassed = Math.floor(state.turnMinutes / 10);
    state.turnMinutes = state.turnMinutes % 10;

    for (let t = 0; t < turnsPassed; t++) {
      state.turn = (state.turn || 0) + 1;

      // Update light source duration
      if (state.activeLightSource) {
        state.activeLightSource.duration = Math.max(0, (state.activeLightSource.duration || 0) - 1);
        if (state.activeLightSource.duration <= 0) {
          state.addLog(`🕯️ The party's ${state.activeLightSource.name} has flickered out! Darkness closes in.`, "warning");
          state.activeLightSource = null;
        }
      }

      // Check wandering monster encounters in dungeon levels (1-in-6 chance on d6 roll of 1)
      if (state.currentFloor !== 'town' && !state.isWildernessTile?.()) {
        const roll = Math.floor(Math.random() * 6) + 1;
        const threshold = isLoud ? 2 : 1; // Loud actions increase patrol probability
        if (roll <= threshold) {
          state.addLog("⚔️ Wandering Monster Patrol! Stalking denizens of the dungeon have spotted your party!", "danger");
          state.triggerRandomEncounter();
          return;
        }
      }
    }
  }

  /**
   * Attempt to pickpocket an NPC or merchant.
   */
  static attemptPickpocket(state, npc) {
    const thief = state.party.find(p => p.classKey === 'thief');
    if (!thief) {
      state.addLog("❌ You have no Rogue in the party to attempt a purse lift.", "warning");
      return { success: false, reason: "No thief" };
    }

    const targetVal = ProgressionManager.getSkillTarget(thief, 'pick_pockets');
    const roll = Math.floor(Math.random() * 100) + 1;
    const success = roll <= targetVal;

    if (success) {
      const goldStolen = Math.floor(Math.random() * 15) + 5;
      state.partyGold = (state.partyGold || 0) + goldStolen;
      state.addLog(`💰 ${thief.name} deftly cut the coin purse of ${npc.name || 'the mark'} (+${goldStolen} gp)! (Rolled ${roll} vs ${targetVal}%)`, "success");
      return { success: true, goldStolen };
    } else {
      state.addLog(`🚨 ${thief.name} was caught red-handed attempting to pickpocket! (Rolled ${roll} vs ${targetVal}%)`, "danger");
      return { success: false, caught: true };
    }
  }

  /**
   * Toggles thief stealth stance.
   */
  static attemptHideInShadows(state) {
    const thief = state.party.find(p => p.classKey === 'thief');
    if (!thief) {
      state.addLog("❌ Only Rogues can blend into deep dungeon shadows.", "warning");
      return { success: false, reason: "No thief" };
    }

    const targetVal = ProgressionManager.getSkillTarget(thief, 'hide_in_shadows');
    const roll = Math.floor(Math.random() * 100) + 1;
    const success = roll <= targetVal;

    thief.isStealth = success;
    if (success) {
      state.addLog(`🌑 ${thief.name} melted completely into the shadows. (Rolled ${roll} vs ${targetVal}%)`, "success");
    } else {
      state.addLog(`👀 ${thief.name} failed to find concealment in the lit passage. (Rolled ${roll} vs ${targetVal}%)`, "info");
    }
    return { success };
  }

  /**
   * Rogue scouts forward corridors.
   */
  static attemptScout(state) {
    const thief = state.party.find(p => p.classKey === 'thief');
    if (!thief) {
      state.addLog("❌ Only a Rogue can slip ahead to scout passages.", "warning");
      return { success: false, reason: "No thief" };
    }

    const targetVal = ProgressionManager.getSkillTarget(thief, 'hide_in_shadows');
    const roll = Math.floor(Math.random() * 100) + 1;
    const success = roll <= targetVal;

    if (success) {
      state.addLog(`👁️ ${thief.name} quietly scouted ahead: The forward corridor appears clear of immediate ambush. (Rolled ${roll} vs ${targetVal}%)`, "success");
      return { success: true, recon: "Corridor clear" };
    } else {
      state.addLog(`⚠️ ${thief.name}'s boots clattered on loose rubble while scouting! (Rolled ${roll} vs ${targetVal}%)`, "warning");
      this.advanceExplorationTurn(state, 10, "Scout stumble", true);
      return { success: false };
    }
  }

  /**
   * Passive auditory check for nearby monsters.
   */
  static checkPassiveHearNoise(state) {
    const thief = state.party.find(p => p.classKey === 'thief');
    if (!thief) return false;

    const targetVal = ProgressionManager.getSkillTarget(thief, 'hear_noise') || 25;
    const roll = Math.floor(Math.random() * 100) + 1;
    if (roll <= targetVal) {
      state.addLog(`👂 ${thief.name} hears muffled scraping footsteps through the stone wall ahead.`, "info");
      return true;
    }
    return false;
  }

  /**
   * Rogue stealth group bypass attempt.
   */
  static attemptSneakPastEncounter(state, encounter) {
    const thief = state.party.find(p => p.classKey === 'thief');
    if (!thief) return { success: false };

    const targetVal = ProgressionManager.getSkillTarget(thief, 'hide_in_shadows');
    const roll = Math.floor(Math.random() * 100) + 1;
    const success = roll <= targetVal;

    if (success) {
      state.addLog(`👣 ${thief.name} guided the party safely past the stalking monsters without alert!`, "success");
      return { success: true };
    } else {
      state.addLog(`💥 A party member tripped, breaking stealth and alerting the encounter!`, "danger");
      return { success: false };
    }
  }

  /**
   * Finds trap on targeted object or front tile.
   */
  static attemptFindTrap(state, target) {
    const thief = state.party.find(p => p.classKey === 'thief');
    if (!thief) {
      state.addLog("❌ Only a Rogue can meticulously inspect mechanisms for hidden traps.", "warning");
      return { success: false, reason: "No thief" };
    }

    const targetVal = ProgressionManager.getSkillTarget(thief, 'find_traps');
    const roll = Math.floor(Math.random() * 100) + 1;
    const success = roll <= targetVal;

    if (success) {
      state.addLog(`🔍 ${thief.name} successfully located and marked a concealed trap mechanism! (Rolled ${roll} vs ${targetVal}%)`, "success");
      return { success: true, trapFound: true };
    } else {
      state.addLog(`🔍 ${thief.name} inspected the area and detected no signs of tripwires or pressure plates. (Rolled ${roll} vs ${targetVal}%)`, "info");
      return { success: false, trapFound: false };
    }
  }

  /**
   * Disarms trap on targeted object or tile.
   */
  static attemptDisarmTrap(state, target) {
    const thief = state.party.find(p => p.classKey === 'thief');
    if (!thief) {
      state.addLog("❌ Only a Rogue possesses the delicate tools to disarm trap triggers.", "warning");
      return { success: false, reason: "No thief" };
    }

    const targetVal = ProgressionManager.getSkillTarget(thief, 'disarm_traps');
    const roll = Math.floor(Math.random() * 100) + 1;
    const success = roll <= targetVal;

    if (success) {
      state.addLog(`✂️ ${thief.name} cleanly wedged the firing pin and disabled the trap mechanism! (Rolled ${roll} vs ${targetVal}%)`, "success");
      return { success: true };
    } else {
      state.addLog(`💥 ${thief.name}'s pick slipped, accidentally springing the trap! (Rolled ${roll} vs ${targetVal}%)`, "danger");
      this.triggerTrap(state, target);
      return { success: false, triggered: true };
    }
  }

  /**
   * Resolves trap trigger consequences and saving throws.
   */
  static triggerTrap(state, trap) {
    const trapType = trap?.type || 'poison_dart';
    const damage = Math.floor(Math.random() * 8) + 4;

    state.addLog(`💥 TRAP SPRUNG! ${trap?.name || 'A concealed dungeon trap'} triggers!`, "danger");

    state.party.forEach(hero => {
      const saved = this.checkSavingThrow(hero, 'petrification_polymorph');
      const finalDmg = saved ? Math.floor(damage / 2) : damage;
      hero.hp = Math.max(0, hero.hp - finalDmg);
      state.addLog(`  - ${hero.name} took ${finalDmg} damage (${saved ? 'Made saving throw' : 'Failed saving throw'}).`, saved ? "info" : "danger");
    });
  }

  /**
   * Checks AD&D 2e character saving throw against a category.
   */
  static checkSavingThrow(hero, category = 'spell') {
    if (!hero || !hero.savingThrows) return false;
    const threshold = hero.savingThrows[category] || 15;
    const roll = Math.floor(Math.random() * 20) + 1;
    return roll >= threshold;
  }

  /**
   * Rogue lockpicking attempt.
   */
  static attemptPickLock(state, target) {
    const thief = state.party.find(p => p.classKey === 'thief');
    if (!thief) {
      state.addLog("❌ You have no Rogue in the party equipped to pick complex locks.", "warning");
      return { success: false, reason: "No thief" };
    }

    const targetVal = ProgressionManager.getSkillTarget(thief, 'pick_locks');
    const roll = Math.floor(Math.random() * 100) + 1;
    const success = roll <= targetVal;

    this.advanceExplorationTurn(state, 10, "Lockpick", false);

    if (success) {
      state.addLog(`🔓 ${thief.name} heard the tumblers click into place! Lock successfully picked. (Rolled ${roll} vs ${targetVal}%)`, "success");
      return { success: true };
    } else if (roll >= 96) {
      state.addLog(`🚫 Critical Failure! ${thief.name}'s pick snapped inside the keyway, jamming the lock permanently! (Rolled ${roll} vs ${targetVal}%)`, "danger");
      return { success: false, jammed: true };
    } else {
      state.addLog(`🔒 ${thief.name} worked the tumblers for 10 minutes but couldn't open the lock. (Rolled ${roll} vs ${targetVal}%)`, "warning");
      return { success: false };
    }
  }

  /**
   * Unlocks a target door or chest with a matching key.
   */
  static unlockTarget(state, target, keyUsed) {
    state.addLog(`🔑 The key smoothly turns in the lock mechanism.`, "success");
    return { success: true };
  }

  /**
   * Fighter force door / portcullis bash attempt.
   */
  static attemptBash(state, target) {
    const fighter = state.party.find(p => p.classKey === 'fighter') || state.party[0];
    const str = fighter?.attributes?.strength || 10;
    const baseChance = Math.min(6, Math.max(1, Math.floor(str / 3))); // 1-in-6 to 6-in-6
    const roll = Math.floor(Math.random() * 6) + 1;
    const success = roll <= baseChance;

    this.advanceExplorationTurn(state, 10, "Door Bash", true); // Loud noise attracts wandering monsters

    if (success) {
      state.addLog(`💥 ${fighter.name} slammed into the door with tremendous force, shattering the lock and hinges! (Rolled ${roll} on d6)`, "success");
      return { success: true };
    } else {
      state.addLog(`🛡️ ${fighter.name} slammed into the reinforced oak door, but the bar held firm! (Rolled ${roll} on d6)`, "warning");
      return { success: false };
    }
  }

  /**
   * Mage reads arcane runes or scrolls.
   */
  static attemptReadMagic(state, target) {
    const mage = state.party.find(p => p.classKey === 'mage');
    if (!mage) {
      state.addLog("❌ Only a Mage can decipher ancient arcane script and glyphs.", "warning");
      return { success: false, reason: "No mage" };
    }

    state.addLog(`📜 ${mage.name} carefully traced the glowing glyphs and translated the arcane text.`, "success");
    return { success: true, translation: "Deciphered arcane script" };
  }
}
