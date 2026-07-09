/**
 * 宗门老祖 - 每击杀10个弟子刷新一个来复仇
 * 全属性是当前时间门派弟子的5倍
 * 掉落地品法宝
 */
import Phaser from 'phaser';
import { COLORS } from '../utils/colors';
import { Element, ELEMENT_COLORS } from '../systems/ElementSystem';
import { DefenseSystem, IDefensible } from '../systems/DefenseSystem';

export class Ancestor extends Phaser.Physics.Arcade.Sprite {
  public hp: number;
  public maxHp: number;
  public damage: number;
  public xp: number;
  public element: Element;
  private radius = 22;
  private color = 0x7e57c2;

  private hitFlash = 0;
  private attackTimer = 1.5;
  private talismanTimer = 3.5;  // 老祖符箓间隔3.5秒
  public earthShield = 0;
  private gfx: Phaser.GameObjects.Graphics;
  private hpBar: Phaser.GameObjects.Graphics;
  private phase = 0;

  public slowMul = 1.0;
  private slowTimer = 0;
  public poisonDps = 0;
  private poisonTimer = 0;
  public knockbackVx = 0;
  public knockbackVy = 0;
  public isDead = false;
  public grievousTimer = 0;
  /** 末法魔化 */
  public magicDesolation = false;

  constructor(scene: Phaser.Scene, x: number, y: number, hpScale = 1) {
    super(scene, x, y, 'enemy_body');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // 老祖属性 = 弟子(200hp,18dmg) × 5 = 1000hp, 90dmg，再乘时间系数
    this.maxHp = Math.round(1000 * hpScale);
    this.hp = this.maxHp;
    this.damage = 90;
    this.xp = 600;  // 经验+300%（原150→600）
    const elems: Element[] = ['metal', 'wood', 'earth', 'water', 'fire'];
    this.element = elems[Math.floor(Math.random() * elems.length)];
    this.defense.defense = 12;  // 老祖防御12

    this.setCircle(this.radius, 0, 0);
    this.setCollideWorldBounds(true);
    this.setDepth(9);

    this.gfx = scene.add.graphics();
    this.gfx.setDepth(9);
    this.hpBar = scene.add.graphics();
    this.hpBar.setDepth(50);
  }

  update(dt: number, targetX: number, targetY: number): void {
    if (this.isDead) return;
    this.phase += dt * 2;

    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) this.slowMul = 1.0;
    }
    if (this.poisonTimer > 0) {
      this.poisonTimer -= dt;
      this.takeDamage(this.poisonDps * dt, true);
      if (this.poisonTimer <= 0) this.poisonDps = 0;
    }
    if (Math.abs(this.knockbackVx) > 1 || Math.abs(this.knockbackVy) > 1) {
      this.knockbackVx *= 0.85;
      this.knockbackVy *= 0.85;
    } else {
      this.knockbackVx = 0;
      this.knockbackVy = 0;
    }

    // 移动：保持中距离
    const dist = Phaser.Math.Distance.Between(this.x, this.y, targetX, targetY);
    const idealDist = 180;
    const angle = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);
    let vx = 0, vy = 0;
    const baseSpeed = 90 * this.slowMul;
    if (dist > idealDist + 30) {
      vx = Math.cos(angle) * baseSpeed;
      vy = Math.sin(angle) * baseSpeed;
    } else if (dist < idealDist - 30) {
      vx = -Math.cos(angle) * baseSpeed * 0.7;
      vy = -Math.sin(angle) * baseSpeed * 0.7;
    } else {
      vx = -Math.sin(angle) * baseSpeed * 0.6;
      vy = Math.cos(angle) * baseSpeed * 0.6;
    }
    this.setVelocity(vx + this.knockbackVx, vy + this.knockbackVy);

    // 攻击：每1.5秒发射多发符箓
    this.attackTimer -= dt;
    if (this.attackTimer <= 0) {
      this.attackTimer = 1.5 + Math.random() * 0.5;
      this.fireAttack(targetX, targetY);
    }

    // 五行符箓：每5秒随机使用
    this.talismanTimer -= dt;
    if (this.talismanTimer <= 0) {
      this.talismanTimer = 3.5;
      const talismans: Element[] = ['metal', 'wood', 'water', 'fire', 'earth'];
      const t = talismans[Math.floor(Math.random() * talismans.length)];
      this.scene.events.emit('disciple-talisman', this.x, this.y, targetX, targetY, t, this.maxHp, this);
    }

    if (this.hitFlash > 0) this.hitFlash -= dt;
    this.draw();
  }

  private fireAttack(tx: number, ty: number): void {
    // 发射3发扇形符箓
    const baseAngle = Phaser.Math.Angle.Between(this.x, this.y, tx, ty);
    for (let i = -1; i <= 1; i++) {
      const a = baseAngle + i * 0.2;
      this.scene.events.emit('disciple-fire', this.x, this.y,
        this.x + Math.cos(a) * 100, this.y + Math.sin(a) * 100,
        this.element, this.damage * 0.5);
    }
  }

  private draw(): void {
    this.gfx.clear();
    const flashing = this.hitFlash > 0;
    const r = this.radius;
    const elemColor = ELEMENT_COLORS[this.element];

    // 外层光晕（旋转）
    this.gfx.fillStyle(elemColor, 0.15);
    this.gfx.fillCircle(this.x, this.y, r + 10);
    this.gfx.fillStyle(elemColor, 0.3);
    this.gfx.fillCircle(this.x, this.y, r + 5);

    // 主体：威严老者造型（大三角道袍）
    this.gfx.fillStyle(flashing ? 0xffffff : this.color, 1);
    this.gfx.fillTriangle(
      this.x, this.y - r,
      this.x - r, this.y + r,
      this.x + r, this.y + r,
    );
    // 内层道袍
    this.gfx.fillStyle(flashing ? 0xffffff : 0x9575cd, 0.9);
    this.gfx.fillTriangle(
      this.x, this.y - r + 5,
      this.x - r + 5, this.y + r - 3,
      this.x + r - 5, this.y + r - 3,
    );
    // 头部
    this.gfx.fillStyle(0xffe0b2, 1);
    this.gfx.fillCircle(this.x, this.y - r + 4, 6);
    // 胡须
    this.gfx.fillStyle(0xffffff, 0.8);
    this.gfx.fillEllipse(this.x, this.y - r + 12, 8, 6);
    // 眼睛（发光）
    this.gfx.fillStyle(elemColor, 1);
    this.gfx.fillCircle(this.x - 2, this.y - r + 3, 1.5);
    this.gfx.fillCircle(this.x + 2, this.y - r + 3, 1.5);

    // 旋转法器光环
    for (let i = 0; i < 3; i++) {
      const a = this.phase + (i / 3) * Math.PI * 2;
      const px = this.x + Math.cos(a) * (r + 8);
      const py = this.y + Math.sin(a) * (r + 8);
      this.gfx.fillStyle(elemColor, 0.8);
      this.gfx.fillCircle(px, py, 3);
    }

    // 五行标识
    const ex = this.x;
    const ey = this.y - r - 10;
    this.gfx.fillStyle(0x000000, 0.5);
    this.gfx.fillCircle(ex, ey, 5);
    this.gfx.fillStyle(elemColor, 1);
    this.gfx.fillCircle(ex, ey, 3.5);

    // 血条
    this.hpBar.clear();
    const bw = 50;
    const bh = 5;
    const bx = this.x - bw / 2;
    const by = this.y - r - 22;
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

  /** 防御属性 */
  public defense: IDefensible = DefenseSystem.createDefense();

  takeDamage(amount: number, skipFlash = false): boolean {
    if (this.isDead) return true;
    if (this.magicDesolation) amount *= 0.05;
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
