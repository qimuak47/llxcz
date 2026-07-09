/**
 * 商店 - 每20秒随机地点刷新，持续1分钟
 * 接触后出售三选一五行法术，用击杀数购买
 * 购买一次后商店消失
 */
import Phaser from 'phaser';
import { COLORS } from '../utils/colors';
import { ELEMENT_COLORS } from '../systems/ElementSystem';

export class Shop extends Phaser.Physics.Arcade.Sprite {
  public life: number;
  public maxLife: number;
  private gfx: Phaser.GameObjects.Graphics;
  private phase = 0;
  /** 是否已被使用（购买后消失） */
  public used = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'proj_body');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.life = 60;  // 持续60秒
    this.maxLife = 60;

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(24, 0, 0);
    body.setImmovable(true);
    body.moves = false;

    this.setDepth(6);
    this.gfx = scene.add.graphics();
    this.gfx.setDepth(6);
  }

  update(dt: number): void {
    this.life -= dt;
    this.phase += dt * 2;
    if (this.life <= 0 || this.used) {
      this.destroy();
      return;
    }
    this.draw();
  }

  private draw(): void {
    this.gfx.clear();
    const pulse = 1 + Math.sin(this.phase) * 0.1;
    const r = 24 * pulse;
    const fadeRatio = this.life < 10 ? this.life / 10 : 1;  // 最后10秒闪烁

    // 外层光晕（金色）
    this.gfx.fillStyle(0xffd54f, 0.2 * fadeRatio);
    this.gfx.fillCircle(this.x, this.y, r + 12);
    this.gfx.fillStyle(0xffd54f, 0.4 * fadeRatio);
    this.gfx.fillCircle(this.x, this.y, r + 6);

    // 主体（木质摊位 + 金顶）
    this.gfx.fillStyle(0x6d4c41, 0.9 * fadeRatio);
    this.gfx.fillRect(this.x - 18, this.y - 4, 36, 20);
    // 金色顶
    this.gfx.fillStyle(0xffd54f, 0.95 * fadeRatio);
    this.gfx.fillTriangle(
      this.x, this.y - r - 4,
      this.x - 22, this.y - 4,
      this.x + 22, this.y - 4,
    );
    // 顶上小旗
    this.gfx.fillStyle(0xe53935, fadeRatio);
    this.gfx.fillRect(this.x - 1, this.y - r - 14, 2, 12);
    this.gfx.fillTriangle(
      this.x + 1, this.y - r - 14,
      this.x + 8, this.y - r - 11,
      this.x + 1, this.y - r - 8,
    );

    // 五行符号（中央旋转的彩色圆点）
    const elems: number[] = [
      ELEMENT_COLORS.metal, ELEMENT_COLORS.wood, ELEMENT_COLORS.water,
      ELEMENT_COLORS.fire, ELEMENT_COLORS.earth,
    ];
    for (let i = 0; i < 5; i++) {
      const a = this.phase + (i / 5) * Math.PI * 2;
      const px = this.x + Math.cos(a) * 10;
      const py = this.y + 6 + Math.sin(a) * 4;
      this.gfx.fillStyle(elems[i], fadeRatio);
      this.gfx.fillCircle(px, py, 3);
    }

    // "商"字
    // 用文字对象更清晰，这里用图形近似
    this.gfx.fillStyle(0xffffff, fadeRatio);
    this.gfx.fillRect(this.x - 4, this.y + 2, 8, 2);
    this.gfx.fillRect(this.x - 4, this.y + 6, 8, 2);

    // 剩余时间提示（最后10秒）
    if (this.life < 10) {
      // 闪烁警示
      if (Math.floor(this.life * 4) % 2 === 0) {
        this.gfx.lineStyle(3, 0xff5252, 1);
        this.gfx.strokeCircle(this.x, this.y, r + 16);
      }
    }
  }

  destroy(fromScene?: boolean): void {
    this.gfx.destroy();
    super.destroy(fromScene);
  }
}
