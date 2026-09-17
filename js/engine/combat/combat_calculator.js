/**
 * CombatCalculator
 * Dedicated mathematical and rule evaluation engine for AD&D 2nd Edition combat mechanics.
 * Pure calculation functions for THAC0, Armor Mitigation, Dice, Masteries, and Outcome Evaluation.
 */

export class CombatCalculator {
  /**
   * AD&D 2e Weapon Mastery & Fighter Specialization Calculations.
   * Specialization provides canonical +1 to-hit, +2 damage for Fighters.
   */
  static calculateWeaponMastery(hero, weaponName, masteryTiers = { familiarity: { minLevel: 1, hits: 25, atkBonus: 1 }, mastery: { minLevel: 2, hits: 50, atkBonus: 1, dmgBonus: 1 } }) {
    const hits = (hero.weaponUsage && hero.weaponUsage[weaponName]) || 0;
    const { familiarity, mastery } = masteryTiers;
    
    // Canonical AD&D 2e Fighter Weapon Specialization (+1 to-hit, +2 damage)
    const isSpecialist = hero.classKey === 'fighter' && weaponName && (weaponName === (hero.specializedWeapon || 'Longsword'));
    const specAtk = isSpecialist ? 1 : 0;
    const specDmg = isSpecialist ? 2 : 0;

    let usageTier = 'novice';
    let usageAtk = 0;
    let usageDmg = 0;

    if (hero.level >= mastery.minLevel && hits >= mastery.hits) {
      usageTier = 'mastery';
      usageAtk = mastery.atkBonus;
      usageDmg = mastery.dmgBonus;
    } else if (hero.level >= familiarity.minLevel && hits >= familiarity.hits) {
      usageTier = 'familiarity';
      usageAtk = familiarity.atkBonus;
      usageDmg = 0;
    }

    const totalAtk = specAtk + usageAtk;
    const totalDmg = specDmg + usageDmg;

    let tierLabel = usageTier;
    if (isSpecialist) {
      if (usageTier === 'mastery') tierLabel = 'grand_master';
      else if (usageTier === 'familiarity') tierLabel = 'specialist_familiar';
      else tierLabel = 'specialist';
    }

    return {
      tier: tierLabel,
      usageTier,
      isSpecialist,
      hits,
      specAtkBonus: specAtk,
      specDmgBonus: specDmg,
      usageAtkBonus: usageAtk,
      usageDmgBonus: usageDmg,
      atkBonus: totalAtk,
      dmgBonus: totalDmg
    };
  }

  /**
   * Evaluates if a hero is a Fighter wielding their specialized weapon.
   */
  static isHeroSpecialistWithEquipped(hero) {
    if (!hero || hero.classKey !== 'fighter' || !hero.equippedWeapon) return false;
    const specWep = hero.specializedWeapon || 'Longsword';
    return hero.equippedWeapon === specWep;
  }

  /**
   * Applies AD&D 2e physical damage type mitigations based on defender armor.
   * - Bludgeoning: Crushes through mail/plate without reduction.
   * - Slashing: Reduced by 2 against chain mail, 5 against plate armor.
   * - Piercing: Reduced by 3 against plate armor.
   */
  static applyArmorMitigation(rawDamage, damageType, armorType) {
    if (damageType === 'bludgeoning') return rawDamage;
    if (armorType === 'chain') {
      if (damageType === 'slashing') return Math.max(1, rawDamage - 2);
    } else if (armorType === 'plate') {
      if (damageType === 'slashing') return Math.max(1, rawDamage - 5);
      if (damageType === 'piercing') return Math.max(1, rawDamage - 3);
    }
    return rawDamage;
  }

  /**
   * Parses standard dice notation (e.g., '2d6+3', '1d8') and calculates theoretical maximum damage.
   */
  static parseMaxDamage(dmgStr, fallback = 8) {
    if (!dmgStr || typeof dmgStr !== 'string') return fallback;
    const m = dmgStr.trim().match(/^(\d+)d(\d+)(?:\+(\d+))?$/i);
    if (!m) return fallback;
    const num = Math.max(1, parseInt(m[1], 10) || 1);
    const die = Math.max(1, parseInt(m[2], 10) || 4);
    const bonus = parseInt(m[3] || '0', 10) || 0;
    return (num * die) + bonus;
  }

  /**
   * Rolls dice based on standard dice notation (e.g., '1d8', '2d4+2').
   */
  static rollDice(dmgStr, fallbackMax = 4) {
    if (!dmgStr || typeof dmgStr !== 'string') return Math.floor(Math.random() * fallbackMax) + 1;
    const m = dmgStr.trim().match(/^(\d+)d(\d+)(?:\+(\d+))?$/i);
    if (!m) return Math.floor(Math.random() * fallbackMax) + 1;
    const num = Math.max(1, parseInt(m[1], 10) || 1);
    const die = Math.max(1, parseInt(m[2], 10) || 4);
    const bonus = parseInt(m[3] || '0', 10) || 0;
    let total = bonus;
    for (let i = 0; i < num; i++) total += Math.floor(Math.random() * die) + 1;
    return Math.max(1, total);
  }

  /**
   * Evaluates hit outcomes, critical hits/masterstrokes, narrative log text, and floating combat badges.
   */
  static evaluateAttackOutcome(params) {
    const {
      attackerName, targetName, weaponName = 'weapon', dmgType = 'slashing',
      attackMode = 'melee', roll, targetNum, rawDmg, netDmg, maxDamage = 8,
      isDead = false, isBoss = false, isNat20 = false, isBackstab = false,
      isSpecialist = false
    } = params;

    const margin = targetNum - roll;
    const isHighMargin = isNat20 || (roll === 1) || (margin >= 4);
    const isLowMargin = (margin <= 1);
    const ratio = rawDmg / Math.max(1, maxDamage);
    const isHighDmg = ratio >= 0.75 || rawDmg >= maxDamage;
    const isLowDmg = rawDmg <= 2 || ratio <= 0.30;

    let logText = '';
    let logType = 'info';
    let cueBadge = isSpecialist ? `🎯 ${netDmg} (Spec)` : `💥 ${netDmg}`;
    let cueClass = isSpecialist ? 'specialist' : 'normal';
    let isMasterstroke = false;
    let masterstrokeFeat = null;

    if (isBackstab) {
      isMasterstroke = true;
      cueClass = 'backstab';
      cueBadge = `🗡️ ${netDmg} BACKSTAB!`;
      logType = 'masterstroke';
      logText = `<div class="ms-title"><span>🗡️ MASTER BACKSTAB — ${attackerName.toUpperCase()}</span><span class="ms-meta">${weaponName} (${netDmg} dmg)</span></div><div class="ms-quote">"${attackerName} emerges unseen from the gloom and sinks the blade to the hilt into ${targetName}!"</div>`;

      if (netDmg >= 12 || isDead || isBoss) {
        masterstrokeFeat = {
          title: '🗡️ SHADOW MASTERSTROKE',
          category: 'CRITICAL BACKSTAB EXECUTED',
          badge: '🩸 LETHAL ANATOMY',
          origin: 'Exploiting unprotected blind spot from darkness',
          heroName: attackerName,
          rollText: `<span style="color:#ffd700">d100:[${roll}] vs Skill</span>`,
          damage: netDmg,
          outcome: `⚡ ${netDmg} DAMAGE`,
          narrative: `${attackerName} strikes silently from the darkness, driving the blade clean into vital organs!`
        };
      }
    } else if (isHighMargin && isHighDmg) {
      // Masterstroke tier
      isMasterstroke = true;
      cueClass = isSpecialist ? 'specialist' : 'crushing';
      cueBadge = isSpecialist ? `🎯 ${netDmg} CRIT SPEC!` : `💥 ${netDmg} MASTERSTROKE!`;
      logType = 'masterstroke';

      let quote = '';
      if (attackMode === 'ranged') {
        quote = isSpecialist
          ? `${attackerName} threads a pinpoint specialized arrow directly through the vulnerable juncture in ${targetName}'s guard!`
          : `${attackerName} threads the arrow with surgical perfection into a vulnerable joint in ${targetName}'s defenses!`;
      } else if (dmgType === 'piercing') {
        quote = `${attackerName} finds the mortal seam in ${targetName}'s guard, piercing directly into vital tissue!`;
      } else if (dmgType === 'bludgeoning') {
        quote = `${attackerName} brings the ${weaponName} down with bone-shattering leverage and devastating kinetic force!`;
      } else {
        quote = `${attackerName} exploits a lethal gap in ${targetName}'s stance, driving the ${weaponName} clean through with surgical mastery!`;
      }

      const titlePrefix = isSpecialist ? '🏹🎯 SPECIALIST MASTERSTROKE' : '⚔️ MASTERSTROKE';
      logText = `<div class="ms-title"><span>${titlePrefix} — ${attackerName.toUpperCase()}</span><span class="ms-meta">${weaponName} (${netDmg}/${maxDamage} dmg)</span></div><div class="ms-quote">"${quote}"</div>`;

      // Rare Cinematic Banner for exceptional feats
      if (isDead && (isBoss || isNat20 || roll === 1 || netDmg >= 8)) {
        masterstrokeFeat = {
          title: isSpecialist ? '🎯 SPECIALIST SHOT OF PINPOINT LETHALITY' : '⚔️ MASTERSTROKE OF MARTIAL PROWESS',
          category: 'CRITICAL APERTURE EXPLOITED',
          badge: isSpecialist ? '🎯 PINPOINT SPEC' : '💥 FATAL PENETRATION',
          origin: isSpecialist ? 'Fighter weapon specialization and lethal ballistic precision' : 'Exquisite geometric timing and terminal kinetic force',
          heroName: attackerName,
          rollText: `<span style="color:#ffd700">d20:[${roll}] vs Target ${targetNum}</span>`,
          damage: netDmg,
          outcome: `⚡ ${netDmg} DAMAGE (FATAL)`,
          narrative: `${attackerName} executes a textbook martial finisher, terminating ${targetName} instantly!`
        };
      }
    } else if (isHighMargin && isLowDmg) {
      cueClass = 'graze';
      cueBadge = isSpecialist ? `🎯 ${netDmg} (Spec Graze)` : `⚔️ ${netDmg} (Graze)`;
      logType = 'info';
      if (attackMode === 'ranged') {
        logText = `🏹 ${attackerName}'s shot is on target, but glances across ${targetName}'s flank — drawing only a stinging flesh graze (${netDmg} dmg).`;
      } else if (dmgType === 'piercing') {
        logText = `⚔️ ${attackerName} slips past the parry, but the point catches on dense bone — shallow penetration (${netDmg} dmg).`;
      } else if (dmgType === 'bludgeoning') {
        logText = `⚔️ ${attackerName} lands squarely, but the impact glances across curved muscle without full kinetic shock (${netDmg} dmg).`;
      } else {
        logText = `⚔️ ${attackerName} cuts cleanly past the guard, but ${targetName} recoils in the nick of time — a shallow flesh graze (${netDmg} dmg).`;
      }
    } else if (isLowMargin && isHighDmg) {
      cueClass = isSpecialist ? 'specialist' : 'heavy';
      cueBadge = isSpecialist ? `🎯 ${netDmg} HEAVY SPEC!` : `💥 ${netDmg} HEAVY IMPACT!`;
      logType = 'info';
      if (attackMode === 'ranged') {
        logText = `💥 ${attackerName}'s shot is hurried, but ${targetName} lunges into the flight path — heavy missile penetration! (${netDmg} dmg)`;
      } else {
        logText = `💥 ${attackerName}'s swing is hurried and off-balance, but ${targetName} lunges into the steel — brutal impalement! (${netDmg} dmg)`;
      }
    } else if (isLowMargin && isLowDmg) {
      cueClass = 'graze';
      cueBadge = `⚔️ ${netDmg}`;
      logType = 'muted';
      if (attackMode === 'ranged') {
        logText = `🏹 ${attackerName}'s ${weaponName} projectile barely catches ${targetName}, grazing light tissue (${netDmg} dmg).`;
      } else {
        logText = `⚔️ ${attackerName}'s ${weaponName} barely breaches ${targetName}'s guard, the blade edge leaving only a ragged scratch (${netDmg} dmg).`;
      }
    } else {
      cueClass = isSpecialist ? 'specialist' : 'normal';
      cueBadge = isSpecialist ? `🎯 ${netDmg} (Spec)` : `💥 ${netDmg}`;
      logType = 'info';
      if (attackMode === 'ranged') {
        if (isSpecialist) {
          logText = `🏹🎯 ${attackerName} looses a specialized shot with ${weaponName}, striking ${targetName} for ${netDmg} damage (+1 to-hit / +2 dmg specialization)!`;
        } else {
          logText = `🏹 ${attackerName} looses a shot at ${targetName}, striking home for ${netDmg} damage!`;
        }
      } else {
        if (isSpecialist) {
          logText = `⚔️🎯 ${attackerName} lands a specialized strike on ${targetName} with ${weaponName} for ${netDmg} damage (+1 to-hit / +2 dmg specialization)!`;
        } else {
          logText = `⚔️ ${attackerName} lands a solid strike on ${targetName} with ${weaponName} for ${netDmg} damage!`;
        }
      }
    }

    return { logText, logType, cueBadge, cueClass, isMasterstroke, masterstrokeFeat };
  }

  /**
   * Evaluates miss and evasion feedback (dodge vs armor deflection).
   */
  static evaluateHeroMissOutcome(params) {
    const { attackerName, targetName, weaponName = 'weapon', attackMode = 'melee', roll, targetArmorType = 'none' } = params;
    let logText = '';
    let cueBadge = '💨 EVADED';
    let cueClass = 'dodge';
    let missLayer = 'DODGE';

    if (attackMode === 'ranged') {
      if (roll === 20) {
        logText = `💨 ${attackerName}'s shot flies wide into the gloom!`;
        cueBadge = '💨 WHIFF';
        cueClass = 'dodge';
        missLayer = 'DODGE';
      } else if (targetArmorType === 'chain' || targetArmorType === 'plate') {
        logText = `⚙️ ARMOR DEFLECTION: The missile strikes ${targetName}'s ${targetArmorType} armor but ricochets off without piercing!`;
        cueBadge = '⚙️ DEFLECTED';
        cueClass = 'armor';
        missLayer = 'ARMOR';
      } else {
        logText = `💨 EVADED: ${targetName} weaves out of the missile's flight path!`;
        cueBadge = '💨 EVADED';
        cueClass = 'dodge';
        missLayer = 'DODGE';
      }
    } else {
      if (roll === 20) {
        logText = `💨 ${attackerName} overextends with an awkward swing; ${targetName} easily steps aside!`;
        cueBadge = '💨 WHIFF';
        cueClass = 'dodge';
        missLayer = 'DODGE';
      } else if (targetArmorType === 'chain' || targetArmorType === 'plate') {
        logText = `⚙️ ARMOR DEFLECTION: ${attackerName}'s ${weaponName} rings off ${targetName}'s ${targetArmorType} armor without penetrating!`;
        cueBadge = '⚙️ DEFLECTED';
        cueClass = 'armor';
        missLayer = 'ARMOR';
      } else {
        logText = `💨 EVADED: ${targetName} ducks underneath ${attackerName}'s strike!`;
        cueBadge = '💨 EVADED';
        cueClass = 'dodge';
        missLayer = 'DODGE';
      }
    }

    return { logText, logType: 'muted', cueBadge, cueClass, missLayer };
  }

  /**
   * AD&D 2e Turn Undead target number matrix.
   */
  static getTurnUndeadTarget(clericLevel, undeadTier) {
    const lvl = Math.max(1, Math.min(10, clericLevel || 1));
    const table = {
      1: { weak: 10, medium: 13, strong: 16, greater: null },
      2: { weak: 7, medium: 10, strong: 13, greater: 20 },
      3: { weak: 4, medium: 7, strong: 10, greater: 16 },
      4: { weak: 'D', medium: 4, strong: 7, greater: 13 },
      5: { weak: 'D', medium: 'D', strong: 4, greater: 10 },
      6: { weak: 'D', medium: 'D', strong: 'D', greater: 7 },
      7: { weak: 'D', medium: 'D', strong: 'D', greater: 4 },
      8: { weak: 'D', medium: 'D', strong: 'D', greater: 'D' },
      9: { weak: 'D', medium: 'D', strong: 'D', greater: 'D' },
      10: { weak: 'D', medium: 'D', strong: 'D', greater: 'D' }
    };
    const row = table[lvl] || table[1];
    return row[undeadTier] !== undefined ? row[undeadTier] : row.weak;
  }
}
