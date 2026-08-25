/**
 * AD&D 2nd Edition Saving Throw System & Heroic Narrative Engine
 * 
 * Based on Gary Gygax's 1e/2e Dungeon Master's Guide philosophy:
 * Saving throws represent a combination of luck, destiny, split-second reflexes,
 * divine favor, and sheer physical willpower. Pulp heroes (Conan, Fafhrd, Gray Mouser,
 * Holger Carlsson, Cugel the Clever) wrench themselves back from the abyss through active agency.
 */

export const SAVING_THROW_LIBRARY = {
  PARALYZATION_POISON_DEATH: {
    POISON: {
      PASS: {
        WARRIOR: "{name}'s dark blood surges—their liver burns off the cobratoxin before their heart gives out!",
        ROGUE: "Sniffing the bitter almond scent at the last millisecond, {name} spits the tainted liquid onto the stone!",
        WIZARD: "{name} mutters a rapid counter-purge incantation, vomiting the black bile before it takes root!",
        CLERIC: "Raising a holy symbol, {name} purges the creeping venom through a sharp, agonizing breath of grace!"
      },
      FAIL: "{name}'s veins turn black as the venom reaches their heart—muscles seize, vision fails, and breath collapses!"
    },
    PARALYZATION: {
      PASS: {
        WARRIOR: "Gritting teeth until gums bleed, {name} forcibly shatters the dead-weight creeping into their limbs!",
        ROGUE: "{name}'s nerve reflexes snap back online just in time, slipping out of the stiffening rigor!",
        WIZARD: "{name} channels a sharp neural shock through their own spine, breaking the magical paralysis!",
        CLERIC: "Invocations of divine mobility flare through {name}'s nervous system, casting off the icy stiffness!"
      },
      FAIL: "{name}'s body freezes into a cold, motionless slab—trapped inside a silent cage of their own unyielding flesh!"
    },
    DEATH_MAGIC: {
      PASS: {
        WARRIOR: "{name}'s heart halts for two terrifying beats, but raw, furious refusal to die forces their chest to heave again!",
        ROGUE: "{name} sidesteps the dark aura by a hair's breadth, feeling the chilling draft of the abyss brush their cheek!",
        WIZARD: "{name} erects a quick mental ward; the killing spell shatters harmlessly against their intellect!",
        CLERIC: "{name} asserts divine authority against the void; the nether-curse recoils from their sacred standing!"
      },
      FAIL: "The word of killing strikes {name} squarely—their soul is violently unmoored, and their body drops like a rag doll!"
    }
  },

  /* --- CATEGORY 2: ROD, STAFF, OR WAND --- */
  ROD_STAFF_WAND: {
    PASS: {
      WARRIOR: "{name} raises their steel shield just as the wand-ray strikes—sparks shower as the beam deflects into the ceiling!",
      ROGUE: "{name} contorts mid-air, slipping beneath the crackling ray of light as it scorches the wall behind them!",
      WIZARD: "{name} recognizes the arcane discharge matrix and ducking early, letting the beam sizzle overhead!",
      CLERIC: "{name} interposes their heavy holy mace, absorbing the rod's energy in a flash of divine grounding!"
    },
    FAIL: "The focused beam from the magical weapon strikes {name} dead-center, blasting them backward in a shower of arcana!"
  },

  /* --- CATEGORY 3: PETRIFICATION OR POLYMORPH --- */
  PETRIFICATION_POLYMORPH: {
    PETRIFICATION: {
      PASS: {
        WARRIOR: "Gray stone creeps up {name}'s arms like frost, but a roaring surge of muscle shatters the calcification!",
        ROGUE: "{name} catches the petrifying gaze in a mirror-polished dagger blade, wrenching their eyes away just in time!",
        WIZARD: "{name} rapidly alters their own dermal density, causing the petrification spell to slide off harmlessly!",
        CLERIC: "{name} invokes the permanence of their deity's creation; the calcifying curse flakes off like dry dust!"
      },
      FAIL: "Cold, heavy stone locks {name}'s joints—eyes freeze in a final, horrified gaze as they turn completely to granite!"
    },
    POLYMORPH: {
      PASS: {
        WARRIOR: "{name}'s skeleton groans as it tries to warp, but their sheer physical integrity forces their body back to human shape!",
        ROGUE: "{name}'s flesh twists grotesquely for a second before their agile form snaps back, rejecting the beast-shape!",
        WIZARD: "{name} understands the transmutation matrix and counter-resonates their own cellular structure!",
        CLERIC: "{name} rejects the unholy alteration of their sacred form, holding their true shape through divine order!"
      },
      FAIL: "{name}'s bones dissolve and reconfigure with sickening pops—their human voice melting into a wretched beast's squeal!"
    }
  },

  /* --- CATEGORY 4: BREATH WEAPON --- */
  BREATH_WEAPON: {
    PASS: {
      WARRIOR: "{name} digs their heels in and ducking behind their tower shield, taking the brunt of the elemental wave on raw steel!",
      ROGUE: "{name} throws themselves flat into a rut in the stone floor—the roaring inferno passes inches above their back!",
      WIZARD: "{name} snaps open a quick cloak-ward, riding the pressure wave out of the core blast radius!",
      CLERIC: "{name} plants their feet and shouts a prayer of protection, splitting the roaring breath cone around the party!"
    },
    FAIL: "{name} is caught dead-center in the elemental blast—armor sears, flesh burns, and the full wave engulfs them!"
  },

  /* --- CATEGORY 5: SPELL (GENERAL ARCANE / DIVINE) --- */
  SPELL: {
    PASS: {
      WARRIOR: "{name} roars in pure physical defiance, shaking off the insidious spellcraft through sheer stubborn force of will!",
      ROGUE: "{name} slips past the magical targeting area, exploiting a dead-zone in the spell's somatic pattern!",
      WIZARD: "{name} unravels the incantation's structure in real-time, causing the hostile magic to fizzle into harmless sparks!",
      CLERIC: "{name}'s divine aura repels the profane sorcery, casting the hostile spell back into the ether!"
    },
    FAIL: "The spell's full magical weight lodges directly into {name}, rewriting reality and overriding their defenses!"
  }
};

/**
 * Standard AD&D 2nd Edition Saving Throw Matrix by Group and Level.
 */
export const ADND_2E_SAVING_THROWS = {
  warrior: [
    // L1-2, L3-4, L5-6, L7-8, L9-10
    { maxLevel: 2, poison: 14, wand: 16, petrification: 15, breath: 17, spell: 17 },
    { maxLevel: 4, poison: 13, wand: 15, petrification: 14, breath: 16, spell: 16 },
    { maxLevel: 6, poison: 11, wand: 13, petrification: 12, breath: 13, spell: 14 },
    { maxLevel: 8, poison: 10, wand: 12, petrification: 11, breath: 12, spell: 13 },
    { maxLevel: 10, poison: 8, wand: 10, petrification: 9, breath: 9, spell: 11 }
  ],
  priest: [
    { maxLevel: 3, poison: 10, wand: 14, petrification: 13, breath: 16, spell: 15 },
    { maxLevel: 6, poison: 9, wand: 13, petrification: 12, breath: 15, spell: 14 },
    { maxLevel: 9, poison: 7, wand: 11, petrification: 10, breath: 13, spell: 12 },
    { maxLevel: 10, poison: 6, wand: 10, petrification: 9, breath: 12, spell: 11 }
  ],
  rogue: [
    { maxLevel: 4, poison: 13, wand: 14, petrification: 12, breath: 16, spell: 15 },
    { maxLevel: 8, poison: 12, wand: 12, petrification: 11, breath: 15, spell: 13 },
    { maxLevel: 10, poison: 11, wand: 10, petrification: 10, breath: 14, spell: 11 }
  ],
  wizard: [
    { maxLevel: 5, poison: 14, wand: 11, petrification: 13, breath: 15, spell: 12 },
    { maxLevel: 10, poison: 13, wand: 9, petrification: 11, breath: 13, spell: 10 }
  ]
};

/**
 * Maps class keys to the 4 archetypal groups.
 */
export function getClassArchetypeGroup(classKey) {
  switch ((classKey || '').toLowerCase()) {
    case 'fighter':
    case 'paladin':
    case 'ranger':
      return 'WARRIOR';
    case 'thief':
    case 'bard':
    case 'rogue':
      return 'ROGUE';
    case 'mage':
    case 'wizard':
    case 'illusionist':
      return 'WIZARD';
    case 'cleric':
    case 'druid':
    case 'priest':
      return 'CLERIC';
    default:
      return 'WARRIOR';
  }
}

/**
 * Normalizes saving throw category names into canonical keys.
 */
export function normalizeCategory(categoryStr) {
  const cat = (categoryStr || '').toUpperCase().trim();
  if (cat.includes('POISON') || cat.includes('PARALYZ') || cat.includes('DEATH')) {
    return 'PARALYZATION_POISON_DEATH';
  }
  if (cat.includes('WAND') || cat.includes('ROD') || cat.includes('STAFF')) {
    return 'ROD_STAFF_WAND';
  }
  if (cat.includes('PETRI') || cat.includes('POLYMORPH') || cat.includes('STONE')) {
    return 'PETRIFICATION_POLYMORPH';
  }
  if (cat.includes('BREATH') || cat.includes('AREA') || cat.includes('TRAP') || cat.includes('FIRE') || cat.includes('SPEAR')) {
    return 'BREATH_WEAPON';
  }
  return 'SPELL';
}

/**
 * Normalizes the sub-category if applicable.
 */
export function normalizeSubCategory(category, subCategoryStr) {
  const normCat = normalizeCategory(category);
  const sub = (subCategoryStr || '').toUpperCase().trim();

  if (normCat === 'PARALYZATION_POISON_DEATH') {
    if (sub.includes('PARALYZ')) return 'PARALYZATION';
    if (sub.includes('DEATH')) return 'DEATH_MAGIC';
    return 'POISON';
  }

  if (normCat === 'PETRIFICATION_POLYMORPH') {
    if (sub.includes('POLYMORPH')) return 'POLYMORPH';
    return 'PETRIFICATION';
  }

  return null;
}

/**
 * Retrieves the 2e base saving throw target for a hero.
 */
export function getBaseSavingThrowTarget(hero, category) {
  const group = getClassArchetypeGroup(hero.classKey).toLowerCase();
  const table = ADND_2E_SAVING_THROWS[group] || ADND_2E_SAVING_THROWS.warrior;
  const level = hero.level || 1;
  const row = table.find(r => level <= r.maxLevel) || table[table.length - 1];

  const normCat = normalizeCategory(category);
  switch (normCat) {
    case 'PARALYZATION_POISON_DEATH': return row.poison;
    case 'ROD_STAFF_WAND': return row.wand;
    case 'PETRIFICATION_POLYMORPH': return row.petrification;
    case 'BREATH_WEAPON': return row.breath;
    case 'SPELL':
    default: return row.spell;
  }
}

/**
 * Generates the Gary Gygax heroic narrative log string for a saving throw outcome.
 */
export function getHeroicSavingThrowNarrative(hero, category, subCategory, success) {
  const normCat = normalizeCategory(category);
  const normSub = normalizeSubCategory(normCat, subCategory);
  const group = getClassArchetypeGroup(hero.classKey);
  const catLib = SAVING_THROW_LIBRARY[normCat] || SAVING_THROW_LIBRARY.SPELL;

  let template = '';
  if (success) {
    if (normSub && catLib[normSub] && catLib[normSub].PASS) {
      template = catLib[normSub].PASS[group] || catLib[normSub].PASS.WARRIOR;
    } else if (catLib.PASS) {
      template = catLib.PASS[group] || catLib.PASS.WARRIOR;
    } else {
      template = "{name} digs deep into reserve vitality and grits through the lethal onslaught!";
    }
  } else {
    if (normSub && catLib[normSub] && catLib[normSub].FAIL) {
      template = catLib[normSub].FAIL;
    } else if (catLib.FAIL) {
      template = catLib.FAIL;
    } else {
      template = "The full catastrophic weight of the hazard crashes directly into {name}!";
    }
  }

  return template.replace(/\{name\}/g, hero.name);
}

/**
 * Executes a full 2e Saving Throw roll with pulp heroic narrative & metadata.
 */
export function resolveSavingThrow(hero, category, subCategory = null, dcBonus = 0) {
  const normCat = normalizeCategory(category);
  const normSub = normalizeSubCategory(normCat, subCategory || category);
  const target = getBaseSavingThrowTarget(hero, normCat);

  // Optional ability score modifiers
  let abilityMod = 0;
  const attrs = hero.attributes || {};
  if (normCat === 'PARALYZATION_POISON_DEATH' && (normSub === 'POISON')) {
    const con = attrs.constitution || 10;
    if (con >= 16) abilityMod = 2;
    else if (con >= 14) abilityMod = 1;
  } else if (normCat === 'BREATH_WEAPON' || normCat === 'ROD_STAFF_WAND') {
    const dex = attrs.dexterity || 10;
    if (dex >= 16) abilityMod = 1;
  } else if (normCat === 'SPELL' || (normSub === 'DEATH_MAGIC')) {
    const wis = attrs.wisdom || 10;
    if (wis >= 16) abilityMod = 2;
    else if (wis >= 14) abilityMod = 1;
  }

  const roll = Math.floor(Math.random() * 20) + 1;
  const total = roll + abilityMod - dcBonus;
  
  // AD&D 2e: Nat 20 always succeeds, Nat 1 always fails
  const success = (roll === 20) || (roll !== 1 && total >= target);

  const narrative = getHeroicSavingThrowNarrative(hero, normCat, normSub, success);

  const categoryLabels = {
    PARALYZATION_POISON_DEATH: normSub ? `SAVE VS. ${normSub.replace('_', ' ')}` : 'SAVE VS. POISON / DEATH',
    ROD_STAFF_WAND: 'SAVE VS. ROD / STAFF / WAND',
    PETRIFICATION_POLYMORPH: normSub ? `SAVE VS. ${normSub}` : 'SAVE VS. PETRIFICATION',
    BREATH_WEAPON: 'SAVE VS. BREATH WEAPON',
    SPELL: 'SAVE VS. SPELL'
  };

  return {
    success,
    roll,
    naturalRoll: roll,
    abilityMod,
    target,
    category: normCat,
    subCategory: normSub,
    categoryLabel: categoryLabels[normCat] || 'SAVING THROW',
    heroName: hero.name,
    classKey: hero.classKey,
    archetypeGroup: getClassArchetypeGroup(hero.classKey),
    narrative
  };
}
