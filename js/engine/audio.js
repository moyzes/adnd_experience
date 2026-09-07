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
    // UI / sheet / equip
    button: '/assets/audio/button.mp3',
    sheet: '/assets/audio/sheet.mp3',
    reward: '/assets/audio/reward.mp3',
    blocked: '/assets/audio/blocked.mp3',
    equip: '/assets/audio/equip.mp3',

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
   * Looping / long tracks — combat music, camp ambient, dungeon environments, towns, wilderness, etc.
   */
  static BGM = {
    combat_1: '/assets/audio/combat_1.mp3',
    combat_2: '/assets/audio/combat_2.mp3',
    combat_3: '/assets/audio/combat_3.mp3',
    town_1: '/assets/audio/town_1.mp3',
    town_2: '/assets/audio/town_2.mp3',
    town: '/assets/audio/town_1.mp3',
    tavern_1: '/assets/audio/tavern_1.mp3',
    tavern_2: '/assets/audio/tavern_2.mp3',
    outfitter: '/assets/audio/outfitter.mp3',
    wilderness_1: '/assets/audio/wilderness_1.mp3',
    wilderness: '/assets/audio/wilderness_1.mp3',
    dungeon_1: '/assets/audio/dungeon_1.mp3',
    dungeon_2: '/assets/audio/dungeon_2.mp3',
    dungeon_3: '/assets/audio/dungeon_3.mp3',
    dungeon: '/assets/audio/dungeon_1.mp3',
    campfire: '/assets/audio/campfire.mp3',
    crickets: '/assets/audio/crickets.mp3',
    ambience_1: '/assets/audio/ambience_1.mp3',
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
    this._shopBgm = null;

    // Environment soundtrack state
    this._currentEnvZone = null;
    this._currentEnvTrack = null;
    this._currentEnvList = [];
    /** @type {HTMLAudioElement|null} */
    this._currentEnvAudio = null;
    this._unlocked = false;

    // Active fading audio elements
    this._fadingOutAudios = new Set();

    // Setup global user gesture unlocker for browser autoplay policies
    this._setupAutoplayUnlock();
  }

  setBgmVolume(volume) {
    this.bgmVolume = Math.max(0, Math.min(1, volume));
    if (this._currentEnvAudio && !this._currentEnvAudio._isFading) {
      this._currentEnvAudio.volume = this.bgmVolume;
    }
    if (this._shopBgm && !this._shopBgm._isFading) {
      this._shopBgm.volume = this.bgmVolume;
    }
    if (this._combatBgm && !this._combatBgm._isFading) {
      this._combatBgm.volume = this.bgmVolume;
    }
    for (const loopAudio of this._loops.values()) {
      if (loopAudio && !loopAudio._isFading) {
        loopAudio.volume = this.bgmVolume;
      }
    }
  }

  setSfxVolume(volume) {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Smoothly interpolates volume of an HTMLAudioElement.
   */
  _fadeAudio(audio, startVol, targetVol, durationMs = 1200, onComplete = null) {
    if (!audio) return;
    if (audio._fadeTimer) {
      clearInterval(audio._fadeTimer);
      audio._fadeTimer = null;
    }

    audio._isFading = true;
    const startTime = performance.now();
    const clampedStart = Math.max(0, Math.min(1, startVol));
    const clampedTarget = Math.max(0, Math.min(1, targetVol));
    audio.volume = clampedStart;

    const interval = 25; // 40 updates per second
    audio._fadeTimer = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(1, elapsed / Math.max(1, durationMs));
      
      // Equal-power / smooth cosine curve easing for natural acoustic crossfade
      const smoothed = 0.5 * (1 - Math.cos(progress * Math.PI));
      const currentVol = clampedStart + (clampedTarget - clampedStart) * smoothed;
      
      try {
        audio.volume = Math.max(0, Math.min(1, currentVol));
      } catch (_) { }

      if (progress >= 1) {
        clearInterval(audio._fadeTimer);
        audio._fadeTimer = null;
        audio._isFading = false;
        try {
          audio.volume = clampedTarget;
        } catch (_) { }
        if (typeof onComplete === 'function') {
          onComplete();
        }
      }
    }, interval);
  }

  /**
   * Smoothly fades an audio element to 0 volume and stops/cleans it up.
   */
  _fadeOutAndStop(audio, durationMs = 1200) {
    if (!audio) return;
    this._fadingOutAudios.add(audio);
    
    // Disconnect loop and end listeners so fading track doesn't trigger loops or playlist switches
    audio.onended = null;
    audio.onerror = null;

    const initialVol = typeof audio.volume === 'number' ? audio.volume : this.bgmVolume;
    this._fadeAudio(audio, initialVol, 0, durationMs, () => {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (_) { }
      this._fadingOutAudios.delete(audio);
    });
  }

  /**
   * Smoothly fades an audio element in from volume 0 up to targetVolume.
   */
  _fadeIn(audio, targetVolume = this.bgmVolume, durationMs = 1200) {
    if (!audio) return;
    audio.volume = 0;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => { });
    }
    this._fadeAudio(audio, 0, targetVolume, durationMs);
  }

  _setupAutoplayUnlock() {
    const unlockHandler = () => {
      this._unlocked = true;
      if (this._currentEnvAudio && this._currentEnvAudio.paused && !this._combatBgm && !this._shopBgm) {
        this._currentEnvAudio.play().catch(() => { });
      } else if (this._currentEnvZone && !this._currentEnvAudio && !this._combatBgm && !this._shopBgm) {
        this._startEnvTrack(this._pickEnvTrack());
      }
      if (this._shopBgm && this._shopBgm.paused) {
        this._shopBgm.play().catch(() => { });
      }
    };

    window.addEventListener('click', unlockHandler, { capture: true, passive: true });
    window.addEventListener('keydown', unlockHandler, { capture: true, passive: true });
    window.addEventListener('touchstart', unlockHandler, { capture: true, passive: true });
    window.addEventListener('pointerdown', unlockHandler, { capture: true, passive: true });
  }

  unlockAudio() {
    this._unlocked = true;
    if (this._currentEnvAudio && this._currentEnvAudio.paused && !this._combatBgm && !this._shopBgm) {
      this._currentEnvAudio.play().catch(() => { });
    } else if (this._currentEnvZone && !this._currentEnvAudio && !this._combatBgm && !this._shopBgm) {
      this._startEnvTrack(this._pickEnvTrack());
    }
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
    return `/assets/audio/${idOrPath}.mp3`;
  }

  /**
   * Play a one-shot SFX by catalog id (preferred) or raw path (legacy).
   * New events must use a registered id from AudioManager.SFX.
   */
  play(idOrPath) {
    const path = this._resolve(idOrPath, AudioManager.SFX);
    if (!path) return;
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
    if (!path) return;
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
   * Multi-track Environment Soundtrack Loop Engine:
   * Plays ambient soundtracks appropriate for the current zone (Town, Wilderness, Dungeon).
   * For zones with multiple tracks (e.g. Town: town_1, town_2; Dungeon: dungeon_1, dungeon_2, dungeon_3),
   * tracks are cycled/randomized smoothly with acoustic crossfade transitions.
   */
  playEnvironmentBgm(zone, trackIds = []) {
    const list = Array.isArray(trackIds) && trackIds.length > 0 ? trackIds : [zone];

    // If we are already in this zone and have active audio playing, keep it playing
    if (this._currentEnvZone === zone && this._currentEnvAudio && !this._currentEnvAudio.paused && !this._currentEnvAudio.ended) {
      this._currentEnvList = list;
      return;
    }

    const previousZone = this._currentEnvZone;
    this._currentEnvZone = zone;
    this._currentEnvList = list;

    // If combat or shop music is currently active, store the zone state but don't play over it
    if (this._combatBgm || this._shopBgm) {
      return;
    }

    const nextTrack = this._pickEnvTrack();
    // Use a 1500ms crossfade between different area zones
    this._startEnvTrack(nextTrack, previousZone ? 1500 : 800);
  }

  _pickEnvTrack() {
    const list = this._currentEnvList;
    if (!list || list.length === 0) return null;
    if (list.length === 1) return list[0];

    // Pick a track, preferring one different from the currently playing one if possible
    const candidates = list.filter(t => t !== this._currentEnvTrack);
    const pool = candidates.length > 0 ? candidates : list;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  _startEnvTrack(trackId, crossfadeMs = 1500) {
    if (!trackId) return;

    const oldAudio = this._currentEnvAudio;
    this._currentEnvAudio = null;

    if (oldAudio) {
      this._fadeOutAndStop(oldAudio, crossfadeMs);
    }

    this._currentEnvTrack = trackId;
    const path = this._resolve(trackId, AudioManager.BGM);
    if (!path) return;

    try {
      const a = new Audio(path);
      
      if (this._currentEnvList.length === 1) {
        a.loop = true;
      } else {
        a.loop = false;
        a.onended = () => {
          if (this._currentEnvZone && !this._combatBgm && !this._shopBgm) {
            const nextTrack = this._pickEnvTrack();
            this._startEnvTrack(nextTrack, 1500);
          }
        };
      }

      a.onerror = (err) => {
        console.warn(`[AudioManager] Note: audio track "${trackId}" at ${path} could not be loaded:`, err);
      };

      this._currentEnvAudio = a;
      this._fadeIn(a, this.bgmVolume, crossfadeMs);
    } catch (_) { }
  }

  stopEnvironmentBgm(fadeDurationMs = 1000) {
    if (this._currentEnvAudio) {
      this._fadeOutAndStop(this._currentEnvAudio, fadeDurationMs);
      this._currentEnvAudio = null;
    }
    this._currentEnvZone = null;
    this._currentEnvTrack = null;
  }

  /**
   * Shop / Outfitter BGM: plays outfitter.mp3 while browsing shop or trading with crossfade
   */
  playShopBgm(trackId = 'outfitter', crossfadeMs = 1000) {
    this.stopShopBgm(false);

    // Crossfade environment audio out during shop visit
    if (this._currentEnvAudio) {
      this._fadeOutAndStop(this._currentEnvAudio, crossfadeMs);
      this._currentEnvAudio = null;
    }

    const path = this._resolve(trackId, AudioManager.BGM);
    if (!path) return;
    try {
      const a = new Audio(path);
      a.loop = true;
      a.onerror = () => {
        console.warn(`[AudioManager] Outfitter track "${trackId}" at ${path} could not be loaded.`);
      };
      this._shopBgm = a;
      this._fadeIn(a, this.bgmVolume, crossfadeMs);
    } catch (_) { }
  }

  stopShopBgm(resumeEnv = true, crossfadeMs = 1000) {
    if (this._shopBgm) {
      this._fadeOutAndStop(this._shopBgm, crossfadeMs);
      this._shopBgm = null;
    }

    // Smoothly resume environment audio after leaving shop if active and not in combat
    if (resumeEnv && this._currentEnvZone && !this._combatBgm) {
      const nextTrack = this._pickEnvTrack();
      this._startEnvTrack(nextTrack, crossfadeMs);
    }
  }

  /**
   * Combat music: pick a random track with smooth combat crossfade.
   */
  playCombatBgm(trackIds = ['combat_1', 'combat_2', 'combat_3'], crossfadeMs = 800) {
    this.stopCombatBgm(false);
    this.stopShopBgm(false);

    // Smoothly fade out environment audio during combat
    if (this._currentEnvAudio) {
      this._fadeOutAndStop(this._currentEnvAudio, crossfadeMs);
      this._currentEnvAudio = null;
    }

    const list = trackIds.length ? trackIds : ['combat_1', 'combat_2', 'combat_3'];
    const pick = list[Math.floor(Math.random() * list.length)];
    const path = this._resolve(pick, AudioManager.BGM);
    if (!path) return;
    try {
      const a = new Audio(path);
      a.loop = true;
      this._combatBgm = a;
      this._fadeIn(a, this.bgmVolume, crossfadeMs);
    } catch (_) { }
  }

  stopCombatBgm(resumeEnv = true, crossfadeMs = 1200) {
    if (this._combatBgm) {
      this._fadeOutAndStop(this._combatBgm, crossfadeMs);
      this._combatBgm = null;
    }

    // Smoothly fade back into environment soundtrack after combat
    if (resumeEnv && this._currentEnvZone && !this._shopBgm) {
      const nextTrack = this._pickEnvTrack();
      this._startEnvTrack(nextTrack, crossfadeMs);
    }
  }

  stopAll(fadeDurationMs = 800) {
    this.stopCombatBgm(false, fadeDurationMs);
    this.stopShopBgm(false, fadeDurationMs);
    this.stopEnvironmentBgm(fadeDurationMs);
    this.stopAllLoops();
  }

  // ── Convenience aliases (prefer play('id')) ─────────────────────────
  playFootstep() { this.play('footstep'); }
  playDoorOpening() { this.play('door_opening'); }
  playChestOpening() { this.play('chest_opening'); }
  playCoins() { this.play('coins'); }
  playEquip() { this.play('equip'); }
}
