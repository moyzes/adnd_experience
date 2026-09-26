/**
 * Alignment & Deity Ethos Management Engine
 *
 * Implements an emergent 2-axis morality system (Order vs Chaos, Good vs Evil)
 * where characters start uncommitted (True Neutral) and their actual choices
 * drive their emergent alignment.
 *
 * Clerics choose a Patron Deity upfront (Pelor, Lolth, or Tyr), and their in-game
 * deeds are constantly evaluated against the sacred ethos and divine tenets of that god.
 */

export class AlignmentManager {
  static DEITIES = [];

  static init(deitiesData = null) {
    if (deitiesData && Array.isArray(deitiesData) && deitiesData.length > 0) {
      this.DEITIES = deitiesData;
    }
  }

  static getDeity(id) {
    if (!id) return this.DEITIES[0];
    return this.DEITIES.find(d => d.id.toLowerCase() === id.toLowerCase()) || this.DEITIES[0];
  }

  static getAllDeities() {
    return this.DEITIES;
  }

  static getAlignment(orderScore = 0, moralityScore = 0) {
    const oVal = Math.max(-100, Math.min(100, Math.round(orderScore)));
    const mVal = Math.max(-100, Math.min(100, Math.round(moralityScore)));

    const oTier = oVal >= 25 ? 'Lawful' : (oVal <= -25 ? 'Chaotic' : 'Neutral');
    const mTier = mVal >= 25 ? 'Good' : (mVal <= -25 ? 'Evil' : 'Neutral');

    let name = '';
    let code = '';
    let color = '#8b949e';

    if (oTier === 'Neutral' && mTier === 'Neutral') {
      name = 'True Neutral';
      code = 'TN';
      color = '#e6edf3';
    } else if (oTier === 'Neutral') {
      name = `Neutral ${mTier}`;
      code = `N${mTier[0]}`;
      color = mTier === 'Good' ? '#7ee787' : '#ff7b72';
    } else if (mTier === 'Neutral') {
      name = `${oTier} Neutral`;
      code = `${oTier[0]}N`;
      color = oTier === 'Lawful' ? '#58a6ff' : '#d2a8ff';
    } else {
      name = `${oTier} ${mTier}`;
      code = `${oTier[0]}${mTier[0]}`;
      if (name === 'Lawful Good') color = '#79c0ff';
      else if (name === 'Chaotic Good') color = '#56d364';
      else if (name === 'Lawful Evil') color = '#d2a8ff';
      else if (name === 'Chaotic Evil') color = '#f85149';
    }

    return {
      name,
      code,
      orderScore: oVal,
      moralityScore: mVal,
      orderTier: oTier,
      moralityTier: mTier,
      color,
      isEmergent: true
    };
  }

  static calculateEthosConcordance(cleric) {
    if (!cleric) return null;
    const deity = this.getDeity(cleric.patronDeityId || 'pelor');
    const cOrder = cleric.orderScore || 0;
    const cMorality = cleric.moralityScore || 0;

    const dOrder = deity.idealCoordinates.order;
    const dMorality = deity.idealCoordinates.morality;

    const dx = cOrder - dOrder;
    const dy = cMorality - dMorality;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const rawConcordance = Math.max(0, Math.min(100, Math.round(100 - (distance / 1.6))));

    let statusLabel = 'Full Communion';
    let statusColor = '#3fb950';

    if (cleric.divineFavor <= 0 || cleric.absoluteSilence) {
      statusLabel = 'Absolute Silence';
      statusColor = '#f85149';
    } else if (rawConcordance >= 75) {
      statusLabel = 'Holy Resonance';
      statusColor = '#3fb950';
    } else if (rawConcordance >= 50) {
      statusLabel = 'Devout Concord';
      statusColor = '#58a6ff';
    } else if (rawConcordance >= 30) {
      statusLabel = 'Spiritual Strain';
      statusColor = '#d29922';
    } else {
      statusLabel = 'Ethos Heresy';
      statusColor = '#f85149';
    }

    return {
      deity,
      distance: Math.round(distance),
      concordancePct: rawConcordance,
      statusLabel,
      statusColor
    };
  }

  static recordMoralAction(state, actor, impact = {}) {
    if (!state || !state.party) return null;

    let targetActor = actor;
    if (typeof actor === 'string') {
      targetActor = state.party.find(p => p && (p.id === actor || p.name === actor || p.name.toLowerCase() === actor.toLowerCase())) || state.party[0];
    }

    const orderDelta = impact.orderDelta != null ? impact.orderDelta : (impact.order != null ? impact.order : 0);
    const moralityDelta = impact.moralityDelta != null ? impact.moralityDelta : (impact.morality != null ? impact.morality : 0);
    const reason = impact.reason || impact.description || 'Action taken';
    const tags = impact.tags || [];
    const isDirectClericChoice = impact.isClericDirect || (targetActor && targetActor.classKey === 'cleric');

    if (targetActor) {
      const prevAlign = this.getAlignment(targetActor.orderScore || 0, targetActor.moralityScore || 0);
      targetActor.orderScore = Math.max(-100, Math.min(100, (targetActor.orderScore || 0) + orderDelta));
      targetActor.moralityScore = Math.max(-100, Math.min(100, (targetActor.moralityScore || 0) + moralityDelta));
      const newAlign = this.getAlignment(targetActor.orderScore, targetActor.moralityScore);

      if (!targetActor.alignmentHistory) targetActor.alignmentHistory = [];
      targetActor.alignmentHistory.unshift({
        reason,
        orderDelta,
        moralityDelta,
        resultingAlignment: newAlign.name,
        timestamp: Date.now()
      });
      if (targetActor.alignmentHistory.length > 8) targetActor.alignmentHistory.pop();

      if (prevAlign.name !== newAlign.name && (orderDelta !== 0 || moralityDelta !== 0)) {
        const logMsg = `\u2696\ufe0f ${targetActor.name}'s alignment has shifted to ${newAlign.name} (${targetActor.orderScore > 0 ? '+' : ''}${targetActor.orderScore} Order, ${targetActor.moralityScore > 0 ? '+' : ''}${targetActor.moralityScore} Morality).`;
        if (typeof state.addLog === 'function') state.addLog(logMsg, "info");
        else if (typeof state.log === 'function') state.log(logMsg, "info");
      }
    }

    const livingAllies = state.party.filter(p => p !== targetActor && p.hp > 0);
    if (livingAllies.length > 0 && (orderDelta !== 0 || moralityDelta !== 0)) {
      const complicityOrder = Math.round(orderDelta * 0.25);
      const complicityMorality = Math.round(moralityDelta * 0.25);
      if (complicityOrder !== 0 || complicityMorality !== 0) {
        livingAllies.forEach(companion => {
          companion.orderScore = Math.max(-100, Math.min(100, (companion.orderScore || 0) + complicityOrder));
          companion.moralityScore = Math.max(-100, Math.min(100, (companion.moralityScore || 0) + complicityMorality));
        });
      }
    }

    const clerics = state.party.filter(p => p.classKey === 'cleric');
    clerics.forEach(cleric => {
      const deity = this.getDeity(cleric.patronDeityId || 'pelor');
      let favorDelta = 0;
      let reasonNote = '';

      deity.ethos.forEach(tenet => {
        const matchesFavored = tags.some(t => tenet.favoredTags?.includes(t));
        const matchesForbidden = tags.some(t => tenet.forbiddenTags?.includes(t));
        if (matchesFavored) {
          favorDelta += 10;
          reasonNote = `Upholding [${tenet.title}]`;
        }
        if (matchesForbidden) {
          favorDelta -= 15;
          reasonNote = `Violating [${tenet.title}]`;
        }
      });

      if (deity.id === 'pelor') {
        if (moralityDelta > 0) favorDelta += 4;
        if (moralityDelta < 0) favorDelta -= 8;
      } else if (deity.id === 'lolth') {
        if (moralityDelta < 0 && orderDelta <= 0) favorDelta += 6;
        if (moralityDelta > 0) favorDelta -= 10;
      } else if (deity.id === 'tyr') {
        if (orderDelta > 0 && moralityDelta >= 0) favorDelta += 5;
        if (orderDelta < 0 || moralityDelta < 0) favorDelta -= 8;
      }

      const multiplier = isDirectClericChoice ? 1.5 : 1.0;
      const finalFavorDelta = Math.round(favorDelta * multiplier);

      if (finalFavorDelta !== 0) {
        const prevFavor = cleric.divineFavor || 0;
        cleric.divineFavor = Math.max(0, Math.min(cleric.maxDivineFavor || 100, prevFavor + finalFavorDelta));
        const actualDelta = cleric.divineFavor - prevFavor;

        if (actualDelta > 0) {
          const msg = `${deity.symbol} ${deity.name} honors ${cleric.name} (+${actualDelta}% Divine Favor)! ${reasonNote ? `— ${reasonNote}` : ''}`;
          if (typeof state.addLog === 'function') state.addLog(msg, "success");
          else if (typeof state.log === 'function') state.log(msg, "success");
        } else if (actualDelta < 0) {
          const msg = `${deity.symbol} ${deity.name} expresses holy displeasure with ${cleric.name} (${actualDelta}% Divine Favor)! ${reasonNote ? `— ${reasonNote}` : ''}`;
          if (typeof state.addLog === 'function') state.addLog(msg, "danger");
          else if (typeof state.log === 'function') state.log(msg, "danger");
        }

        if (cleric.divineFavor === 0) {
          cleric.absoluteSilence = true;
          const msg = `\u26a1 CRITICAL: ${deity.name} has imposed Absolute Silence on ${cleric.name}! Communion is severed.`;
          if (typeof state.addLog === 'function') state.addLog(msg, "danger");
          else if (typeof state.log === 'function') state.log(msg, "danger");
        } else if (cleric.divineFavor > 0 && cleric.absoluteSilence) {
          cleric.absoluteSilence = false;
          const msg = `\u2728 ${deity.name}'s divine grace has been rekindled for ${cleric.name}.`;
          if (typeof state.addLog === 'function') state.addLog(msg, "success");
          else if (typeof state.log === 'function') state.log(msg, "success");
        }
      }

      const concordance = this.calculateEthosConcordance(cleric);
      if (concordance) {
        cleric.ethosStatus = `${concordance.statusLabel} (${deity.name})`;
        cleric.ethosConcordance = concordance.concordancePct;
      }
    });

    return { actor: targetActor, orderDelta, moralityDelta, reason, tags };
  }
}
