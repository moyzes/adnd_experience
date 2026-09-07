/**
 * SpellRegistry - Canonical data-driven spell registry and effect dispatcher.
 * Vancian constructs use effect.dice (NdS+M); buffs still use effect.amount.
 */

export class SpellRegistry {
  static #spellsById = new Map();
  static #spellsByClass = { mage: [], cleric: [] };

  static init(spellData, classesData = null) {
    this.#spellsById.clear();
    this.#spellsByClass.mage = [];
    this.#spellsByClass.cleric = [];
    const spellList = Array.isArray(spellData) ? spellData : (spellData?.spells || []);
    spellList.forEach(spell => {
      this.#spellsById.set(spell.id, spell);
      const classKey = (spell.class || '').toLowerCase();
      if (this.#spellsByClass[classKey]) this.#spellsByClass[classKey].push(spell);
    });
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

  static getAll() { return Array.from(this.#spellsById.values()); }
  static get(id) { return this.#spellsById.get(id) || null; }
  static getSpellsForClass(classKey, maxTier = 4) {
    const list = this.#spellsByClass[(classKey || '').toLowerCase()] || [];
    return list.filter(s => (s.tier || 1) <= maxTier);
  }
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

  static rollDice(expr) {
    if (!expr || typeof expr !== 'string') return null;
    const m = String(expr).trim().match(/^(\d+)d(\d+)([+-]\d+)?$/i);
    if (!m) return null;
    const n = Math.min(20, parseInt(m[1], 10));
    const sides = Math.min(100, parseInt(m[2], 10));
    const bonus = m[3] ? parseInt(m[3], 10) : 0;
    const rolls = [];
    let total = bonus;
    for (let i = 0; i < n; i++) {
      const r = Math.floor(Math.random() * sides) + 1;
      rolls.push(r);
      total += r;
    }
    return { expr: `${n}d${sides}${bonus ? (bonus > 0 ? `+${bonus}` : `${bonus}`) : ''}`, rolls, bonus, total: Math.max(0, total) };
  }

  static resolveMagnitude(effect, fallback = 0) {
    const rolled = effect?.dice ? this.rollDice(effect.dice) : null;
    if (rolled) {
      const bonusBit = rolled.bonus ? (rolled.bonus > 0 ? `+${rolled.bonus}` : `${rolled.bonus}`) : '';
      return { value: rolled.total, detail: `${rolled.expr} [${rolled.rolls.join(',')}]${bonusBit}` };
    }
    const value = effect?.amount != null ? effect.amount : fallback;
    return { value, detail: null };
  }

  static #formatMagnitude(value, detail) {
    return detail ? `${value} (${detail})` : `${value}`;
  }

  static #combatEffectHandlers = {
    damage: (caster, spell, effect, ctx) => {
      const { target, simMobHp } = ctx;
      if (!target) return [];
      const mag = SpellRegistry.resolveMagnitude(effect, 12);
      const dmg = mag.value;
      simMobHp[target.instanceId] = Math.max(0, simMobHp[target.instanceId] - dmg);
      const isDead = simMobHp[target.instanceId] <= 0;
      return [{
        eventType: 'MONSTER_HIT', sourceName: caster.name, targetInstanceId: target.instanceId,
        targetName: target.name, damage: dmg, diceDetail: mag.detail, isDead, attackMode: 'spell',
        spellId: spell.id, sfx: spell.sfx || 'magic_missile', cueBadge: spell.badge || `-${dmg}`,
        cueClass: spell.badgeClass || 'normal',
        logText: `${caster.name} unleashes ${spell.name} on ${target.name} for ${SpellRegistry.#formatMagnitude(dmg, mag.detail)} damage!${ctx.casterRefundText}`,
        logType: 'success'
      }];
    },
    aoe_damage: (caster, spell, effect, ctx) => {
      const { livingMobs, simMobHp } = ctx;
      let totalDamageDealt = 0;
      const hitMobs = [];
      livingMobs.forEach(mob => {
        const mag = SpellRegistry.resolveMagnitude(effect, 18);
        const dmg = mag.value;
        simMobHp[mob.instanceId] = Math.max(0, simMobHp[mob.instanceId] - dmg);
        const isDead = simMobHp[mob.instanceId] <= 0;
        totalDamageDealt += dmg;
        hitMobs.push({ name: mob.name, damage: dmg, isDead, detail: mag.detail });
      });
      const perTarget = hitMobs.map(m => `${m.name} ${SpellRegistry.#formatMagnitude(m.damage, m.detail)}`).join('; ');
      return [{
        eventType: 'MONSTER_HIT', sourceName: caster.name, targetName: hitMobs.map(m => m.name).join(', '),
        damage: totalDamageDealt, isDead: hitMobs.some(m => m.isDead), attackMode: 'spell',
        spellId: spell.id, sfx: spell.sfx || 'magic_missile', cueBadge: spell.badge || `-${totalDamageDealt}`,
        cueClass: spell.badgeClass || 'crushing',
        logText: `${caster.name} unleashes ${spell.name} — ${perTarget} (${totalDamageDealt} total)!${ctx.casterRefundText}`,
        logType: 'success'
      }];
    },
    heal: (caster, spell, effect, ctx) => {
      const { party, simHeroHp, healTargetIndex } = ctx;
      let targetIdx = healTargetIndex;
      if (targetIdx == null || simHeroHp[targetIdx] <= 0) {
        targetIdx = 0;
        let lowest = Infinity;
        party.forEach((h, i) => {
          if (simHeroHp[i] > 0 && simHeroHp[i] < lowest) { lowest = simHeroHp[i]; targetIdx = i; }
        });
      }
      const targetHero = party[targetIdx];
      const mag = SpellRegistry.resolveMagnitude(effect, 8);
      const before = simHeroHp[targetIdx];
      simHeroHp[targetIdx] = Math.min(targetHero.maxHp, simHeroHp[targetIdx] + mag.value);
      const healedHp = simHeroHp[targetIdx] - before;
      return [{
        eventType: 'SPELL_CAST', sourceName: caster.name, spellId: spell.id, targetHeroIndex: targetIdx,
        targetHeroName: targetHero.name, healedHp, diceDetail: mag.detail, sfx: spell.sfx || 'cure_wounds',
        cueBadge: `+${healedHp} HP`, cueClass: 'heal',
        logText: `${caster.name} invokes ${spell.name} — ${targetHero.name} recovers ${SpellRegistry.#formatMagnitude(healedHp, mag.detail)} HP!${ctx.casterRefundText}`,
        logType: 'success'
      }];
    },
    party_heal: (caster, spell, effect, ctx) => {
      const { party, simHeroHp } = ctx;
      let totalHealed = 0;
      const partyHealMap = {};
      party.forEach((h, i) => {
        if (simHeroHp[i] > 0) {
          const mag = SpellRegistry.resolveMagnitude(effect, 8);
          const before = simHeroHp[i];
          simHeroHp[i] = Math.min(h.maxHp, simHeroHp[i] + mag.value);
          totalHealed += simHeroHp[i] - before;
          partyHealMap[i] = simHeroHp[i];
        }
      });
      return [{
        eventType: 'SPELL_CAST', sourceName: caster.name, spellId: spell.id, partyHeal: true, partyHealMap,
        totalHealed, sfx: spell.sfx || 'cure_wounds', cueBadge: `+${totalHealed} PARTY HP`, cueClass: 'heal',
        logText: `${caster.name} invokes ${spell.name} — party recovers ${totalHealed} HP total!${ctx.casterRefundText}`,
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
      return [{ eventType: 'SPELL_CAST', sourceName: caster.name, spellId: spell.id, sfx: spell.sfx || 'bless',
        cueBadge: spell.badge || 'COURAGE', cueClass: spell.badgeClass || 'normal',
        logText: `${caster.name} invokes ${spell.name} — the party is heartened (+${effect.amount || 1} attack, ${effect.duration_rounds || 4} rounds)!${ctx.casterRefundText}`,
        logType: 'success' }];
    },
    buff_ac: (caster, spell, effect, ctx) => {
      caster.tempAcBonus = effect.amount || 2;
      caster.tempAcRounds = effect.duration_rounds || 4;
      caster.tempAcSource = effect.source || spell.name;
      return [{ eventType: 'SPELL_CAST', sourceName: caster.name, spellId: spell.id, sfx: spell.sfx || 'bless',
        cueBadge: spell.badge || 'WARD', cueClass: spell.badgeClass || 'ward',
        logText: `${caster.name} casts ${spell.name} — a protective barrier forms! (+${caster.tempAcBonus} AC, ${caster.tempAcRounds} rounds)${ctx.casterRefundText}`,
        logType: 'success' }];
    },
    debuff: (caster, spell, effect, ctx) => {
      const { target } = ctx;
      if (!target) return [];
      target.debuffType = effect.debuffType || 'to_hit';
      target.debuffAmount = effect.amount || 2;
      target.debuffRounds = effect.duration_rounds || 3;
      const debuffLabel = target.debuffType === 'to_hit' ? 'to-hit penalty' : 'AC penalty';
      return [{ eventType: 'SPELL_CAST', sourceName: caster.name, spellId: spell.id, sfx: spell.sfx || 'sleep',
        cueBadge: spell.badge || 'HEX', cueClass: spell.badgeClass || 'normal',
        logText: `${caster.name} hexes ${target.name} with ${spell.name} — ${debuffLabel} for ${target.debuffRounds} rounds!${ctx.casterRefundText}`,
        logType: 'success' }];
    },
    sleep: (caster, spell, effect, ctx) => {
      const { target, simMobHp } = ctx;
      if (!target) return [];
      const threshold = effect.max_hp_threshold || 30;
      if (simMobHp[target.instanceId] <= threshold) {
        target.asleepRounds = effect.duration_rounds || 2;
        return [{ eventType: 'SPELL_CAST', sourceName: caster.name, spellId: spell.id, sfx: 'sleep',
          cueBadge: 'SLEEP', cueClass: 'normal',
          logText: `${caster.name} casts ${spell.name} — ${target.name} collapses into slumber!${ctx.casterRefundText}`,
          logType: 'success' }];
      }
      return [{ eventType: 'SPELL_CAST', sourceName: caster.name, spellId: spell.id, sfx: 'sword_miss',
        cueBadge: 'RESIST', cueClass: 'normal',
        logText: `${caster.name} casts ${spell.name} — ${target.name} resists the drowse (too hardy).${ctx.casterRefundText}`,
        logType: 'warning' }];
    }
  };

  static resolveCombatSpell(caster, spell, context) {
    const effect = spell.effect || {};
    const handler = this.#combatEffectHandlers[effect.type];
    if (handler) return handler(caster, spell, effect, context);
    return [{ eventType: 'SPELL_CAST', sourceName: caster.name, spellId: spell.id,
      sfx: spell.sfx || 'magic_missile', cueBadge: spell.badge || 'CAST', cueClass: spell.badgeClass || 'normal',
      logText: `${caster.name} invokes ${spell.name}.${context.casterRefundText || ''}`, logType: 'info' }];
  }

  static resolveExplorationSpell(caster, spell, context) {
    const effect = spell.effect || {};
    const { party, targetHeroIndex, state } = context;
    if (effect.type === 'heal') {
      let targetIdx = targetHeroIndex;
      if (targetIdx == null || targetIdx < 0 || targetIdx >= party.length) {
        let lowestHpRatio = 1.0, candidateIdx = null;
        party.forEach((h, i) => {
          if (h.hp < h.maxHp) {
            const ratio = h.hp / h.maxHp;
            if (ratio < lowestHpRatio) { lowestHpRatio = ratio; candidateIdx = i; }
          }
        });
        if (candidateIdx === null) return { success: false, reason: 'All party members are already at full health.' };
        targetIdx = candidateIdx;
      }
      const target = party[targetIdx];
      if (!target) return { success: false, reason: 'Invalid target ally.' };
      if (target.hp >= target.maxHp) return { success: false, reason: `${target.name} is already at full health.` };
      const mag = SpellRegistry.resolveMagnitude(effect, 8);
      const before = target.hp;
      target.hp = Math.min(target.maxHp, target.hp + mag.value);
      spell.spent = true;
      return { success: true, spellName: spell.name, spellId: spell.id, sfx: spell.sfx || 'cure_wounds',
        targetHeroIndex: targetIdx, targetHeroName: target.name, hpHealed: target.hp - before,
        diceDetail: mag.detail, currentHp: target.hp, maxHp: target.maxHp, wasIncapacitated: before <= 0 };
    }
    if (effect.type === 'party_heal') {
      let totalHealed = 0;
      const healedMembers = [];
      party.forEach(h => {
        if (h.hp < h.maxHp) {
          const mag = SpellRegistry.resolveMagnitude(effect, 8);
          const before = h.hp;
          h.hp = Math.min(h.maxHp, h.hp + mag.value);
          const gained = h.hp - before;
          totalHealed += gained;
          healedMembers.push({ name: h.name, gained, hp: h.hp, maxHp: h.maxHp });
        }
      });
      spell.spent = true;
      return { success: true, spellName: spell.name, spellId: spell.id, sfx: spell.sfx || 'cure_wounds', totalHealed, healedMembers };
    }
    if (effect.type === 'buff_attack') {
      const amt = effect.amount || 1;
      const rounds = effect.duration_rounds || 4;
      party.forEach(h => { if (h.hp > 0) { h.tempAttackBonus = amt; h.tempAttackRounds = rounds; } });
      spell.spent = true;
      const isHaste = spell.id === 'haste';
      return { success: true, spellName: spell.name, spellId: spell.id, sfx: isHaste ? 'magic_missile' : 'bless',
        amount: amt, durationRounds: rounds,
        log: isHaste
          ? `${caster.name} unleashes Haste! The party's reflexes surge (+${amt} to-hit for ${rounds} rounds).`
          : `${caster.name} invokes Bless! (+${amt} to-hit for ${rounds} rounds).` };
    }
    if (effect.type === 'buff_ac') {
      let target = caster;
      let targetIdx = targetHeroIndex;
      if (targetIdx != null && targetIdx >= 0 && targetIdx < party.length) target = party[targetIdx];
      const amt = effect.amount || 2;
      const rounds = effect.duration_rounds || 3;
      target.tempAcBonus = amt; target.tempAcRounds = rounds; target.tempAcSource = effect.source || spell.name;
      spell.spent = true;
      return { success: true, spellName: spell.name, spellId: spell.id, sfx: spell.sfx || 'bless',
        targetHeroIndex: targetIdx != null ? targetIdx : party.indexOf(target), targetHeroName: target.name,
        acBonus: amt, durationRounds: rounds,
        log: `${caster.name} invokes ${spell.name} upon ${target.name}! (-${amt} AC for ${rounds} rounds).` };
    }
    if (effect.type === 'illumination' || spell.id === 'light') {
      const durationSeconds = effect.duration_seconds || 240;
      if (state) state.lightSpellUntil = Date.now() + durationSeconds * 1000;
      spell.spent = true;
      return { success: true, spellName: spell.name, spellId: spell.id, sfx: spell.sfx || 'bless', isLightSpell: true,
        log: `${caster.name} casts Arcane Light! A sphere of radiance hovers for 4 minutes.` };
    }
    return { success: false, reason: `${spell.name} can only be unleashed against hostile targets during combat!` };
  }
}
