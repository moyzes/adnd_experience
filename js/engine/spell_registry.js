/**
 * SpellRegistry - Canonical data-driven spell registry and effect dispatcher.
 * Unifies all arcane constructs and divine prayers across combat, exploration,
 * level-up spell grimoires, and UI presentation.
 */

export class SpellRegistry {
  static #spellsById = new Map();
  static #spellsByClass = {
    mage: [],
    cleric: []
  };

  /**
   * Initializes the registry with a list of spell definitions.
   * @param {Array<Object>|{spells: Array<Object>}} spellData 
   * @param {Object} [classesData] Optional classes spec to decorate with dynamic tier maps
   */
  static init(spellData, classesData = null) {
    this.#spellsById.clear();
    this.#spellsByClass.mage = [];
    this.#spellsByClass.cleric = [];

    const spellList = Array.isArray(spellData) ? spellData : (spellData?.spells || []);

    spellList.forEach(spell => {
      this.#spellsById.set(spell.id, spell);
      const classKey = (spell.class || '').toLowerCase();
      if (this.#spellsByClass[classKey]) {
        this.#spellsByClass[classKey].push(spell);
      }
    });

    // Keep tier-sorted
    this.#spellsByClass.mage.sort((a, b) => (a.tier || 1) - (b.tier || 1));
    this.#spellsByClass.cleric.sort((a, b) => (a.tier || 1) - (b.tier || 1));

    if (classesData && classesData.archetypes) {
      if (classesData.archetypes.mage) {
        if (!classesData.archetypes.mage.vancian_magic) classesData.archetypes.mage.vancian_magic = {};
        classesData.archetypes.mage.vancian_magic.spell_tiers = this.getTierMapForClass('mage');
      }
      if (classesData.archetypes.cleric) {
        classesData.archetypes.cleric.spells_available_by_tier = this.getTierMapForClass('cleric');
      }
    }
  }

  /**
   * Retrieve all registered spell definitions.
   * @returns {Array<Object>}
   */
  static getAll() {
    return Array.from(this.#spellsById.values());
  }

  /**
   * Retrieve a spell definition by ID.
   * @param {string} id 
   * @returns {Object|null}
   */
  static get(id) {
    return this.#spellsById.get(id) || null;
  }

  /**
   * Get all spells registered for a class up to a given tier.
   * @param {string} classKey 
   * @param {number} maxTier 
   * @returns {Array<Object>}
   */
  static getSpellsForClass(classKey, maxTier = 4) {
    const list = this.#spellsByClass[(classKey || '').toLowerCase()] || [];
    return list.filter(s => (s.tier || 1) <= maxTier);
  }

  /**
   * Get spells partitioned by tier dictionary { "1": [...], "2": [...] }
   * for backward compatibility with setup screens and existing specs.
   * @param {string} classKey 
   * @returns {Object}
   */
  static getTierMapForClass(classKey) {
    const list = this.#spellsByClass[(classKey || '').toLowerCase()] || [];
    const tierMap = {};
    list.forEach(s => {
      const tierStr = String(s.tier || 1);
      if (!tierMap[tierStr]) tierMap[tierStr] = [];
      tierMap[tierStr].push(s);
    });
    return tierMap;
  }

  // =========================================================================
  // Pure Effect Handlers: Combat Resolution
  // =========================================================================

  static #combatEffectHandlers = {
    damage: (caster, spell, effect, ctx) => {
      const { target, simMobHp } = ctx;
      if (!target) return [];
      const dmg = effect.amount || 12;
      simMobHp[target.instanceId] = Math.max(0, simMobHp[target.instanceId] - dmg);
      const isDead = simMobHp[target.instanceId] <= 0;
      return [{
        eventType: 'MONSTER_HIT',
        sourceName: caster.name,
        targetInstanceId: target.instanceId,
        targetName: target.name,
        damage: dmg,
        isDead,
        attackMode: 'spell',
        spellId: spell.id,
        sfx: spell.sfx || 'magic_missile',
        cueBadge: spell.badge || `💥 -${dmg}`,
        cueClass: spell.badgeClass || 'normal',
        logText: `🔮 ${caster.name} unleashes ${spell.name} on ${target.name} for ${dmg} damage!${ctx.casterRefundText}`,
        logType: 'success'
      }];
    },

    aoe_damage: (caster, spell, effect, ctx) => {
      const { livingMobs, simMobHp } = ctx;
      let totalDamageDealt = 0;
      const hitMobs = [];
      livingMobs.forEach(mob => {
        const dmg = effect.amount || 18;
        simMobHp[mob.instanceId] = Math.max(0, simMobHp[mob.instanceId] - dmg);
        const isDead = simMobHp[mob.instanceId] <= 0;
        totalDamageDealt += dmg;
        hitMobs.push({ name: mob.name, damage: dmg, isDead });
      });

      const mobNames = hitMobs.map(m => m.name).join(', ');
      const deadCount = hitMobs.filter(m => m.isDead).length;
      return [{
        eventType: 'MONSTER_HIT',
        sourceName: caster.name,
        targetName: mobNames,
        damage: totalDamageDealt,
        isDead: deadCount > 0,
        attackMode: 'spell',
        spellId: spell.id,
        sfx: spell.sfx || 'magic_missile',
        cueBadge: spell.badge || `💥 -${totalDamageDealt}`,
        cueClass: spell.badgeClass || 'crushing',
        logText: `💥 ${caster.name} unleashes ${spell.name} — ${mobNames} caught in the blast for ${totalDamageDealt} damage total!${ctx.casterRefundText}`,
        logType: 'success'
      }];
    },

    heal: (caster, spell, effect, ctx) => {
      const { party, simHeroHp, healTargetIndex } = ctx;
      let targetIdx = healTargetIndex;

      // Default to lowest HP alive hero if target is missing or dead
      if (targetIdx == null || simHeroHp[targetIdx] <= 0) {
        targetIdx = 0;
        let lowest = Infinity;
        party.forEach((h, i) => {
          if (simHeroHp[i] > 0 && simHeroHp[i] < lowest) {
            lowest = simHeroHp[i];
            targetIdx = i;
          }
        });
      }

      const targetHero = party[targetIdx];
      const healAmt = effect.amount || 15;
      const before = simHeroHp[targetIdx];
      simHeroHp[targetIdx] = Math.min(targetHero.maxHp, simHeroHp[targetIdx] + healAmt);
      const healedHp = simHeroHp[targetIdx] - before;

      return [{
        eventType: 'SPELL_CAST',
        sourceName: caster.name,
        spellId: spell.id,
        targetHeroIndex: targetIdx,
        targetHeroName: targetHero.name,
        healedHp: healedHp,
        sfx: spell.sfx || 'cure_wounds',
        cueBadge: `✨ +${healedHp} HP`,
        cueClass: 'heal',
        logText: `✨ ${caster.name} invokes ${spell.name} — ${targetHero.name} recovers ${healedHp} HP!${ctx.casterRefundText}`,
        logType: 'success'
      }];
    },

    party_heal: (caster, spell, effect, ctx) => {
      const { party, simHeroHp } = ctx;
      let totalHealed = 0;
      const partyHealMap = {};
      party.forEach((h, i) => {
        if (simHeroHp[i] > 0) {
          const healAmt = effect.amount || 20;
          const before = simHeroHp[i];
          simHeroHp[i] = Math.min(h.maxHp, simHeroHp[i] + healAmt);
          const diff = simHeroHp[i] - before;
          totalHealed += diff;
          partyHealMap[i] = simHeroHp[i];
        }
      });

      return [{
        eventType: 'SPELL_CAST',
        sourceName: caster.name,
        spellId: spell.id,
        partyHeal: true,
        partyHealMap: partyHealMap,
        totalHealed: totalHealed,
        sfx: spell.sfx || 'cure_wounds',
        cueBadge: `✨ +${totalHealed} PARTY HP`,
        cueClass: 'heal',
        logText: `✨ ${caster.name} invokes ${spell.name} — party recovers ${totalHealed} HP total!${ctx.casterRefundText}`,
        logType: 'success'
      }];
    },

    buff_attack: (caster, spell, effect, ctx) => {
      const { party, simHeroHp } = ctx;
      party.forEach((h, i) => {
        if (simHeroHp[i] > 0) {
          h.tempAttackBonus = effect.amount || 1;
          h.tempAttackRounds = effect.duration_rounds || 4;
        }
      });

      return [{
        eventType: 'SPELL_CAST',
        sourceName: caster.name,
        spellId: spell.id,
        sfx: spell.sfx || 'bless',
        cueBadge: spell.badge || '✨ COURAGE',
        cueClass: spell.badgeClass || 'normal',
        logText: `✨ ${caster.name} invokes ${spell.name} — the party is heartened (+${effect.amount || 1} attack, ${effect.duration_rounds || 4} rounds)!${ctx.casterRefundText}`,
        logType: 'success'
      }];
    },

    buff_ac: (caster, spell, effect, ctx) => {
      caster.tempAcBonus = effect.amount || 2;
      caster.tempAcRounds = effect.duration_rounds || 4;
      caster.tempAcSource = effect.source || spell.name;

      return [{
        eventType: 'SPELL_CAST',
        sourceName: caster.name,
        spellId: spell.id,
        sfx: spell.sfx || 'bless',
        cueBadge: spell.badge || '🛡️ WARD',
        cueClass: spell.badgeClass || 'ward',
        logText: `🛡️ ${caster.name} casts ${spell.name} — a protective barrier forms! (+${caster.tempAcBonus} AC, ${caster.tempAcRounds} rounds)${ctx.casterRefundText}`,
        logType: 'success'
      }];
    },

    debuff: (caster, spell, effect, ctx) => {
      const { target } = ctx;
      if (!target) return [];
      target.debuffType = effect.debuffType || 'to_hit';
      target.debuffAmount = effect.amount || 2;
      target.debuffRounds = effect.duration_rounds || 3;
      const debuffLabel = target.debuffType === 'to_hit' ? 'to-hit penalty' : 'AC penalty';

      return [{
        eventType: 'SPELL_CAST',
        sourceName: caster.name,
        spellId: spell.id,
        sfx: spell.sfx || 'sleep',
        cueBadge: spell.badge || '🌀 HEX',
        cueClass: spell.badgeClass || 'normal',
        logText: `🌀 ${caster.name} hexes ${target.name} with ${spell.name} — ${debuffLabel} for ${target.debuffRounds} rounds!${ctx.casterRefundText}`,
        logType: 'success'
      }];
    },

    sleep: (caster, spell, effect, ctx) => {
      const { target, simMobHp } = ctx;
      if (!target) return [];
      const threshold = effect.max_hp_threshold || 30;
      if (simMobHp[target.instanceId] <= threshold) {
        target.asleepRounds = effect.duration_rounds || 2;
        return [{
          eventType: 'SPELL_CAST',
          sourceName: caster.name,
          spellId: spell.id,
          sfx: 'sleep',
          cueBadge: '💤 SLEEP',
          cueClass: 'normal',
          logText: `💤 ${caster.name} casts ${spell.name} — ${target.name} collapses into slumber!${ctx.casterRefundText}`,
          logType: 'success'
        }];
      } else {
        return [{
          eventType: 'SPELL_CAST',
          sourceName: caster.name,
          spellId: spell.id,
          sfx: 'sword_miss',
          cueBadge: '🛡️ RESIST',
          cueClass: 'normal',
          logText: `💤 ${caster.name} casts ${spell.name} — ${target.name} resists the drowse (too hardy).${ctx.casterRefundText}`,
          logType: 'warning'
        }];
      }
    }
  };

  /**
   * Dispatches combat spell effects purely without mutating real HP directly.
   * @param {Object} caster 
   * @param {Object} spell 
   * @param {Object} context 
   * @returns {Array<Object>} Combat events array
   */
  static resolveCombatSpell(caster, spell, context) {
    const effect = spell.effect || {};
    const handler = this.#combatEffectHandlers[effect.type];

    if (handler) {
      return handler(caster, spell, effect, context);
    }

    // Default fallback
    return [{
      eventType: 'SPELL_CAST',
      sourceName: caster.name,
      spellId: spell.id,
      sfx: spell.sfx || 'magic_missile',
      cueBadge: spell.badge || '✨ CAST',
      cueClass: spell.badgeClass || 'normal',
      logText: `✨ ${caster.name} invokes ${spell.name}.${context.casterRefundText || ''}`,
      logType: 'info'
    }];
  }

  // =========================================================================
  // Pure Effect Handlers: Out-of-Combat Exploration Casting
  // =========================================================================

  /**
   * Resolves an out-of-combat spell invocation.
   * @param {Object} caster 
   * @param {Object} spell 
   * @param {Object} context { party, targetHeroIndex, state }
   * @returns {Object} Resolution result
   */
  static resolveExplorationSpell(caster, spell, context) {
    const effect = spell.effect || {};
    const { party, targetHeroIndex, state } = context;

    if (effect.type === 'heal') {
      let targetIdx = targetHeroIndex;
      if (targetIdx == null || targetIdx < 0 || targetIdx >= party.length) {
        let lowestHpRatio = 1.0;
        let candidateIdx = null;
        party.forEach((h, i) => {
          if (h.hp < h.maxHp) {
            const ratio = h.hp / h.maxHp;
            if (ratio < lowestHpRatio) {
              lowestHpRatio = ratio;
              candidateIdx = i;
            }
          }
        });
        if (candidateIdx === null) {
          return { success: false, reason: "All party members are already at full health." };
        }
        targetIdx = candidateIdx;
      }

      const target = party[targetIdx];
      if (!target) return { success: false, reason: "Invalid target ally." };
      if (target.hp >= target.maxHp) {
        return { success: false, reason: `${target.name} is already at full health.` };
      }

      const healAmt = effect.amount || 15;
      const before = target.hp;
      target.hp = Math.min(target.maxHp, target.hp + healAmt);
      const actualHealed = target.hp - before;
      spell.spent = true;

      return {
        success: true,
        spellName: spell.name,
        spellId: spell.id,
        sfx: spell.sfx || 'cure_wounds',
        targetHeroIndex: targetIdx,
        targetHeroName: target.name,
        hpHealed: actualHealed,
        currentHp: target.hp,
        maxHp: target.maxHp,
        wasIncapacitated: before <= 0
      };
    }

    if (effect.type === 'party_heal') {
      let totalHealed = 0;
      const healedMembers = [];
      party.forEach(h => {
        if (h.hp < h.maxHp) {
          const healAmt = effect.amount || 20;
          const before = h.hp;
          h.hp = Math.min(h.maxHp, h.hp + healAmt);
          const gained = h.hp - before;
          totalHealed += gained;
          healedMembers.push({ name: h.name, gained, hp: h.hp, maxHp: h.maxHp });
        }
      });
      spell.spent = true;

      return {
        success: true,
        spellName: spell.name,
        spellId: spell.id,
        sfx: spell.sfx || 'cure_wounds',
        totalHealed,
        healedMembers
      };
    }

    if (effect.type === 'buff_attack') {
      const amt = effect.amount || 1;
      const rounds = effect.duration_rounds || 4;
      party.forEach(h => {
        if (h.hp > 0) {
          h.tempAttackBonus = amt;
          h.tempAttackRounds = rounds;
        }
      });
      spell.spent = true;
      const isHaste = spell.id === 'haste';
      return {
        success: true,
        spellName: spell.name,
        spellId: spell.id,
        sfx: isHaste ? 'magic_missile' : 'bless',
        amount: amt,
        durationRounds: rounds,
        log: isHaste
          ? `⏩ ${caster.name} unleashes Haste! The party's reflexes and attack momentum surge (+${amt} to-hit for ${rounds} rounds).`
          : `✨ ${caster.name} invokes Bless! Sacred fervor washes over the entire party (+${amt} to-hit attack bonus for ${rounds} rounds).`
      };
    }

    if (effect.type === 'buff_ac') {
      let target = caster;
      let targetIdx = targetHeroIndex;
      if (targetIdx != null && targetIdx >= 0 && targetIdx < party.length) {
        target = party[targetIdx];
      }
      const amt = effect.amount || 2;
      const rounds = effect.duration_rounds || 3;
      const src = effect.source || spell.name;
      target.tempAcBonus = amt;
      target.tempAcRounds = rounds;
      target.tempAcSource = src;
      spell.spent = true;
      return {
        success: true,
        spellName: spell.name,
        spellId: spell.id,
        sfx: spell.sfx || 'bless',
        targetHeroIndex: targetIdx != null ? targetIdx : party.indexOf(target),
        targetHeroName: target.name,
        acBonus: amt,
        durationRounds: rounds,
        log: `🛡️ ${caster.name} invokes ${spell.name} upon ${target.name}! A protective ward surrounds them (-${amt} AC for ${rounds} rounds).`
      };
    }

    if (effect.type === 'illumination' || spell.id === 'light') {
      const durationSeconds = effect.duration_seconds || 240;
      if (state) state.lightSpellUntil = Date.now() + durationSeconds * 1000;
      spell.spent = true;
      return {
        success: true,
        spellName: spell.name,
        spellId: spell.id,
        sfx: spell.sfx || 'bless',
        isLightSpell: true,
        log: `✨ ${caster.name} casts Arcane Light! An eerie sphere of radiant luminescence hovers above the party for 4 minutes.`
      };
    }

    return {
      success: false,
      reason: `${spell.name} can only be unleashed against hostile targets during combat!`
    };
  }
}
