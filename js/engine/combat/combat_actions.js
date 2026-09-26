/**
 * CombatActions
 * Encapsulates the execution and resolution of individual hero and monster actions during a combat round:
 * - Melee attacks
 * - Ranged attacks (with ammo consumption)
 * - Backstab tradecraft
 * - Spells & Prayers (Vancian cognitive slots & divine petitions)
 * - Turn Undead divine channel
 * - Monster attacks against hero defensive layers (Dodge, Dexterity, Shield, Guard, Wards, Armor)
 * - Saving throws against special monster attacks (Poison, Petrification, Spells)
 */

import { CombatCalculator } from './combat_calculator.js';
import { SpellRegistry } from '../spell_registry.js';
import { GameState } from '../state.js';

export class CombatActions {
  /**
   * Resolves a hero's melee weapon strike.
   */
  static resolveHeroMelee(state, hero, target, simMobHp, combatEvents) {
    if (!state.canHeroMelee(hero)) {
      combatEvents.push({
        eventType: 'HERO_MISS',
        sourceName: hero.name,
        targetName: target.name,
        logText: `⚔️ ${hero.name} has no melee weapon ready — cannot strike!`,
        logType: 'warning'
      });
      return;
    }

    const roll = Math.floor(Math.random() * 20) + 1;
    const strVal = state.getEffectiveStrength ? state.getEffectiveStrength(hero) : (hero.attributes?.strength || 10);
    const glovesAtk = (hero.equippedGloves && hero.equippedGloves.attackBonus) || 0;
    const glovesDmg = (hero.equippedGloves && hero.equippedGloves.damageBonus) || 0;
    const bless = (hero.tempAttackBonus || 0) + glovesAtk;

    const mastery = state.getWeaponMastery(hero, hero.equippedWeapon);
    const targetNum = strVal + (hero.attackBonus || 1) + state.getLevelAttackBonus(hero) + mastery.atkBonus + bless;
    const dmgType = state.getWeaponDamageType(hero.equippedWeapon, 'slashing');
    const baseMaxDmg = state.getWeaponMaxDamage(hero.equippedWeapon, 8) || 8;
    const isFighterSpec = state.isHeroSpecialistWithEquipped(hero);
    const dmgBonus = mastery.dmgBonus + (hero.tempDamageBonus || 0) + glovesDmg;
    const maxWepDmg = baseMaxDmg + dmgBonus;

    if (roll <= targetNum && roll !== 20) {
      const weaponRoll = Math.floor(Math.random() * baseMaxDmg) + 1;
      const rawDmg = weaponRoll + dmgBonus;
      const netDmg = state.applyArmorMitigation(rawDmg, dmgType, target.armorType);
      simMobHp[target.instanceId] = Math.max(0, simMobHp[target.instanceId] - netDmg);
      const isDead = simMobHp[target.instanceId] <= 0;
      if (isDead) {
        target.hp = 0;
        target.surrendered = false;
        target.slain = true;
        target.moraleStatus = 'DEAD';
      }

      state.trackWeaponUsage(hero, hero.equippedWeapon);

      const outcome = state.evaluateAttackOutcome({
        attackerName: hero.name,
        targetName: target.name,
        weaponName: hero.equippedWeapon || 'Blade',
        dmgType: dmgType,
        attackMode: 'melee',
        roll: roll,
        targetNum: targetNum,
        rawDmg: rawDmg,
        netDmg: netDmg,
        maxDamage: maxWepDmg,
        isDead: isDead,
        isBoss: !!(target.isBoss || target.hp > 20),
        isSpecialist: isFighterSpec
      });

      combatEvents.push({
        eventType: 'MONSTER_HIT',
        sourceName: hero.name,
        targetInstanceId: target.instanceId,
        targetName: target.name,
        damage: netDmg,
        isDead: isDead,
        attackMode: 'melee',
        cueBadge: outcome.cueBadge,
        cueClass: outcome.cueClass,
        isMasterstroke: outcome.isMasterstroke,
        masterstrokeFeat: outcome.masterstrokeFeat,
        logText: outcome.logText,
        logType: outcome.logType
      });
    } else {
      const missOutcome = state.evaluateHeroMissOutcome({
        attackerName: hero.name,
        targetName: target.name,
        weaponName: hero.equippedWeapon || 'Blade',
        attackMode: 'melee',
        roll: roll,
        targetArmorType: target.armorType
      });

      combatEvents.push({
        eventType: 'HERO_MISS',
        sourceName: hero.name,
        targetName: target.name,
        attackMode: 'melee',
        cueBadge: missOutcome.cueBadge,
        cueClass: missOutcome.cueClass,
        missLayer: missOutcome.missLayer,
        logText: missOutcome.logText,
        logType: missOutcome.logType
      });
    }
  }

  /**
   * Resolves a hero's ranged projectile strike with ammunition consumption.
   */
  static resolveHeroRanged(state, hero, heroIndex, target, simMobHp, combatEvents) {
    const ammoType = state.getWeaponAmmoType(hero.equippedWeapon);
    const ammoCount = state.getAmmoCount(ammoType, hero);

    if (!state.hasRangedWeapon(hero)) {
      combatEvents.push({
        eventType: 'HERO_MISS',
        sourceName: hero.name,
        targetName: target.name,
        logText: `🏹 ${hero.name} has no ranged weapon ready — shot aborted!`,
        logType: 'warning'
      });
      return;
    }

    if (ammoType && ammoCount <= 0) {
      combatEvents.push({
        eventType: 'HERO_MISS',
        sourceName: hero.name,
        targetName: target.name,
        attackMode: 'ranged',
        cueBadge: '⚠️ NO AMMO',
        cueClass: 'dodge',
        logText: `🏹 ${hero.name} reaches for ${ammoType}, but the quiver is empty! Shot aborted!`,
        logType: 'warning'
      });
      if (state.combat && state.combat.previousCommands) {
        delete state.combat.previousCommands[heroIndex];
      }
      return;
    }

    // Consume 1 ammunition unit
    const { remaining } = state.consumeAmmo(hero, ammoType, 1);
    if (remaining <= 0 && state.combat && state.combat.previousCommands) {
      delete state.combat.previousCommands[heroIndex];
    }

    const roll = Math.floor(Math.random() * 20) + 1;
    const dexVal = hero.attributes.dexterity || 10;
    const bless = hero.tempAttackBonus || 0;

    const mastery = state.getWeaponMastery(hero, hero.equippedWeapon);
    const isFighterSpec = (hero.classKey === 'fighter' && hero.specializedWeapon === hero.equippedWeapon);
    const targetNum = dexVal + (hero.attackBonus != null ? hero.attackBonus : 1) + state.getLevelAttackBonus(hero) + mastery.atkBonus + bless;
    const dmgType = state.getWeaponDamageType(hero.equippedWeapon, 'piercing');
    const baseMaxDmg = state.getWeaponMaxDamage(hero.equippedWeapon, 6) || 6;
    const maxWepDmg = baseMaxDmg + mastery.dmgBonus;

    if (roll <= targetNum && roll !== 20) {
      const weaponRoll = Math.floor(Math.random() * baseMaxDmg) + 1;
      const rawDmg = weaponRoll + mastery.dmgBonus;
      const netDmg = state.applyArmorMitigation(rawDmg, dmgType, target.armorType);
      simMobHp[target.instanceId] = Math.max(0, simMobHp[target.instanceId] - netDmg);
      const isDead = simMobHp[target.instanceId] <= 0;
      if (isDead) {
        target.hp = 0;
        target.surrendered = false;
        target.slain = true;
        target.moraleStatus = 'DEAD';
      }

      state.trackWeaponUsage(hero, hero.equippedWeapon);

      const outcome = state.evaluateAttackOutcome({
        attackerName: hero.name,
        targetName: target.name,
        weaponName: hero.equippedWeapon || 'Bow',
        dmgType: dmgType,
        attackMode: 'ranged',
        roll: roll,
        targetNum: targetNum,
        rawDmg: rawDmg,
        netDmg: netDmg,
        maxDamage: maxWepDmg,
        isDead: isDead,
        isBoss: !!(target.isBoss || target.hp > 20),
        isSpecialist: isFighterSpec
      });

      const ammoNotice = ammoType ? ` [${remaining} ${remaining === 1 ? ammoType.replace(/s$/, '') : ammoType} left]` : '';
      const finalLog = outcome.logText + (remaining === 0 ? ` ⚠️ ${hero.name} has exhausted their ${ammoType}!` : ammoNotice);

      combatEvents.push({
        eventType: 'MONSTER_HIT',
        sourceName: hero.name,
        targetInstanceId: target.instanceId,
        targetName: target.name,
        damage: netDmg,
        isDead: isDead,
        attackMode: 'ranged',
        isSpecialist: isFighterSpec,
        cueBadge: outcome.cueBadge,
        cueClass: outcome.cueClass,
        isMasterstroke: outcome.isMasterstroke,
        masterstrokeFeat: outcome.masterstrokeFeat,
        logText: finalLog,
        logType: outcome.logType
      });
    } else {
      const missOutcome = state.evaluateHeroMissOutcome({
        attackerName: hero.name,
        targetName: target.name,
        weaponName: hero.equippedWeapon || 'Bow',
        attackMode: 'ranged',
        roll: roll,
        targetArmorType: target.armorType
      });

      const ammoNotice = ammoType ? ` [${remaining} ${remaining === 1 ? ammoType.replace(/s$/, '') : ammoType} left]` : '';
      const finalLog = missOutcome.logText + (remaining === 0 ? ` ⚠️ ${hero.name} has exhausted their ${ammoType}!` : ammoNotice);

      combatEvents.push({
        eventType: 'HERO_MISS',
        sourceName: hero.name,
        targetName: target.name,
        attackMode: 'ranged',
        isSpecialist: isFighterSpec,
        cueBadge: missOutcome.cueBadge,
        cueClass: missOutcome.cueClass,
        missLayer: missOutcome.missLayer,
        logText: finalLog,
        logType: missOutcome.logType
      });
    }
  }

  /**
   * Resolves a thief's backstab attempt.
   */
  static resolveHeroBackstab(state, hero, target, simMobHp, combatEvents) {
    const partyTier = state && state.getPartyEncumbranceTier ? state.getPartyEncumbranceTier() : null;
    if (partyTier && partyTier.stealthLocked) {
      state.addLog(`⚠️ Encumbrance lockout: Armor clatters loudly! Backstab degraded to a standard melee strike.`, "warning");
      this.resolveHeroMelee(state, hero, target, simMobHp, combatEvents);
      return;
    }

    const bTiers = GameState.BACKSTAB_TIERS || { familiarity: { minLevel: 1, count: 10, bonusMult: 0.10 }, mastery: { minLevel: 2, count: 25, bonusMult: 0.25 } };
    let bonusChance = 0;
    if (hero.level >= bTiers.mastery.minLevel && (hero.backstabSuccesses || 0) >= bTiers.mastery.count) {
      bonusChance += (bTiers.mastery.bonusMult * 100);
    } else if (hero.level >= bTiers.familiarity.minLevel && (hero.backstabSuccesses || 0) >= bTiers.familiarity.count) {
      bonusChance += (bTiers.familiarity.bonusMult * 100);
    }

    const chance = state.getSkillTarget(hero, 'hide_in_shadows') + bonusChance;
    const roll = Math.floor(Math.random() * 100) + 1;

    if (roll <= chance) {
      hero.backstabSuccesses = (hero.backstabSuccesses || 0) + 1;

      const baseWepDmg = state.getWeaponMaxDamage(hero.equippedWeapon, 6) || 6;
      const weaponRoll = Math.floor(Math.random() * baseWepDmg) + 1;
      const rawDmg = weaponRoll * 2;
      const netDmg = state.applyArmorMitigation(rawDmg, 'slashing', target.armorType);
      simMobHp[target.instanceId] = Math.max(0, simMobHp[target.instanceId] - netDmg);
      const isDead = simMobHp[target.instanceId] <= 0;
      if (isDead) {
        target.hp = 0;
        target.surrendered = false;
        target.slain = true;
        target.moraleStatus = 'DEAD';
      }

      const outcome = state.evaluateAttackOutcome({
        attackerName: hero.name,
        targetName: target.name,
        weaponName: hero.equippedWeapon || 'Dagger',
        dmgType: 'slashing',
        attackMode: 'backstab',
        roll: roll,
        targetNum: chance,
        rawDmg: rawDmg,
        netDmg: netDmg,
        maxDamage: baseWepDmg * 2,
        isDead: isDead,
        isBoss: !!(target.isBoss || target.hp > 20),
        isBackstab: true
      });

      combatEvents.push({
        eventType: 'MONSTER_HIT',
        sourceName: hero.name,
        targetInstanceId: target.instanceId,
        targetName: target.name,
        damage: netDmg,
        isDead: isDead,
        attackMode: 'backstab',
        cueBadge: outcome.cueBadge,
        cueClass: outcome.cueClass,
        isMasterstroke: outcome.isMasterstroke,
        masterstrokeFeat: outcome.masterstrokeFeat,
        logText: outcome.logText,
        logType: outcome.logType
      });
    } else {
      combatEvents.push({
        eventType: 'HERO_MISS',
        sourceName: hero.name,
        targetName: target.name,
        attackMode: 'backstab',
        cueBadge: '💨 MISSED',
        cueClass: 'dodge',
        missLayer: 'DODGE',
        logText: `🗡️ ${hero.name}'s backstab missed ${target.name}!`,
        logType: 'warning'
      });
    }
  }

  /**
   * Resolves a mage's Vancian spell cast.
   */
  static resolveHeroCast(state, hero, heroIndex, command, target, livingMobs, simMobHp, simHeroHp, castInterrupted, combatEvents) {
    const spellIndex = command.spellIndex;
    const spell = hero.spells && hero.spells[spellIndex];
    if (!spell || spell.spent) {
      combatEvents.push({
        eventType: 'HERO_MISS',
        sourceName: hero.name,
        logText: `🔮 ${hero.name}'s mind reaches for a spell that is no longer there...`,
        logType: 'warning'
      });
      return;
    }

    spell.spent = true;

    if (castInterrupted[heroIndex]) {
      combatEvents.push({
        eventType: 'SPELL_FIZZLE',
        sourceName: hero.name,
        spellId: spell.id,
        targetHeroIndex: heroIndex,
        logText: `💫 ${hero.name}'s ${spell.name} collapses! Concentration broken — construct erased. The scorched seat remains until rest.`,
        logType: 'danger'
      });
      return;
    }

    const events = SpellRegistry.resolveCombatSpell(hero, spell, {
      target,
      livingMobs,
      simMobHp,
      simHeroHp,
      party: state.party,
      casterIndex: heroIndex,
      casterRefundText: ` The construct is gone; its burden remains until rest.`
    });
    combatEvents.push(...events);
  }

  /**
   * Resolves a cleric's divine prayer.
   */
  static resolveHeroPray(state, hero, heroIndex, command, target, livingMobs, simMobHp, simHeroHp, combatEvents) {
    const spellIndex = command.spellIndex;
    const spell = hero.spells && hero.spells[spellIndex];
    if (!spell || spell.spent || hero.divineFavor <= 0 || hero.absoluteSilence) {
      combatEvents.push({
        eventType: 'HERO_MISS',
        sourceName: hero.name,
        logText: `✨ ${hero.name}'s petition goes unanswered...`,
        logType: 'warning'
      });
      return;
    }
    spell.spent = true;

    const events = SpellRegistry.resolveCombatSpell(hero, spell, {
      target,
      livingMobs,
      simMobHp,
      simHeroHp,
      party: state.party,
      casterIndex: heroIndex,
      healTargetIndex: command.healTargetIndex,
      casterRefundText: ''
    });
    combatEvents.push(...events);
  }

  /**
   * Resolves a cleric's Turn Undead divine power.
   */
  static resolveHeroTurnUndead(state, hero, livingMobs, simMobHp, combatEvents) {
    if (hero.classKey !== 'cleric' || hero.divineFavor <= 0 || hero.absoluteSilence) {
      combatEvents.push({
        eventType: 'HERO_MISS',
        sourceName: hero.name,
        logText: `✨ ${hero.name} raises the holy symbol — but the heavens are silent.`,
        logType: 'warning'
      });
      return;
    }

    const undead = livingMobs.filter(e => e.creatureType === 'undead' && simMobHp[e.instanceId] > 0);
    if (undead.length === 0) {
      combatEvents.push({
        eventType: 'TURN_UNDEAD',
        sourceName: hero.name,
        logText: `✨ ${hero.name} brandishes the holy symbol — no undead abominations present.`,
        logType: 'muted'
      });
      return;
    }

    const roll = Math.floor(Math.random() * 20) + 1;
    const skillBonus = Math.floor((state.getSkillTarget(hero, 'turn_undead') - 14) / 3);
    const effectiveRoll = roll + Math.max(0, skillBonus);

    let destroyed = 0, fled = 0, resisted = 0;

    undead.forEach(mob => {
      const need = state.getTurnUndeadTarget(hero.level || 1, mob.undeadTier || 'weak');
      if (need == null) { resisted++; return; }
      if (need === 'D' || effectiveRoll >= 20) {
        simMobHp[mob.instanceId] = 0;
        destroyed++;
      } else if (effectiveRoll >= need) {
        mob.turnedRounds = 3;
        fled++;
      } else { resisted++; }
    });

    let detail = [];
    if (destroyed) detail.push(`${destroyed} destroyed`);
    if (fled) detail.push(`${fled} flee in terror`);
    if (resisted) detail.push(`${resisted} unfazed`);
    combatEvents.push({
      eventType: 'TURN_UNDEAD',
      sourceName: hero.name,
      logText: `✨ ${hero.name} asserts divine authority! (d20=${roll}${skillBonus > 0 ? `+${skillBonus}` : ''}) — ${detail.join(', ') || 'no effect'}.`,
      logType: (destroyed || fled) ? 'success' : 'warning'
    });
  }

  /**
   * Resolves a monster attack targeting a hero, applying THAC0, defenses, and saves.
   */
  static resolveMonsterAttack(state, mob, targetHero, targetHeroIndex, simMobHp, simHeroHp, guardedBy, selfGuardAc, castInterrupted, combatEvents) {
    if (simMobHp[mob.instanceId] <= 0 || mob.fled || mob.surrendered || simHeroHp[targetHeroIndex] <= 0) return;

    let finalHeroIndex = targetHeroIndex;
    let finalHero = targetHero;
    let redirected = false;
    const guardianIdx = guardedBy[targetHeroIndex];

    if (guardianIdx != null && simHeroHp[guardianIdx] > 0) {
      finalHeroIndex = guardianIdx;
      finalHero = state.party[guardianIdx];
      redirected = true;
    }

    const guardBonus = selfGuardAc[finalHeroIndex] || 0;
    const spellAc = (state.party[finalHeroIndex] && state.party[finalHeroIndex].tempAcBonus) || 0;
    const debuffAcPenalty = (mob.debuffType === 'ac' && (mob.debuffRounds || 0) > 0) ? mob.debuffAmount : 0;
    const partyTier = state.getPartyEncumbranceTier ? state.getPartyEncumbranceTier() : null;
    const encAcPenalty = (partyTier && partyTier.acPenalty) || 0;

    // AD&D 2nd Edition Descending AC:
    const baseHeroAc = finalHero.armorClass != null ? finalHero.armorClass : 5;
    const effectiveHeroAc = baseHeroAc - guardBonus - spellAc + debuffAcPenalty + encAcPenalty;

    // Attacker THAC0
    const mobThaco = state.getMonsterThaco(mob);

    // Required d20 roll to hit: Attacker THAC0 - Defender AC
    const rawTargetToHit = mobThaco - effectiveHeroAc;
    const targetToHit = Math.max(2, Math.min(20, rawTargetToHit));

    const roll = Math.floor(Math.random() * 20) + 1;
    const toHitPenalty = (mob.debuffType === 'to_hit' && (mob.debuffRounds || 0) > 0) ? mob.debuffAmount : 0;
    const adjustedRoll = roll - toHitPenalty;

    const isHit = (roll === 20) || (roll !== 1 && adjustedRoll >= targetToHit);

    if (isHit) {
      const rawDmg = state.rollMonsterDamage(mob.damage);
      const maxMobDmg = state.getMonsterMaxDamage(mob.damage);
      simHeroHp[finalHeroIndex] = Math.max(-10, simHeroHp[finalHeroIndex] - rawDmg);
      const isDead = simHeroHp[finalHeroIndex] <= -10;
      const isIncapacitated = simHeroHp[finalHeroIndex] <= 0 && !isDead;
      castInterrupted[finalHeroIndex] = true;

      const rollRatio = rawDmg / Math.max(1, maxMobDmg);
      const isHeavy = (roll === 20 || rollRatio >= 0.75);
      const isLow = (rawDmg <= 2 && rollRatio <= 0.35);

      let cueBadge = `🩸 -${rawDmg}`;
      let cueClass = 'normal';
      let logText = '';

      if (isDead) {
        cueBadge = `💀 DEAD (-10)`;
        cueClass = 'heavy';
        logText = redirected
          ? `💀 FATAL TRAUMA: ${mob.name}'s blow crushes through ${finalHero.name} (-10 HP)! ${finalHero.name} is permanently dead.`
          : `💀 FATAL TRAUMA: ${mob.name}'s strike sends ${finalHero.name} to -10 HP! ${finalHero.name} is permanently dead.`;
      } else if (isIncapacitated) {
        cueBadge = `⚠️ INCAPACITATED (${simHeroHp[finalHeroIndex]} HP)`;
        cueClass = 'heavy';
        logText = redirected
          ? `⚠️ CRITICAL WOUND: ${mob.name} strikes at ${targetHero.name} — ${finalHero.name} interposes, falls to ${simHeroHp[finalHeroIndex]} HP, and collapses incapacitated!`
          : `⚠️ CRITICAL WOUND: ${mob.name} drops ${finalHero.name} to ${simHeroHp[finalHeroIndex]} HP! ${finalHero.name} collapses incapacitated!`;
      } else if (isHeavy) {
        cueBadge = `💀 -${rawDmg} CRUSHING!`;
        cueClass = 'heavy';
        logText = redirected
          ? `💥 CRITICAL IMPACT: ${mob.name} strikes at ${targetHero.name} — ${finalHero.name} interposes and takes a devastating ${rawDmg} damage!`
          : `💥 CRITICAL IMPACT: ${mob.name} catches ${finalHero.name} with a crushing blow for ${rawDmg} damage!`;
      } else if (isLow) {
        cueBadge = `🩸 -${rawDmg}`;
        cueClass = 'graze';
        logText = redirected
          ? `💥 ${mob.name} strikes at ${targetHero.name} — ${finalHero.name} interposes and absorbs ${rawDmg} minor damage.`
          : `💥 ${mob.name} nicks ${finalHero.name} through a gap in the armor for ${rawDmg} minor damage.`;
      } else {
        cueBadge = `🩸 -${rawDmg}`;
        cueClass = 'normal';
        logText = redirected
          ? `💥 ${mob.name} strikes at ${targetHero.name} — ${finalHero.name} interposes and takes ${rawDmg} damage!`
          : `💥 ${mob.name} strikes ${finalHero.name} for ${rawDmg} damage!`;
      }

      combatEvents.push({
        eventType: 'HERO_HIT',
        sourceName: mob.name,
        targetHeroIndex: finalHeroIndex,
        targetHeroName: finalHero.name,
        damage: rawDmg,
        isDead: isDead,
        isIncapacitated: isIncapacitated,
        currentHp: simHeroHp[finalHeroIndex],
        redirected: redirected,
        cueBadge: cueBadge,
        cueClass: cueClass,
        logText: logText,
        logType: isDead ? 'danger' : isIncapacitated ? 'warning' : 'danger'
      });

      // Saving throw trigger for monsters with venom, paralyzation, breath, or spells
      if (!isDead && (mob.special_attack || mob.save_category)) {
        const saveCat = mob.save_category || (mob.special_attack === 'poison' ? 'poison' : 'spell');
        const saveSub = mob.special_attack || 'poison';
        const saveRes = state.checkSavingThrow(finalHero, saveCat, saveSub);

        if (saveRes.success) {
          const modStr = saveRes.abilityMod ? (saveRes.abilityMod > 0 ? `+${saveRes.abilityMod}` : `${saveRes.abilityMod}`) : '';
          combatEvents.push({
            eventType: 'SAVE_SUCCESS',
            savingThrow: saveRes,
            targetHeroIndex: finalHeroIndex,
            targetHeroName: finalHero.name,
            sourceName: mob.name,
            logText: `🛡️ HEROIC FORTITUDE: ${saveRes.narrative} [d20=${saveRes.roll}${modStr} vs Target ${saveRes.target}]`,
            logType: 'success'
          });
        } else {
          const extraDmg = mob.poison_damage || mob.special_damage || 4;
          simHeroHp[finalHeroIndex] = Math.max(-10, simHeroHp[finalHeroIndex] - extraDmg);
          const isPoisonDead = simHeroHp[finalHeroIndex] <= -10;
          const isPoisonInc = simHeroHp[finalHeroIndex] <= 0 && !isPoisonDead;
          const modStr = saveRes.abilityMod ? (saveRes.abilityMod > 0 ? `+${saveRes.abilityMod}` : `${saveRes.abilityMod}`) : '';
          combatEvents.push({
            eventType: 'SAVE_FAILURE',
            savingThrow: saveRes,
            targetHeroIndex: finalHeroIndex,
            targetHeroName: finalHero.name,
            damage: extraDmg,
            isDead: isPoisonDead,
            isIncapacitated: isPoisonInc,
            currentHp: simHeroHp[finalHeroIndex],
            sourceName: mob.name,
            logText: isPoisonDead
              ? `💀 FATAL TOXIN: ${saveRes.narrative} (Fatal venom brings ${finalHero.name} to -10 HP! Dead.)`
              : isPoisonInc
              ? `⚠️ VENOMOUS INCAPACITATION: ${saveRes.narrative} (Takes +${extraDmg} toxic damage, dropping ${finalHero.name} to ${simHeroHp[finalHeroIndex]} HP! Incapacitated.)`
              : `💀 MORTAL BREACH: ${saveRes.narrative} (Takes +${extraDmg} toxic damage! d20=${saveRes.roll}${modStr} vs Target ${saveRes.target})`,
            logType: 'danger'
          });
        }
      }
    } else {
      // Layered defensive resolution: Determine the exact layer that foiled the attack
      const unarmoredThreshold = mobThaco - 10;
      const dexAdj = GameState.getDexDefensiveAdjustment ? GameState.getDexDefensiveAdjustment(finalHero.attributes?.dexterity || 10) : 0;
      const dexBonus = Math.abs(Math.min(0, dexAdj));
      const dexThreshold = unarmoredThreshold + dexBonus;

      const shieldBonus = (finalHero.equippedShield && (finalHero.equippedShield.acBonus || 1)) || 0;
      const shieldThreshold = dexThreshold + shieldBonus;

      const guardThreshold = shieldThreshold + guardBonus;
      const spellThreshold = guardThreshold + spellAc;

      let missLayer = 'ARMOR';
      let cueBadge = '⚙️ DEFLECTED';
      let cueClass = 'armor';
      let logText = '';

      if (adjustedRoll < unarmoredThreshold || roll === 1) {
        missLayer = 'DODGE';
        cueBadge = '💨 EVADED';
        cueClass = 'dodge';
        logText = redirected
          ? `💨 ${mob.name} lunges wildly at ${targetHero.name} — ${finalHero.name} intercepts and easily sidesteps the blow!`
          : `💨 EVADED: ${finalHero.name} smoothly sidesteps ${mob.name}'s wild strike — biting empty air!`;
      } else if (dexBonus > 0 && adjustedRoll < dexThreshold) {
        missLayer = 'DODGE';
        cueBadge = '💨 DODGED';
        cueClass = 'dodge';
        logText = redirected
          ? `💨 ${finalHero.name}'s quick reflexes turn ${mob.name}'s strike aside from ${targetHero.name}!`
          : `💨 DODGED: ${finalHero.name}'s lightning reflexes turn ${mob.name}'s lethal stroke into a clean miss!`;
      } else if (shieldBonus > 0 && adjustedRoll < shieldThreshold) {
        missLayer = 'SHIELD';
        cueBadge = '🛡️ BLOCKED';
        cueClass = 'shield';
        const shieldName = (finalHero.equippedShield && finalHero.equippedShield.name) || 'shield';
        logText = redirected
          ? `🛡️ SHIELD BLOCK: ${finalHero.name} intercepts ${mob.name}'s strike with the rim of the ${shieldName}!`
          : `🛡️ SHIELD BLOCK: ${finalHero.name} catches ${mob.name}'s blow cleanly on the iron rim of the ${shieldName}!`;
      } else if (guardBonus > 0 && adjustedRoll < guardThreshold) {
        missLayer = 'GUARD';
        cueBadge = '🛡️ GUARDED';
        cueClass = 'shield';
        logText = `🛡️ TACTICAL GUARD: ${finalHero.name}'s disciplined guard parries ${mob.name}'s assault!`;
      } else if (spellAc > 0 && adjustedRoll < spellThreshold) {
        missLayer = 'SPELL';
        cueBadge = '✨ WARDED';
        cueClass = 'ward';
        const spellSrc = finalHero.tempAcSource || 'Arcane Shield';
        logText = `✨ WARDED: A radiant barrier of ${spellSrc} flares around ${finalHero.name}, absorbing ${mob.name}'s blow!`;
      } else {
        missLayer = 'ARMOR';
        cueBadge = '⚙️ DEFLECTED';
        cueClass = 'armor';
        const armorName = (finalHero.equippedArmor && finalHero.equippedArmor.name) || 'armor';
        logText = redirected
          ? `⚙️ ARMOR DEFLECTION: ${finalHero.name} intercepts ${mob.name}'s strike — the blow rings harmlessly off the ${armorName}!`
          : `⚙️ ARMOR DEFLECTION: ${mob.name}'s blade strikes ${finalHero.name}'s ${armorName} with a shower of sparks, glancing off harmlessly!`;
      }

      combatEvents.push({
        eventType: 'MONSTER_MISS',
        sourceName: mob.name,
        targetHeroName: redirected ? finalHero.name : targetHero.name,
        targetHeroIndex: finalHeroIndex,
        missLayer: missLayer,
        cueBadge: cueBadge,
        cueClass: cueClass,
        logText: logText,
        logType: 'muted'
      });
    }
  }
}
