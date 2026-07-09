/**
 * 玩家 - 穿越者老雷
 * 能力：磁场转动（放电 + 磁场领域 + 肉身强化）
 * 自动攻击最近敌人，移动靠键盘/摇杆
 * 五行法术：解锁后周期自动触发
 */
import Phaser from 'phaser';
import { COLORS } from '../utils/colors';
import { PlayerStats, SpellDef } from '../systems/UpgradeSystem';
import { Element, ELEMENT_COLORS } from '../systems/ElementSystem';
import { DefenseSystem, IDefensible } from '../systems/DefenseSystem';
import { DebuffSystem, IDebuffable } from '../systems/DebuffSystem';

export class Player extends Phaser.Physics.Arcade.Sprite {
  public stats: PlayerStats;
  public hp: number;
  /** 攻击计时器（秒） */
  private attackTimer = 0;
  /** 磁暴计时器（秒） */
  private stormTimer = 0;
  /** 受伤无敌时间 */
  private invuln = 0;
  /** 磁场护盾冷却 */
  private shieldCooldown = 0;
  /** 是否处于护盾状态 */
  public shieldActive = false;
  private shieldTimer = 0;
  /** 五行法术计时器（按 spell.id 索引） */
  private spellTimers: Record<string, number> = {};
  /** 木行加速 buff 计时 */
  private woodBuffTimer = 0;
  /** 木行加速倍率 */
  private woodSpeedMul = 1.0;
  /** 火行燃烧状态（每秒掉血） */
  public burnDps = 0;
  public burnTimer = 0;
  /** 土行护盾（商店法术）：抵消伤害+反弹 */
  public earthShield = 0;       // 当前护盾值
  public earthShieldMax = 0;    // 护盾上限
  private earthShieldCooldown = 0;  // 护盾破碎后冷却
  /** 禁疗状态（神之手金行攻击） */
  public healBlockTimer = 0;
  /** 中毒状态（弟子金行符箓，每秒最大生命3%） */
  public poisonTimer = 0;
  public poisonDpsRatio = 0;

  /** 视觉元素 */
  private auraRing: Phaser.GameObjects.Arc;
  private glowGfx: Phaser.GameObjects.Graphics;
  private shieldGfx: Phaser.GameObjects.Arc;

  constructor(scene: Phaser.Scene, x: number, y: number, stats: PlayerStats) {
    // 使用一个隐藏的 1x1 纹理作为 sprite 基底，实际用 Graphics 绘制
    super(scene, x, y, 'player_body');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCircle(14, 0, 0);
    this.setCollideWorldBounds(true);

    this.stats = stats;
    this.hp = stats.maxHp;
    this.defense.defense = 2;  // 初始防御2

    // 磁场领域光环（视觉）
    this.auraRing = scene.add.circle(x, y, stats.auraRange, COLORS.MAGNETIC, 0.08)
      .setStrokeStyle(1, COLORS.MAGNETIC_GLOW, 0.4);
    this.auraRing.setDepth(1);

    // 发光层
    this.glowGfx = scene.add.graphics();
    this.glowGfx.setDepth(5);

    // 护盾
    this.shieldGfx = scene.add.circle(x, y, 22, 0xffffff, 0)
      .setStrokeStyle(2, COLORS.MAGNETIC_GLOW, 0);
    this.shieldGfx.setDepth(6);

    this.setDepth(10);
  }

  /** 每帧更新 */
  update(dt: number, moveX: number, moveY: number, nearestEnemy: Phaser.Math.Vector2 | null): void {
    // 木行加速 buff 衰减
    if (this.woodBuffTimer > 0) {
      this.woodBuffTimer -= dt;
      if (this.woodBuffTimer <= 0) this.woodSpeedMul = 1.0;
    }

    // 火行燃烧伤害（无视无敌帧，持续掉血）
    if (this.burnTimer > 0) {
      this.burnTimer -= dt;
      this.hp -= this.burnDps * dt;
      if (this.hp <= 0) {
        this.hp = 0;
        this.scene.events.emit('player-dead');
      }
      if (this.burnTimer <= 0) this.burnDps = 0;
    }

    // 土行护盾冷却恢复
    if (this.earthShieldCooldown > 0) {
      this.earthShieldCooldown -= dt;
      if (this.earthShieldCooldown <= 0 && this.earthShieldMax > 0) {
        this.earthShield = this.earthShieldMax;
        this.scene.events.emit('player-hit', this.x, this.y);
      }
    }
    // 禁疗倒计时
    if (this.healBlockTimer > 0) {
      this.healBlockTimer -= dt;
    }
    // 中毒（每秒最大生命3%）
    if (this.poisonTimer > 0) {
      this.poisonTimer -= dt;
      this.hp -= this.stats.maxHp * this.poisonDpsRatio * dt;
      if (this.hp <= 0) {
        this.hp = 0;
        this.scene.events.emit('player-dead');
      }
      if (this.poisonTimer <= 0) this.poisonDpsRatio = 0;
    }
    // 减速衰减
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) this.slowMul = 1.0;
    }
    // 防御更新
    DefenseSystem.updateDefense(this.defense, dt);
    // Debuff 更新
    const debuffResult = DebuffSystem.updateDebuffs(this.debuffContainer, dt, this.x, this.y);
    if (debuffResult.tearDamage > 0) {
      this.hp -= debuffResult.tearDamage;  // 无视防御
      if (this.hp <= 0) {
        this.hp = 0;
        this.scene.events.emit('player-dead');
      }
    }

    // 眩晕：无法移动/攻击/法术
    const isStunned = DebuffSystem.hasDebuff(this.debuffContainer, 'stun');

    // 移动（受木行加速、减速、法宝移速加成、眩晕影响）
    const len = Math.sqrt(moveX * moveX + moveY * moveY);
    const treasureMoveBonus = (this as any).treasureMoveSpeedBonus ?? 0;
    if (isStunned) {
      this.setVelocity(0, 0);
    } else if (len > 0.1) {
      const nx = moveX / (len > 1 ? len : 1);
      const ny = moveY / (len > 1 ? len : 1);
      this.setVelocity(nx * (this.stats.moveSpeed + treasureMoveBonus) * this.woodSpeedMul * this.slowMul, ny * (this.stats.moveSpeed + treasureMoveBonus) * this.woodSpeedMul * this.slowMul);
    } else {
      this.setVelocity(0, 0);
    }

    // 计时器
    if (this.invuln > 0) this.invuln -= dt;
    if (this.shieldCooldown > 0) this.shieldCooldown -= dt;
    if (this.shieldTimer > 0) {
      this.shieldTimer -= dt;
      if (this.shieldTimer <= 0) this.shieldActive = false;
    }

    // 生命再生（禁疗时无效）
    if (this.stats.hpRegen > 0 && this.hp < this.stats.maxHp && this.healBlockTimer <= 0) {
      this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.hpRegen * dt);
    }

    // 自动攻击（眩晕时无法攻击）
    if (!isStunned) {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0 && nearestEnemy) {
        this.attackTimer = 1 / this.stats.attackSpeed;
        this.fireLightning(nearestEnemy);
      }
    }

    // 磁暴领域（解锁后周期性释放，眩晕时无法释放）
    if (!isStunned && this.stats.hasStorm) {
      this.stormTimer -= dt;
      if (this.stormTimer <= 0) {
        this.stormTimer = 4;  // 每 4 秒一次
        this.emitStorm();
      }
    }

    // 五行法术触发（眩晕时无法释放）
    if (!isStunned) {
      for (const spell of this.stats.spells) {
        if (spell.trigger !== 'auto') continue;
        const id = spell.id;
        if (this.spellTimers[id] === undefined) this.spellTimers[id] = spell.interval ?? 3;
        this.spellTimers[id] -= dt;
        if (this.spellTimers[id] <= 0) {
          this.spellTimers[id] = Math.max(0.5, spell.interval ?? 3);
          this.castSpell(spell, nearestEnemy);
        }
      }
    }

    // 更新视觉
    this.updateVisual();
  }

  /** 施放五行法术 */
  private castSpell(spell: SpellDef, nearest: Phaser.Math.Vector2 | null): void {
    // 计算法宝加成
    const treasureBonus = this.getTreasureBonus(spell.element);
    const dmgMul = (spell.damageMul ?? 1) * treasureBonus.damageMul;
    const rangeMul = (spell.range ?? 1) * treasureBonus.rangeMul;
    const intervalMul = treasureBonus.speedMul;

    switch (spell.id) {
      case 'metal': {
        // 庚金剑气：1.8倍金行伤害 + 中毒（每秒敌人maxHp的6%，持续5秒）
        const target = nearest ?? new Phaser.Math.Vector2(this.x + 1, this.y);
        const angle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
        const vx = Math.cos(angle) * 380;
        const vy = Math.sin(angle) * 380;
        const dmg = this.stats.damage * dmgMul;
        // poisonDps 传 0.06 表示按 maxHp 6%/秒，poisonDur 传 5
        this.scene.events.emit('spell-metal', this.x, this.y, vx, vy, dmg, 0.06, 5);
        break;
      }
      case 'wood': {
        this.heal(spell.value ?? 25);
        this.woodSpeedMul = 1.3;
        this.woodBuffTimer = spell.duration ?? 4;
        this.scene.events.emit('spell-wood', this.x, this.y);
        break;
      }
      case 'water': {
        this.scene.events.emit('spell-water', this.x, this.y, rangeMul, spell.value ?? 0.4, spell.duration ?? 3, this.stats.damage * dmgMul);
        break;
      }
      case 'fire': {
        this.scene.events.emit('spell-fire', this.x, this.y, rangeMul, this.stats.damage * dmgMul, spell.value ?? 200);
        break;
      }
      case 'earth': {
        // 厚土壁垒：抵挡投射物次数=叠加次数
        const stacks = this.stats.spellStacks['earth'] ?? 1;
        this.scene.events.emit('spell-earth', this.x, this.y, rangeMul, spell.duration ?? 4, this.stats.damage * dmgMul, stacks);
        break;
      }
      // ===== 商店五行法术 =====
      case 'shop_metal': {
        this.scene.events.emit('spell-shop-metal', this.x, this.y, rangeMul, this.stats.damage * dmgMul);
        break;
      }
      case 'shop_wood': {
        this.scene.events.emit('spell-shop-wood', this.x, this.y, rangeMul, this.stats.damage * dmgMul, spell.value ?? 0.5, spell.duration ?? 4);
        break;
      }
      case 'shop_water': {
        const target = nearest ?? new Phaser.Math.Vector2(this.x + 1, this.y);
        const angle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
        const vx = Math.cos(angle) * 1500;  // 飞行速度1500
        const vy = Math.sin(angle) * 1500;
        const dmg = this.stats.damage * dmgMul * 1.5;
        this.scene.events.emit('spell-shop-water', this.x, this.y, vx, vy, dmg, spell.value ?? 2.5);
        break;
      }
      case 'shop_fire': {
        const target = nearest ?? new Phaser.Math.Vector2(this.x + 1, this.y);
        const angle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
        const vx = Math.cos(angle) * 350;
        const vy = Math.sin(angle) * 350;
        const dmg = this.stats.damage * dmgMul;
        this.scene.events.emit('spell-shop-fire', this.x, this.y, vx, vy, dmg, rangeMul, spell.duration ?? 4);
        break;
      }
      case 'shop_earth': {
        this.scene.events.emit('spell-shop-earth', this.x, this.y, spell.value ?? 0.1, spell.duration ?? 5);
        break;
      }
      case 'shop_earth2': {
        // 巨门化暗：标记最近敌人位置，1秒后造成3倍土行伤害
        const target = nearest ?? new Phaser.Math.Vector2(this.x + 1, this.y);
        const dmg = this.stats.damage * dmgMul;
        this.scene.events.emit('spell-shop-earth2', target.x, target.y, dmg, rangeMul);
        break;
      }
    }
  }

  /** 计算法宝对特定五行法术的加成 */
  private getTreasureBonus(element: Element): { damageMul: number; rangeMul: number; speedMul: number } {
    let damageMul = 1;
    let rangeMul = 1;
    let speedMul = 1;
    for (const t of this.stats.equippedTreasures) {
      if (!t) continue;
      const e = t.effect;
      // 全局法术加成
      if (e.spellDamageMul) damageMul *= e.spellDamageMul;
      if (e.spellRangeMul) rangeMul *= e.spellRangeMul;
      if (e.spellSpeedMul) speedMul *= e.spellSpeedMul;
      // 特定五行加成
      if (e.elementBonus && e.elementBonus[element]) {
        const eb = e.elementBonus[element]!;
        if (eb.damageMul) damageMul *= eb.damageMul;
        if (eb.rangeMul) rangeMul *= eb.rangeMul;
        if (eb.speedMul) speedMul *= eb.speedMul;
      }
    }
    return { damageMul, rangeMul, speedMul };
  }

  /** 发射雷电 */
  private fireLightning(target: Phaser.Math.Vector2): void {
    const angle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
    const count = this.stats.projectileCount;
    const spread = count > 1 ? 0.25 : 0;
    // 磁场转动：无属性雷电伤害+200%
    const magneticBoost = (this as any).magneticBoost ? 3.0 : 1.0;
    const dmg = this.stats.damage * magneticBoost;
    for (let i = 0; i < count; i++) {
      const a = angle + (i - (count - 1) / 2) * spread;
      const vx = Math.cos(a) * 420;
      const vy = Math.sin(a) * 420;
      this.scene.events.emit('player-fire', this.x, this.y, vx, vy, dmg, this.stats.pierce, this.stats.hasChain);
    }
    this.scene.events.emit('player-attack-fx', this.x, this.y, target.x, target.y);
  }

  /** 磁暴冲击波 */
  private emitStorm(): void {
    this.scene.events.emit('player-storm', this.x, this.y, this.stats.auraRange * 1.5, this.stats.damage * 2);
  }

  /** 更新视觉：光环跟随、像素风肌肉小人、护盾 */
  private updateVisual(): void {
    this.auraRing.setPosition(this.x, this.y);
    this.auraRing.setRadius(this.stats.auraRange);

    // 发光绘制
    this.glowGfx.clear();
    // 外层光晕
    this.glowGfx.fillStyle(COLORS.PLAYER_GLOW, 0.12);
    this.glowGfx.fillCircle(this.x, this.y, 22);
    this.glowGfx.fillStyle(COLORS.PLAYER_GLOW, 0.2);
    this.glowGfx.fillCircle(this.x, this.y, 16);

    // 像素风肌肉小人（战棋风格）
    const px = this.x;
    const py = this.y;
    const flashing = this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0;
    const skin = flashing ? 0xffffff : 0xffcc80;
    const cloth = flashing ? 0xffffff : COLORS.PLAYER;
    const clothDark = flashing ? 0xffffff : 0x00838f;
    const hair = 0x3e2723;

    // 头部（像素方块）
    this.glowGfx.fillStyle(skin, 1);
    this.glowGfx.fillRect(px - 4, py - 14, 8, 7);  // 脸
    // 头发
    this.glowGfx.fillStyle(hair, 1);
    this.glowGfx.fillRect(px - 5, py - 15, 10, 3);  // 刘海
    this.glowGfx.fillRect(px - 5, py - 14, 2, 4);   // 左鬓
    this.glowGfx.fillRect(px + 3, py - 14, 2, 4);   // 右鬓
    // 眼睛
    this.glowGfx.fillStyle(0x000000, 1);
    this.glowGfx.fillRect(px - 3, py - 11, 1, 2);
    this.glowGfx.fillRect(px + 2, py - 11, 1, 2);

    // 躯干（肌肉上身，战棋风格宽肩）
    this.glowGfx.fillStyle(cloth, 1);
    this.glowGfx.fillRect(px - 7, py - 7, 14, 10);  // 上衣
    // 胸肌轮廓
    this.glowGfx.fillStyle(clothDark, 1);
    this.glowGfx.fillRect(px - 6, py - 6, 12, 1);   // 锁骨
    this.glowGfx.fillRect(px - 1, py - 5, 2, 6);    // 中线
    // 手臂（肌肉，两侧凸出）
    this.glowGfx.fillStyle(skin, 1);
    this.glowGfx.fillRect(px - 10, py - 6, 3, 8);   // 左臂
    this.glowGfx.fillRect(px + 7, py - 6, 3, 8);    // 右臂
    // 拳头
    this.glowGfx.fillRect(px - 10, py + 2, 3, 3);
    this.glowGfx.fillRect(px + 7, py + 2, 3, 3);

    // 腰带
    this.glowGfx.fillStyle(0xffd54f, 1);
    this.glowGfx.fillRect(px - 7, py + 3, 14, 2);

    // 腿部
    this.glowGfx.fillStyle(clothDark, 1);
    this.glowGfx.fillRect(px - 5, py + 5, 4, 8);    // 左腿
    this.glowGfx.fillRect(px + 1, py + 5, 4, 8);    // 右腿
    // 靴子
    this.glowGfx.fillStyle(0x3e2723, 1);
    this.glowGfx.fillRect(px - 5, py + 11, 4, 2);
    this.glowGfx.fillRect(px + 1, py + 11, 4, 2);

    // 木行加速光环
    if (this.woodBuffTimer > 0) {
      this.glowGfx.lineStyle(2, COLORS.ELEMENT_WOOD, 0.7);
      this.glowGfx.strokeCircle(this.x, this.y, 18 + Math.sin(Date.now() / 100) * 2);
    }

    // 护盾
    this.shieldGfx.setPosition(this.x, this.y);
    if (this.shieldActive) {
      this.shieldGfx.setStrokeStyle(3, COLORS.MAGNETIC_GLOW, 0.8);
    } else {
      this.shieldGfx.setStrokeStyle(2, COLORS.MAGNETIC_GLOW, 0);
    }

    // 土行护盾（商店法术）：棕色光环
    if (this.earthShield > 0) {
      const ratio = this.earthShield / this.earthShieldMax;
      this.glowGfx.lineStyle(3, COLORS.ELEMENT_EARTH, 0.7 * ratio);
      this.glowGfx.strokeCircle(this.x, this.y, 24 + Math.sin(Date.now() / 200) * 2);
      this.glowGfx.lineStyle(1, 0xffeb3b, 0.4 * ratio);
      this.glowGfx.strokeCircle(this.x, this.y, 20);
    }

    // 撕裂特效：红色血滴
    if (DebuffSystem.hasDebuff(this.debuffContainer, 'tear')) {
      const t = Date.now() / 100;
      for (let i = 0; i < 3; i++) {
        const a = t + i * 2.1;
        const r = 14 + Math.sin(a) * 3;
        const bx = this.x + Math.cos(a) * r;
        const by = this.y + Math.sin(a) * r;
        this.glowGfx.fillStyle(0xff1744, 0.8);
        this.glowGfx.fillCircle(bx, by, 2);
      }
    }

    // 眩晕特效：黄色星星旋转
    if (DebuffSystem.hasDebuff(this.debuffContainer, 'stun')) {
      const t = Date.now() / 200;
      for (let i = 0; i < 3; i++) {
        const a = t + i * (Math.PI * 2 / 3);
        const sx = this.x + Math.cos(a) * 18;
        const sy = this.y - 20 + Math.sin(a) * 4;
        this.glowGfx.fillStyle(0xffeb3b, 0.9);
        this.glowGfx.fillCircle(sx, sy, 3);
        this.glowGfx.fillStyle(0xffffff, 0.6);
        this.glowGfx.fillCircle(sx - 1, sy - 1, 1);
      }
    }

    // 衰弱特效：紫色光环
    if (DebuffSystem.hasDebuff(this.debuffContainer, 'weaken')) {
      this.glowGfx.lineStyle(2, 0xab47bc, 0.6);
      this.glowGfx.strokeCircle(this.x, this.y, 16 + Math.sin(Date.now() / 150) * 2);
    }
  }

  /** 受伤 */
  takeDamage(amount: number): boolean {
    if (this.invuln > 0) return false;
    // 磁场护体：触发护盾抵挡一次
    if (this.stats.hasShield && this.shieldCooldown <= 0 && !this.shieldActive) {
      this.shieldActive = true;
      this.shieldTimer = 1.5;
      this.shieldCooldown = 8;
      this.invuln = 0.3;
      return false;
    }
    if (this.shieldActive) return false;

    // 土行护盾（商店法术）：抵消伤害+反弹
    if (this.earthShield > 0) {
      if (amount >= this.earthShield) {
        const reflect = this.earthShield;
        this.earthShield = 0;
        this.earthShieldCooldown = 5;
        this.invuln = 0.3;
        this.scene.events.emit('earth-shield-reflect', this.x, this.y, reflect * 2);
        amount -= reflect;
      } else {
        this.earthShield -= amount;
        this.scene.events.emit('earth-shield-reflect', this.x, this.y, amount);
        return true;
      }
    }

    // 衰弱增伤50%
    if (DebuffSystem.hasDebuff(this.debuffContainer, 'weaken')) amount *= 1.5;
    // 五行减伤（升级提供，乘算叠加）
    if (this.stats.elementReduction > 0) amount *= (1 - this.stats.elementReduction);
    // 防御减免（基础+临时+法宝加成+升级加成）
    const totalDefense = this.defense.defense + this.defense.tempDefense + this.treasureDefenseBonus + this.stats.defenseAdd;
    amount = Math.max(1, amount - totalDefense);

    this.hp -= amount;
    this.invuln = 0.6;  // 0.6秒无敌帧，防止被围攻瞬秒
    this.scene.events.emit('player-hit', this.x, this.y);
    if (this.hp <= 0) {
      this.hp = 0;
      this.scene.events.emit('player-dead');
    }
    return true;
  }

  /** 设置土行护盾（商店法术） */
  setEarthShield(ratio: number): void {
    this.earthShieldMax = Math.round(this.stats.maxHp * ratio);
    this.earthShield = this.earthShieldMax;
    this.earthShieldCooldown = 0;
  }

  /** 治疗（禁疗状态下无效） */
  heal(amount: number): void {
    if (this.healBlockTimer > 0) return;  // 禁疗
    this.hp = Math.min(this.stats.maxHp, this.hp + amount);
  }

  /** 施加禁疗 */
  applyHealBlock(duration: number): void {
    this.healBlockTimer = Math.max(this.healBlockTimer, duration);
  }

  /** 施加中毒（每秒扣除 ratio × maxHp） */
  applyPoison(ratio: number, duration: number): void {
    this.poisonDpsRatio = Math.max(this.poisonDpsRatio, ratio);
    this.poisonTimer = Math.max(this.poisonTimer, duration);
  }

  /** 施加减速（水行符箓） */
  public slowMul = 1.0;
  public slowTimer = 0;
  /** 防御属性（每升一级+0.5） */
  public defense: IDefensible = DefenseSystem.createDefense();
  /** 法宝提供的常驻防御加成（不参与 tempDefense 衰减） */
  public treasureDefenseBonus = 0;
  /** Debuff 容器 */
  public debuffContainer: IDebuffable = DebuffSystem.createDebuffs();
  applySlow(mul: number, duration: number): void {
    if (mul < this.slowMul) this.slowMul = mul;
    this.slowTimer = Math.max(this.slowTimer, duration);
  }

  /** 施加燃烧（火行神使攻击） */
  applyBurn(dps: number, duration: number): void {
    this.burnDps = Math.max(this.burnDps, dps);
    this.burnTimer = Math.max(this.burnTimer, duration);
  }

  /** 应用升级后刷新最大生命 */
  onUpgrade(): void {
    const hpRatio = this.hp / this.stats.maxHp;
    this.hp = this.stats.maxHp * Math.min(1, hpRatio + 0.1);
    // 每升一级增加0.5防御
    this.defense.defense += 0.5;
  }

  /** 销毁 */
  destroy(fromScene?: boolean): void {
    this.auraRing.destroy();
    this.glowGfx.destroy();
    this.shieldGfx.destroy();
    super.destroy(fromScene);
  }
}
