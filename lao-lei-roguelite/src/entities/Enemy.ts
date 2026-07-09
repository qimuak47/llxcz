/**
 * 妖兽 - 修仙界弱小敌人
 * 多种类型：妖兔/石蟒/灵狼/妖蝠/统领
 * 简单 AI：朝玩家移动接触造成伤害
 * 每种妖兽有五行属性，相克影响伤害
 */
import Phaser from 'phaser';
import { COLORS } from '../utils/colors';
import { Element, ELEMENT_COLORS } from '../systems/ElementSystem';
import { DefenseSystem, IDefensible } from '../systems/DefenseSystem';

export type EnemyKind = 'rabbit' | 'snake' | 'wolf' | 'bat' | 'boss';

interface EnemyDef {
  hp: number;
  speed: number;
  damage: number;     // 接触伤害（每次命中）
  radius: number;
  color: number;
  xp: number;         // 击杀掉落经验
  score: number;
  element: Element;   // 五行属性
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  rabbit: { hp: 16, speed: 120, damage: 26, radius: 11, color: COLORS.ENEMY_RABBIT, xp: 3,  score: 1, element: 'wood' },
  snake:  { hp: 42, speed: 65,  damage: 38, radius: 13, color: COLORS.ENEMY_SNAKE,  xp: 7,  score: 2, element: 'earth' },
  wolf:   { hp: 28, speed: 140, damage: 34, radius: 12, color: COLORS.ENEMY_WOLF,   xp: 5,  score: 2, element: 'metal' },
  bat:    { hp: 12, speed: 155, damage: 22, radius: 9,  color: COLORS.ENEMY_BAT,    xp: 2,  score: 1, element: 'fire' },
  boss:   { hp: 400, speed: 55, damage: 34, radius: 28, color: COLORS.ENEMY_BOSS,   xp: 80, score: 50, element: 'water' },
};

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  public kind: EnemyKind;
  public hp: number;
  public maxHp: number;
  public damage: number;
  public xp: number;
  public score: number;
  public element: Element;       // 五行属性
  private radius: number;
  private color: number;

  /** 受伤闪烁计时 */
  private hitFlash = 0;
  /** 视觉图形 */
  private gfx: Phaser.GameObjects.Graphics;
  /** 血条（仅 boss 显示） */
  private hpBar?: Phaser.GameObjects.Graphics;

  // ===== 状态效果 =====
  /** 减速倍率（0.5=半速），随时间衰减 */
  public slowMul = 1.0;
  private slowTimer = 0;
  /** 中毒：每秒掉血，持续 N 秒 */
  public poisonDps = 0;
  private poisonTimer = 0;
  /** 击退速度（外部设置，自然衰减） */
  public knockbackVx = 0;
  public knockbackVy = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, kind: EnemyKind, hpScale = 1) {
    super(scene, x, y, 'enemy_body');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    const def = ENEMY_DEFS[kind];
    this.kind = kind;
    this.maxHp = Math.round(def.hp * hpScale);
    this.hp = this.maxHp;
    this.damage = def.damage;
    this.xp = def.xp;
    this.score = def.score;
    this.radius = def.radius;
    this.color = def.color;
    this.element = def.element;
    // 防御：boss=5，小怪=0
    this.defense.defense = kind === 'boss' ? 8 : 3;  // 统领8，小怪3

    this.setCircle(def.radius, 0, 0);
    this.setCollideWorldBounds(true);
    this.setDepth(8);

    this.gfx = scene.add.graphics();
    this.gfx.setDepth(8);

    if (kind === 'boss') {
      this.hpBar = scene.add.graphics();
      this.hpBar.setDepth(50);
    }
  }

  /** 每帧更新：朝目标移动 + 状态效果 */
  update(dt: number, targetX: number, targetY: number): void {
    // 状态效果衰减
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) { this.slowMul = 1.0; }
    }
    if (this.poisonTimer > 0) {
      this.poisonTimer -= dt;
      this.takeDamage(this.poisonDps * dt, true);  // 中毒伤害不触发五行
      if (this.poisonTimer <= 0) { this.poisonDps = 0; }
    }

    // 击退衰减
    if (Math.abs(this.knockbackVx) > 1 || Math.abs(this.knockbackVy) > 1) {
      this.knockbackVx *= 0.85;
      this.knockbackVy *= 0.85;
    } else {
      this.knockbackVx = 0;
      this.knockbackVy = 0;
    }

    // 朝目标移动（受减速影响）
    const angle = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);
    const def = ENEMY_DEFS[this.kind];
    const sp = def.speed * this.slowMul;
    const vx = Math.cos(angle) * sp + this.knockbackVx;
    const vy = Math.sin(angle) * sp + this.knockbackVy;
    this.setVelocity(vx, vy);

    if (this.hitFlash > 0) this.hitFlash -= dt;
    this.draw();
  }

  /** 施加减速 */
  applySlow(mul: number, duration: number): void {
    // 取更强的减速
    if (mul < this.slowMul) {
      this.slowMul = mul;
    }
    this.slowTimer = Math.max(this.slowTimer, duration);
  }

  /** 施加中毒 */
  applyPoison(dps: number, duration: number): void {
    this.poisonDps = Math.max(this.poisonDps, dps);
    this.poisonTimer = Math.max(this.poisonTimer, duration);
  }

  /** 施加击退 */
  applyKnockback(vx: number, vy: number): void {
    this.knockbackVx = vx;
    this.knockbackVy = vy;
  }

  /** 绘制妖兽（几何图形） */
  private draw(): void {
    this.gfx.clear();
    const flashing = this.hitFlash > 0;

    // 不同种类不同形状
    switch (this.kind) {
      case 'rabbit':
        // 妖兔：椭圆 + 两只长耳
        this.gfx.fillStyle(flashing ? 0xffffff : this.color, 1);
        this.gfx.fillEllipse(this.x, this.y, this.radius * 2, this.radius * 2.2);
        // 耳朵
        this.gfx.fillRect(this.x - 6, this.y - this.radius - 8, 3, 10);
        this.gfx.fillRect(this.x + 3, this.y - this.radius - 8, 3, 10);
        // 眼睛
        this.gfx.fillStyle(0xff5252, 1);
        this.gfx.fillCircle(this.x - 3, this.y - 2, 1.5);
        this.gfx.fillCircle(this.x + 3, this.y - 2, 1.5);
        break;
      case 'snake':
        // 石蟒：长条椭圆
        this.gfx.fillStyle(flashing ? 0xffffff : this.color, 1);
        this.gfx.fillEllipse(this.x, this.y, this.radius * 2.5, this.radius * 1.4);
        // 斑纹
        this.gfx.fillStyle(0x2e7d32, 0.6);
        this.gfx.fillCircle(this.x - 8, this.y, 2);
        this.gfx.fillCircle(this.x, this.y, 2);
        this.gfx.fillCircle(this.x + 8, this.y, 2);
        // 眼
        this.gfx.fillStyle(0xffeb3b, 1);
        this.gfx.fillCircle(this.x + this.radius, this.y - 2, 1.5);
        break;
      case 'wolf':
        // 灵狼：三角尖锐
        this.gfx.fillStyle(flashing ? 0xffffff : this.color, 1);
        this.gfx.fillCircle(this.x, this.y, this.radius);
        // 耳朵三角
        this.gfx.fillTriangle(
          this.x - 8, this.y - this.radius,
          this.x - 4, this.y - this.radius - 6,
          this.x - 2, this.y - this.radius
        );
        this.gfx.fillTriangle(
          this.x + 2, this.y - this.radius,
          this.x + 4, this.y - this.radius - 6,
          this.x + 8, this.y - this.radius
        );
        // 眼睛发红
        this.gfx.fillStyle(0xff1744, 1);
        this.gfx.fillCircle(this.x - 4, this.y - 2, 1.5);
        this.gfx.fillCircle(this.x + 4, this.y - 2, 1.5);
        break;
      case 'bat':
        // 妖蝠：小圆 + 翅膀
        this.gfx.fillStyle(flashing ? 0xffffff : this.color, 1);
        this.gfx.fillCircle(this.x, this.y, this.radius);
        // 翅膀（拍动效果）
        const wing = Math.sin(this.scene.time.now / 80) * 4;
        this.gfx.fillTriangle(
          this.x - this.radius, this.y,
          this.x - this.radius - 8, this.y - 4 + wing,
          this.x - this.radius - 6, this.y + 4
        );
        this.gfx.fillTriangle(
          this.x + this.radius, this.y,
          this.x + this.radius + 8, this.y - 4 + wing,
          this.x + this.radius + 6, this.y + 4
        );
        break;
      case 'boss':
        // 妖兽统领：大圆 + 尖刺 + 光环
        this.gfx.fillStyle(COLORS.ENEMY_BOSS, 0.2);
        this.gfx.fillCircle(this.x, this.y, this.radius + 8);
        this.gfx.fillStyle(flashing ? 0xffffff : this.color, 1);
        this.gfx.fillCircle(this.x, this.y, this.radius);
        // 尖刺
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + this.scene.time.now / 500;
          const x1 = this.x + Math.cos(a) * this.radius;
          const y1 = this.y + Math.sin(a) * this.radius;
          const x2 = this.x + Math.cos(a) * (this.radius + 10);
          const y2 = this.y + Math.sin(a) * (this.radius + 10);
          this.gfx.fillStyle(0xb71c1c, 1);
          this.gfx.fillTriangle(
            x1 - Math.sin(a) * 3, y1 + Math.cos(a) * 3,
            x1 + Math.sin(a) * 3, y1 - Math.cos(a) * 3,
            x2, y2
          );
        }
        // 眼睛
        this.gfx.fillStyle(0xffeb3b, 1);
        this.gfx.fillCircle(this.x - 8, this.y - 4, 3);
        this.gfx.fillCircle(this.x + 8, this.y - 4, 3);
        this.gfx.fillStyle(0x000000, 1);
        this.gfx.fillCircle(this.x - 8, this.y - 4, 1.5);
        this.gfx.fillCircle(this.x + 8, this.y - 4, 1.5);
        break;
    }

    // 五行属性标识（右上角小圆点）
    if (this.element !== 'none') {
      const ex = this.x + this.radius * 0.7;
      const ey = this.y - this.radius * 0.7;
      this.gfx.fillStyle(0x000000, 0.5);
      this.gfx.fillCircle(ex, ey, 5);
      this.gfx.fillStyle(ELEMENT_COLORS[this.element], 1);
      this.gfx.fillCircle(ex, ey, 3.5);
    }

    // 状态效果标识（左上角）
    let sx = this.x - this.radius * 0.7;
    const sy = this.y - this.radius * 0.7;
    if (this.slowMul < 1.0) {
      // 减速：蓝色小三角
      this.gfx.fillStyle(0x4fc3f7, 1);
      this.gfx.fillTriangle(sx, sy - 3, sx - 3, sy + 2, sx + 3, sy + 2);
      sx -= 8;
    }
    if (this.poisonDps > 0) {
      // 中毒：紫色小圆
      this.gfx.fillStyle(0xab47bc, 1);
      this.gfx.fillCircle(sx, sy, 3);
    }

    // boss 血条
    if (this.hpBar && this.kind === 'boss') {
      this.hpBar.clear();
      const bw = 80;
      const bh = 6;
      const bx = this.x - bw / 2;
      const by = this.y - this.radius - 18;
      this.hpBar.fillStyle(0x000000, 0.6);
      this.hpBar.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      this.hpBar.fillStyle(0x37474f, 1);
      this.hpBar.fillRect(bx, by, bw, bh);
      const ratio = Math.max(0, this.hp / this.maxHp);
      this.hpBar.fillStyle(ratio > 0.5 ? 0x4caf50 : ratio > 0.25 ? 0xff9800 : 0xf44336, 1);
      this.hpBar.fillRect(bx, by, bw * ratio, bh);
    }
  }

  /** 是否已死亡（待 GameScene 清理） */
  public isDead = false;
  public grievousTimer = 0;
  /** 防御属性 */
  public defense: IDefensible = DefenseSystem.createDefense();

  /** 末法魔化（受到的所有伤害减少90%） */
  public magicDesolation = false;

  /** 受伤
   * @param amount 伤害值（已含五行倍率）
   * @param skipFlash 是否跳过闪烁（中毒等持续伤害）
   */
  takeDamage(amount: number, skipFlash = false): boolean {
    if (this.isDead) return true;
    // 末法魔化减伤97%
    if (this.magicDesolation) amount *= 0.05;
    // 防御减免
    amount = DefenseSystem.applyDefense(this.defense, amount);
    this.hp -= amount;
    if (!skipFlash) this.hitFlash = 0.08;
    if (this.hp <= 0) {
      this.hp = 0;
      this.isDead = true;
      return true;
    }
    return false;
  }

  destroy(fromScene?: boolean): void {
    this.gfx.destroy();
    this.hpBar?.destroy();
    super.destroy(fromScene);
  }
}
