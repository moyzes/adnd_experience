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
    magic_missile: '/assets/audio/magic_missile.mp3',
    sleep: '/assets/audio/sleep.mp3',
    bless: '/assets/audio/bless.mp3',
    turn_undead: '/assets/audio/turn_undead.mp3',
  };

  /**
   * Looping / long tracks — combat music, camp ambient, etc.
   */
  static BGM = {
    combat_1: '/assets/audio/combat_1.mp3',
    combat_2: '/assets/audio/combat_2.mp3',
    combat_3: '/assets/audio/combat_3.mp3',
    campfire: '/assets/audio/campfire.mp3',
    crickets: '/assets/audio/crickets.mp3',
  };

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
