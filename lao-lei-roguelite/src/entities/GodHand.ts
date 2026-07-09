/**
 * 神之手 - 天劫一轮5神使后降临的最终boss
 * 不限制玩家移动，具有全部五行能力，每3秒轮流使用
 * 血量为土行神使的2倍
 */
import Phaser from 'phaser';
import { COLORS } from '../utils/colors';
import { Element, ELEMENT_COLORS } from '../systems/ElementSystem';
import { DefenseSystem, IDefensible, ElementReductionSystem } from '../systems/DefenseSystem';

export class GodHand extends Phaser.Physics.Arcade.Sprite {
  public hp: number;
  public maxHp: number;
  public damage: number;
  public element: Element = 'none';
  public name = '神之手';
  public radius = 50;
  private gfx: Phaser.GameObjects.Graphics;
  private hpBar: Phaser.GameObjects.Graphics;
  private phase = 0;
  private hitFlash = 0;
  /** 当前攻击五行（轮换） */
  private currentAttackIndex = 0;
  private attackTimer = 2;
  /** 巨石列表（土行技能） */
  private rocks: { angle: number; dist: number }[] = [];
  private rockTimer = 0;

  public isDead = false;
  /** 末法魔化 */
  public magicDesolation = false;

  constructor(scene: Phaser.Scene, x: number, y: number, hp: number) {
    super(scene, x, y, 'enemy_body');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.maxHp = hp;
    this.hp = hp;
    this.damage = 40;
    this.defense.defense = 30;  // 神之手防御30

    this.setCircle(this.radius, 0, 0);
    this.setCollideWorldBounds(true);
    this.setDepth(10);

    this.gfx = scene.add.graphics();
    this.gfx.setDepth(10);
    this.hpBar = scene.add.graphics();
    this.hpBar.setDepth(51);
  }

  /** 存在时间（用于狂暴） */
  private aliveTime = 0;
  /** 是否狂暴 */
  public enraged = false;

  update(dt: number, targetX: number, targetY: number): void {
    if (this.isDead) return;
    this.phase += dt * 1.5;
    this.aliveTime += dt;

    // 不屈：每秒重置伤害计数
    this.damageTimer += dt;
    if (this.damageTimer >= 1.0) {
      this.damageTimer = 0;
      this.damageThisSecond = 0;
    }

    // 1分钟后狂暴：伤害+50%，攻击间隔-50%
    if (!this.enraged && this.aliveTime >= 60) {
      this.enraged = true;
      this.damage = Math.round(this.damage * 1.5);
    }

    // 缓慢移动追踪玩家
    const angle = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);
    const dist = Phaser.Math.Distance.Between(this.x, this.y, targetX, targetY);
    if (dist > 250) {
      this.setVelocity(Math.cos(angle) * 60, Math.sin(angle) * 60);
    } else {
      this.setVelocity(0, 0);
    }

    // 攻击空档回血：每秒回2%最大生命
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.02 * dt);

    // 攻击轮换：金木水火土，每3秒一次（狂暴后1.5秒）
    this.attackTimer -= dt;
    if (this.attackTimer <= 0) {
      this.attackTimer = this.enraged ? 1.5 : 3;
      const attacks: Element[] = ['metal', 'wood', 'water', 'fire', 'earth'];
      const currentElement = attacks[this.currentAttackIndex % 5];
      this.currentAttackIndex++;
      this.fireAttack(currentElement, targetX, targetY);
    }

    // 巨石旋转更新（旋转加快）
    if (this.rocks.length > 0) {
      this.rockTimer -= dt;
      for (const r of this.rocks) {
        r.angle += dt * 3;  // 旋转加快
      }
      if (this.rockTimer <= 0) {
        // 巨石变成投射物攻击玩家
        this.launchRocks(targetX, targetY);
        this.rocks = [];
      }
    }

    if (this.hitFlash > 0) this.hitFlash -= dt;
    this.draw();
  }

  /** 巨石结束后变成投射物 */
  private launchRocks(tx: number, ty: number): void {
    for (const r of this.rocks) {
      const rx = this.x + Math.cos(r.angle) * r.dist;
      const ry = this.y + Math.sin(r.angle) * r.dist;
      const angle = Phaser.Math.Angle.Between(rx, ry, tx, ty);
      const speed = 300;
      this.scene.events.emit('godhand-rock-launch', rx, ry, Math.cos(angle) * speed, Math.sin(angle) * speed, this.damage * 0.5);
    }
  }

  /** 获取巨石位置（用于碰撞检测） */
  getRockPositions(): { x: number; y: number }[] {
    return this.rocks.map(r => ({
      x: this.x + Math.cos(r.angle) * r.dist,
      y: this.y + Math.sin(r.angle) * r.dist,
    }));
  }

  private fireAttack(element: Element, tx: number, ty: number): void {
    switch (element) {
      case 'metal':
        this.scene.events.emit('godhand-metal', this.x, this.y, tx, ty, this.damage);
        break;
      case 'wood':
        this.scene.events.emit('godhand-wood', this.x, this.y, tx, ty, this.damage * 0.5);
        break;
      case 'water':
        this.scene.events.emit('godhand-water', this.x, this.y, tx, ty, this.damage * 0.6);
        break;
      case 'fire':
        this.scene.events.emit('godhand-fire', this.x, this.y, this.damage * 1.5);
        break;
      case 'earth':
        this.summonRocks(6, this.damage);
        break;
    }
  }

  /** 召唤巨石围绕旋转 */
  summonRocks(count: number, _dmg: number): void {
    this.rocks = [];
    for (let i = 0; i < count; i++) {
      this.rocks.push({ angle: (i / count) * Math.PI * 2, dist: 80 });
    }
    this.rockTimer = 10;
  }

  private draw(): void {
    this.gfx.clear();
    const flashing = this.hitFlash > 0;
    const r = this.radius;
    const palmColor = flashing ? 0xffffff : 0xfff8e1;  // 淡黄色
    const palmShadow = flashing ? 0xffffff : 0xffe0b2;

    // 外层神圣光晕
    this.gfx.fillStyle(0xffffff, 0.08);
    this.gfx.fillCircle(this.x, this.y, r + 25);
    this.gfx.fillStyle(0xffd54f, 0.12);
    this.gfx.fillCircle(this.x, this.y, r + 15);

    // 手掌主体（竖向椭圆，模拟手掌）
    this.gfx.fillStyle(palmColor, 0.95);
    this.gfx.fillEllipse(this.x, this.y + 5, r * 1.4, r * 1.6);
    // 手掌阴影
    this.gfx.fillStyle(palmShadow, 0.5);
    this.gfx.fillEllipse(this.x - 5, this.y + 8, r * 1.2, r * 1.4);

    // 无畏印：五指向上张开（食指/中指/无名指/小指+拇指）
    // 拇指（左侧，稍短）
    this.gfx.fillStyle(palmColor, 1);
    this.gfx.fillEllipse(this.x - r * 0.7, this.y - r * 0.2, r * 0.35, r * 0.7);
    // 食指（左上，伸直）
    this.gfx.fillEllipse(this.x - r * 0.45, this.y - r * 0.9, r * 0.28, r * 0.9);
    // 中指（中上，最高）
    this.gfx.fillEllipse(this.x, this.y - r * 1.0, r * 0.28, r * 1.0);
    // 无名指（右上）
    this.gfx.fillEllipse(this.x + r * 0.45, this.y - r * 0.9, r * 0.28, r * 0.9);
    // 小指（右侧，稍短）
    this.gfx.fillEllipse(this.x + r * 0.75, this.y - r * 0.5, r * 0.25, r * 0.7);

    // 手指关节高光
    this.gfx.fillStyle(0xffffff, 0.4);
    this.gfx.fillEllipse(this.x - r * 0.45, this.y - r * 1.1, r * 0.1, r * 0.3);
    this.gfx.fillEllipse(this.x, this.y - r * 1.2, r * 0.1, r * 0.3);
    this.gfx.fillEllipse(this.x + r * 0.45, this.y - r * 1.1, r * 0.1, r * 0.3);

    // 手掌中心法印（旋转的金色符文）
    this.gfx.lineStyle(2, 0xffd54f, 0.9);
    this.gfx.strokeCircle(this.x, this.y + 5, r * 0.35);
    this.gfx.lineStyle(1.5, 0xff8f00, 0.7);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + this.phase * 0.3;
      this.gfx.lineBetween(this.x, this.y + 5, this.x + Math.cos(a) * r * 0.3, this.y + 5 + Math.sin(a) * r * 0.3);
    }
    // 中心点
    this.gfx.fillStyle(0xffd54f, 1);
    this.gfx.fillCircle(this.x, this.y + 5, r * 0.12);

    // 狂暴状态：红色光环
    if (this.enraged) {
      this.gfx.lineStyle(4, 0xff5252, 0.6 + Math.sin(this.phase * 3) * 0.2);
      this.gfx.strokeCircle(this.x, this.y, r + 20);
    }

    // 巨石
    for (const rock of this.rocks) {
      const rx = this.x + Math.cos(rock.angle) * rock.dist;
      const ry = this.y + Math.sin(rock.angle) * rock.dist;
      this.gfx.fillStyle(ELEMENT_COLORS.earth, 0.4);
      this.gfx.fillCircle(rx, ry, 18);
      this.gfx.fillStyle(ELEMENT_COLORS.earth, 1);
      this.gfx.fillCircle(rx, ry, 12);
      this.gfx.fillStyle(0x6d4c41, 1);
      this.gfx.fillCircle(rx - 3, ry - 2, 4);
      this.gfx.fillCircle(rx + 4, ry + 3, 3);
    }

    // 血条（顶部大血条）
    this.hpBar.clear();
    const bw = 120;
    const bh = 6;
    const bx = this.x - bw / 2;
    const by = this.y - r - 30;
    this.hpBar.fillStyle(0x000000, 0.7);
    this.hpBar.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
    this.hpBar.fillStyle(0x37474f, 1);
    this.hpBar.fillRect(bx, by, bw, bh);
    const ratio = Math.max(0, this.hp / this.maxHp);
    this.hpBar.fillStyle(0xff5252, 1);
    this.hpBar.fillRect(bx, by, bw * ratio, bh);
  }

  /** 防御属性 */
  public defense: IDefensible = DefenseSystem.createDefense();
  /** 五行减伤率（40%） */
  public elementReduction = 0.40;
  private lastAttackElement: Element = 'none';

  setAttackElement(el: Element): void {
    this.lastAttackElement = el;
  }

  /** 不屈：每秒最多失去10%最大生命 */
  private damageThisSecond = 0;
  private damageTimer = 0;

  takeDamage(amount: number, skipFlash = false): boolean {
    if (this.isDead) return true;
    // 末法魔化减伤
    if (this.magicDesolation) amount *= 0.05;
    // 五行减伤
    if (this.lastAttackElement !== 'none') {
      amount = ElementReductionSystem.applyReduction(amount, this.elementReduction);
    }
    // 不屈：每秒最多失去10%最大生命
    const maxDamagePerSecond = this.maxHp * 0.1;
    if (this.damageThisSecond + amount > maxDamagePerSecond) {
      amount = Math.max(0, maxDamagePerSecond - this.damageThisSecond);
    }
    if (amount <= 0) return false;
    this.damageThisSecond += amount;
    // 防御减免
    amount = DefenseSystem.applyDefense(this.defense, amount);
    this.hp -= amount;
    this.lastAttackElement = 'none';
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
