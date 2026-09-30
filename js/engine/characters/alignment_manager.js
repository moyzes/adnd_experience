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
      id: "pelor",
      name: "Pelor",
      title: "The Sun Father",
      symbol: "☀️",
      alignment: "Neutral Good",
      portfolio: "Sun, Light, Healing, Agriculture, Strength against Evil",
      idealCoordinates: { order: 0, morality: 80 },
      idealOrder: 0,
      idealMorality: 80,
      color: "#e3b341",
      ethos: [
        {
          title: "Eradicate the Shadow",
          description: "Purge undead and malignant darkness wherever they take root.",
          favoredTags: ["purge_undead", "radiant_light", "destroy_necromancy"],
          forbiddenTags: ["aid_undead", "desecrate_shrine", "dark_magic"]
        },
        {
          title: "Relieve Suffering",
          description: "Prioritize healing, charity, and defending the vulnerable over personal wealth or glory.",
          favoredTags: ["heal_wounded", "charity", "defend_vulnerable"],
          forbiddenTags: ["extortion", "neglect_wounded", "cruelty"]
        },
        {
          title: "Nurture Life",
          description: "Protect crops, communities, and simple folk, serving as a beacon of warmth and renewal.",
          favoredTags: ["protect_innocents", "feed_hungry", "restore_community"],
          forbiddenTags: ["slaughter_civilians", "poison_wells", "burn_fields"]
        },
        {
          title: "Tempered Mercy",
          description: "Offer redemption to those capable of change, but strike down unyielding evil without hesitation.",
          favoredTags: ["spare_surrendered", "offer_redemption", "vanquish_evil"],
          forbiddenTags: ["wanton_slaughter", "torture", "corrupt_bargain"]
        }
      ]
    },
    {
      id: "lolth",
      name: "Lolth",
      title: "The Spider Queen",
      symbol: "🕷️",
      alignment: "Chaotic Evil",
      portfolio: "Drow, Spiders, Darkness, Ambition, Treachery",
      idealCoordinates: { order: -80, morality: -80 },
      idealOrder: -80,
      idealMorality: -80,
      color: "#a371f7",
      ethos: [
        {
          title: "Dominance Through Strength",
          description: "Power belongs strictly to those ruthless enough to seize and hold it. Weakness warrants death or enslavement.",
          favoredTags: ["ruthless_dominance", "execute_rival", "subjugate"],
          forbiddenTags: ["show_weakness", "beg_mercy", "unconditional_submission"]
        },
        {
          title: "Embrace Treachery",
          description: "Intrigue, betrayal, and the elimination of rivals are tests of favor and natural selection.",
          favoredTags: ["betrayal", "ambush", "poison_dagger", "eliminate_rival"],
          forbiddenTags: ["blind_loyalty", "forgive_betrayal", "pawn_sacrifice_denied"]
        },
        {
          title: "Instill Fear",
          description: "Rule through terror, cruelty, and absolute authority over inferiors.",
          favoredTags: ["terror", "cruelty", "intimidate", "torture"],
          forbiddenTags: ["compassion", "comfort_weak", "unsolicited_charity"]
        },
        {
          title: "Enforce Supremacy",
          description: "Assert drow superiority over all surface dwellers and maintain Lolth's complete spiritual dominion.",
          favoredTags: ["drow_supremacy", "crush_surface_pride", "spider_veneration"],
          forbiddenTags: ["praise_surface_gods", "humility_before_inferiors"]
        }
      ]
    },
    {
      id: "tyr",
      name: "Tyr",
      title: "The Maimed God / The Even-Handed",
      symbol: "⚖️",
      alignment: "Lawful Good",
      portfolio: "Justice, Law, Duty, Righteousness, Order",
      idealCoordinates: { order: 80, morality: 80 },
      idealOrder: 80,
      idealMorality: 80,
      color: "#58a6ff",
      ethos: [
        {
          title: "Uphold Blind Fairness",
          description: "Administer laws and moral codes with absolute impartiality. True justice ignores wealth, lineage, or personal bias—applying equally to high lords and commoners alike.",
          favoredTags: ["impartial_justice", "uphold_law", "refuse_bribe", "fair_trial"],
          forbiddenTags: ["bribery", "nepotism", "corrupt_verdict", "mob_rule"]
        },
        {
          title: "Protect the Wronged",
          description: "Serve as an unyielding shield for those suffering under tyranny, corruption, or lawlessness. Righting systemic wrongs and restoring balance to a community is a sacred duty.",
          favoredTags: ["defend_oppressed", "right_wrongs", "shatter_tyranny", "shield_victim"],
          forbiddenTags: ["abet_tyrant", "ignore_plight", "complicity_in_injustice"]
        },
        {
          title: "Bear the Burden of Sacrifice",
          description: "Accept hardship, personal loss, and physical toll willingly if it advances the cause of good—emulating Tyr, who sacrificed his right hand to bind a cosmic threat and lost his sight in the pursuit of truth.",
          favoredTags: ["self_sacrifice", "bear_wound_for_ally", "endure_hardship", "honor_duty"],
          forbiddenTags: ["cowardice", "abandon_post", "scapegoat_innocent"]
        },
        {
          title: "Enforce Justice, Reject Vengeance",
          description: "Execute punishment swiftly and proportionally to restore order, never out of personal malice, anger, or bloodlust. Retribution without law is merely murder.",
          favoredTags: ["proportional_punishment", "lawful_execution", "restrain_bloodlust"],
          forbiddenTags: ["bloodlust_murder", "sadistic_revenge", "lynch_mob", "extrajudicial_slaughter"]
        }
      ]
    }
  ];

  static init(deitiesData = null) {
    if (deitiesData && Array.isArray(deitiesData) && deitiesData.length > 0) {
      this.DEITIES = deitiesData;
    }
  }

  static getDeity(id) {
    if (!this.DEITIES || this.DEITIES.length === 0) {
      return { id: 'pelor', name: 'Pelor', symbol: '☀️', idealCoordinates: { order: 0, morality: 80 }, idealOrder: 0, idealMorality: 80, ethos: [] };
    }
    const found = this.DEITIES.find(d => d.id && d.id.toLowerCase() === (id || 'pelor').toLowerCase()) || this.DEITIES[0];
    const order = found.idealCoordinates ? found.idealCoordinates.order : (found.idealOrder ?? 0);
    const morality = found.idealCoordinates ? found.idealCoordinates.morality : (found.idealMorality ?? 0);
    return {
      ...found,
      idealCoordinates: { order, morality },
      idealOrder: order,
      idealMorality: morality
    };
  }

  static getAllDeities() {
    return this.DEITIES;
  }

  static getAlignmentCreed(alignmentName) {
    const creeds = {
      'Lawful Good': 'Combines honor, discipline, and oaths with deep compassion for all life, standing as a righteous shield against tyranny and corruption.',
      'Neutral Good': 'Devoted to doing good and uplifting mortal lives, cooperating with lawful structures when just, yet answering only to moral righteousness.',
      'Chaotic Good': 'Follows the dictates of conscience above all, placing individual freedom, mercy, and benevolence far above arbitrary decrees and traditions.',
      'Lawful Neutral': 'Believes that structure, duty, and honor supersede personal morals; the rule of law and fidelity to oaths are the only bulwarks against chaos.',
      'True Neutral': 'Maintains pragmatic equilibrium without fanatical devotion to extremes, seeing the dance between order, chaos, good, and evil as a cosmic balance.',
      'Chaotic Neutral': 'An ardent individualist answering to whim, passion, and personal liberty, distrustful of all rulers and unbound by dogma.',
      'Lawful Evil': 'Methodical, disciplined, and ruthlessly ambitious, bending law, contract, and hierarchy to consolidate power and subjugate the weak.',
      'Neutral Evil': 'Pure, unadulterated self-interest without remorse or honor; aligns with whatever promises personal supremacy, wealth, or survival.',
      'Chaotic Evil': 'Driven by base malice, destructive impulse, and contempt for life, reveling in slaughter, domination, and violent unpredictability.'
    };
    return creeds[alignmentName] || 'Follows a personal compass shaped by experience, circumstance, and trials.';
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

    const key = name.toLowerCase().replace(/\s+/g, '_');
    const creed = this.getAlignmentCreed(name);

    return {
      name,
      code,
      key,
      creed,
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
    if (!deity) return null;

    const dOrder = deity.idealCoordinates ? deity.idealCoordinates.order : (deity.idealOrder ?? 0);
    const dMorality = deity.idealCoordinates ? deity.idealCoordinates.morality : (deity.idealMorality ?? 0);

    // If a newly created or uncommitted cleric starts with pristine (0, 0) scores and no moral choices recorded,
    // they are aligned at their sacred consecration to their chosen patron deity.
    if ((cleric.orderScore == null || cleric.orderScore === 0) &&
        (cleric.moralityScore == null || cleric.moralityScore === 0) &&
        (!cleric.alignmentHistory || cleric.alignmentHistory.length === 0)) {
      cleric.orderScore = dOrder;
      cleric.moralityScore = dMorality;
    }

    const cOrder = cleric.orderScore != null ? cleric.orderScore : dOrder;
    const cMorality = cleric.moralityScore != null ? cleric.moralityScore : dMorality;

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
