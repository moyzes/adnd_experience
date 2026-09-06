/**
 * Central audio registry for the dungeon crawler.
 *
 * RULE: every new sound event must be registered in SFX (or BGM) below.
 * Call sites use audio.play('id') — never raw asset paths.
 */
export class AudioManager {
  /**
   * SFX catalog — id → absolute path under /assets/audio/
   * Add new one-shot effects here only.
   */
  static SFX = {
    // UI / sheet
    button: '/assets/audio/button.mp3',
    sheet: '/assets/audio/sheet.mp3',
    reward: '/assets/audio/reward.mp3',
    blocked: '/assets/audio/blocked.mp3',

    // Exploration
    footstep: '/assets/audio/footstep.mp3',
    door_opening: '/assets/audio/door_opening.mp3',
    chest_opening: '/assets/audio/chest_opening.mp3',
    coins: '/assets/audio/coins.mp3',
    unlock: '/assets/audio/unlock.mp3',
    unlock_try: '/assets/audio/unlock_try.mp3',
    trap_found: '/assets/audio/trap_found.mp3',
    hide: '/assets/audio/hide.mp3',
    bash: '/assets/audio/bash.mp3',
    rested: '/assets/audio/rested.mp3',
    falling: '/assets/audio/falling.mp3',

    // Combat hits / misses
    sword_hit: '/assets/audio/sword_hit.mp3',
    sword_miss: '/assets/audio/sword_miss.mp3',
    arrow_impact: '/assets/audio/arrow_impact.mp3',
    backstab: '/assets/audio/backstab.mp3',
    death: '/assets/audio/death.mp3',
    combat_turn: '/assets/audio/combat_turn.mp3',
    victory: '/assets/audio/victory.mp3',

    // Magic / divine
    cure_wounds: '/assets/audio/cure_wounds.mp3',
    magic_missile: '/assets/audio/magic_missile.mp3',
    sleep: '/assets/audio/sleep.mp3',
    bless: '/assets/audio/bless.mp3',
    turn_undead: '/assets/audio/turn_undead.mp3',
    read_magic: '/assets/audio/study.mp3',
    relic: '/assets/audio/relic.mp3',
    goblin: '/assets/audio/goblin.mp3',
    level_up: '/assets/audio/level_up.mp3',
    monster_grunt: '/assets/audio/monster-grunts.mp3',
    ranged: '/assets/audio/ranged.mp3',
    sword_missed: '/assets/audio/sword_missed.mp3',
    combat_turn_1: '/assets/audio/combat_turn-1.mp3',
  };

  /**
   * Looping / long tracks — combat music, camp ambient, dungeon environments, etc.
   */
  static BGM = {
    combat_1: '/assets/audio/combat_1.mp3',
    combat_2: '/assets/audio/combat_2.mp3',
    combat_3: '/assets/audio/combat_3.mp3',
    dungeon: '/assets/audio/dungeon.mp3',
    wilderness: '/assets/audio/wilderness.mp3',
    campfire: '/assets/audio/campfire.mp3',
    crickets: '/assets/audio/crickets.mp3',
    ambience_1: '/assets/audio/ambience_1.mp3',
    wilderness_1: '/assets/audio/wilderness_1.mp3',
    dark_forest: '/assets/audio/dark_forest.mp3',
    ruin_dungeon_1: '/assets/audio/ruin_dungeon_1.mp3',
  };

  /**
   * Allows an adventure module JSON spec to register custom SFX or BGM tracks declaratively.
   */
  static registerCustomAudio(customAudio = {}) {
    if (customAudio.sfx) Object.assign(AudioManager.SFX, customAudio.sfx);
    if (customAudio.bgm) Object.assign(AudioManager.BGM, customAudio.bgm);
  }

  constructor() {
    this.sfxVolume = 0.85;
    this.bgmVolume = 0.55;
    /** @type {Map<string, HTMLAudioElement>} */
    this._cache = new Map();
    /** @type {Map<string, HTMLAudioElement>} */
    this._loops = new Map();
    this._combatBgm = null;
  }

  /**
   * Resolve an id or legacy path to an absolute URL.
   * @returns {string|null}
   */
  _resolve(idOrPath, catalog) {
    if (!idOrPath || typeof idOrPath !== 'string') return null;
    if (catalog[idOrPath]) return catalog[idOrPath];
    // Legacy path fallback (monster soundAttack, old adventure tracks)
    if (idOrPath.includes('.mp3')) {
      if (idOrPath.startsWith('/') || idOrPath.startsWith('http')) return idOrPath;
      return '/' + idOrPath.replace(/^\.\//, '');
    }
    return null;
  }

  /**
   * Play a one-shot SFX by catalog id (preferred) or raw path (legacy).
   * New events must use a registered id from AudioManager.SFX.
   */
  play(idOrPath) {
    const path = this._resolve(idOrPath, AudioManager.SFX);
    if (!path) {
      console.warn('[Audio] Unknown SFX id — register it in AudioManager.SFX:', idOrPath);
      return;
    }
    try {
      let a = this._cache.get(path);
      if (!a) {
        a = new Audio(path);
        this._cache.set(path, a);
      }
      a.volume = this.sfxVolume;
      a.currentTime = 0;
      a.play().catch(() => { });
    } catch (_) { /* ignore autoplay / missing file */ }
  }

  /**
   * Start a looping BGM/ambient by id. Stops any previous instance of the same id.
   */
  playLoop(idOrPath) {
    const path = this._resolve(idOrPath, AudioManager.BGM) || this._resolve(idOrPath, AudioManager.SFX);
    if (!path) {
      console.warn('[Audio] Unknown loop id — register it in AudioManager.BGM:', idOrPath);
      return;
    }
    this.stopLoop(idOrPath);
    try {
      const a = new Audio(path);
      a.loop = true;
      a.volume = this.bgmVolume;
      a.play().catch(() => { });
      this._loops.set(idOrPath, a);
    } catch (_) { }
  }

  stopLoop(idOrPath) {
    const a = this._loops.get(idOrPath);
    if (a) {
      a.pause();
      a.currentTime = 0;
      this._loops.delete(idOrPath);
    }
  }

  stopAllLoops() {
    for (const id of [...this._loops.keys()]) this.stopLoop(id);
  }

  /**
   * Combat music: pick a random track from a list of BGM ids (or legacy paths).
   */
  playCombatBgm(trackIds = ['combat_1', 'combat_2', 'combat_3']) {
    this.stopCombatBgm();
    const list = trackIds.length ? trackIds : ['combat_1', 'combat_2', 'combat_3'];
    const pick = list[Math.floor(Math.random() * list.length)];
    const path = this._resolve(pick, AudioManager.BGM);
    if (!path) return;
    try {
      const a = new Audio(path);
      a.loop = true;
      a.volume = this.bgmVolume;
      a.play().catch(() => { });
      this._combatBgm = a;
    } catch (_) { }
  }

  stopCombatBgm() {
    if (this._combatBgm) {
      this._combatBgm.pause();
      this._combatBgm = null;
    }
  }

  // ── Convenience aliases (prefer play('id')) ─────────────────────────
  playFootstep() { this.play('footstep'); }
  playDoorOpening() { this.play('door_opening'); }
  playChestOpening() { this.play('chest_opening'); }
  playCoins() { this.play('coins'); }
}
