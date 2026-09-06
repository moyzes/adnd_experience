export class Renderer2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.lastSig = null;
  }

  render(state) {
    if (!state || !state.spec || !state.spec.map) return;
    const exploredCount = state.exploredTiles ? state.exploredTiles.size : 0;
    const sig = `${state.player.x}_${state.player.y}_${state.player.facing}_${state.openedDoors.size}_${state.openedChests.size}_${exploredCount}_${state.spec.title || ''}`;
    if (this.lastSig === sig) return;
    this.lastSig = sig;

    const map = state.spec.map;
    const rows = map.length;
    const cols = map[0].length;

    const cellW = this.canvas.width / cols;
    const cellH = this.canvas.height / rows;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 1. Render base map tiles with Fog of War
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const isExplored = state.isTileExplored(x, y);

        if (!isExplored) {
          // Fog of War: Unexplored deep shroud
          this.ctx.fillStyle = '#040608';
          this.ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
          this.ctx.strokeStyle = '#0a0d12';
          this.ctx.lineWidth = 0.5;
          this.ctx.strokeRect(x * cellW, y * cellH, cellW, cellH);
          continue;
        }

        const tile = map[y][x];
        if (tile === 1) {
          this.ctx.fillStyle = '#1c2128'; // Wall
        } else if (tile === 2) {
          this.ctx.fillStyle = state.openedDoors.has(`${x},${y}`) ? '#30363d' : '#8957e5'; // Door
        } else if (tile === 3) {
          this.ctx.fillStyle = state.openedChests.has(`${x},${y}`) ? '#30363d' : '#f0883e'; // Chest
        } else if (tile === 6) {
          this.ctx.fillStyle = '#238636'; // Altar
        } else if (tile === 9) {
          this.ctx.fillStyle = '#d29922'; // Outfitter stall
        } else {
          // Wilderness vs dungeon floor
          const isWilderness = state.spec.surface_y_min != null ? y >= state.spec.surface_y_min : (y >= 8 && rows > 10);
          this.ctx.fillStyle = isWilderness ? '#0f1715' : '#0d1117'; // Floor
        }
        this.ctx.fillRect(x * cellW, y * cellH, cellW - 0.5, cellH - 0.5);
      }
    }

    // 2. Render Shop Marker (if explored)
    if (state.spec.shop && state.spec.shop.tile) {
      const [sx, sy] = state.spec.shop.tile;
      if (sx >= 0 && sx < cols && sy >= 0 && sy < rows && state.isTileExplored(sx, sy)) {
        this.ctx.fillStyle = 'rgba(210, 153, 34, 0.4)';
        this.ctx.fillRect(sx * cellW, sy * cellH, cellW, cellH);

        this.ctx.fillStyle = '#f2cc60';
        this.ctx.font = `bold ${Math.max(8, Math.floor(cellH * 0.7))}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('🏪', (sx + 0.5) * cellW, (sy + 0.5) * cellH);
      }
    }

    // 3. Render Campfire & Landmarks (if explored)
    if (state.spec.landmarks && Array.isArray(state.spec.landmarks)) {
      state.spec.landmarks.forEach(lm => {
        if (lm.model === 'campfire' || lm.id?.includes('camp')) {
          const cx = lm.x;
          const cy = lm.y;
          if (cx >= 0 && cx < cols && cy >= 0 && cy < rows && state.isTileExplored(cx, cy)) {
            this.ctx.fillStyle = 'rgba(255, 123, 114, 0.3)';
            this.ctx.beginPath();
            this.ctx.arc((cx + 0.5) * cellW, (cy + 0.5) * cellH, Math.max(4, cellW * 0.45), 0, Math.PI * 2);
            this.ctx.fill();

            this.ctx.fillStyle = '#ff7b72';
            this.ctx.font = `bold ${Math.max(8, Math.floor(cellH * 0.7))}px sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('🔥', (cx + 0.5) * cellW, (cy + 0.5) * cellH);
          }
        }
      });
    }

    // 4. Render Patron Encampments & Mentors (if explored)
    if (state.spec.npcs) {
      Object.values(state.spec.npcs).forEach(npc => {
        if (!npc.tile || npc.tile.length < 2) return;
        const [nx, ny] = npc.tile;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) return;
        if (!state.isTileExplored(nx, ny)) return; // Fog of War hides uncharted patrons/mentors/bosses

        const isPatron = npc.id === 'lord_albright' || npc.id === 'baron_vane' || npc.id?.includes('patron');
        const isMentor = npc.id?.includes('mentor') || npc.id === 'captain_valerius' || npc.id === 'archmage_cynthia' || npc.id === 'priestess_kaelen' || npc.id === 'master_jax';
        const isBoss = npc.id === 'malakor_boss' || npc.id === 'chieftain_graktar';

        if (isPatron) {
          // Royal Patron Camp Pavilion Marker (Blue & Gold Ring)
          const px = (nx + 0.5) * cellW;
          const py = (ny + 0.5) * cellH;

          // Glow background
          this.ctx.fillStyle = 'rgba(88, 166, 255, 0.35)';
          this.ctx.beginPath();
          this.ctx.arc(px, py, Math.max(5, cellW * 0.6), 0, Math.PI * 2);
          this.ctx.fill();

          // Border ring
          this.ctx.strokeStyle = '#d29922';
          this.ctx.lineWidth = 1.5;
          this.ctx.stroke();

          // Icon
          this.ctx.fillStyle = '#ffffff';
          this.ctx.font = `bold ${Math.max(8, Math.floor(cellH * 0.75))}px sans-serif`;
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText('⛺', px, py);
        } else if (isMentor) {
          // Mentor / Class Guild Training Quarter Marker
          const mx = (nx + 0.5) * cellW;
          const my = (ny + 0.5) * cellH;

          // Glow background
          this.ctx.fillStyle = 'rgba(210, 153, 34, 0.3)';
          this.ctx.beginPath();
          this.ctx.arc(mx, my, Math.max(4, cellW * 0.5), 0, Math.PI * 2);
          this.ctx.fill();

          this.ctx.strokeStyle = '#e3b341';
          this.ctx.lineWidth = 1;
          this.ctx.stroke();

          let mSymbol = '⭐';
          if (npc.id === 'captain_valerius') mSymbol = '🛡️';
          else if (npc.id === 'archmage_cynthia') mSymbol = '🔮';
          else if (npc.id === 'priestess_kaelen') mSymbol = '✨';
          else if (npc.id === 'master_jax') mSymbol = '🗡️';

          this.ctx.font = `bold ${Math.max(7, Math.floor(cellH * 0.65))}px sans-serif`;
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText(mSymbol, mx, my);
        } else if (isBoss) {
          // Red skull boss encounter marker
          const bx = (nx + 0.5) * cellW;
          const by = (ny + 0.5) * cellH;
          this.ctx.fillStyle = 'rgba(248, 81, 73, 0.3)';
          this.ctx.beginPath();
          this.ctx.arc(bx, by, Math.max(4, cellW * 0.5), 0, Math.PI * 2);
          this.ctx.fill();

          this.ctx.font = `bold ${Math.max(7, Math.floor(cellH * 0.65))}px sans-serif`;
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText('💀', bx, by);
        }
      });
    }

    // 5. Render the player marker with FOV & orientation
    const px = (state.player.x + 0.5) * cellW;
    const py = (state.player.y + 0.5) * cellH;
    const pRadius = Math.max(3, Math.min(cellW, cellH) * 0.38);

    // Subtle player aura
    this.ctx.fillStyle = 'rgba(88, 166, 255, 0.3)';
    this.ctx.beginPath();
    this.ctx.arc(px, py, pRadius * 1.6, 0, Math.PI * 2);
    this.ctx.fill();

    // Player body
    this.ctx.fillStyle = '#58a6ff';
    this.ctx.beginPath();
    this.ctx.arc(px, py, pRadius, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 1;
    this.ctx.stroke();

    // Player Direction Arrow
    let dx = 0, dy = 0;
    if (state.player.facing === 'NORTH') dy = -1;
    if (state.player.facing === 'SOUTH') dy = 1;
    if (state.player.facing === 'EAST') dx = 1;
    if (state.player.facing === 'WEST') dx = -1;

    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(px, py);
    this.ctx.lineTo(px + dx * cellW * 0.55, py + dy * cellH * 0.55);
    this.ctx.stroke();
  }
}
