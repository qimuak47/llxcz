/**
 * 门派弟子 - 精英怪
 * 比妖兽更强，使用御剑和符箓远程攻击
 * 击败奖励更多经验
 */
import Phaser from 'phaser';
import { COLORS } from '../utils/colors';
import { Element, ELEMENT_COLORS } from '../systems/ElementSystem';
import { DefenseSystem, IDefensible } from '../systems/DefenseSystem';

export class Disciple extends Phaser.Physics.Arcade.Sprite {
  public hp: number;
  public maxHp: number;
  public damage: number;
  public xp: number;
  public element: Element;
  private radius = 14;
  private color = 0xb39ddb;  // 弟子服色（紫白）

  /** 受伤闪烁 */
  private hitFlash = 0;
  /** 攻击计时器 */
  private attackTimer = 2;
  /** 符箓使用计时器（每5秒） */
  private talismanTimer = 5;
  /** 土行护盾值 */
  public earthShield = 0;
  /** 御剑/符箓发射事件回调 */
  private gfx: Phaser.GameObjects.Graphics;
  private hpBar: Phaser.GameObjects.Graphics;

  // 状态效果（与 Enemy 一致）
  public slowMul = 1.0;
  private slowTimer = 0;
  public poisonDps = 0;
  private poisonTimer = 0;
  public knockbackVx = 0;
  public knockbackVy = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, hpScale = 1) {
    super(scene, x, y, 'enemy_body');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // 弟子属性（初始能撑约5秒，随时间增长）
    this.maxHp = Math.round(150 * hpScale);  // 弟子生命150（原200-50）
    this.hp = this.maxHp;
    this.damage = 18;
    this.xp = 25;  // 高经验奖励
    // 随机五行属性
    const elems: Element[] = ['metal', 'wood', 'earth', 'water', 'fire'];
    this.element = elems[Math.floor(Math.random() * elems.length)];
    this.defense.defense = 8;  // 弟子防御8

    this.setCircle(this.radius, 0, 0);
    this.setCollideWorldBounds(true);
    this.setDepth(8);

    this.gfx = scene.add.graphics();
    this.gfx.setDepth(8);
    this.hpBar = scene.add.graphics();
    this.hpBar.setDepth(9);
  }

  update(dt: number, targetX: number, targetY: number): void {
    // 状态效果衰减
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) this.slowMul = 1.0;
    }
    if (this.poisonTimer > 0) {
      this.poisonTimer -= dt;
      this.takeDamage(this.poisonDps * dt, true);
      if (this.poisonTimer <= 0) this.poisonDps = 0;
    }
    // 击退衰减
    if (Math.abs(this.knockbackVx) > 1 || Math.abs(this.knockbackVy) > 1) {
      this.knockbackVx *= 0.85;
      this.knockbackVy *= 0.85;
    } else {
      this.knockbackVx = 0;
      this.knockbackVy = 0;
    }

    // 移动：保持中距离（不像妖兽那样贴脸）
    const dist = Phaser.Math.Distance.Between(this.x, this.y, targetX, targetY);
    const idealDist = 200;
    const angle = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);
    let vx = 0, vy = 0;
    if (dist > idealDist + 30) {
      // 太远，靠近
      vx = Math.cos(angle) * 80 * this.slowMul;
      vy = Math.sin(angle) * 80 * this.slowMul;
    } else if (dist < idealDist - 30) {
      // 太近，后退
      vx = -Math.cos(angle) * 60 * this.slowMul;
      vy = -Math.sin(angle) * 60 * this.slowMul;
    } else {
      // 侧向移动（绕圈）
      vx = -Math.sin(angle) * 50 * this.slowMul;
      vy = Math.cos(angle) * 50 * this.slowMul;
    }
    this.setVelocity(vx + this.knockbackVx, vy + this.knockbackVy);

    // 攻击：每 2 秒发射御剑
    this.attackTimer -= dt;
    if (this.attackTimer <= 0) {
      this.attackTimer = 2 + Math.random() * 1;
      this.fireAttack(targetX, targetY);
    }

    // 符箓：每 5 秒随机使用一张五行符箓
    this.talismanTimer -= dt;
    if (this.talismanTimer <= 0) {
      this.talismanTimer = 5;
      this.useTalisman(targetX, targetY);
    }

    if (this.hitFlash > 0) this.hitFlash -= dt;
    this.draw();
  }

  /** 随机使用五行符箓 */
  private useTalisman(tx: number, ty: number): void {
    const talismans: Element[] = ['metal', 'wood', 'water', 'fire', 'earth'];
    const t = talismans[Math.floor(Math.random() * talismans.length)];
    this.scene.events.emit('disciple-talisman', this.x, this.y, tx, ty, t, this.maxHp, this);
  }

  /** 发射御剑或符箓 */
  private fireAttack(tx: number, ty: number): void {
    // 通知场景生成弟子投射物（伤害+50%）
    this.scene.events.emit('disciple-fire', this.x, this.y, tx, ty, this.element, this.damage * 0.9);
  }

  private draw(): void {
    this.gfx.clear();
    const flashing = this.hitFlash > 0;
    const r = this.radius;

    // 外层光晕
    this.gfx.fillStyle(ELEMENT_COLORS[this.element], 0.2);
    this.gfx.fillCircle(this.x, this.y, r + 6);

    // 主体：道袍（紫白色三角）
    this.gfx.fillStyle(flashing ? 0xffffff : this.color, 1);
    this.gfx.fillTriangle(
      this.x, this.y - r,
      this.x - r, this.y + r,
      this.x + r, this.y + r,
    );
    // 内层道袍
    this.gfx.fillStyle(flashing ? 0xffffff : 0xe1bee7, 0.8);
    this.gfx.fillTriangle(
      this.x, this.y - r + 4,
      this.x - r + 4, this.y + r - 2,
      this.x + r - 4, this.y + r - 2,
    );
    // 头部（小圆）
    this.gfx.fillStyle(0xffe0b2, 1);
    this.gfx.fillCircle(this.x, this.y - r + 2, 4);
    // 眼睛
    this.gfx.fillStyle(0x000000, 1);
    this.gfx.fillCircle(this.x - 1.5, this.y - r + 1, 0.8);
    this.gfx.fillCircle(this.x + 1.5, this.y - r + 1, 0.8);

    // 五行标识（头顶）
    const ex = this.x;
    const ey = this.y - r - 8;
    this.gfx.fillStyle(0x000000, 0.5);
    this.gfx.fillCircle(ex, ey, 5);
    this.gfx.fillStyle(ELEMENT_COLORS[this.element], 1);
    this.gfx.fillCircle(ex, ey, 3.5);

    // 状态标识
    let sx = this.x - r * 0.7;
    const sy = this.y + r * 0.7;
    if (this.slowMul < 1.0) {
      this.gfx.fillStyle(0x4fc3f7, 1);
      this.gfx.fillTriangle(sx, sy - 3, sx - 3, sy + 2, sx + 3, sy + 2);
      sx -= 8;
    }
    if (this.poisonDps > 0) {
      this.gfx.fillStyle(0xab47bc, 1);
      this.gfx.fillCircle(sx, sy, 3);
    }

    // 血条（始终显示，比妖兽大）
    this.hpBar.clear();
    const bw = 36;
    const bh = 4;
    const bx = this.x - bw / 2;
    const by = this.y - r - 18;
    this.hpBar.fillStyle(0x000000, 0.6);
    this.hpBar.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    this.hpBar.fillStyle(0x37474f, 1);
    this.hpBar.fillRect(bx, by, bw, bh);
    const ratio = Math.max(0, this.hp / this.maxHp);
    this.hpBar.fillStyle(ratio > 0.5 ? 0x4caf50 : ratio > 0.25 ? 0xff9800 : 0xf44336, 1);
    this.hpBar.fillRect(bx, by, bw * ratio, bh);
  }

  applySlow(mul: number, duration: number): void {
    if (mul < this.slowMul) this.slowMul = mul;
    this.slowTimer = Math.max(this.slowTimer, duration);
  }

  applyPoison(dps: number, duration: number): void {
    this.poisonDps = Math.max(this.poisonDps, dps);
    this.poisonTimer = Math.max(this.poisonTimer, duration);
  }

  applyKnockback(vx: number, vy: number): void {
    this.knockbackVx = vx;
    this.knockbackVy = vy;
  }

  /** 是否已死亡 */
  public isDead = false;
  public grievousTimer = 0;
  /** 末法魔化 */
  public magicDesolation = false;
  /** 防御属性 */
  public defense: IDefensible = DefenseSystem.createDefense();

  takeDamage(amount: number, skipFlash = false): boolean {
    if (this.isDead) return true;
    if (this.magicDesolation) amount *= 0.05;
    // 土行护盾抵消
    if (this.earthShield > 0) {
      if (amount >= this.earthShield) {
        amount -= this.earthShield;
        this.earthShield = 0;
      } else {
        this.earthShield -= amount;
        return false;
      }
    }
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
    this.hpBar.destroy();
    super.destroy(fromScene);
  }
}
