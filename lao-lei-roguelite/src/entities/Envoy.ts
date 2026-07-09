/**
 * 天劫神使 - 天兵天将造型
 * 五行属性决定外形色调和远程攻击方式：
 * - 金：单把高伤飞剑
 * - 木：连续低伤高速自机狙绿色符箓
 * - 水：散弹低伤减速圆珠
 * - 火：近距慢速锥形高伤+持续燃烧
 * - 土：中距慢速石柱，1秒后破碎小范围碎裂伤害
 */
import Phaser from 'phaser';
import { COLORS } from '../utils/colors';
import { Element, ELEMENT_COLORS } from '../systems/ElementSystem';
import { DefenseSystem, IDefensible, ElementReductionSystem } from '../systems/DefenseSystem';

/** 神使攻击模式 */
export type EnvoyAttackType = 'sword' | 'talisman' | 'shotgun' | 'flame' | 'pillar';

interface EnvoyConfig {
  element: Element;
  name: string;
  hp: number;
  damage: number;
  speed: number;
  radius: number;
  attackType: EnvoyAttackType;
  attackInterval: number;
}

/** 五行神使配置 */
export const ENVOY_CONFIGS: Record<Exclude<Element, 'none'>, EnvoyConfig> = {
  metal: {
    element: 'metal', name: '庚金杀神', hp: 400, damage: 45, speed: 70, radius: 30,
    attackType: 'sword', attackInterval: 2.0,
  },
  wood: {
    element: 'wood', name: '青木瘟神', hp: 700, damage: 25, speed: 60, radius: 30,
    attackType: 'talisman', attackInterval: 0.32,
  },
  water: {
    element: 'water', name: '玄冰霜神', hp: 1300, damage: 30, speed: 65, radius: 30,
    attackType: 'shotgun', attackInterval: 1.44,
  },
  fire: {
    element: 'fire', name: '烈焰焚神', hp: 1100, damage: 60, speed: 75, radius: 30,
    attackType: 'flame', attackInterval: 1.4,
  },
  earth: {
    element: 'earth', name: '厚土镇神', hp: 1800, damage: 50, speed: 50, radius: 32,
    attackType: 'pillar', attackInterval: 2.4,
  },
};

/** 五行神使初始防御（金15/木20/水25/火15/土30） */
export const ENVOY_DEFENSE: Record<Exclude<Element, 'none'>, number> = {
  metal: 10,
  wood: 12,  // 木行神使防御12（原20-8）
  water: 25,
  fire: 15,
  earth: 30,
};

export class Envoy extends Phaser.Physics.Arcade.Sprite {
  public hp: number;
  public maxHp: number;
  public damage: number;
  public element: Element;
  public name: string;
  private radius: number;
  private config: EnvoyConfig;

  private hitFlash = 0;
  private attackTimer = 1.5;  // 首次攻击延迟
  private gfx: Phaser.GameObjects.Graphics;
  private hpBar: Phaser.GameObjects.Graphics;
  /** 移动目标点（绕玩家巡逻） */
  private patrolAngle = 0;

  // 状态效果（与 Enemy/Disciple 一致接口）
  public slowMul = 1.0;
  private slowTimer = 0;
  public poisonDps = 0;
  private poisonTimer = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, element: Element, hpScale = 1) {
    super(scene, x, y, 'enemy_body');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.config = ENVOY_CONFIGS[element as Exclude<Element, 'none'>];
    this.element = element;
    this.name = this.config.name;
    this.maxHp = Math.round(this.config.hp * hpScale);
    this.hp = this.maxHp;
    this.damage = this.config.damage;
    this.radius = this.config.radius;
    // 防御按五行拆分 + 每击败一个神使所有敌人+5防御（由 GameScene 设置）
    this.defense.defense = ENVOY_DEFENSE[element as Exclude<Element, 'none'>] ?? 15;

    this.setCircle(this.radius, 0, 0);
    this.setCollideWorldBounds(true);
    this.setDepth(9);

    this.gfx = scene.add.graphics();
    this.gfx.setDepth(9);
    this.hpBar = scene.add.graphics();
    this.hpBar.setDepth(50);
  }

  update(dt: number, targetX: number, targetY: number): void {
    // 重伤计时器衰减
    if (this.grievousTimer > 0) this.grievousTimer -= dt;
    // 木行神使回春被动：每秒恢复2%最大生命（重伤降低70%）
    if (this.element === 'wood' && this.hp > 0) {
      const regenRate = this.grievousTimer > 0 ? 0.02 * 0.3 : 0.02;
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * regenRate * dt);
    }
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

    // 移动：绕玩家中距离巡逻（受减速影响）
    this.patrolAngle += dt * 0.6;
    const idealDist = 220;
    const patrolX = targetX + Math.cos(this.patrolAngle) * idealDist;
    const patrolY = targetY + Math.sin(this.patrolAngle) * idealDist;
    const angle = Phaser.Math.Angle.Between(this.x, this.y, patrolX, patrolY);
    const sp = this.config.speed * this.slowMul;
    this.setVelocity(Math.cos(angle) * sp, Math.sin(angle) * sp);

    // 攻击
    this.attackTimer -= dt;
    if (this.attackTimer <= 0) {
      this.attackTimer = this.config.attackInterval;
      this.fireAttack(targetX, targetY);
    }

    if (this.hitFlash > 0) this.hitFlash -= dt;
    this.draw();
  }

  /** 施加减速 */
  applySlow(mul: number, duration: number): void {
    if (mul < this.slowMul) this.slowMul = mul;
    this.slowTimer = Math.max(this.slowTimer, duration);
  }

  /** 施加击退（神使较重，击退效果减半） */
  applyKnockback(vx: number, vy: number): void {
    // 神使质量大，击退效果减半
    this.slowTimer = Math.max(this.slowTimer, 0.2);
    this.slowMul = Math.min(this.slowMul, 0.8);
  }

  /** 施加中毒 */
  applyPoison(dps: number, duration: number): void {
    this.poisonDps = Math.max(this.poisonDps, dps);
    this.poisonTimer = Math.max(this.poisonTimer, duration);
  }

  /** 发射攻击（按五行类型） */
  private fireAttack(tx: number, ty: number): void {
    const type = this.config.attackType;
    const angle = Phaser.Math.Angle.Between(this.x, this.y, tx, ty);
    const event = (name: string, ...args: any[]) => this.scene.events.emit(name, ...args);

    switch (type) {
      case 'sword': {
        // 金：单把高伤飞剑（直线高速）
        const speed = 400;
        event('envoy-fire', this.x, this.y,
          this.x + Math.cos(angle) * speed, this.y + Math.sin(angle) * speed,
          this.element, this.damage, 'sword');
        break;
      }
      case 'talisman': {
        // 木：连续低伤高速自机狙（朝玩家方向连发）
        const speed = 480;
        event('envoy-fire', this.x, this.y,
          this.x + Math.cos(angle) * speed, this.y + Math.sin(angle) * speed,
          this.element, this.damage, 'talisman');
        break;
      }
      case 'shotgun': {
        // 水：散弹（5发扇形低速圆珠，带减速）
        const speed = 260;
        const spread = 0.5;
        for (let i = -2; i <= 2; i++) {
          const a = angle + i * spread / 4;
          event('envoy-fire', this.x, this.y,
            this.x + Math.cos(a) * speed, this.y + Math.sin(a) * speed,
            this.element, this.damage, 'shotgun');
        }
        break;
      }
      case 'flame': {
        // 火：近距锥形高伤（短射程，带燃烧）
        const speed = 200;
        event('envoy-fire', this.x, this.y,
          this.x + Math.cos(angle) * speed, this.y + Math.sin(angle) * speed,
          this.element, this.damage, 'flame');
        break;
      }
      case 'pillar': {
        // 土：发射石柱朝玩家方向
        event('envoy-pillar', this.x, this.y, this.element, this.damage, tx, ty);
        break;
      }
    }
  }

  /** 绘制天兵天将造型 */
  private draw(): void {
    this.gfx.clear();
    const flashing = this.hitFlash > 0;
    const r = this.radius;
    const elemColor = ELEMENT_COLORS[this.element];
    const t = this.scene.time.now / 1000;

    // 外层五行光环（旋转）
    this.gfx.fillStyle(elemColor, 0.15);
    this.gfx.fillCircle(this.x, this.y, r + 12);
    this.gfx.lineStyle(2, elemColor, 0.5);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + t;
      const x1 = this.x + Math.cos(a) * (r + 8);
      const y1 = this.y + Math.sin(a) * (r + 8);
      this.gfx.strokeCircle(x1, y1, 3);
    }

    // 天将铠甲主体（八边形）
    this.gfx.fillStyle(flashing ? 0xffffff : 0x37474f, 1);
    const sides = 8;
    this.gfx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
      const px = this.x + Math.cos(a) * r;
      const py = this.y + Math.sin(a) * r;
      if (i === 0) this.gfx.moveTo(px, py);
      else this.gfx.lineTo(px, py);
    }
    this.gfx.closePath();
    this.gfx.fillPath();

    // 铠甲五行色内层
    this.gfx.fillStyle(flashing ? 0xffffff : elemColor, 0.7);
    this.gfx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
      const px = this.x + Math.cos(a) * (r - 5);
      const py = this.y + Math.sin(a) * (r - 5);
      if (i === 0) this.gfx.moveTo(px, py);
      else this.gfx.lineTo(px, py);
    }
    this.gfx.closePath();
    this.gfx.fillPath();

    // 头盔（上方半圆）
    this.gfx.fillStyle(0xffe0b2, 1);
    this.gfx.fillCircle(this.x, this.y - r * 0.4, r * 0.35);
    // 头盔翎羽（五行色）
    this.gfx.fillStyle(elemColor, 1);
    this.gfx.fillTriangle(
      this.x, this.y - r * 0.8,
      this.x - 3, this.y - r * 0.5,
      this.x + 3, this.y - r * 0.5,
    );
    // 眼睛（发光）
    this.gfx.fillStyle(0xffeb3b, 1);
    this.gfx.fillCircle(this.x - 4, this.y - r * 0.4, 2);
    this.gfx.fillCircle(this.x + 4, this.y - r * 0.4, 2);

    // 肩甲（左右两个小八边形）
    this.gfx.fillStyle(elemColor, 0.9);
    this.drawSmallOctagon(this.x - r * 0.8, this.y + r * 0.2, 5);
    this.drawSmallOctagon(this.x + r * 0.8, this.y + r * 0.2, 5);

    // 武器（按五行不同）
    this.drawWeapon(t);

    // 五行标识（头顶大圆）
    const ex = this.x;
    const ey = this.y - r - 12;
    this.gfx.fillStyle(0x000000, 0.6);
    this.gfx.fillCircle(ex, ey, 7);
    this.gfx.fillStyle(elemColor, 1);
    this.gfx.fillCircle(ex, ey, 5);

    // 血条（顶部，宽大）
    this.hpBar.clear();
    const bw = 80;
    const bh = 6;
    const bx = this.x - bw / 2;
    const by = this.y - r - 26;
    this.hpBar.fillStyle(0x000000, 0.7);
    this.hpBar.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
    this.hpBar.fillStyle(0x37474f, 1);
    this.hpBar.fillRect(bx, by, bw, bh);
    const ratio = Math.max(0, this.hp / this.maxHp);
    this.hpBar.fillStyle(ratio > 0.5 ? 0x4caf50 : ratio > 0.25 ? 0xff9800 : 0xf44336, 1);
    this.hpBar.fillRect(bx, by, bw * ratio, bh);
  }

  /** 绘制小八边形 */
  private drawSmallOctagon(x: number, y: number, r: number): void {
    this.gfx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) this.gfx.moveTo(px, py);
      else this.gfx.lineTo(px, py);
    }
    this.gfx.closePath();
    this.gfx.fillPath();
  }

  /** 绘制武器（按五行） */
  private drawWeapon(t: number): void {
    const r = this.radius;
    const elemColor = ELEMENT_COLORS[this.element];
    const wave = Math.sin(t * 4) * 2;

    switch (this.config.attackType) {
      case 'sword': {
        // 金：长剑（右侧）
        this.gfx.fillStyle(0xcfd8dc, 1);
        this.gfx.fillRect(this.x + r * 0.6, this.y - 1, r * 0.9, 3);
        this.gfx.fillStyle(elemColor, 1);
        this.gfx.fillTriangle(
          this.x + r * 1.5, this.y,
          this.x + r * 1.4, this.y - 3,
          this.x + r * 1.4, this.y + 3,
        );
        break;
      }
      case 'talisman': {
        // 木：符箓（飘浮在周围）
        for (let i = 0; i < 3; i++) {
          const a = t * 2 + (i / 3) * Math.PI * 2;
          const tx = this.x + Math.cos(a) * (r + 6);
          const ty = this.y + Math.sin(a) * (r + 6);
          this.gfx.fillStyle(elemColor, 0.9);
          this.gfx.fillRect(tx - 3, ty - 5, 6, 10);
          this.gfx.fillStyle(0xffffff, 0.7);
          this.gfx.fillRect(tx - 1, ty - 3, 2, 6);
        }
        break;
      }
      case 'shotgun': {
        // 水：冰珠（环绕）
        for (let i = 0; i < 4; i++) {
          const a = t + (i / 4) * Math.PI * 2;
          const tx = this.x + Math.cos(a) * (r + 5);
          const ty = this.y + Math.sin(a) * (r + 5);
          this.gfx.fillStyle(elemColor, 0.8);
          this.gfx.fillCircle(tx, ty, 3);
        }
        break;
      }
      case 'flame': {
        // 火：火焰光环（脉动）
        this.gfx.fillStyle(elemColor, 0.4 + wave * 0.1);
        this.gfx.fillCircle(this.x, this.y, r + 4 + wave);
        this.gfx.fillStyle(0xffeb3b, 0.6);
        this.gfx.fillCircle(this.x, this.y - r * 0.3, 4 + wave);
        break;
      }
      case 'pillar': {
        // 土：石块护盾（左右）
        this.gfx.fillStyle(elemColor, 0.9);
        this.gfx.fillCircle(this.x - r * 0.9, this.y + wave, 5);
        this.gfx.fillCircle(this.x + r * 0.9, this.y - wave, 5);
        break;
      }
    }
  }

  /** 是否已死亡 */
  public isDead = false;
  public grievousTimer = 0;
  /** 末法魔化 */
  public magicDesolation = false;
  /** 防御属性 */
  public defense: IDefensible = DefenseSystem.createDefense();
  /** 五行减伤率（25%） */
  public elementReduction = 0.25;
  /** 最近攻击的五行（用于同属性吸收判断） */
  private lastAttackElement: Element = 'none';

  /** 设置攻击五行（用于同属性吸收判断） */
  setAttackElement(el: Element): void {
    this.lastAttackElement = el;
  }

  takeDamage(amount: number, skipFlash = false): boolean {
    if (this.isDead) return true;
    // 末法魔化减伤
    if (this.magicDesolation) amount *= 0.05;
    // 同属性吸收：不掉血且回血（回血减少80%，即只回20%）
    if (ElementReductionSystem.isSameElementAbsorb(this.lastAttackElement, this.element)) {
      this.hp = Math.min(this.maxHp, this.hp + amount * 0.2);
      this.lastAttackElement = 'none';
      return false;
    }
    // 五行减伤（仅对五行攻击生效，普通攻击不减伤）
    if (this.lastAttackElement !== 'none') {
      amount = ElementReductionSystem.applyReduction(amount, this.elementReduction);
    }
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
