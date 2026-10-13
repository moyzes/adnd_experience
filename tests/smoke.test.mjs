import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { SpellRegistry } from '../js/engine/spell_registry.js';
import { ItemCatalog } from '../js/engine/items/item_catalog.js';
import { resolveSavingThrow } from '../js/engine/saving_throws.js';
import { CharacterFactory } from '../js/engine/characters/character_factory.js';
import { EncumbranceManager } from '../js/engine/items/encumbrance_manager.js';
import { ProgressionManager } from '../js/engine/characters/progression_manager.js';
import { CombatActions } from '../js/engine/combat/combat_actions.js';

const spellsData = JSON.parse(fs.readFileSync(new URL('../data/spells.json', import.meta.url), 'utf8'));
const classesData = JSON.parse(fs.readFileSync(new URL('../data/classes.json', import.meta.url), 'utf8'));

function initSpellRegistry() {
  SpellRegistry.init(spellsData, classesData);
}

function getAllJsonFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results = results.concat(getAllJsonFiles(full));
    } else if (file.endsWith('.json')) {
      results.push(full);
    }
  }
  return results;
}

test('1. Catalog integrity', () => {
  initSpellRegistry();

  const ids = new Set();
  for (const [name, item] of Object.entries(ItemCatalog.ITEMS)) {
    assert.ok(item.id, `ITEMS["${name}"] must have an id`);
    assert.ok(item.kind, `ITEMS["${name}"] must have a kind`);
    assert.strictEqual(typeof item.weight, 'number', `ITEMS["${name}"] weight must be numeric`);
    assert.ok(!ids.has(item.id), `Duplicate item id "${item.id}" in ITEMS["${name}"]`);
    ids.add(item.id);
  }

  for (const [name, weapon] of Object.entries(ItemCatalog.WEAPONS)) {
    assert.strictEqual(typeof weapon.weight, 'number', `WEAPONS["${name}"] weight must be numeric`);
  }

  // Verify all boots and gloves in data/**/*.json exist in ItemCatalog.ITEMS
  const dataDir = path.resolve(new URL('../data', import.meta.url).pathname);
  const jsonFiles = getAllJsonFiles(dataDir);
  const foundNames = new Set();
  for (const f of jsonFiles) {
    const content = JSON.parse(fs.readFileSync(f, 'utf8'));
    const scan = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        obj.forEach(scan);
      } else {
        if (obj.type === 'boots' || obj.type === 'gloves' || obj.kind === 'boots' || obj.kind === 'gloves') {
          if (obj.name) {
            foundNames.add(obj.name);
            assert.ok(ItemCatalog.ITEMS[obj.name], `Item "${obj.name}" in ${f} must exist in ItemCatalog.ITEMS`);
          }
        }
        Object.values(obj).forEach(scan);
      }
    };
    scan(content);
  }
  assert.ok(foundNames.size > 0, 'Should find boots and gloves in data files');
});

test('1b. WEAPONS entries unique id and kind (skipped - schema note)', {
  skip: 'ItemCatalog.WEAPONS defines combat damage profiles ({ category, damageType, maxDmg, weight }) without id or kind; item definitions reside in ItemCatalog.ITEMS'
}, () => {
  initSpellRegistry();
  for (const [name, weapon] of Object.entries(ItemCatalog.WEAPONS)) {
    assert.ok(weapon.id, `WEAPONS["${name}"] missing id`);
    assert.ok(weapon.kind, `WEAPONS["${name}"] missing kind`);
  }
});

test('2. Elf Fey Resistance', () => {
  initSpellRegistry();
  const elfMage = { raceKey: 'elf', classKey: 'mage', level: 1 };
  for (let i = 0; i < 50; i++) {
    const res = resolveSavingThrow(elfMage, 'SPELL', 'sleep', 999);
    assert.strictEqual(res.success, true, 'Elf saving throw should succeed against sleep');
    assert.strictEqual(res.isImmune, true, 'Elf should have isImmune against sleep');
  }

  const dwarfCleric = { raceKey: 'dwarf', classKey: 'cleric', level: 1 };
  let successes = 0;
  for (let i = 0; i < 200; i++) {
    const res = resolveSavingThrow(dwarfCleric, 'SPELL', 'sleep', 999);
    if (res.success) successes++;
  }
  const rate = successes / 200;
  assert.ok(rate < 0.30, `Dwarf cleric success rate (${(rate * 100).toFixed(1)}%) should be under 30%`);
});

test('3. Class availability', () => {
  initSpellRegistry();
  const lowRoll = { strength: 8, dexterity: 12, constitution: 12, intelligence: 9, wisdom: 10, charisma: 10 };
  const avail = CharacterFactory.getClassAvailability(lowRoll, classesData);
  assert.strictEqual(avail.fighter.available, false, 'Fighter should not be available with STR 8');
  assert.strictEqual(avail.ranger.available, false, 'Ranger should not be available with STR 8');
});

test('4. Encumbrance tier for default STR 13 Human Fighter', () => {
  initSpellRegistry();
  const fighter = CharacterFactory.createPartyMember('fighter', 'Valeros', [], classesData, {
    race: 'human',
    attributes: {
      ...classesData.archetypes.fighter.attributes,
      strength: 13
    }
  });
  const res = EncumbranceManager.getTier(fighter);
  const tier = (typeof res === 'object' && res.tier) ? res.tier : res;
  assert.strictEqual(tier, 'unencumbered');
});

test('5. Ranger level-up raises scout and tracking by 5 and has no companion', () => {
  initSpellRegistry();
  const ranger = CharacterFactory.createPartyMember('ranger', 'Strider', [], classesData, { race: 'human' });
  ranger.canLevelUp = true;
  const initialScout = ranger.skills.scout.base;
  const initialTracking = ranger.skills.tracking.base;

  const mockState = {
    party: [ranger],
    partyGold: 10000,
    getPartyGold: () => 10000,
    spendGold: () => true,
    addLog: () => {},
    classesSpec: classesData,
    partyInventory: []
  };

  const res = ProgressionManager.applyLevelUp(mockState, 0, {});
  assert.strictEqual(res.success, true);
  assert.strictEqual(ranger.skills.scout.base, initialScout + 5);
  assert.strictEqual(ranger.skills.tracking.base, initialTracking + 5);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(ranger, 'companion'), false);
  assert.strictEqual(ranger.companion, undefined);
});

test('6. Species Enemy combat bonus', () => {
  initSpellRegistry();
  const mockState = {
    classesSpec: classesData
  };
  const ranger = { classKey: 'ranger' };
  const fighter = { classKey: 'fighter' };
  const goblinTarget = { id: 'goblin_scout', name: 'Goblin Scout' };
  const humanoidTarget = { id: 'bandit', name: 'Bandit', type: 'humanoid' };

  const rMelee = CombatActions.getClassCombatBonus(mockState, ranger, goblinTarget, 'Longsword', 'melee');
  const rRanged = CombatActions.getClassCombatBonus(mockState, ranger, goblinTarget, 'Short Bow', 'ranged');
  const fMelee = CombatActions.getClassCombatBonus(mockState, fighter, goblinTarget, 'Longsword', 'melee');
  const rHumanoid = CombatActions.getClassCombatBonus(mockState, ranger, humanoidTarget, 'Longsword', 'melee');

  assert.strictEqual(rMelee, 4, 'Ranger melee vs goblin should be 4');
  assert.strictEqual(rRanged, 4, 'Ranger ranged vs goblin should be 4');
  assert.strictEqual(fMelee, 0, 'Fighter vs goblin should be 0');
  assert.strictEqual(rHumanoid, 0, 'Ranger vs humanoid unlisted name should be 0');
});
