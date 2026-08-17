export class Renderer2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  render(state) {
    const map = state.spec.map;
    const rows = map.length;
    const cols = map[0].length;

    const cellW = this.canvas.width / cols;
    const cellH = this.canvas.height / rows;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Renderiza o mapa completo dinamicamente
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const tile = map[y][x];
        if (tile === 1) {
          this.ctx.fillStyle = '#21262d'; // Wall
        } else if (tile === 2) {
          this.ctx.fillStyle = state.openedDoors.has(`${x},${y}`) ? '#30363d' : '#8957e5'; // Door
        } else if (tile === 3) {
          this.ctx.fillStyle = state.openedChests.has(`${x},${y}`) ? '#30363d' : '#f0883e'; // Chest
        } else if (tile === 6) {
          this.ctx.fillStyle = '#238636'; // Altar
        } else if (tile === 9) {
          this.ctx.fillStyle = '#d4a017'; // Outfitter stall
        } else {
          this.ctx.fillStyle = '#0d1117'; // Floor
        }
        this.ctx.fillRect(x * cellW, y * cellH, cellW - 0.5, cellH - 0.5);
      }
    }

    // Renderiza o Player
    this.ctx.fillStyle = '#58a6ff';
    this.ctx.beginPath();
    const px = (state.player.x + 0.5) * cellW;
    const py = (state.player.y + 0.5) * cellH;
    this.ctx.arc(px, py, Math.max(2, Math.min(cellW, cellH) * 0.35), 0, Math.PI * 2);
    this.ctx.fill();

    // Direção do Player
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    this.ctx.moveTo(px, py);
    let dx = 0, dy = 0;
    if (state.player.facing === 'NORTH') dy = -1;
    if (state.player.facing === 'SOUTH') dy = 1;
    if (state.player.facing === 'EAST') dx = 1;
    if (state.player.facing === 'WEST') dx = -1;
    this.ctx.lineTo(px + dx * cellW * 0.45, py + dy * cellH * 0.45);
    this.ctx.stroke();
  }
}