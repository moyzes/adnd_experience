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
  static DEITIES = [
    {
      id: 'pelor',
      name: 'Pelor',
      title: 'The Sun Father',
      symbol: '☀️',
      alignment: 'Neutral Good',
      portfolio: 'Sun, Light, Healing, Agriculture, Strength against Evil',
      idealCoordinates: { order: 0, morality: 80 },
      color: '#e3b341',
      ethos: [
        {
          title: 'Eradicate the Shadow',
          description: 'Purge undead and malignant darkness wherever they take root.',
          favoredTags: ['purge_undead', 'radiant_light', 'destroy_necromancy'],
          forbiddenTags: ['aid_undead', 'desecrate_shrine', 'dark_magic']
        },
        {
          title: 'Relieve Suffering',
          description: 'Prioritize healing, charity, and defending the vulnerable over personal wealth or glory.',
          favoredTags: ['heal_wounded', 'charity', 'defend_vulnerable'],
          forbiddenTags: ['extortion', 'neglect_wounded', 'cruelty']
        },
        {
          title: 'Nurture Life',
          description: 'Protect crops, communities, and simple folk, serving as a beacon of warmth and renewal.',
          favoredTags: ['protect_innocents', 'feed_hungry', 'restore_community'],
          forbiddenTags: ['slaughter_civilians', 'poison_wells', 'burn_fields']
        },
        {
          title: 'Tempered Mercy',
          description: 'Offer redemption to those capable of change, but strike down unyielding evil without hesitation.',
          favoredTags: ['spare_surrendered', 'offer_redemption', 'vanquish_evil'],
          forbiddenTags: ['wanton_slaughter', 'torture', 'corrupt_bargain']
        }
      ]
    },
    {
      id: 'lolth',
      name: 'Lolth',
      title: 'The Spider Queen',
      symbol: '🕷️',
      alignment: 'Chaotic Evil',
      portfolio: 'Drow, Spiders, Darkness, Ambition, Treachery',
      idealCoordinates: { order: -80, morality: -80 },
      color: '#a371f7',
      ethos: [
        {
          title: 'Dominance Through Strength',
          description: 'Power belongs strictly to those ruthless enough to seize and hold it. Weakness warrants death or enslavement.',
          favoredTags: ['ruthless_dominance', 'execute_rival', 'subjugate'],
          forbiddenTags: ['show_weakness', 'beg_mercy', 'unconditional_submission']
        },
        {
          title: 'Embrace Treachery',
          description: 'Intrigue, betrayal, and the elimination of rivals are tests of favor and natural selection.',
          favoredTags: ['betrayal', 'ambush', 'poison_dagger', 'eliminate_rival'],
          forbiddenTags: ['blind_loyalty', 'forgive_betrayal', 'pawn_sacrifice_denied']
        },
        {
          title: 'Instill Fear',
          description: 'Rule through terror, cruelty, and absolute authority over inferiors.',
          favoredTags: ['terror', 'cruelty', 'intimidate', 'torture'],
          forbiddenTags: ['compassion', 'comfort_weak', 'unsolicited_charity']
        },
        {
          title: 'Enforce Supremacy',
          description: 'Assert drow superiority over all surface dwellers and maintain Lolth\'s complete spiritual dominion.',
          favoredTags: ['drow_supremacy', 'crush_surface_pride', 'spider_veneration'],
          forbiddenTags: ['praise_surface_gods', 'humility_before_inferiors']
        }
      ]
    },
    {
      id: 'tyr',
      name: 'Tyr',
      title: 'The Maimed God / The Even-Handed',
      symbol: '⚖️',
      alignment: 'Lawful Good',
      portfolio: 'Justice, Law, Duty, Righteousness, Order',
      idealCoordinates: { order: 80, morality: 80 },
      color: '#58a6ff',
      ethos: [
        {
          title: 'Uphold Blind Fairness',
          description: 'Administer laws and moral codes with absolute impartiality. True justice ignores wealth, lineage, or personal bias—applying equally to high lords and commoners alike.',
          favoredTags: ['impartial_justice', 'uphold_law', 'refuse_bribe', 'fair_trial'],
          forbiddenTags: ['bribery', 'nepotism', 'corrupt_verdict', 'mob_rule']
        },
        {
          title: 'Protect the Wronged',
          description: 'Serve as an unyielding shield for those suffering under tyranny, corruption, or lawlessness. Righting systemic wrongs and restoring balance to a community is a sacred duty.',
          favoredTags: ['defend_oppressed', 'right_wrongs', 'shatter_tyranny', 'shield_victim'],
          forbiddenTags: ['abet_tyrant', 'ignore_plight', 'complicity_in_injustice']
        },
        {
          title: 'Bear the Burden of Sacrifice',
          description: 'Accept hardship, personal loss, and physical toll willingly if it advances the cause of good—emulating Tyr, who sacrificed his right hand to bind a cosmic threat and lost his sight in the pursuit of truth.',
          favoredTags: ['self_sacrifice', 'bear_wound_for_ally', 'endure_hardship', 'honor_duty'],
          forbiddenTags: ['cowardice', 'abandon_post', 'scapegoat_innocent']
        },
        {
          title: 'Enforce Justice, Reject Vengeance',
          description: 'Execute punishment swiftly and proportionally to restore order, never out of personal malice, anger, or bloodlust. Retribution without law is merely murder.',
          favoredTags: ['proportional_punishment', 'lawful_execution', 'restrain_bloodlust'],
          forbiddenTags: ['bloodlust_murder', 'sadistic_revenge', 'lynch_mob', 'extrajudicial_slaughter']
        }
      ]
    }
  ];

  static init(deitiesData = null) {
    if (deitiesData && Array.isArray(deitiesData) && deitiesData.length > 0) {
      // Merge custom definitions if supplied
      deitiesData.forEach(d => {
        const existingIdx = this.DEITIES.findIndex(existing => existing.id === d.id);
        if (existingIdx >= 0) {
          this.DEITIES[existingIdx] = { ...this.DEITIES[existingIdx], ...d };
        } else {
          this.DEITIES.push(d);
        }
      });
    }
  }

  static getDeity(id) {
    if (!id) return this.DEITIES[0]; // Pelor default
    return this.DEITIES.find(d => d.id.toLowerCase() === id.toLowerCase()) || this.DEITIES[0];
  }

  static getAllDeities() {
    return this.DEITIES;
  }

  /**
   * Translates 2D numeric coordinates (-100 to +100) into emergent AD&D alignment
   */
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

  /**
   * Calculates how close a Cleric's current moral coordinates are to their Deity's ideals
   */
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

    // Max potential distance on [-100, 100] grid is sqrt(200^2 + 200^2) ≈ 282.8
    // Full concordance threshold < 35, Discord > 80
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

  /**
   * Records an in-game action, adjusts the actor's coordinates,
   * applies complicity to the fellowship, and tests against Cleric tenets.
   */
  static recordMoralAction(state, actor, impact = {}) {
    if (!state || !state.party) return null;

    // Resolve actor if string/id
    let targetActor = actor;
    if (typeof actor === 'string') {
      targetActor = state.party.find(p => p && (p.id === actor || p.name === actor || p.name.toLowerCase() === actor.toLowerCase())) || state.party[0];
    }

    const orderDelta = impact.orderDelta != null ? impact.orderDelta : (impact.order != null ? impact.order : 0);
    const moralityDelta = impact.moralityDelta != null ? impact.moralityDelta : (impact.morality != null ? impact.morality : 0);
    const reason = impact.reason || impact.description || 'Action taken';
    const tags = impact.tags || [];
    const isDirectClericChoice = impact.isClericDirect || (targetActor && targetActor.classKey === 'cleric');

    // 1. Shift the primary actor
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
        const logMsg = `⚖️ ${targetActor.name}'s alignment has shifted to ${newAlign.name} (${targetActor.orderScore > 0 ? '+' : ''}${targetActor.orderScore} Order, ${targetActor.moralityScore > 0 ? '+' : ''}${targetActor.moralityScore} Morality).`;
        if (typeof state.addLog === 'function') state.addLog(logMsg, "info");
        else if (typeof state.log === 'function') state.log(logMsg, "info");
      }
    }

    // 2. Party Complicity (living allies absorb 25% of the moral drift)
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

    // 3. Evaluate Cleric Ethos Tenets
    const clerics = state.party.filter(p => p.classKey === 'cleric');
    clerics.forEach(cleric => {
      const deity = this.getDeity(cleric.patronDeityId || 'pelor');
      let favorDelta = 0;
      let reasonNote = '';

      // Check tags against deity tenets
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

      // Also factor coordinate drift into divine favor
      if (deity.id === 'pelor') {
        if (moralityDelta > 0) favorDelta += 4;
        if (moralityDelta < 0) favorDelta -= 8;
      } else if (deity.id === 'lolth') {
        if (moralityDelta < 0 && orderDelta <= 0) favorDelta += 6; // Ruthless chaos
        if (moralityDelta > 0) favorDelta -= 10; // Mercy is weakness to Lolth
      } else if (deity.id === 'tyr') {
        if (orderDelta > 0 && moralityDelta >= 0) favorDelta += 5; // Lawful good justice
        if (orderDelta < 0 || moralityDelta < 0) favorDelta -= 8; // Lawlessness or cruelty
      }

      // Apply multiplier if the cleric personally drove the decision
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
          const msg = `⚡ CRITICAL: ${deity.name} has imposed Absolute Silence on ${cleric.name}! Communion is severed.`;
          if (typeof state.addLog === 'function') state.addLog(msg, "danger");
          else if (typeof state.log === 'function') state.log(msg, "danger");
        } else if (cleric.divineFavor > 0 && cleric.absoluteSilence) {
          cleric.absoluteSilence = false;
          const msg = `✨ ${deity.name}'s divine grace has been rekindled for ${cleric.name}.`;
          if (typeof state.addLog === 'function') state.addLog(msg, "success");
          else if (typeof state.log === 'function') state.log(msg, "success");
        }
      }

      // Refresh cleric ethos status
      const concordance = this.calculateEthosConcordance(cleric);
      if (concordance) {
        cleric.ethosStatus = `${concordance.statusLabel} (${deity.name})`;
        cleric.ethosConcordance = concordance.concordancePct;
      }
    });

    return {
      actor: targetActor,
      orderDelta,
      moralityDelta,
      reason,
      tags
    };
  }
}
