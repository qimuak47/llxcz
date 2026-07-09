/**
 * GameScene - 主战斗场景
 * 负责：玩家、敌人、投射物、灵石的生成与碰撞
 * 波次系统：随时间推移敌人变多变强，定期出现 boss
 * 升级流程：经验满 → 暂停 → 显示三选一 → 继续
 */
import Phaser from 'phaser';
import { COLORS } from '../utils/colors';
import { Player } from '../entities/Player';
import { Enemy, EnemyKind } from '../entities/Enemy';
import { Projectile } from '../entities/Projectile';
import { XPGem } from '../entities/XPGem';
import { SpellProjectile } from '../entities/SpellProjectile';
import { EarthWall } from '../entities/EarthWall';
import { Disciple } from '../entities/Disciple';
import { Envoy } from '../entities/Envoy';
import { Ancestor } from '../entities/Ancestor';
import { GodHand } from '../entities/GodHand';
import { WoodDragon } from '../entities/WoodDragon';
import { Shop } from '../entities/Shop';
import { FireVortex } from '../entities/FireVortex';
import { VirtualJoystick } from '../systems/VirtualJoystick';
import {
  createInitialStats, applyUpgrade, rollUpgrades,
  PlayerStats, Upgrade, SHOP_SPELL_POOL,
} from '../systems/UpgradeSystem';
import { SaveSystem } from '../systems/SaveSystem';
import { Element, elementMultiplier, ELEMENT_COLORS, ELEMENT_NAMES } from '../systems/ElementSystem';
import { Treasure, TreasureGrade, rollTreasure, GRADE_NAMES, GRADE_COLORS, canSynthesize, getUpgradedTreasure, TREASURE_POOL } from '../systems/TreasureSystem';
import { checkSynthesizable, executeSynthesis, RECIPES, Recipe } from '../systems/SynthesisSystem';
import { DebuffSystem } from '../systems/DebuffSystem';
import { SpiritTreasureEntity } from '../entities/SpiritTreasureEntity';
import { SPIRIT_TREASURE_POOL, MELT_VALUES, SpiritTreasureId } from '../systems/SpiritTreasureSystem';
import { WORLD_W, WORLD_H } from '../main';

interface UpgradeChoice {
  upgrade: Upgrade;
  card: Phaser.GameObjects.Container;
}

export class GameScene extends Phaser.Scene {
  // ===== 实体 =====
  private player!: Player;
  private enemies!: Phaser.GameObjects.Group;
  private disciples!: Phaser.GameObjects.Group;   // 门派弟子精英怪
  private envoys!: Phaser.GameObjects.Group;      // 天劫神使
  private ancestors!: Phaser.GameObjects.Group;   // 宗门老祖
  private godHand: GodHand | null = null;         // 神之手
  private projectiles!: Phaser.GameObjects.Group;
  private spellProjectiles!: Phaser.GameObjects.Group;  // 五行法术投射物
  private earthWalls!: Phaser.GameObjects.Group;        // 土墙
  private gems!: Phaser.GameObjects.Group;
  private shops!: Phaser.GameObjects.Group;       // 商店
  private fireVortices!: Phaser.GameObjects.Group; // 火焰漩涡
  private fxGfx!: Phaser.GameObjects.Graphics;

  // ===== 输入 =====
  private joystick!: VirtualJoystick;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;

  // ===== 状态 =====
  private stats!: PlayerStats;
  private takenUpgrades: Record<string, number> = {};
  private level = 1;
  private xp = 0;
  private xpToNext = 5;
  private elapsed = 0;          // 存活秒数
  private kills = 0;
  private gemsCollected = 0;
  private spawnTimer = 0;
  private bossTimer = 0;
  private bossSpawned = false;
  private currentBoss: Enemy | null = null;
  private paused = false;
  private gameOver = false;

  // ===== 天劫系统 =====
  /** 天劫倒计时（秒），到 0 触发神使降临 */
  private tribulationTimer = 60;
  /** 天劫间隔（秒） - 根据当前轮次进度变化 */
  private tribulationInterval = 60;

  /** 根据已击败神使数计算下次天劫倒计时
   * 0个→60秒(金), 1个→50秒(木), 2个→40秒(水), 3个→30秒(火), 4个→20秒(土), 5个→10秒(神之手)
   */
  private getTribulationInterval(): number {
    const kills = this.envoyRoundKills;
    if (kills >= 5) return 10;  // 神之手
    return 60 - kills * 10;  // 60,50,40,30,20
  }
  /** 天劫次数（递增难度） */
  private tribulationCount = 0;
  /** 当前神使 */
  private currentEnvoy: Envoy | null = null;
  /** 天劫进行中（屏幕封锁） */
  private tribulationActive = false;
  /** 屏幕封锁边界视觉 */
  private tribulationWalls: Phaser.GameObjects.Graphics[] = [];
  /** 弟子生成计时 */
  private discipleTimer = 8;
  /** 商店生成计时 */
  private shopTimer = 20;
  /** 商店当前购买所需击杀数（每次购买后+15） */
  private shopCost = 15;
  /** 商店提示冷却（防止频繁提示） */
  private shopTipCooldown = 0;
  /** 弟子击杀计数（每10个刷新老祖） */
  private discipleKills = 0;
  /** 当前天劫轮次的神使顺序（金木水火土） */
  private envoyQueue: Element[] = [];
  /** 当前轮次已击败的神使数 */
  private envoyRoundKills = 0;
  /** 法宝稀有特效计时器 */
  private treasureSpecialTimers: Record<string, number> = {};
  /** 法宝自动合成检查计时器 */
  private synthesisTimer = 3;
  /** 先天灵宝实体列表 */
  private spiritTreasureEntities: SpiritTreasureEntity[] = [];
  /** 末法魔化是否开启（第一个神之手被击杀后开启） */
  public magicDesolation = false;
  /** 神之手击杀计数 */
  private godHandKills = 0;
  /** 最终阶段状态 */
  private finalPhase: 'none' | 'shop' | 'countdown' | 'finalBattle' | 'victory' = 'none';
  /** 最终阶段倒计时 */
  private finalCountdown = 0;

  // ===== 升级 UI =====
  private upgradeOverlay?: Phaser.GameObjects.Container;
  private pendingLevelUps = 0;

  // ===== 暂停 =====
  private pauseOverlay?: Phaser.GameObjects.Container;

  constructor() {
    super('Game');
  }

  create(): void {
    const W = WORLD_W;
    const H = WORLD_H;

    // 重置状态
    this.stats = createInitialStats();
    this.takenUpgrades = {};
    this.level = 1;
    this.xp = 0;
    this.xpToNext = 5;
    this.elapsed = 0;
    this.kills = 0;
    this.gemsCollected = 0;
    this.spawnTimer = 0;
    this.bossTimer = 0;
    this.bossSpawned = false;
    this.currentBoss = null;
    this.paused = false;
    this.gameOver = false;
    this.pendingLevelUps = 0;
    // 天劫重置
    this.tribulationTimer = this.getTribulationInterval();
    this.tribulationCount = 0;
    this.currentEnvoy = null;
    this.tribulationActive = false;
    this.tribulationWalls = [];
    this.discipleTimer = 8;
    this.shopTimer = 20;
    this.shopCost = 8;
    this.discipleKills = 0;
    this.envoyQueue = [];
    this.envoyRoundKills = 0;
    this.treasureSpecialTimers = {};
    this.godHand = null;
    this.magicDesolation = false;
    this.godHandKills = 0;
    this.finalPhase = 'none';
    this.finalCountdown = 0;
    this.synthesisTimer = 3;
    this.shopTipCooldown = 0;
    // 清理残留游龙
    if ((this as any).woodDragons) {
      for (const d of (this as any).woodDragons) d.destroy();
      (this as any).woodDragons = [];
    }
    // 清理灵宝实体
    for (const e of this.spiritTreasureEntities) e.destroy();
    this.spiritTreasureEntities = [];

    // 世界边界（大地图）
    this.physics.world.setBounds(0, 0, W, H);

    // 相机跟随玩家，范围限制在世界内
    this.cameras.main.setBounds(0, 0, W, H);
    this.cameras.main.setRoundPixels(true);

    // 背景（大地图）
    this.drawArena(W, H);

    // 特效层
    this.fxGfx = this.add.graphics();
    this.fxGfx.setDepth(20);

    // 玩家（生成在地图中心）
    this.player = new Player(this, W / 2, H / 2, this.stats);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // 实体组
    this.enemies = this.add.group();
    this.disciples = this.add.group();
    this.envoys = this.add.group();
    this.ancestors = this.add.group();
    this.projectiles = this.add.group();
    this.spellProjectiles = this.add.group();
    this.earthWalls = this.add.group();
    this.gems = this.add.group();
    this.shops = this.add.group();
    this.fireVortices = this.add.group();

    // 输入
    this.joystick = new VirtualJoystick(this);
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = this.input.keyboard.addKeys('W,A,S,D') as any;
      // ESC 暂停
      this.input.keyboard.on('keydown-ESC', () => {
        // 有升级/商店/天劫奖励overlay时不响应ESC暂停
        if (this.upgradeOverlay) return;
        // UIScene 的法宝面板打开时不响应
        const ui = this.scene.get('UI') as any;
        if (ui.treasurePanelState) return;
        this.togglePause();
      });
    }

    // 碰撞
    this.setupCollisions();

    // 事件回调
    this.setupEvents();

    // 启动 UI 场景（HUD 覆盖层）
    this.scene.launch('UI');

    // 入场提示
    this.showIntro();
  }

  /** 绘制战场背景：群山擂台 */
  private drawArena(W: number, H: number): void {
    const g = this.add.graphics();
    // 渐变底（更明亮的深绿到深蓝）
    g.fillGradientStyle(0x1a3a2e, 0x1a3a2e, 0x0a1a2e, 0x0a1a2e, 1);
    g.fillRect(0, 0, W, H);

    // 随机地形区域（灵石矿脉、草地、水池、灵田）
    // 用确定性伪随机（基于坐标）
    const seed = (n: number) => {
      const v = Math.sin(n * 12.9898) * 43758.5453;
      return v - Math.floor(v);  // 0~1
    };
    // 草地区域（亮绿）
    for (let i = 0; i < 8; i++) {
      const cx = seed(i * 7) * W;
      const cy = seed(i * 13) * H;
      const r = 80 + seed(i * 17) * 120;
      g.fillStyle(0x2d5a3d, 0.6);
      g.fillCircle(cx, cy, r);
      g.fillStyle(0x4d7a5d, 0.4);
      g.fillCircle(cx, cy, r * 0.6);
    }
    // 灵石矿脉（亮青色斑点）
    for (let i = 0; i < 12; i++) {
      const cx = seed(i * 23) * W;
      const cy = seed(i * 31) * H;
      const r = 30 + seed(i * 37) * 50;
      g.fillStyle(0x1a4a4a, 0.7);
      g.fillCircle(cx, cy, r);
      g.fillStyle(0x4dd0e1, 0.3);
      g.fillCircle(cx, cy, r * 0.5);
    }
    // 水池（蓝色）
    for (let i = 0; i < 6; i++) {
      const cx = seed(i * 41 + 100) * W;
      const cy = seed(i * 43 + 100) * H;
      const r = 60 + seed(i * 47 + 100) * 80;
      g.fillStyle(0x1a3a5a, 0.7);
      g.fillCircle(cx, cy, r);
      g.fillStyle(0x4fc3f7, 0.3);
      g.fillCircle(cx, cy, r * 0.7);
    }
    // 灵田（黄色方块）
    for (let i = 0; i < 10; i++) {
      const cx = seed(i * 53 + 200) * W;
      const cy = seed(i * 59 + 200) * H;
      const s = 20 + seed(i * 61 + 200) * 30;
      g.fillStyle(0x5a4a1a, 0.6);
      g.fillRect(cx - s / 2, cy - s / 2, s, s);
      g.fillStyle(0xffd54f, 0.2);
      g.fillRect(cx - s / 2 + 4, cy - s / 2 + 4, s - 8, s - 8);
    }

    // 网格（更淡）
    g.lineStyle(1, 0x2a4a3e, 0.3);
    for (let x = 0; x <= W; x += 64) {
      g.lineBetween(x, 0, x, H);
    }
    for (let y = 0; y <= H; y += 64) {
      g.lineBetween(0, y, W, y);
    }

    // 远山（多层）
    g.fillStyle(0x1a2a3a, 0.5);
    g.beginPath();
    g.moveTo(0, H * 0.2);
    for (let x = 0; x <= W; x += 80) {
      g.lineTo(x, H * 0.2 + Math.sin(x * 0.006) * 60 + Math.sin(x * 0.015) * 30);
    }
    g.lineTo(W, 0);
    g.lineTo(0, 0);
    g.closePath();
    g.fillPath();

    g.fillStyle(0x2a3a4a, 0.3);
    g.beginPath();
    g.moveTo(0, H * 0.15);
    for (let x = 0; x <= W; x += 100) {
      g.lineTo(x, H * 0.15 + Math.sin(x * 0.004 + 1) * 80);
    }
    g.lineTo(W, 0);
    g.lineTo(0, 0);
    g.closePath();
    g.fillPath();

    // 星点装饰
    for (let i = 0; i < 80; i++) {
      const x = Math.abs(seed(i * 71 + 300)) * W;
      const y = Math.abs(seed(i * 73 + 300)) * H * 0.3;
      g.fillStyle(0xffffff, 0.3 + Math.abs(seed(i * 79 + 300)) * 0.4);
      g.fillCircle(x, y, 0.8 + Math.abs(seed(i * 83 + 300)) * 1.2);
    }

    // 边界发光
    g.lineStyle(3, COLORS.MAGNETIC_GLOW, 0.2);
    g.strokeRect(0, 0, W, H);
  }

  /** 设置碰撞 */
  private setupCollisions(): void {
    // 投射物 vs 敌人（玩家普通雷电攻击，无五行属性）
    this.physics.add.overlap(this.projectiles, this.enemies, (proj, enemy) => {
      const p = proj as Projectile;
      const e = enemy as Enemy;
      const allEnemies = this.enemies.getChildren() as Enemy[];
      const consumed = p.onHit(e, allEnemies);
      if (consumed) return;  // 已命中过，不再造成伤害
      // 造成伤害（普通攻击无五行，倍率1.0）
      const dead = e.takeDamage(p.damage);
      this.onEnemyHit(e, 0xffeb3b);
      if (dead) {
        this.onEnemyDeath(e);
      }
    });

    // 投射物 vs 弟子（精英怪）
    this.physics.add.overlap(this.projectiles, this.disciples, (proj, disc) => {
      const p = proj as Projectile;
      const d = disc as Disciple;
      const consumed = p.onHit(d as any, []);
      if (consumed) return;  // 已命中过，不再造成伤害
      const dead = d.takeDamage(p.damage);
      this.onEnemyHit(d as any, 0xffeb3b);
      if (dead) this.onDiscipleDeath(d);
    });

    // 投射物 vs 神使
    this.physics.add.overlap(this.projectiles, this.envoys, (proj, env) => {
      const p = proj as Projectile;
      const e = env as Envoy;
      const consumed = p.onHit(e as any, []);
      if (consumed) return;
      e.setAttackElement('none');
      const dead = e.takeDamage(p.damage);
      this.onEnemyHit(e as any, 0xffeb3b);
      if (dead) this.onEnvoyDeath();
    });

    // 五行法术投射物 vs 神使
    this.physics.add.overlap(this.spellProjectiles, this.envoys, (proj, env) => {
      const p = proj as SpellProjectile;
      if ((p as any).fromEnemy) return;
      const e = env as Envoy;
      const consumed = p.onHit(e as any);
      if (consumed) return;
      const mul = elementMultiplier(p.element, e.element);
      e.setAttackElement(p.element);
      const dead = e.takeDamage(p.damage * mul);
      if (p.poisonDps > 0) e.applyPoison(p.poisonDps, p.poisonDuration);
      this.onEnemyHit(e as any, ELEMENT_COLORS[p.element], mul);
      if (dead) this.onEnvoyDeath();
    });

    // 五行法术投射物 vs 敌人（跳过敌方投射物）
    this.physics.add.overlap(this.spellProjectiles, this.enemies, (proj, enemy) => {
      const p = proj as SpellProjectile;
      if ((p as any).fromEnemy) return;
      const e = enemy as Enemy;
      const consumed = p.onHit(e);
      if (consumed) return;
      const mul = elementMultiplier(p.element, e.element);
      const finalDmg = p.damage * mul;
      const dead = e.takeDamage(finalDmg);
      if (p.poisonDps > 0) e.applyPoison(p.poisonDps, p.poisonDuration);
      this.onEnemyHit(e, ELEMENT_COLORS[p.element], mul);
      if (dead) this.onEnemyDeath(e);
    });

    // 五行法术投射物 vs 弟子（跳过敌方投射物）
    this.physics.add.overlap(this.spellProjectiles, this.disciples, (proj, disc) => {
      const p = proj as SpellProjectile;
      if ((p as any).fromEnemy) return;
      const d = disc as Disciple;
      const consumed = p.onHit(d as any);
      if (consumed) return;
      const mul = elementMultiplier(p.element, d.element);
      const dead = d.takeDamage(p.damage * mul);
      if (p.poisonDps > 0) d.applyPoison(p.poisonDps, p.poisonDuration);
      this.onEnemyHit(d as any, ELEMENT_COLORS[p.element], mul);
      if (dead) this.onDiscipleDeath(d);
    });

    // 敌人 vs 玩家（接触伤害 - 修复版）
    this.physics.add.overlap(this.enemies, this.player, (enemy, player) => {
      const e = enemy as Enemy;
      const p = player as Player;
      p.takeDamage(e.damage);
    });

    // 弟子 vs 玩家（接触伤害）
    this.physics.add.overlap(this.disciples, this.player, (disc, player) => {
      const d = disc as Disciple;
      const p = player as Player;
      p.takeDamage(d.damage);
    });

    // 神使 vs 玩家（接触伤害，更高）
    this.physics.add.overlap(this.envoys, this.player, (env, player) => {
      const e = env as Envoy;
      const p = player as Player;
      p.takeDamage(e.damage);
    });

    // 老祖 vs 玩家（接触伤害）
    this.physics.add.overlap(this.ancestors, this.player, (anc, player) => {
      const a = anc as Ancestor;
      const p = player as Player;
      p.takeDamage(a.damage);
    });

    // 神之手 vs 玩家（接触伤害）
    // 注意：神之手不封锁移动，用碰撞而非 overlap

    // 投射物 vs 老祖
    this.physics.add.overlap(this.projectiles, this.ancestors, (proj, anc) => {
      const p = proj as Projectile;
      const a = anc as Ancestor;
      const consumed = p.onHit(a as any, []);
      if (consumed) return;
      const dead = a.takeDamage(p.damage);
      this.onEnemyHit(a as any, 0xffeb3b);
      if (dead) this.onAncestorDeath(a);
    });

    // 五行法术投射物 vs 老祖
    this.physics.add.overlap(this.spellProjectiles, this.ancestors, (proj, anc) => {
      const p = proj as SpellProjectile;
      if ((p as any).fromEnemy) return;
      const a = anc as Ancestor;
      const consumed = p.onHit(a as any);
      if (consumed) return;
      const mul = elementMultiplier(p.element, a.element);
      const dead = a.takeDamage(p.damage * mul);
      if (p.poisonDps > 0) a.applyPoison(p.poisonDps, p.poisonDuration);
      this.onEnemyHit(a as any, ELEMENT_COLORS[p.element], mul);
      if (dead) this.onAncestorDeath(a);
    });

    // 神之手 vs 玩家投射物（动态检测，神之手不是 group）
    // 在 update 里手动处理

    // 敌方五行投射物 vs 玩家（弟子/神使/神之手发射的）
    this.physics.add.overlap(this.spellProjectiles, this.player, (proj, player) => {
      const p = proj as SpellProjectile;
      if (!(p as any).fromEnemy) return;
      const pl = player as Player;
      pl.takeDamage(p.damage);
      // 火行投射物附加燃烧
      if ((p as any).burnDps) {
        pl.applyBurn?.((p as any).burnDps, (p as any).burnDuration);
      }
      // 金行神之手兵器附加禁疗
      if ((p as any).applyHealBlock) {
        pl.applyHealBlock((p as any).healBlockDuration ?? 10);
      }
      // 金行符箓附加中毒（每秒3%最大生命，持续20秒）
      if ((p as any).applyPoisonOnHit) {
        pl.applyPoison?.((p as any).poisonRatio ?? 0.03, (p as any).poisonDuration ?? 20);
      }
      // 水行神使散弹附加减速
      if ((p as any).applySlowOnHit) {
        const slowMul = (p as any).slowMul ?? 0.4;
        const slowDur = (p as any).slowDuration ?? 2;
        pl.applySlow?.(slowMul, slowDur);
      }
      // 木行神使投射物附加撕裂
      if ((p as any).applyTear) {
        DebuffSystem.applyDebuff(pl.debuffContainer, 'tear', (p as any).tearDuration ?? 3);
      }
      // 土行神使石柱附加眩晕
      if ((p as any).applyStun) {
        DebuffSystem.applyDebuff(pl.debuffContainer, 'stun', (p as any).stunDuration ?? 2);
      }
      // 金行神使飞剑附加衰弱
      if ((p as any).applyWeaken) {
        DebuffSystem.applyDebuff(pl.debuffContainer, 'weaken', (p as any).weakenDuration ?? 5);
      }
      p.destroy();
    });

    // 土墙 vs 敌人（阻挡）
    this.physics.add.collider(this.earthWalls, this.enemies);
    this.physics.add.collider(this.earthWalls, this.disciples);
    this.physics.add.collider(this.earthWalls, this.envoys);

    // 灵石 vs 玩家
    this.physics.add.overlap(this.gems, this.player, (gem, player) => {
      const g = gem as XPGem;
      this.collectGem(g);
    });

    // 商店 vs 玩家
    this.physics.add.overlap(this.shops, this.player, (shop, player) => {
      const s = shop as Shop;
      if (!s.used) this.openShop(s);
    });
  }

  /** 设置事件回调 */
  private setupEvents(): void {
    // 清除旧的自定义事件监听器（防止场景重启时叠加）
    // 注意：不能 removeAllListeners，会清除 Phaser 内部事件
    const customEvents = [
      'player-fire', 'player-attack-fx', 'chain-fx', 'chain-damage',
      'player-storm', 'disciple-fire', 'disciple-talisman',
      'envoy-fire', 'envoy-pillar', 'pillar-break',
      'spawn-fire-vortex', 'godhand-metal', 'godhand-wood', 'godhand-water',
      'godhand-fire', 'godhand-earth', 'godhand-rock-launch',
      'spell-metal', 'spell-wood', 'spell-water', 'spell-fire', 'spell-earth',
      'spell-shop-metal', 'spell-shop-wood', 'spell-shop-water', 'spell-shop-fire', 'spell-shop-earth', 'spell-shop-earth2',
      'earth-shield-reflect',
      'player-hit', 'player-dead',
      'envoy-spawn', 'envoy-update', 'envoy-dead',
      'boss-spawn', 'boss-dead',
      'ui-update',
    ];
    for (const evt of customEvents) {
      this.events.removeAllListeners(evt);
    }
    // 玩家发射
    this.events.on('player-fire', (x: number, y: number, vx: number, vy: number, dmg: number, pierce: number, chain: boolean) => {
      const proj = new Projectile(this, x, y, vx, vy, dmg, pierce, chain);
      this.projectiles.add(proj);
    });

    // 放电特效
    this.events.on('player-attack-fx', (x: number, y: number, tx: number, ty: number) => {
      this.drawLightningArc(x, y, tx, ty, 0xffeb3b, 0.6, 200);
    });

    // 雷链特效
    this.events.on('chain-fx', (x1: number, y1: number, x2: number, y2: number) => {
      this.drawLightningArc(x1, y1, x2, y2, 0xb388ff, 0.8, 150);
    });

    // 雷链伤害
    this.events.on('chain-damage', (target: Enemy, dmg: number) => {
      if (!target.active) return;
      const dead = target.takeDamage(dmg);
      this.onEnemyHit(target);
      if (dead) this.onEnemyDeath(target);
    });

    // 磁暴
    this.events.on('player-storm', (x: number, y: number, range: number, dmg: number) => {
      this.emitStorm(x, y, range, dmg);
    });

    // 弟子发射御剑/符箓
    this.events.on('disciple-fire', (x: number, y: number, tx: number, ty: number, element: Element, dmg: number) => {
      const angle = Phaser.Math.Angle.Between(x, y, tx, ty);
      const speed = 420;  // 原280 ×1.5（+50%）
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const proj = new SpellProjectile(this, x, y, vx, vy, dmg, element, 0, 0);
      (proj as any).fromEnemy = true;
      this.spellProjectiles.add(proj);
    });

    // ===== 弟子/老祖五行符箓 =====
    this.events.on('disciple-talisman', (x: number, y: number, tx: number, ty: number, element: Element, maxHp: number, caster: any) => {
      switch (element) {
        case 'metal': {
          // 金行符箓：高速紫色箭支（速度1000），击中中毒20秒（每秒3%最大生命）
          const angle = Phaser.Math.Angle.Between(x, y, tx, ty);
          const speed = 3000;  // 箭速3000
          const proj = new SpellProjectile(this, x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, 15, 'metal', 0, 0);
          (proj as any).fromEnemy = true;
          (proj as any).applyPoisonOnHit = true;
          (proj as any).poisonRatio = 0.03;
          (proj as any).poisonDuration = 12;  // 中毒持续12秒
          this.spellProjectiles.add(proj);
          break;
        }
        case 'wood': {
          // 木行符箓：自身最大生命+100，恢复30%最大生命
          if (caster && caster.hp !== undefined) {
            caster.maxHp = caster.maxHp + 100;
            caster.hp += caster.maxHp * 0.3;
            caster.hp = Math.min(caster.hp, caster.maxHp);
            const ring = this.add.circle(x, y, 20, 0x66bb6a, 0.4).setStrokeStyle(2, 0x66bb6a, 1);
            ring.setDepth(15);
            this.tweens.add({ targets: ring, scale: 2, alpha: 0, duration: 500, onComplete: () => ring.destroy() });
          }
          break;
        }
        case 'water': {
          // 水行符箓：周围300距离强烈减速80%，持续2秒
          const dist = Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y);
          if (dist < 300) {
            this.player.applySlow?.(0.2, 2);
          }
          const ring = this.add.circle(x, y, 10, 0x4fc3f7, 0.4).setStrokeStyle(3, 0x4fc3f7, 1);
          ring.setDepth(15);
          this.tweens.add({ targets: ring, scale: 30, alpha: 0, duration: 600, onComplete: () => ring.destroy() });
          break;
        }
        case 'fire': {
          // 火行符箓：红色长方形符箓+黄色花纹，朝主角飞行2秒后爆炸
          const fireGfx = this.add.graphics();
          fireGfx.setDepth(15);
          const startTime = this.time.now;
          const fireRange = 220;
          let fireX = x, fireY = y;
          const updateFire = () => {
            const elapsed = (this.time.now - startTime) / 1000;
            if (elapsed >= 2) {
              // 爆炸
              const ring = this.add.circle(fireX, fireY, 10, 0xff7043, 0.6).setStrokeStyle(5, 0xffeb3b, 1);
              ring.setDepth(15);
              this.tweens.add({ targets: ring, scale: fireRange / 10, alpha: 0, duration: 400, onComplete: () => ring.destroy() });
              const dmg = 45 + this.elapsed * 0.2;  // 火行符箓伤害45+时间*0.2
              const dPlayer = Phaser.Math.Distance.Between(fireX, fireY, this.player.x, this.player.y);
              if (dPlayer < fireRange) this.player.takeDamage(dmg);
              const allEnemies = [
                ...this.enemies.getChildren() as Enemy[],
                ...this.disciples.getChildren() as Disciple[],
                ...this.ancestors.getChildren() as Ancestor[],
              ];
              for (const e of allEnemies) {
                const d = Phaser.Math.Distance.Between(fireX, fireY, e.x, e.y);
                if (d < fireRange) {
                  const dead = e.takeDamage(dmg);
                  if (dead) {
                    if (e instanceof Enemy) this.onEnemyDeath(e);
                    else if (e instanceof Disciple) this.onDiscipleDeath(e);
                    else if (e instanceof Ancestor) this.onAncestorDeath(e);
                  }
                }
              }
              fireGfx.destroy();
              return;
            }
            // 朝玩家飞行
            const angle = Phaser.Math.Angle.Between(fireX, fireY, this.player.x, this.player.y);
            fireX += Math.cos(angle) * 150 * (1/60);
            fireY += Math.sin(angle) * 150 * (1/60);
            // 施法者躲避
            if (caster && !caster.isDead) {
              const dCaster = Phaser.Math.Distance.Between(caster.x, caster.y, fireX, fireY);
              if (dCaster < fireRange + 50) {
                const escapeAngle = Phaser.Math.Angle.Between(fireX, fireY, caster.x, caster.y);
                caster.x += Math.cos(escapeAngle) * 3;
                caster.y += Math.sin(escapeAngle) * 3;
              }
            }
            // 绘制红色长方形符箓+黄色花纹
            fireGfx.clear();
            const w = 16, h = 22;
            // 符箓主体（红色长方形）
            fireGfx.fillStyle(0xff5252, 1);
            fireGfx.fillRect(fireX - w/2, fireY - h/2, w, h);
            // 边框
            fireGfx.lineStyle(1, 0xffeb3b, 0.8);
            fireGfx.strokeRect(fireX - w/2, fireY - h/2, w, h);
            // 黄色花纹（中间符文）
            fireGfx.fillStyle(0xffeb3b, 1);
            fireGfx.fillRect(fireX - 2, fireY - 6, 4, 2);  // 上横
            fireGfx.fillRect(fireX - 2, fireY + 4, 4, 2);  // 下横
            fireGfx.fillRect(fireX - 1, fireY - 4, 2, 8);  // 中竖
            // 光晕
            fireGfx.fillStyle(0xff7043, 0.3);
            fireGfx.fillCircle(fireX, fireY, 14);
            this.time.delayedCall(16, updateFire);
          };
          updateFire();
          break;
        }
        case 'earth': {
          // 土行符箓：增加自身10防御，持续10秒
          if (caster && caster.defense) {
            caster.defense.tempDefense = Math.max(caster.defense.tempDefense, 10);
            caster.defense.tempDefenseTimer = Math.max(caster.defense.tempDefenseTimer, 10);
            const ring = this.add.circle(x, y, 25, 0xa1887f, 0.3).setStrokeStyle(3, 0xa1887f, 0.8);
            ring.setDepth(14);
            this.tweens.add({ targets: ring, alpha: 0, duration: 10000, onComplete: () => ring.destroy() });
          }
          break;
        }
      }
    });

    // ===== 神使五行攻击（统一事件，按 type 分发） =====
    this.events.on('envoy-fire', (x: number, y: number, tx: number, ty: number, element: Element, dmg: number, type: string) => {
      const angle = Phaser.Math.Angle.Between(x, y, tx, ty);
      switch (type) {
        case 'sword': {
          // 金：单把高伤飞剑（体积+200%，速度+100%），击中施加衰弱5秒
          const speed = 840;
          const proj = new SpellProjectile(this, x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, dmg, 'metal', 0, 0);
          (proj as any).fromEnemy = true;
          (proj as any).isBigSword = true;
          (proj as any).applyWeaken = true;
          (proj as any).weakenDuration = 5;
          proj.setCircle(24, 0, 0);
          this.spellProjectiles.add(proj);
          this.drawHitFx(x, y, ELEMENT_COLORS.metal);
          break;
        }
        case 'talisman': {
          // 木：连续低伤高速符箓，击中玩家施加撕裂3秒
          const speed = 500;
          const proj = new SpellProjectile(this, x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, dmg, 'wood', 0, 0);
          (proj as any).fromEnemy = true;
          (proj as any).applyTear = true;
          (proj as any).tearDuration = 3;
          this.spellProjectiles.add(proj);
          break;
        }
        case 'shotgun': {
          // 水：散弹低伤减速圆珠（5发扇形，减速+30%）
          const speed = 300;
          for (let i = -2; i <= 2; i++) {
            const a = angle + i * 0.18;
            const proj = new SpellProjectile(this, x, y, Math.cos(a) * speed, Math.sin(a) * speed, dmg, 'water', 0, 0);
            (proj as any).fromEnemy = true;
            (proj as any).applySlowOnHit = true;
            (proj as any).slowMul = 0.28;  // 原0.4，减速+30%
            (proj as any).slowDuration = 1;  // 减速持续1秒
            this.spellProjectiles.add(proj);
          }
          break;
        }
        case 'flame': {
          // 火：中距离锥形火焰（多发扇形）+燃烧
          const speed = 250;
          for (let i = -3; i <= 3; i++) {
            const a = angle + i * 0.08;  // 锥形7发
            const proj = new SpellProjectile(this, x, y, Math.cos(a) * speed, Math.sin(a) * speed, dmg * 0.5, 'fire', 0, 0);
            (proj as any).fromEnemy = true;
            (proj as any).burnDps = dmg * 0.3;
            (proj as any).burnDuration = 3;
            (proj as any).isFlame = true;
            this.spellProjectiles.add(proj);
          }
          break;
        }
      }
    });

    // 土：发射石柱（撞击高额伤害不重复，飞1秒后爆裂碎片）
    this.events.on('envoy-pillar', (x: number, y: number, element: Element, dmg: number, tx: number, ty: number) => {
      const angle = Phaser.Math.Angle.Between(x, y, tx, ty);
      const speed = 300;
      const proj = new SpellProjectile(this, x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, dmg, 'earth', 0, 0);
      (proj as any).fromEnemy = true;
      (proj as any).isPillar = true;
      (proj as any).pillarImpactDmg = dmg;
      (proj as any).pillarBreakTime = 1.0;
      (proj as any).pillarBreakDmg = dmg * 0.3;
      (proj as any).applyStun = true;
      (proj as any).stunDuration = 1.5;  // 撞击眩晕1.5秒
      proj.setCircle(48, 0, 0);  // 体积+200%（原16→48）
      this.spellProjectiles.add(proj);
    });

    // 石柱破碎：范围伤害 + 飞溅动画
    this.events.on('pillar-break', (x: number, y: number, dmg: number, element: Element) => {
      // 飞溅碎片动画（更多碎片，更大范围）
      for (let i = 0; i < 20; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * 100 + 20;
        const fx = this.add.circle(x, y, Math.random() * 5 + 2, ELEMENT_COLORS.earth, 1);
        fx.setDepth(15);
        this.tweens.add({
          targets: fx,
          x: x + Math.cos(a) * d,
          y: y + Math.sin(a) * d,
          alpha: 0,
          scale: 0.3,
          duration: 600,
          ease: 'Cubic.out',
          onComplete: () => fx.destroy(),
        });
      }
      // 碎裂冲击波
      const shockwave = this.add.circle(x, y, 10, ELEMENT_COLORS.earth, 0.3)
        .setStrokeStyle(3, 0xa1887f, 0.8);
      shockwave.setDepth(14);
      this.tweens.add({
        targets: shockwave,
        scale: 20,
        alpha: 0,
        duration: 500,
        onComplete: () => shockwave.destroy(),
      });
      const dist = Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y);
      if (dist < 200) {  // 碎裂范围200
        this.player.takeDamage(dmg);
        // 碎裂飞溅眩晕1秒
        DebuffSystem.applyDebuff(this.player.debuffContainer, 'stun', 0.7);  // 碎裂眩晕0.7秒
      }
      this.cameras.main.shake(100, 0.008);
    });

    // ===== 商店五行法术事件 =====
    // 金：杀伐之斧 - 近战范围挥砍
    // 金：杀伐之斧 - 40度扇形朝最近敌人方向
    this.events.on('spell-shop-metal', (x: number, y: number, range: number, dmg: number) => {
      // 找最近敌人方向
      const allEnemiesForAxe = [
        ...this.enemies.getChildren() as Enemy[],
        ...this.disciples.getChildren() as Disciple[],
        ...this.envoys.getChildren() as Envoy[],
        ...this.ancestors.getChildren() as Ancestor[],
      ];
      let nearestAng = 0;
      let nearestDist = Infinity;
      for (const e of allEnemiesForAxe) {
        const d = Phaser.Math.Distance.Between(x, y, e.x, e.y);
        if (d < nearestDist) {
          nearestDist = d;
          nearestAng = Phaser.Math.Angle.Between(x, y, e.x, e.y);
        }
      }
      if (this.godHand) {
        const d = Phaser.Math.Distance.Between(x, y, this.godHand.x, this.godHand.y);
        if (d < nearestDist) {
          nearestDist = d;
          nearestAng = Phaser.Math.Angle.Between(x, y, this.godHand.x, this.godHand.y);
        }
      }

      // 40度扇形 = ±0.35弧度
      const halfAngle = 0.35;
      // 挥砍特效
      const fx = this.add.graphics();
      fx.setDepth(15);
      fx.fillStyle(ELEMENT_COLORS.metal, 0.5);
      fx.beginPath();
      fx.moveTo(x, y);
      fx.arc(x, y, range, nearestAng - halfAngle, nearestAng + halfAngle);
      fx.closePath();
      fx.fillPath();
      this.tweens.add({ targets: fx, alpha: 0, duration: 300, onComplete: () => fx.destroy() });

      // 对扇形范围内敌人造成一次伤害（不重复）
      const allEnemies = [
        ...allEnemiesForAxe,
      ];
      for (const e of allEnemies) {
        const dist = Phaser.Math.Distance.Between(x, y, e.x, e.y);
        if (dist < range) {
          const ang = Phaser.Math.Angle.Between(x, y, e.x, e.y);
          const angDiff = Math.abs(Phaser.Math.Angle.Wrap(ang - nearestAng));
          if (angDiff <= halfAngle) {
            const mul = elementMultiplier('metal', e.element);
            const dead = e.takeDamage(dmg * mul);
            this.onEnemyHit(e as any, ELEMENT_COLORS.metal, mul);
            if (dead) {
              if (e instanceof Enemy) this.onEnemyDeath(e);
              else if (e instanceof Disciple) this.onDiscipleDeath(e);
              else if (e instanceof Envoy) this.onEnvoyDeath();
              else if (e instanceof Ancestor) this.onAncestorDeath(e);
            }
          }
        }
      }
      // 神之手
      if (this.godHand) {
        const dist = Phaser.Math.Distance.Between(x, y, this.godHand.x, this.godHand.y);
        if (dist < range) {
          const ang = Phaser.Math.Angle.Between(x, y, this.godHand.x, this.godHand.y);
          const angDiff = Math.abs(Phaser.Math.Angle.Wrap(ang - nearestAng));
          if (angDiff <= halfAngle) {
            this.godHand.takeDamage(dmg);
          }
        }
      }
      this.cameras.main.shake(100, 0.008);
    });

    // 木：草根汲取 - 周围持续伤害+吸血（生成持续效果）
    this.events.on('spell-shop-wood', (x: number, y: number, range: number, dmg: number, drainRatio: number, duration: number) => {
      // 草藤视觉
      const fx = this.add.graphics();
      fx.setDepth(14);
      const startTime = this.time.now;
      const drawDrain = () => {
        if (this.time.now - startTime > duration * 1000) { fx.destroy(); return; }
        fx.clear();
        fx.fillStyle(ELEMENT_COLORS.wood, 0.2);
        fx.fillCircle(x, y, range);
        // 草藤触手
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + this.time.now / 300;
          const len = range * (0.7 + Math.sin(this.time.now / 200 + i) * 0.2);
          fx.lineStyle(3, ELEMENT_COLORS.wood, 0.7);
          fx.beginPath();
          fx.moveTo(x, y);
          for (let t = 0; t < 1; t += 0.2) {
            const wobble = Math.sin(this.time.now / 100 + t * 10 + i) * 8;
            const px = x + Math.cos(a) * len * t + Math.cos(a + Math.PI / 2) * wobble;
            const py = y + Math.sin(a) * len * t + Math.sin(a + Math.PI / 2) * wobble;
            fx.lineTo(px, py);
          }
          fx.strokePath();
        }
        this.time.delayedCall(50, drawDrain);
      };
      drawDrain();

      // 持续伤害+吸血（每秒）
      const tickCount = Math.floor(duration);
      for (let i = 0; i < tickCount; i++) {
        this.time.delayedCall(i * 1000, () => {
          const allEnemies = [
            ...this.enemies.getChildren() as Enemy[],
            ...this.disciples.getChildren() as Disciple[],
            ...this.envoys.getChildren() as Envoy[],
          ];
          let totalDmg = 0;
          for (const e of allEnemies) {
            const dist = Phaser.Math.Distance.Between(x, y, e.x, e.y);
            if (dist < range) {
              const mul = elementMultiplier('wood', e.element);
              const dmgPerTick = dmg * mul;  // dmg 是每秒伤害
              const dead = e.takeDamage(dmgPerTick);
              totalDmg += dmgPerTick;
              if (dead) {
                if (e instanceof Enemy) this.onEnemyDeath(e);
                else if (e instanceof Disciple) this.onDiscipleDeath(e);
                else if (e instanceof Envoy) this.onEnvoyDeath();
              }
            }
          }
          // 吸血
          if (totalDmg > 0) {
            this.player.heal(totalDmg * drainRatio);
          }
        });
      }
    });

    // 水：定身寒针 - 发射冰针
    // 水：定身寒针 - 穿透所有敌人，定身+伤害+50%
    this.events.on('spell-shop-water', (x: number, y: number, vx: number, vy: number, dmg: number, freezeDuration: number) => {
      const proj = new SpellProjectile(this, x, y, vx, vy, dmg, 'water', 0, 0);
      (proj as any).fromEnemy = false;
      (proj as any).freezeOnHit = true;
      (proj as any).freezeDuration = freezeDuration;
      (proj as any).maxPierceOverride = 999;  // 穿透所有
      this.spellProjectiles.add(proj);
    });

    // 火：火焰漩涡 - 发射火球，命中生成漩涡
    this.events.on('spell-shop-fire', (x: number, y: number, vx: number, vy: number, dmg: number, range: number, duration: number) => {
      const proj = new SpellProjectile(this, x, y, vx, vy, dmg, 'fire', 0, 0);
      (proj as any).fromEnemy = false;
      (proj as any).isFireball = true;  // 标记为火球（命中生成漩涡）
      (proj as any).vortexRange = range;
      (proj as any).vortexDuration = duration;
      (proj as any).vortexDps = dmg * 0.5;  // 漩涡每秒伤害
      this.spellProjectiles.add(proj);
    });

    // 土：坚震甲胄 - 生成护盾
    this.events.on('spell-shop-earth', (x: number, y: number, ratio: number, _duration: number) => {
      this.player.setEarthShield(ratio);
      const ring = this.add.circle(x, y, 30, ELEMENT_COLORS.earth, 0.3)
        .setStrokeStyle(3, ELEMENT_COLORS.earth, 1);
      ring.setDepth(15);
      this.tweens.add({
        targets: ring,
        scale: 2,
        alpha: 0,
        duration: 600,
        onComplete: () => ring.destroy(),
      });
    });

    // 土：巨门化暗 - 标记位置画黑色门扉，1秒后炸成黑气造成范围伤害
    this.events.on('spell-shop-earth2', (tx: number, ty: number, dmg: number, range: number) => {
      // 绘制黑色门扉
      const doorGfx = this.add.graphics();
      doorGfx.setDepth(15);
      const drawDoor = () => {
        doorGfx.clear();
        // 门框
        doorGfx.fillStyle(0x000000, 0.8);
        doorGfx.fillRect(tx - 20, ty - 40, 40, 80);
        // 门框边线
        doorGfx.lineStyle(3, 0x4dd0e1, 0.6);
        doorGfx.strokeRect(tx - 20, ty - 40, 40, 80);
        // 门上符文
        doorGfx.fillStyle(0x4dd0e1, 0.4);
        doorGfx.fillCircle(tx, ty - 15, 4);
        doorGfx.fillCircle(tx, ty + 15, 4);
        doorGfx.fillRect(tx - 2, ty - 10, 4, 20);
      };
      drawDoor();

      // 1秒后爆炸
      this.time.delayedCall(1000, () => {
        // 门扉炸成黑气
        doorGfx.destroy();
        // 黑气爆炸特效
        for (let i = 0; i < 20; i++) {
          const a = Math.random() * Math.PI * 2;
          const d = Math.random() * range * 0.8;
          const fx = this.add.circle(tx, ty, Math.random() * 6 + 3, 0x000000, 0.8);
          fx.setDepth(16);
          this.tweens.add({
            targets: fx,
            x: tx + Math.cos(a) * d,
            y: ty + Math.sin(a) * d,
            alpha: 0,
            scale: 0.2,
            duration: 600,
            onComplete: () => fx.destroy(),
          });
        }
        // 范围光环
        const ring = this.add.circle(tx, ty, 10, 0x000000, 0.5)
          .setStrokeStyle(5, 0x4dd0e1, 0.8);
        ring.setDepth(15);
        this.tweens.add({
          targets: ring,
          scale: range / 10,
          alpha: 0,
          duration: 400,
          onComplete: () => ring.destroy(),
        });

        // 对范围内所有敌人造成土行伤害
        const allTargets = [
          ...this.enemies.getChildren() as Enemy[],
          ...this.disciples.getChildren() as Disciple[],
          ...this.ancestors.getChildren() as Ancestor[],
          ...this.envoys.getChildren() as Envoy[],
        ];
        for (const e of allTargets) {
          const dist = Phaser.Math.Distance.Between(tx, ty, e.x, e.y);
          if (dist < range) {
            const mul = elementMultiplier('earth', e.element);
            if (e instanceof Envoy) e.setAttackElement('earth');
            const dead = e.takeDamage(dmg * mul);
            this.onEnemyHit(e as any, ELEMENT_COLORS.earth, mul);
            if (dead) {
              if (e instanceof Enemy) this.onEnemyDeath(e);
              else if (e instanceof Disciple) this.onDiscipleDeath(e);
              else if (e instanceof Ancestor) this.onAncestorDeath(e);
              else if (e instanceof Envoy) this.onEnvoyDeath();
            }
          }
        }
        // 神之手
        if (this.godHand) {
          const dist = Phaser.Math.Distance.Between(tx, ty, this.godHand.x, this.godHand.y);
          if (dist < range) {
            this.godHand.setAttackElement('earth');
            this.godHand.takeDamage(dmg);
          }
        }
        // 木行游龙
        if ((this as any).woodDragons) {
          for (const d of (this as any).woodDragons as WoodDragon[]) {
            const dist = Phaser.Math.Distance.Between(tx, ty, d.x, d.y);
            if (dist < range) {
              d.takeDamage(dmg, 'earth');
            }
          }
        }
        this.cameras.main.shake(100, 0.008);
      });
    });

    // 土行护盾反弹伤害
    this.events.on('earth-shield-reflect', (x: number, y: number, dmg: number) => {
      // 对周围敌人造成反弹伤害
      const allEnemies = [
        ...this.enemies.getChildren() as Enemy[],
        ...this.disciples.getChildren() as Disciple[],
        ...this.envoys.getChildren() as Envoy[],
      ];
      for (const e of allEnemies) {
        const dist = Phaser.Math.Distance.Between(x, y, e.x, e.y);
        if (dist < 80) {
          const dead = e.takeDamage(dmg);
          this.onEnemyHit(e as any, ELEMENT_COLORS.earth);
          if (dead) {
            if (e instanceof Enemy) this.onEnemyDeath(e);
            else if (e instanceof Disciple) this.onDiscipleDeath(e);
            else if (e instanceof Envoy) this.onEnvoyDeath();
          }
        }
      }
      // 反弹特效
      const ring = this.add.circle(x, y, 80, ELEMENT_COLORS.earth, 0.3)
        .setStrokeStyle(3, 0xffeb3b, 0.8);
      ring.setDepth(15);
      this.tweens.add({
        targets: ring,
        scale: 1.5,
        alpha: 0,
        duration: 400,
        onComplete: () => ring.destroy(),
      });
    });

    // 生成火焰漩涡
    this.events.on('spawn-fire-vortex', (x: number, y: number, range: number, duration: number, dps: number) => {
      const vortex = new FireVortex(this, x, y, duration, dps);
      (vortex as any).effectRange = range;
      this.fireVortices.add(vortex);
      // 爆炸特效
      const ring = this.add.circle(x, y, 10, ELEMENT_COLORS.fire, 0.6)
        .setStrokeStyle(5, 0xffeb3b, 1);
      ring.setDepth(15);
      this.tweens.add({
        targets: ring,
        scale: range / 10,
        alpha: 0,
        duration: 400,
        onComplete: () => ring.destroy(),
      });
    });

    // ===== 神之手五行攻击 =====
    // 金：并排5把刀剑枪锤镰（空隙增大，击中禁疗10秒）
    this.events.on('godhand-metal', (x: number, y: number, tx: number, ty: number, dmg: number) => {
      const baseAngle = Phaser.Math.Angle.Between(x, y, tx, ty);
      const speed = 840;
      for (let i = -1; i <= 2; i++) {  // 4个投射物（原5个）
        const a = baseAngle + i * 0.25;
        const proj = new SpellProjectile(this, x, y, Math.cos(a) * speed, Math.sin(a) * speed, dmg, 'metal', 0, 0);
        (proj as any).fromEnemy = true;
        (proj as any).isBigSword = true;
        (proj as any).applyHealBlock = true;
        (proj as any).healBlockDuration = 8;  // 禁疗8秒（原10-2）
        proj.setCircle(20, 0, 0);
        this.spellProjectiles.add(proj);
      }
    });
    // 木：召唤5个绿色精怪追击主角
    // 木：召唤4条木行游龙
    this.events.on('godhand-wood', (x: number, y: number, _tx: number, _ty: number, _dmg: number) => {
      const dragonHp = 300 + this.elapsed * 2.5;  // 生命300+时间*2.5（成长减半）
      const dragonDmg = 15 + this.elapsed * 0.2;  // 冲撞伤害15+时间*0.2（原20-5）
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const sx = x + Math.cos(a) * 80;
        const sy = y + Math.sin(a) * 80;
        const dragon = new WoodDragon(this, sx, sy, dragonHp, dragonDmg, x, y);
        dragon.magicDesolation = this.magicDesolation;
        (this as any).woodDragons = (this as any).woodDragons || [];
        (this as any).woodDragons.push(dragon);
      }
      // 召唤特效
      const ring = this.add.circle(x, y, 10, ELEMENT_COLORS.wood, 0.5).setStrokeStyle(3, 0xffffff, 1);
      ring.setDepth(15);
      this.tweens.add({ targets: ring, scale: 8, alpha: 0, duration: 500, onComplete: () => ring.destroy() });
    });
    // 水：密集冰锥（严重减速）
    this.events.on('godhand-water', (x: number, y: number, tx: number, ty: number, dmg: number) => {
      const baseAngle = Phaser.Math.Angle.Between(x, y, tx, ty);
      const speed = 400;
      for (let i = -4; i <= 4; i++) {
        const a = baseAngle + i * 0.06;
        const proj = new SpellProjectile(this, x, y, Math.cos(a) * speed, Math.sin(a) * speed, dmg, 'water', 0, 0);
        (proj as any).fromEnemy = true;
        (proj as any).applySlowOnHit = true;
        (proj as any).slowMul = 0.2;
        (proj as any).slowDuration = 3;
        this.spellProjectiles.add(proj);
      }
    });
    // 火：一圈火焰扩散到半屏后缩回（高额+燃烧5秒）
    this.events.on('godhand-fire', (x: number, y: number, dmg: number) => {
      // 扩散环（固定450距离）
      const ring = this.add.circle(x, y, 10, ELEMENT_COLORS.fire, 0.5)
        .setStrokeStyle(8, 0xffeb3b, 1);
      ring.setDepth(15);
      const fireRange = 380;  // 火行扩散距离380
      this.tweens.add({
        targets: ring,
        scale: fireRange / 10,
        duration: 800,
        yoyo: true,
        onComplete: () => ring.destroy(),
      });
      // 范围伤害+燃烧
      const dist = Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y);
      if (dist < fireRange) {
        this.player.takeDamage(dmg);
        this.player.applyBurn?.(dmg * 0.3, 5);
      }
      this.cameras.main.shake(300, 0.015);
    });
    // 土：6块巨石围绕旋转10秒
    this.events.on('godhand-earth', (x: number, y: number, dmg: number) => {
      if (this.godHand) {
        this.godHand.summonRocks(6, dmg);
      }
    });

    // 巨石结束后变成投射物
    this.events.on('godhand-rock-launch', (x: number, y: number, vx: number, vy: number, dmg: number) => {
      const proj = new SpellProjectile(this, x, y, vx, vy, dmg, 'earth', 0, 0);
      (proj as any).fromEnemy = true;
      (proj as any).isPillar = true;
      this.spellProjectiles.add(proj);
    });

    // 玩家受击
    this.events.on('player-hit', (x: number, y: number) => {
      this.cameras.main.shake(80, 0.005);
      this.drawHitFx(x, y, 0xff5252);
    });

    // 玩家死亡
    this.events.on('player-dead', () => {
      this.onPlayerDeath();
    });

    // ===== 五行法术事件 =====
    // 金行：发射金剑
    this.events.on('spell-metal', (x: number, y: number, vx: number, vy: number, dmg: number, poisonDps: number, poisonDur: number) => {
      const proj = new SpellProjectile(this, x, y, vx, vy, dmg, 'metal', poisonDps, poisonDur);
      this.spellProjectiles.add(proj);
      // 发射特效
      this.drawHitFx(x, y, ELEMENT_COLORS.metal);
    });

    // 木行：回血光环
    this.events.on('spell-wood', (x: number, y: number) => {
      const ring = this.add.circle(x, y, 30, ELEMENT_COLORS.wood, 0.4)
        .setStrokeStyle(3, ELEMENT_COLORS.wood, 1);
      ring.setDepth(15);
      this.tweens.add({
        targets: ring,
        scale: 2.5,
        alpha: 0,
        duration: 800,
        onComplete: () => ring.destroy(),
      });
      // 治疗数字
      const txt = this.add.text(x, y - 30, '+生命', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '16px',
        color: '#66bb6a',
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 3,
      }).setOrigin(0.5).setDepth(20);
      this.tweens.add({
        targets: txt,
        y: y - 50,
        alpha: 0,
        duration: 800,
        onComplete: () => txt.destroy(),
      });
    });

    // 水行：冰冻范围
    this.events.on('spell-water', (x: number, y: number, range: number, slowMul: number, duration: number, dmg: number) => {
      // 冰冻光环
      const ring = this.add.circle(x, y, range, ELEMENT_COLORS.water, 0.25)
        .setStrokeStyle(4, ELEMENT_COLORS.water, 0.9);
      ring.setDepth(15);
      this.tweens.add({
        targets: ring,
        scale: 1.2,
        alpha: 0,
        duration: 600,
        onComplete: () => ring.destroy(),
      });
      // 对范围内所有敌人施加减速 + 水行伤害
      const allTargets = [
        ...this.enemies.getChildren() as Enemy[],
        ...this.disciples.getChildren() as Disciple[],
        ...this.ancestors.getChildren() as Ancestor[],
        ...this.envoys.getChildren() as Envoy[],
      ];
      for (const e of allTargets) {
        const dist = Phaser.Math.Distance.Between(x, y, e.x, e.y);
        if (dist < range) {
          e.applySlow(slowMul, duration);
          const mul = elementMultiplier('water', e.element);
          if (e instanceof Envoy) e.setAttackElement('water');
          const dead = e.takeDamage(dmg * mul);
          this.onEnemyHit(e as any, ELEMENT_COLORS.water, mul);
          if (dead) {
            if (e instanceof Enemy) this.onEnemyDeath(e);
            else if (e instanceof Disciple) this.onDiscipleDeath(e);
            else if (e instanceof Ancestor) this.onAncestorDeath(e);
            else if (e instanceof Envoy) this.onEnvoyDeath();
          }
        }
      }
      // 冰晶粒子
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const fx = this.add.circle(x + Math.cos(a) * range, y + Math.sin(a) * range, 4, ELEMENT_COLORS.water, 1);
        fx.setDepth(16);
        this.tweens.add({
          targets: fx,
          x: x + Math.cos(a) * 10,
          y: y + Math.sin(a) * 10,
          alpha: 0,
          duration: 500,
          onComplete: () => fx.destroy(),
        });
      }
    });

    // 火行：范围爆炸 + 击退
    this.events.on('spell-fire', (x: number, y: number, range: number, dmg: number, knockbackForce: number) => {
      // 爆炸光环
      const ring = this.add.circle(x, y, 10, ELEMENT_COLORS.fire, 0.6)
        .setStrokeStyle(5, 0xffeb3b, 1);
      ring.setDepth(15);
      this.tweens.add({
        targets: ring,
        scale: range / 10,
        alpha: 0,
        duration: 400,
        onComplete: () => ring.destroy(),
      });
      // 火焰粒子
      for (let i = 0; i < 20; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * range;
        const fx = this.add.circle(x + Math.cos(a) * d, y + Math.sin(a) * d, Math.random() * 4 + 2, ELEMENT_COLORS.fire, 1);
        fx.setDepth(16);
        this.tweens.add({
          targets: fx,
          x: x + Math.cos(a) * (d + 30),
          y: y + Math.sin(a) * (d + 30),
          alpha: 0,
          duration: 500,
          onComplete: () => fx.destroy(),
        });
      }
      // 范围伤害 + 击退（对所有敌人）
      const allTargets = [
        ...this.enemies.getChildren() as Enemy[],
        ...this.disciples.getChildren() as Disciple[],
        ...this.ancestors.getChildren() as Ancestor[],
        ...this.envoys.getChildren() as Envoy[],
      ];
      for (const e of allTargets) {
        const dist = Phaser.Math.Distance.Between(x, y, e.x, e.y);
        if (dist < range) {
          const mul = elementMultiplier('fire', e.element);
          if (e instanceof Envoy) e.setAttackElement('fire');
          const dead = e.takeDamage(dmg * mul);
          // 击退
          const angle = Phaser.Math.Angle.Between(x, y, e.x, e.y);
          e.applyKnockback(Math.cos(angle) * knockbackForce, Math.sin(angle) * knockbackForce);
          this.onEnemyHit(e as any, ELEMENT_COLORS.fire, mul);
          if (dead) {
            if (e instanceof Enemy) this.onEnemyDeath(e);
            else if (e instanceof Disciple) this.onDiscipleDeath(e);
            else if (e instanceof Ancestor) this.onAncestorDeath(e);
            else if (e instanceof Envoy) this.onEnvoyDeath();
          }
        }
      }
      this.cameras.main.shake(150, 0.01);
    });

    // 土行：生成土墙
    this.events.on('spell-earth', (x: number, y: number, range: number, duration: number, dmg: number, blockCharges?: number) => {
      const charges = blockCharges ?? 1;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const wx = x + Math.cos(a) * range;
        const wy = y + Math.sin(a) * range;
        const wall = new EarthWall(this, wx, wy, duration, charges);
        this.earthWalls.add(wall);
        // 生成时对附近敌人造成土行伤害
        const enemies = this.enemies.getChildren() as Enemy[];
        for (const e of enemies) {
          const dist = Phaser.Math.Distance.Between(wx, wy, e.x, e.y);
          if (dist < 40) {
            const mul = elementMultiplier('earth', e.element);
            const dead = e.takeDamage(dmg * mul);
            this.onEnemyHit(e, ELEMENT_COLORS.earth, mul);
            if (dead) this.onEnemyDeath(e);
          }
        }
      }
      // 落地特效
      const ring = this.add.circle(x, y, range, ELEMENT_COLORS.earth, 0.2)
        .setStrokeStyle(2, ELEMENT_COLORS.earth, 0.6);
      ring.setDepth(14);
      this.tweens.add({
        targets: ring,
        alpha: 0,
        duration: 500,
        onComplete: () => ring.destroy(),
      });
    });
  }

  /** 绘制雷电弧光（短暂特效） */
  private drawLightningArc(x1: number, y1: number, x2: number, y2: number, color: number, alpha: number, duration: number): void {
    const fx = this.add.graphics();
    fx.setDepth(15);
    fx.lineStyle(2, color, alpha);
    fx.beginPath();
    fx.moveTo(x1, y1);
    const segs = 8;
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      const px = x1 + (x2 - x1) * t + (Math.random() - 0.5) * 12;
      const py = y1 + (y2 - y1) * t + (Math.random() - 0.5) * 12;
      fx.lineTo(px, py);
    }
    fx.lineTo(x2, y2);
    fx.strokePath();

    this.tweens.add({
      targets: fx,
      alpha: 0,
      duration: duration,
      onComplete: () => fx.destroy(),
    });
  }

  /** 受击粒子 */
  private drawHitFx(x: number, y: number, color: number): void {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * 20 + 5;
      const fx = this.add.circle(x, y, 3, color, 1);
      fx.setDepth(15);
      this.tweens.add({
        targets: fx,
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d,
        alpha: 0,
        scale: 0.3,
        duration: 300,
        onComplete: () => fx.destroy(),
      });
    }
  }

  /** 磁暴冲击波 */
  private emitStorm(x: number, y: number, range: number, dmg: number): void {
    // 视觉：扩散圆环
    const ring = this.add.circle(x, y, 10, COLORS.MAGNETIC, 0.4)
      .setStrokeStyle(3, COLORS.MAGNETIC_GLOW, 1);
    ring.setDepth(15);
    this.tweens.add({
      targets: ring,
      scale: range / 10,
      alpha: 0,
      duration: 500,
      onComplete: () => ring.destroy(),
    });

    // 范围伤害
    const enemies = this.enemies.getChildren() as Enemy[];
    for (const e of enemies) {
      const dist = Phaser.Math.Distance.Between(x, y, e.x, e.y);
      if (dist < range) {
        const dead = e.takeDamage(dmg);
        this.onEnemyHit(e);
        if (dead) this.onEnemyDeath(e);
      }
    }
    this.cameras.main.shake(120, 0.008);
  }

  /** 敌人受击特效
   * @param color 特效颜色（按五行）
   * @param mul 五行倍率（>1.5 显示"克制!"）
   */
  private onEnemyHit(e: Enemy, color = 0xffeb3b, mul = 1.0): void {
    this.drawHitFx(e.x, e.y, color);
    // 相克提示
    if (mul >= 2.0) {
      const txt = this.add.text(e.x, e.y - 20, '克制!', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '14px',
        color: '#ff5252',
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 3,
      }).setOrigin(0.5).setDepth(20);
      this.tweens.add({
        targets: txt,
        y: e.y - 40,
        alpha: 0,
        duration: 600,
        onComplete: () => txt.destroy(),
      });
    }
  }

  /** 敌人死亡 */
  private onEnemyDeath(e: Enemy): void {
    this.kills++;
    // 死亡爆裂特效
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * 25 + 5;
      const fx = this.add.circle(e.x, e.y, 3, e.kind === 'boss' ? 0xff5252 : 0xffeb3b, 1);
      fx.setDepth(15);
      this.tweens.add({
        targets: fx,
        x: e.x + Math.cos(a) * d,
        y: e.y + Math.sin(a) * d,
        alpha: 0,
        duration: 400,
        onComplete: () => fx.destroy(),
      });
    }
    // 掉落灵石
    const gemCount = e.kind === 'boss' ? 10 : 1;
    for (let i = 0; i < gemCount; i++) {
      const ox = (Math.random() - 0.5) * 20;
      const oy = (Math.random() - 0.5) * 20;
      const gem = new XPGem(this, e.x + ox, e.y + oy, e.xp);
      this.gems.add(gem);
    }
    // boss 死亡
    if (e.kind === 'boss') {
      this.currentBoss = null;
      this.bossSpawned = false;
      this.cameras.main.shake(300, 0.015);
      this.events.emit('boss-dead');
    }
    e.destroy();
  }

  /** 弟子死亡 */
  private onDiscipleDeath(d: Disciple): void {
    this.kills++;
    this.discipleKills++;
    // 死亡爆裂特效（金色，比普通敌人更华丽）
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = Math.random() * 35 + 5;
      const fx = this.add.circle(d.x, d.y, 4, 0xffd54f, 1);
      fx.setDepth(15);
      this.tweens.add({
        targets: fx,
        x: d.x + Math.cos(a) * dist,
        y: d.y + Math.sin(a) * dist,
        alpha: 0,
        scale: 0.2,
        duration: 600,
        onComplete: () => fx.destroy(),
      });
    }
    // 掉落更多灵石（精英怪奖励翻倍）
    for (let i = 0; i < 5; i++) {
      const ox = (Math.random() - 0.5) * 30;
      const oy = (Math.random() - 0.5) * 30;
      const gem = new XPGem(this, d.x + ox, d.y + oy, d.xp);
      this.gems.add(gem);
    }
    // 掉落人品法宝
    this.dropTreasure(d.x, d.y, 'human');
    this.cameras.main.shake(120, 0.006);
    d.destroy();

    // 每击杀5个弟子刷新宗门老祖
    if (this.discipleKills % 5 === 0) {
      this.time.delayedCall(1500, () => this.spawnAncestor());
    }
  }

  /** 生成宗门老祖 */
  private spawnAncestor(): void {
    const pos = this.spawnPosAtEdge();
    const hpScale = 1 + this.elapsed / 100;
    const ancestor = new Ancestor(this, pos.x, pos.y, hpScale);
    this.ancestors.add(ancestor);

    // 老祖入场提示
    const { cx, cy } = this.getCameraCenter();
    const text = this.add.text(cx, cy - 80,
      '⚠ 宗门老祖出关 · 前来复仇 ⚠', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '28px',
        color: '#b388ff',
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 5,
      }).setOrigin(0.5).setAlpha(0).setDepth(150);
    this.tweens.add({
      targets: text,
      alpha: 1,
      duration: 400,
      yoyo: true,
      hold: 1800,
      onComplete: () => text.destroy(),
    });
    this.cameras.main.shake(300, 0.012);
  }

  /** 老祖死亡 */
  private onAncestorDeath(a: Ancestor): void {
    this.kills++;
    // 死亡爆裂特效（紫色华丽）
    for (let i = 0; i < 25; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * 50 + 10;
      const fx = this.add.circle(a.x, a.y, 5, i % 2 ? 0xb388ff : 0xffd54f, 1);
      fx.setDepth(15);
      this.tweens.add({
        targets: fx,
        x: a.x + Math.cos(ang) * dist,
        y: a.y + Math.sin(ang) * dist,
        alpha: 0,
        scale: 0.2,
        duration: 800,
        onComplete: () => fx.destroy(),
      });
    }
    // 掉落大量灵石
    for (let i = 0; i < 10; i++) {
      const ox = (Math.random() - 0.5) * 40;
      const oy = (Math.random() - 0.5) * 40;
      const gem = new XPGem(this, a.x + ox, a.y + oy, a.xp);
      this.gems.add(gem);
    }
    // 掉落地品法宝
    this.dropTreasure(a.x, a.y, 'earth');
    this.cameras.main.shake(300, 0.015);
    a.destroy();
  }

  /** 神使死亡：天劫解除 + 特殊法术三选一（经验奖励在选完法术后发放） */
  private onEnvoyDeath(): void {
    const envoy = this.currentEnvoy;
    if (!envoy) return;
    this.envoyRoundKills++;
    // 每击败一个神使，所有敌人+3防御
    const allEnemies = [
      ...this.enemies.getChildren() as Enemy[],
      ...this.disciples.getChildren() as Disciple[],
      ...this.ancestors.getChildren() as Ancestor[],
    ];
    for (const e of allEnemies) {
      if (e.defense) e.defense.defense += 3;
    }
    // 死亡爆裂特效
    const elemColor = ELEMENT_COLORS[envoy.element];
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = Math.random() * 60 + 10;
      const fx = this.add.circle(envoy.x, envoy.y, Math.random() * 5 + 3, i % 2 ? elemColor : 0xffffff, 1);
      fx.setDepth(15);
      this.tweens.add({
        targets: fx,
        x: envoy.x + Math.cos(a) * dist,
        y: envoy.y + Math.sin(a) * dist,
        alpha: 0,
        scale: 0.2,
        duration: 900,
        onComplete: () => fx.destroy(),
      });
    }
    // 掉落灵石
    for (let i = 0; i < 15; i++) {
      const ox = (Math.random() - 0.5) * 50;
      const oy = (Math.random() - 0.5) * 50;
      const gem = new XPGem(this, envoy.x + ox, envoy.y + oy, 32);  // 经验+300%（原8→32）
      this.gems.add(gem);
    }
    this.cameras.main.shake(600, 0.025);

    // 掉落对应五行地品法宝
    const earthGradeTreasures = TREASURE_POOL.filter(t => t.grade === 'earth' && t.element === envoy.element);
    if (earthGradeTreasures.length > 0) {
      const treasure = earthGradeTreasures[Math.floor(Math.random() * earthGradeTreasures.length)];
      this.dropTreasure(envoy.x, envoy.y, 'earth');
    }

    // 解除封锁
    this.endTribulation();
    this.currentEnvoy = null;
    envoy.destroy();

    // 判断是否5个神使都击败
    if (this.envoyRoundKills >= 5) {
      // 5个神使都击败，下一次天劫召唤神之手
      const { cx, cy } = this.getCameraCenter();
      const text = this.add.text(cx, cy - 80,
        '五行使者已陨 · 下次天劫神之手降临', {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '24px',
          color: '#ff5252',
          fontStyle: 'bold',
          stroke: '#000',
          strokeThickness: 5,
        }).setOrigin(0.5).setAlpha(0).setDepth(150);
      this.tweens.add({
        targets: text,
        alpha: 1,
        duration: 400,
        yoyo: true,
        hold: 2000,
        onComplete: () => text.destroy(),
      });
      // 重置天劫倒计时，下次触发神之手
      this.tribulationTimer = this.getTribulationInterval();
    } else {
      // 未集齐5个，等下次天劫生成下一个神使
      const { cx, cy } = this.getCameraCenter();
      const text = this.add.text(cx, cy - 80,
        `神使陨落 · 余 ${5 - this.envoyRoundKills} 位`, {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '24px',
          color: '#ffd54f',
          fontStyle: 'bold',
          stroke: '#000',
          strokeThickness: 4,
        }).setOrigin(0.5).setAlpha(0).setDepth(150);
      this.tweens.add({
        targets: text,
        alpha: 1,
        duration: 400,
        yoyo: true,
        hold: 1200,
        onComplete: () => text.destroy(),
      });
      // 重置天劫倒计时，等下次天劫
      this.tribulationTimer = this.getTribulationInterval();
    }
  }

  /** 神之手死亡 */
  private onGodHandDeath(): void {
    if (!this.godHand) return;
    const gh = this.godHand;
    // 大量爆裂特效
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = Math.random() * 100 + 10;
      const colors = [0xff5252, 0xffd54f, 0xffffff, 0x4dd0e1];
      const fx = this.add.circle(gh.x, gh.y, Math.random() * 6 + 3, colors[i % 4], 1);
      fx.setDepth(15);
      this.tweens.add({
        targets: fx,
        x: gh.x + Math.cos(a) * dist,
        y: gh.y + Math.sin(a) * dist,
        alpha: 0,
        scale: 0.2,
        duration: 1200,
        onComplete: () => fx.destroy(),
      });
    }
    // 掉落大量灵石
    for (let i = 0; i < 30; i++) {
      const ox = (Math.random() - 0.5) * 80;
      const oy = (Math.random() - 0.5) * 80;
      const gem = new XPGem(this, gh.x + ox, gh.y + oy, Math.round(this.elapsed * 8 / 30));  // 经验=当前秒数×8，分30份
      this.gems.add(gem);
    }
    // 掉落天品法宝
    this.dropTreasure(gh.x, gh.y, 'heaven');
    this.cameras.main.shake(800, 0.03);

    // 天劫结束 - 清除限制框
    this.endTribulation();
    this.tribulationActive = false;
    this.godHand.destroy();
    this.godHand = null;
    this.envoyRoundKills = 0;
    this.godHandKills++;
    this.events.emit('envoy-dead');

    const { cx, cy } = this.getCameraCenter();

    if (this.godHandKills === 1) {
      // 第一个神之手被击杀：开启末法魔化 + 特殊坊市
      this.magicDesolation = true;
      const text = this.add.text(cx, cy - 80,
        '⚡ 末法时代降临 · 敌人魔化 ⚡', {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '32px',
          color: '#ff5252',
          fontStyle: 'bold',
          stroke: '#000',
          strokeThickness: 6,
        }).setOrigin(0.5).setAlpha(0).setDepth(150);
      this.tweens.add({ targets: text, alpha: 1, duration: 500, yoyo: true, hold: 2000, onComplete: () => text.destroy() });
      this.tribulationTimer = this.getTribulationInterval();
      this.time.delayedCall(2500, () => this.showTribulationReward());
      // 延迟打开特殊坊市
      this.time.delayedCall(4000, () => this.openSpecialShop());
    } else if (this.godHandKills === 2) {
      // 第二个神之手被击杀：进入最终阶段 + 特殊坊市
      this.finalPhase = 'shop';
      const text = this.add.text(cx, cy - 80,
        '⚡ 末法终章 · 最终商店开启 ⚡', {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '32px',
          color: '#ffd54f',
          fontStyle: 'bold',
          stroke: '#000',
          strokeThickness: 6,
        }).setOrigin(0.5).setAlpha(0).setDepth(150);
      this.tweens.add({ targets: text, alpha: 1, duration: 500, yoyo: true, hold: 2000, onComplete: () => text.destroy() });
      this.time.delayedCall(2500, () => this.openFinalShop());
    } else if (this.godHandKills >= 3) {
      // 第三个神之手被击杀：胜利
      this.finalPhase = 'victory';
      this.showVictory();
    }
  }

  /** 开启最终商店 */
  private openFinalShop(): void {
    const finalShopCost = 5000;  // 固定消耗5000，不继承坊市
    this.paused = true;
    this.physics.pause();
    const { cx, cy, w, h } = this.getCameraCenter();
    const mask = this.add.rectangle(cx, cy, w, h, 0x000000, 0.85);
    mask.setDepth(100).setInteractive();
    const title = this.add.text(cx, cy - 200, '最终商店', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '32px',
      color: '#ffd54f',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 5,
    }).setOrigin(0.5).setDepth(101);
    const subtitle = this.add.text(cx, cy - 155, `击杀数：${this.kills}（每次购买消耗 ${finalShopCost}）`, {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '16px',
      color: '#b0bec5',
    }).setOrigin(0.5).setDepth(101);

    const available = SHOP_SPELL_POOL.filter(u => {
      const takenCount = this.takenUpgrades[u.id] ?? 0;
      return takenCount < u.maxStacks;
    });
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    const choices = shuffled.slice(0, 3);
    const { cardW, cardH, gap } = this.calcCardSize();
    const totalW = cardW * 3 + gap * 2;
    const startX = cx - totalW / 2 + cardW / 2;
    const cardY = cy + 30;
    const cards: UpgradeChoice[] = choices.map((upg, i) => {
      const x = startX + i * (cardW + gap);
      const card = this.createUpgradeCard(x, cardY, cardW, cardH, upg);
      card.setDepth(101);
      return { upgrade: upg, card };
    });
    const closeBtn = this.add.text(cx, cy + 200, '✕ 关闭商店 · 开始最终决战', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '18px',
      color: '#ff5252',
      fontStyle: 'bold',
      backgroundColor: '#37474f',
      padding: { x: 16, y: 6 },
    }).setOrigin(0.5).setDepth(102).setInteractive({ useHandCursor: true });

    this.upgradeOverlay = this.add.container(0, 0, [mask, title, subtitle, ...cards.map(c => c.card), closeBtn]);
    this.upgradeOverlay.setDepth(100);

    for (const choice of cards) {
      choice.card.on('pointerdown', () => {
        if (this.kills >= finalShopCost) {
          this.kills -= finalShopCost;
          applyUpgrade(this.stats, choice.upgrade);
          this.takenUpgrades[choice.upgrade.id] = (this.takenUpgrades[choice.upgrade.id] ?? 0) + 1;
          this.player.onUpgrade();
        }
      });
    }

    const closeFinalShop = () => {
      this.upgradeOverlay?.destroy(true);
      this.upgradeOverlay = undefined;
      this.paused = false;
      this.physics.resume();
      // 开始10秒倒计时
      this.finalPhase = 'countdown';
      this.finalCountdown = 10;
    };
    closeBtn.on('pointerdown', closeFinalShop);
  }

  /** 显示胜利 */
  private showVictory(): void {
    this.paused = true;
    this.physics.pause();
    SaveSystem.addStats({ totalKills: this.kills, totalRuns: 1, totalGems: this.gemsCollected });
    SaveSystem.updateBest(this.level, this.elapsed);
    this.time.delayedCall(1500, () => {
      this.scene.stop('UI');
      this.scene.start('GameOver', {
        level: this.level,
        kills: this.kills,
        time: this.elapsed,
        gems: this.gemsCollected,
        victory: true,
      });
    });
  }

  /** 掉落法宝 */
  private dropTreasure(x: number, y: number, grade: TreasureGrade): void {
    const treasure = rollTreasure(grade);
    // 创建法宝拾取物（用 XPGem 的机制简化，直接获得）
    const fx = this.add.circle(x, y, 8, GRADE_COLORS[grade], 1)
      .setStrokeStyle(2, 0xffffff, 0.8);
    fx.setDepth(16);
    // 浮动动画
    this.tweens.add({
      targets: fx,
      y: y - 10,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    // 1秒后自动拾取
    this.time.delayedCall(1000, () => {
      this.collectTreasure(treasure, x, y);
      fx.destroy();
    });
  }

  /** 收集法宝 */
  private collectTreasure(treasure: Treasure, x: number, y: number): void {
    // 先尝试自动装备到空栏位
    const emptySlot = this.stats.equippedTreasures.findIndex(t => t === null);
    if (emptySlot >= 0) {
      this.stats.equippedTreasures[emptySlot] = treasure;
    } else {
      // 装备栏满了，放入背包
      this.stats.treasures.push(treasure);
    }
    // 检查合成（背包里3个相同法宝）
    this.trySynthesize();

    // 显示获得提示
    const { cx, cy } = this.getCameraCenter();
    const gradeColor = '#' + GRADE_COLORS[treasure.grade].toString(16).padStart(6, '0');
    const text1 = this.add.text(cx, cy - 60,
      `获得【${GRADE_NAMES[treasure.grade]}品法宝】`, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '22px',
        color: gradeColor,
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 4,
      }).setOrigin(0.5).setAlpha(0).setDepth(150);
    const text2 = this.add.text(cx, cy - 20,
      treasure.name, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '28px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 4,
      }).setOrigin(0.5).setAlpha(0).setDepth(150);
    const text3 = this.add.text(cx, cy + 20,
      treasure.desc, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '14px',
        color: '#b0bec5',
      }).setOrigin(0.5).setAlpha(0).setDepth(150);
    this.tweens.add({ targets: [text1, text2, text3], alpha: 1, duration: 400, yoyo: true, hold: 2500, onComplete: () => { text1.destroy(); text2.destroy(); text3.destroy(); } });
  }

  /** 尝试合成法宝（背包里3个相同→高品级） */
  private trySynthesize(): void {
    const result = canSynthesize(this.stats.treasures);
    if (!result) return;
    const upgraded = getUpgradedTreasure(result.treasure);
    if (!upgraded) return;
    // 移除3个相同法宝
    const key = result.treasure.id + '_' + result.treasure.grade;
    let removed = 0;
    this.stats.treasures = this.stats.treasures.filter(t => {
      if (removed < 3 && t.id === result.treasure.id && t.grade === result.treasure.grade) {
        removed++;
        return false;
      }
      return true;
    });
    // 添加高品级法宝到背包
    this.stats.treasures.push({ ...upgraded });
    // 提示
    const { cx, cy } = this.getCameraCenter();
    const text = this.add.text(cx, cy + 60,
      `★ 法宝合成 ★ ${upgraded.name}（${GRADE_NAMES[upgraded.grade]}品）`, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '20px',
        color: '#ffd54f',
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 4,
      }).setOrigin(0.5).setAlpha(0).setDepth(150);
    this.tweens.add({ targets: text, alpha: 1, duration: 400, yoyo: true, hold: 2000, onComplete: () => text.destroy() });
    // 递归检查是否还能合成
    this.trySynthesize();
  }

  /** 天劫奖励：特殊法术三选一 */
  private showTribulationReward(): void {
    // 确保旧 overlay 被销毁
    this.upgradeOverlay?.destroy(true);
    this.upgradeOverlay = undefined;

    this.paused = true;
    this.physics.pause();

    const { cx, cy, w, h } = this.getCameraCenter();

    // 半透明遮罩
    const mask = this.add.rectangle(cx, cy, w, h, 0x000000, 0.8);

    // 标题
    const title = this.add.text(cx, cy - 180, '⚡ 天劫馈赠 · 仙法抉择 ⚡', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '32px',
      color: '#ffd54f',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 5,
    }).setOrigin(0.5).setDepth(101);

    const subtitle = this.add.text(cx, cy - 135, '神使陨落，天道降下仙法秘卷', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '15px',
      color: '#b0bec5',
    }).setOrigin(0.5).setDepth(101);

    // 生成三个特殊法术
    const tribulationUpgrades = this.rollTribulationUpgrades();
    const { cardW, cardH, gap } = this.calcCardSize();
    const totalW = cardW * 3 + gap * 2;
    const startX = cx - totalW / 2 + cardW / 2;
    const cardY = cy + 40;

    const cards: UpgradeChoice[] = tribulationUpgrades.map((upg, i) => {
      const x = startX + i * (cardW + gap);
      const card = this.createUpgradeCard(x, cardY, cardW, cardH, upg);
      card.setDepth(101);
      return { upgrade: upg, card };
    });

    this.upgradeOverlay = this.add.container(0, 0, [mask, title, subtitle, ...cards.map(c => c.card)]);
    this.upgradeOverlay.setDepth(100);

    for (const choice of cards) {
      choice.card.on('pointerdown', () => {
        this.selectTribulationUpgrade(choice.upgrade);
      });
    }
  }

  /** 选择天劫奖励（不消耗 pendingLevelUps，选完后发经验触发普通升级） */
  private selectTribulationUpgrade(upg: Upgrade): void {
    applyUpgrade(this.stats, upg);
    this.takenUpgrades[upg.id] = (this.takenUpgrades[upg.id] ?? 0) + 1;
    this.player.onUpgrade();

    // 销毁天劫奖励 UI
    this.upgradeOverlay?.destroy(true);
    this.upgradeOverlay = undefined;

    // 恢复游戏
    this.paused = false;
    this.physics.resume();

    // 天劫奖励选完后，再发放经验（此时会正常触发普通升级三选一）
    // 用 delayedCall 确保当前帧完成后再触发，避免 overlay 冲突
    const bigXp = 100 + (this.tribulationCount - 1) * 50;
    this.time.delayedCall(100, () => {
      this.gainXP(bigXp);
    });
  }

  /** 生成天劫特殊法术（强力版） */
  private rollTribulationUpgrades(): Upgrade[] {
    const pool: Upgrade[] = [
      { id: 'trib_dmg', name: '天雷灌体', desc: '放电伤害 +80%', rarity: 'epic', maxStacks: 5, effect: { damageMul: 1.8 } },
      { id: 'trib_aspd', name: '风雷急迅', desc: '攻击速度 +50%', rarity: 'epic', maxStacks: 5, effect: { attackSpeedMul: 1.5 } },
      { id: 'trib_hp', name: '金刚不坏', desc: '最大生命 +300', rarity: 'epic', maxStacks: 5, effect: { maxHpAdd: 300 } },
      { id: 'trib_regen', name: '造化回春', desc: '每秒恢复 10 点生命', rarity: 'epic', maxStacks: 3, effect: { hpRegenAdd: 10 } },
      { id: 'trib_proj', name: '万剑归宗', desc: '同时多发射 2 道雷电', rarity: 'epic', maxStacks: 2, effect: { projectileAdd: 2 } },
      { id: 'trib_move', name: '御风神行', desc: '移动速度 +30%', rarity: 'epic', maxStacks: 3, effect: { moveSpeedMul: 1.3 } },
      { id: 'trib_aura', name: '磁场领域+', desc: '磁场范围 +50%，伤害 +100%', rarity: 'epic', maxStacks: 3, effect: { auraRangeMul: 1.5 } },
      { id: 'trib_xp', name: '悟道天书', desc: '经验获取 +50%', rarity: 'epic', maxStacks: 3, effect: { xpMul: 1.5 } },
      { id: 'trib_elem', name: '五行护身', desc: '五行减伤 +40%（乘算叠加）', rarity: 'epic', maxStacks: 5, effect: { elementReductionAdd: 0.4 } },
    ];
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3);
  }

  /** 法宝稀有特效触发（只对已装备的法宝生效） */
  private updateTreasureSpecials(dt: number): void {
    for (const t of this.stats.equippedTreasures) {
      if (!t || !t.effect.special) continue;
      const id = t.id + '_eq';
      if (this.treasureSpecialTimers[id] === undefined) {
        this.treasureSpecialTimers[id] = t.effect.specialCooldown ?? 10;
      }
      this.treasureSpecialTimers[id] -= dt;
      if (this.treasureSpecialTimers[id] <= 0) {
        this.treasureSpecialTimers[id] = t.effect.specialCooldown ?? 10;
        this.triggerTreasureSpecial(t);
      }
    }
  }

  /** 触发法宝稀有特效 */
  private triggerTreasureSpecial(t: Treasure): void {
    const x = this.player.x;
    const y = this.player.y;
    // 触发提示文字
    this.showTreasureTriggerTip(t.name + '发动');

    switch (t.effect.special) {
      case 'kill_minions': {
        // 斩妖符：秒杀600范围内小怪
        const range = t.effect.specialValue ?? 600;
        const enemies = this.enemies.getChildren() as Enemy[];
        for (const e of enemies) {
          const d = Phaser.Math.Distance.Between(x, y, e.x, e.y);
          if (d < range && e.kind !== 'boss') {
            e.isDead = true;
            this.onEnemyDeath(e);
          }
        }
        const ring = this.add.circle(x, y, 10, 0xff5252, 0.6).setStrokeStyle(4, 0xffffff, 1);
        ring.setDepth(15);
        this.tweens.add({ targets: ring, scale: range / 10, alpha: 0, duration: 500, onComplete: () => ring.destroy() });
        break;
      }
      case 'thunder_tribulation': {
        // 雷劫符：秒杀1000范围内小怪+对弟子老祖造成40%最大生命伤害，蓝色闪电特效
        const range = t.effect.specialValue ?? 1000;
        const enemies = this.enemies.getChildren() as Enemy[];
        for (const e of enemies) {
          const d = Phaser.Math.Distance.Between(x, y, e.x, e.y);
          if (d < range && e.kind !== 'boss') {
            // 蓝色闪电特效
            this.drawLightningArc(x, y - 200, e.x, e.y, 0x4fc3f7, 0.9, 200);
            e.isDead = true;
            this.onEnemyDeath(e);
          }
        }
        // 对弟子老祖造成40%最大生命伤害
        const elites = [
          ...this.disciples.getChildren() as Disciple[],
          ...this.ancestors.getChildren() as Ancestor[],
        ];
        for (const e of elites) {
          const d = Phaser.Math.Distance.Between(x, y, e.x, e.y);
          if (d < range) {
            this.drawLightningArc(x, y - 200, e.x, e.y, 0x4fc3f7, 0.9, 200);
            const dead = e.takeDamage(e.maxHp * 0.4);
            if (dead) {
              if (e instanceof Disciple) this.onDiscipleDeath(e);
              else if (e instanceof Ancestor) this.onAncestorDeath(e);
            }
          }
        }
        const ring = this.add.circle(x, y, 10, 0x4fc3f7, 0.5).setStrokeStyle(5, 0xffffff, 1);
        ring.setDepth(15);
        this.tweens.add({ targets: ring, scale: range / 10, alpha: 0, duration: 600, onComplete: () => ring.destroy() });
        this.cameras.main.shake(200, 0.01);
        break;
      }
      case 'armageddon': {
        // 灭世雷劫：范围+50%（1500→2250），秒杀小怪+对弟子老祖80%最大生命伤害+对游龙80%最大生命伤害
        const range = (t.effect.specialValue ?? 1500) * 1.5;
        const enemies = this.enemies.getChildren() as Enemy[];
        for (const e of enemies) {
          const d = Phaser.Math.Distance.Between(x, y, e.x, e.y);
          if (d < range && e.kind !== 'boss') {
            this.drawLightningArc(x, y - 300, e.x, e.y, 0xff5252, 1, 250);
            e.isDead = true;
            this.onEnemyDeath(e);
          }
        }
        const elites = [
          ...this.disciples.getChildren() as Disciple[],
          ...this.ancestors.getChildren() as Ancestor[],
        ];
        for (const e of elites) {
          const d = Phaser.Math.Distance.Between(x, y, e.x, e.y);
          if (d < range) {
            this.drawLightningArc(x, y - 300, e.x, e.y, 0xff5252, 1, 250);
            const dead = e.takeDamage(e.maxHp * 0.8);
            if (dead) {
              if (e instanceof Disciple) this.onDiscipleDeath(e);
              else if (e instanceof Ancestor) this.onAncestorDeath(e);
            }
          }
        }
        // 对木行游龙造成80%最大生命伤害
        if ((this as any).woodDragons) {
          for (const d of (this as any).woodDragons as WoodDragon[]) {
            const dd = Phaser.Math.Distance.Between(x, y, d.x, d.y);
            if (dd < range) {
              this.drawLightningArc(x, y - 300, d.x, d.y, 0xff5252, 1, 250);
              d.takeDamage(d.maxHp * 0.8, 'none');
            }
          }
        }
        const ring = this.add.circle(x, y, 10, 0xff5252, 0.6).setStrokeStyle(6, 0xffd54f, 1);
        ring.setDepth(15);
        this.tweens.add({ targets: ring, scale: range / 10, alpha: 0, duration: 700, onComplete: () => ring.destroy() });
        this.cameras.main.shake(300, 0.015);
        break;
      }
      case 'freeze_area': {
        const range = 250;
        const all = [
          ...this.enemies.getChildren() as Enemy[],
          ...this.disciples.getChildren() as Disciple[],
          ...this.ancestors.getChildren() as Ancestor[],
        ];
        for (const e of all) {
          const d = Phaser.Math.Distance.Between(x, y, e.x, e.y);
          if (d < range) e.applySlow(0.01, 3);
        }
        const ring = this.add.circle(x, y, 10, 0x4fc3f7, 0.5).setStrokeStyle(4, 0xffffff, 1);
        ring.setDepth(15);
        this.tweens.add({ targets: ring, scale: 25, alpha: 0, duration: 600, onComplete: () => ring.destroy() });
        break;
      }
      case 'heal_burst': {
        this.player.heal(this.stats.maxHp * 0.3);
        const ring = this.add.circle(x, y, 10, 0x66bb6a, 0.5).setStrokeStyle(4, 0xffffff, 1);
        ring.setDepth(15);
        this.tweens.add({ targets: ring, scale: 15, alpha: 0, duration: 500, onComplete: () => ring.destroy() });
        break;
      }
      case 'lightning_storm': {
        const range = 300;
        const all = [
          ...this.enemies.getChildren() as Enemy[],
          ...this.disciples.getChildren() as Disciple[],
          ...this.ancestors.getChildren() as Ancestor[],
        ];
        for (const e of all) {
          const d = Phaser.Math.Distance.Between(x, y, e.x, e.y);
          if (d < range) {
            const dead = e.takeDamage(this.stats.damage * 3);
            this.onEnemyHit(e as any, 0xffeb3b);
            if (dead) {
              if (e instanceof Enemy) this.onEnemyDeath(e);
              else if (e instanceof Disciple) this.onDiscipleDeath(e);
              else if (e instanceof Ancestor) this.onAncestorDeath(e);
            }
          }
        }
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const tx = x + Math.cos(a) * range;
          const ty = y + Math.sin(a) * range;
          this.drawLightningArc(x, y, tx, ty, 0xffeb3b, 0.8, 300);
        }
        this.cameras.main.shake(200, 0.01);
        break;
      }
      case 'sword_circle': {
        // 万剑归宗：对全屏敌人发射彩色飞剑，10倍伤害
        const dmgMul = t.effect.specialValue ?? 10;
        const dmg = this.stats.damage * dmgMul;
        // 彩色飞剑颜色
        const colors = [0xff5252, 0xffeb3b, 0x66bb6a, 0x4fc3f7, 0xb388ff, 0xff80ab, 0x4dd0e1, 0xffd54f];
        const allTargets = [
          ...this.enemies.getChildren() as Enemy[],
          ...this.disciples.getChildren() as Disciple[],
          ...this.ancestors.getChildren() as Ancestor[],
          ...this.envoys.getChildren() as Envoy[],
        ];
        for (const target of allTargets) {
          if (!target.active) continue;
          const angle = Phaser.Math.Angle.Between(x, y, target.x, target.y);
          const speed = 500;
          const proj = new SpellProjectile(this, x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, dmg, 'metal', 0, 0);
          (proj as any).swordColor = colors[Math.floor(Math.random() * colors.length)];
          this.spellProjectiles.add(proj);
        }
        break;
      }
    }
  }

  /** 法宝触发提示（玩家位置，1秒淡出） */
  private showTreasureTriggerTip(text: string): void {
    const tip = this.add.text(this.player.x, this.player.y - 40, text, {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '14px',
      color: '#ffd54f',
      backgroundColor: '#000000',
      padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setAlpha(0.9).setDepth(80);
    this.tweens.add({
      targets: tip,
      alpha: 0,
      y: this.player.y - 60,
      duration: 1000,
      onComplete: () => tip.destroy(),
    });
  }

  /** 自动合成检查（每3秒） */
  private checkAutoSynthesis(): void {
    const available = checkSynthesizable([...this.stats.equippedTreasures.filter(t => t !== null) as any, ...this.stats.treasures]);
    for (const recipe of available) {
      // 执行合成
      const result = executeSynthesis(this.stats.equippedTreasures, this.stats.treasures, recipe);
      // 清理 bag 中的 null
      this.stats.treasures = this.stats.treasures.filter(t => t !== null);
      // 查找产物法宝对象
      if (result) {
        const product = TREASURE_POOL.find(t => t.id === result.id);
        if (product) {
          // 自动装备到空栏位，否则放背包
          const emptySlot = this.stats.equippedTreasures.findIndex(t => t === null);
          if (emptySlot >= 0) {
            this.stats.equippedTreasures[emptySlot] = { ...product };
          } else {
            this.stats.treasures.push({ ...product });
          }
          // 合成提示
          this.showSynthesisTip(product.name);
        }
      }
    }
  }

  /** 合成提示（主角位置，2秒淡出） */
  private showSynthesisTip(name: string): void {
    const tip = this.add.text(this.player.x, this.player.y - 50, `★ 法宝合成：${name}`, {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '14px',
      color: '#b388ff',
      backgroundColor: '#000000',
      padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setAlpha(0.9).setDepth(80);
    this.tweens.add({
      targets: tip,
      alpha: 0,
      y: this.player.y - 70,
      duration: 2000,
      onComplete: () => tip.destroy(),
    });
  }

  /** 应用法宝常驻属性（移速/防御） */
  private applyTreasurePassiveStats(): void {
    let bonusMoveSpeed = 0;
    let bonusDefense = 0;
    for (const t of this.stats.equippedTreasures) {
      if (!t) continue;
      if (t.effect.moveSpeedAdd) bonusMoveSpeed += t.effect.moveSpeedAdd;
      if (t.effect.defenseAdd) bonusDefense += t.effect.defenseAdd;
    }
    // 法宝防御加成用独立字段，不与 tempDefense 冲突
    this.player.treasureDefenseBonus = bonusDefense;
    (this.player as any).treasureMoveSpeedBonus = bonusMoveSpeed;
  }

  /** 更新先天灵宝 */
  private updateSpiritTreasures(dt: number): void {
    let nearest: { x: number; y: number } | null = null;
    let nearestDist = Infinity;
    const allEnemies = [
      ...this.enemies.getChildren() as Enemy[],
      ...this.disciples.getChildren() as Disciple[],
      ...this.ancestors.getChildren() as Ancestor[],
      ...this.envoys.getChildren() as Envoy[],
    ];
    for (const e of allEnemies) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
      if (d < nearestDist) { nearestDist = d; nearest = { x: e.x, y: e.y }; }
    }
    if (this.godHand) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.godHand.x, this.godHand.y);
      if (d < nearestDist) { nearest = { x: this.godHand.x, y: this.godHand.y }; }
    }

    for (const entity of this.spiritTreasureEntities) {
      const result = entity.update(dt, this.player.x, this.player.y, nearest);
      if (!result) continue;
      if (result.action === 'zhan_yan_luo_slash' && nearest) {
        const tx = result.targetX!, ty = result.targetY!;
        const slashAngle = Phaser.Math.Angle.Between(entity.x, entity.y, tx, ty);
        const halfAngle = Math.PI / 3;
        const range = 300;
        const fx = this.add.graphics(); fx.setDepth(15);
        fx.fillStyle(0xff5252, 0.4);
        fx.beginPath(); fx.moveTo(entity.x, entity.y);
        fx.arc(entity.x, entity.y, range, slashAngle - halfAngle, slashAngle + halfAngle);
        fx.closePath(); fx.fillPath();
        this.tweens.add({ targets: fx, alpha: 0, duration: 300, onComplete: () => fx.destroy() });
        for (const e of allEnemies) {
          const d = Phaser.Math.Distance.Between(entity.x, entity.y, e.x, e.y);
          if (d < range) {
            const ang = Phaser.Math.Angle.Between(entity.x, entity.y, e.x, e.y);
            if (Math.abs(Phaser.Math.Angle.Wrap(ang - slashAngle)) <= halfAngle) {
              e.maxHp -= e.maxHp * 0.07;
              if (e.hp > e.maxHp) e.hp = e.maxHp;
              const dead = e.takeDamage(this.stats.damage * 5);
              this.onEnemyHit(e as any, 0xff5252);
              if (dead) { if (e instanceof Enemy) this.onEnemyDeath(e); else if (e instanceof Disciple) this.onDiscipleDeath(e); else if (e instanceof Ancestor) this.onAncestorDeath(e); else if (e instanceof Envoy) this.onEnvoyDeath(); }
            }
          }
        }
      } else if (result.action === 'bu_gu_po_fa_cleanse') {
        this.player.debuffContainer.debuffs = [];
        this.player.healBlockTimer = 0; this.player.poisonTimer = 0; this.player.poisonDpsRatio = 0;
        this.player.burnTimer = 0; this.player.burnDps = 0; this.player.slowTimer = 0; this.player.slowMul = 1.0;
        // 金光一闪特效（多层）
        const flash1 = this.add.circle(this.player.x, this.player.y, 20, 0xffd54f, 0.8); flash1.setDepth(15);
        this.tweens.add({ targets: flash1, scale: 3, alpha: 0, duration: 500, onComplete: () => flash1.destroy() });
        const flash2 = this.add.circle(this.player.x, this.player.y, 15, 0xffffff, 0.9); flash2.setDepth(16);
        this.tweens.add({ targets: flash2, scale: 2.5, alpha: 0, duration: 400, onComplete: () => flash2.destroy() });
        // 金色光环
        const ring = this.add.circle(this.player.x, this.player.y, 10, 0xffd54f, 0).setStrokeStyle(3, 0xffd54f, 0.9); ring.setDepth(15);
        this.tweens.add({ targets: ring, scale: 3, alpha: 0, duration: 600, onComplete: () => ring.destroy() });
      } else if (result.action === 'fu_cang_long_whip') {
        const range = 200;
        const fx = this.add.graphics(); fx.setDepth(15);
        fx.lineStyle(4, 0xff5252, 0.6); fx.strokeCircle(this.player.x, this.player.y, range);
        fx.lineStyle(2, 0xffd54f, 0.4); fx.strokeCircle(this.player.x, this.player.y, range * 0.7);
        this.tweens.add({ targets: fx, alpha: 0, duration: 400, onComplete: () => fx.destroy() });
        const spellProjs = this.spellProjectiles.getChildren() as SpellProjectile[];
        for (const p of spellProjs) {
          if (!(p as any).fromEnemy) continue;
          if (Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y) < range) p.destroy();
        }
        for (const e of allEnemies) {
          if (Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y) < range) {
            const dead = e.takeDamage(this.stats.damage * 3);
            // 施加重伤debuff（治疗降低70%），持续5秒
            (e as any).grievousTimer = 5;
            this.onEnemyHit(e as any, 0xff5252);
            if (dead) { if (e instanceof Enemy) this.onEnemyDeath(e); else if (e instanceof Disciple) this.onDiscipleDeath(e); else if (e instanceof Ancestor) this.onAncestorDeath(e); else if (e instanceof Envoy) this.onEnvoyDeath(); }
          }
        }
      }
    }
  }

  /** 购买先天灵宝 */
  private buySpiritTreasure(id: SpiritTreasureId): boolean {
    const t = SPIRIT_TREASURE_POOL.find(t => t.id === id);
    if (!t || this.stats.spiritTreasures.includes(id) || this.stats.karma < t.price) return false;
    this.stats.karma -= t.price;
    this.stats.spiritTreasures.push(id);
    this.spiritTreasureEntities.push(new SpiritTreasureEntity(this, this.player.x, this.player.y, id));
    return true;
  }

  /** 熔铸法宝为业 */
  private meltTreasure(source: 'equip' | 'bag', index: number): number {
    let t: any;
    if (source === 'equip') { t = this.stats.equippedTreasures[index]; if (!t) return 0; this.stats.equippedTreasures[index] = null; }
    else { t = this.stats.treasures[index]; if (!t) return 0; this.stats.treasures.splice(index, 1); }
    const v = MELT_VALUES[t.grade] ?? 10;
    this.stats.karma += v;
    return v;
  }

  /** 打开特殊坊市 */
  private openSpecialShop(): void {
    this.paused = true; this.physics.pause();
    const { cx, cy, w, h } = this.getCameraCenter();
    const elements: Phaser.GameObjects.GameObject[] = [];
    const mask = this.add.rectangle(cx, cy, w, h, 0x000000, 0.9); mask.setDepth(100).setInteractive(); elements.push(mask);
    const title = this.add.text(cx, cy - h * 0.4, '特殊坊市 · 熔铸灵宝', { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '28px', color: '#ff5252', fontStyle: 'bold', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5).setDepth(101); elements.push(title);
    const karmaText = this.add.text(cx, cy - h * 0.4 + 35, `当前业值：${this.stats.karma}`, { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '18px', color: '#ffd54f', fontStyle: 'bold' }).setOrigin(0.5).setDepth(101); elements.push(karmaText);
    const tipText = this.add.text(cx, cy + h * 0.3, '', { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '14px', color: '#ff5252', fontStyle: 'bold', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5).setAlpha(0).setDepth(102); elements.push(tipText);
    const showTip = (msg: string) => { tipText.setText(msg); tipText.setAlpha(1); this.tweens.add({ targets: tipText, alpha: 0, duration: 2000, hold: 500 }); };

    // 上方：先天灵宝
    const available = SPIRIT_TREASURE_POOL.filter(t => !this.stats.spiritTreasures.includes(t.id));
    const tTitle = this.add.text(cx - w * 0.35, cy - h * 0.25, '【先天灵宝】', { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '14px', color: '#ffd54f', fontStyle: 'bold' }).setDepth(101); elements.push(tTitle);
    for (let i = 0; i < available.length; i++) {
      const t = available[i]; const tx = cx - w * 0.35 + (i % 3) * 130; const ty = cy - h * 0.2 + Math.floor(i / 3) * 80;
      const card = this.add.rectangle(tx, ty, 120, 70, 0x1e2a44, 0.95).setStrokeStyle(2, 0xff5252, 0.8); card.setDepth(101).setInteractive({ useHandCursor: true }); elements.push(card);
      const name = this.add.text(tx, ty - 15, t.name, { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '13px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(102); elements.push(name);
      const price = this.add.text(tx, ty + 5, `${t.price}业`, { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '11px', color: '#ffd54f' }).setOrigin(0.5).setDepth(102); elements.push(price);
      const desc = this.add.text(tx, ty + 20, t.desc.slice(0, 12) + '...', { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '9px', color: '#b0bec5' }).setOrigin(0.5).setDepth(102); elements.push(desc);
      card.on('pointerdown', () => {
        if (this.stats.karma >= t.price) { this.buySpiritTreasure(t.id); karmaText.setText(`当前业值：${this.stats.karma}`); showTip(`获得先天灵宝：${t.name}！`); card.destroy(); name.destroy(); price.destroy(); desc.destroy(); }
        else showTip(`业值不足！需要${t.price}业，当前${this.stats.karma}业`);
      });
    }

    // 下方：法宝熔铸
    const bTitle = this.add.text(cx - w * 0.35, cy + h * 0.05, '【法宝熔铸】（点击选中，再点熔铸按钮）', { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '14px', color: '#4dd0e1', fontStyle: 'bold' }).setDepth(101); elements.push(bTitle);
    const allT: { treasure: any; source: 'equip' | 'bag'; index: number }[] = [];
    for (let i = 0; i < this.stats.equippedTreasures.length; i++) if (this.stats.equippedTreasures[i]) allT.push({ treasure: this.stats.equippedTreasures[i], source: 'equip', index: i });
    for (let i = 0; i < this.stats.treasures.length; i++) allT.push({ treasure: this.stats.treasures[i], source: 'bag', index: i });
    let selSrc: 'equip' | 'bag' | null = null; let selIdx = -1; let selCard: Phaser.GameObjects.Rectangle | null = null;
    for (let i = 0; i < allT.length && i < 12; i++) {
      const t = allT[i]; const tx = cx - w * 0.35 + (i % 6) * 65; const ty = cy + h * 0.1 + Math.floor(i / 6) * 55;
      const mv = MELT_VALUES[t.treasure.grade] ?? 10; const gc = GRADE_COLORS[t.treasure.grade as keyof typeof GRADE_COLORS];
      const card = this.add.rectangle(tx, ty, 55, 45, 0x0a0e1a, 0.9).setStrokeStyle(2, gc, 0.8); card.setDepth(101).setInteractive({ useHandCursor: true }); elements.push(card);
      const name = this.add.text(tx, ty - 8, t.treasure.name.slice(0, 3), { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '10px', color: '#ffffff' }).setOrigin(0.5).setDepth(102); elements.push(name);
      const val = this.add.text(tx, ty + 8, `${mv}业`, { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '9px', color: '#ffd54f' }).setOrigin(0.5).setDepth(102); elements.push(val);
      card.on('pointerdown', () => {
        if (selCard) selCard.setStrokeStyle(2, GRADE_COLORS[allT.find(d => d.source === selSrc && d.index === selIdx)?.treasure.grade as keyof typeof GRADE_COLORS] ?? 0x37474f, 0.8);
        selSrc = t.source; selIdx = t.index; selCard = card; card.setStrokeStyle(3, 0xffffff, 1);
        showTip(`选中：${t.treasure.name}（熔铸可获得${mv}业）`);
      });
    }
    const meltBtn = this.add.text(cx + w * 0.3, cy + h * 0.15, '熔铸选中法宝', { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '16px', color: '#ff5252', fontStyle: 'bold', backgroundColor: '#37474f', padding: { x: 12, y: 6 } }).setOrigin(0.5).setDepth(102).setInteractive({ useHandCursor: true }); elements.push(meltBtn);
    meltBtn.on('pointerdown', () => {
      if (!selSrc || selIdx < 0) { showTip('请先选择要熔铸的法宝！'); return; }
      const v = this.meltTreasure(selSrc, selIdx);
      if (v > 0) { karmaText.setText(`当前业值：${this.stats.karma}`); showTip(`熔铸成功！获得${v}业`); for (const el of elements) el.destroy(); this.openSpecialShop(); }
      else showTip('熔铸失败！');
    });
    const closeBtn = this.add.text(cx, cy + h * 0.4, '✕ 离开', { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '18px', color: '#ff5252', fontStyle: 'bold', backgroundColor: '#37474f', padding: { x: 16, y: 6 } }).setOrigin(0.5).setDepth(102).setInteractive({ useHandCursor: true }); elements.push(closeBtn);
    const closeShop = () => { for (const el of elements) el.destroy(); this.paused = false; this.physics.resume(); this.input.keyboard?.off('keydown-ESC', closeShop); };
    closeBtn.on('pointerdown', closeShop); this.input.keyboard?.once('keydown-ESC', closeShop);
  }

  /** 计算三选一卡片尺寸（适配移动端竖屏） */
  private calcCardSize(): { cardW: number; cardH: number; gap: number } {
    const screenW = this.scale.width;
    if (screenW < 500) {
      // 移动端竖屏：小卡片
      return { cardW: Math.min(150, screenW * 0.28), cardH: 220, gap: 12 };
    } else if (screenW < 800) {
      // 移动端横屏/小平板
      return { cardW: 180, cardH: 260, gap: 16 };
    }
    // 桌面
    return { cardW: 220, cardH: 300, gap: 30 };
  }

  /** 收集灵石 */
  private collectGem(g: XPGem): void {
    this.gemsCollected++;
    this.gainXP(g.xp);
    // 拾取特效
    const fx = this.add.circle(g.x, g.y, 4, COLORS.GEM_GLOW, 1);
    fx.setDepth(15);
    this.tweens.add({
      targets: fx,
      scale: 3,
      alpha: 0,
      duration: 250,
      onComplete: () => fx.destroy(),
    });
    g.destroy();
  }

  /** 获得经验 */
  private gainXP(amount: number): void {
    this.xp += Math.round(amount * this.stats.xpMul);
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.xpToNext = Math.round(this.xpToNext * 1.35 + 2);
      this.pendingLevelUps++;
    }
    if (this.pendingLevelUps > 0 && !this.paused) {
      this.showUpgradeChoices();
    }
  }

  /** 显示升级三选一 */
  private showUpgradeChoices(): void {
    // 确保旧 overlay 被销毁
    this.upgradeOverlay?.destroy(true);
    this.upgradeOverlay = undefined;

    this.paused = true;
    this.physics.pause();

    const choices = rollUpgrades(this.takenUpgrades, 3);
    if (choices.length === 0) {
      // 没有可选升级，直接恢复
      this.pendingLevelUps--;
      this.paused = false;
      this.physics.resume();
      if (this.pendingLevelUps > 0) this.showUpgradeChoices();
      return;
    }

    const { cx, cy, w, h } = this.getCameraCenter();

    // 半透明遮罩（覆盖相机视野）
    const mask = this.add.rectangle(cx, cy, w, h, 0x000000, 0.7);

    // 标题
    const title = this.add.text(cx, cy - h * 0.32, `境界突破 · 筑基 ${this.level} 层`, {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '36px',
      color: COLOR_STR.GOLD,
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(101);

    const subtitle = this.add.text(cx, cy - h * 0.32 + 44, '三选其一，凝练磁场之道', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '16px',
      color: COLOR_STR.DIM,
    }).setOrigin(0.5).setDepth(101);

    // 三张卡（自适应尺寸）
    const { cardW, cardH, gap } = this.calcCardSize();
    const totalW = cardW * 3 + gap * 2;
    const startX = cx - totalW / 2 + cardW / 2;
    const cardY = cy + h * 0.05;

    const cards: UpgradeChoice[] = choices.map((upg, i) => {
      const x = startX + i * (cardW + gap);
      const card = this.createUpgradeCard(x, cardY, cardW, cardH, upg);
      card.setDepth(101);
      return { upgrade: upg, card };
    });

    this.upgradeOverlay = this.add.container(0, 0, [mask, title, subtitle, ...cards.map(c => c.card)]);
    this.upgradeOverlay.setDepth(100);

    // 卡片点击
    for (const choice of cards) {
      choice.card.on('pointerdown', () => {
        this.selectUpgrade(choice.upgrade);
      });
    }
  }

  /** 创建升级卡 */
  private createUpgradeCard(x: number, y: number, w: number, h: number, upg: Upgrade): Phaser.GameObjects.Container {
    const rarityColor = upg.rarity === 'common' ? 0x90a4ae : upg.rarity === 'rare' ? 0x4dd0e1 : 0xffd54f;
    const rarityLabel = upg.rarity === 'common' ? '凡品' : upg.rarity === 'rare' ? '灵品' : '仙品';

    const bg = this.add.rectangle(0, 0, w, h, COLORS.CARD_BG, 0.95)
      .setStrokeStyle(3, rarityColor, 1);

    // 顶部色条
    const top = this.add.rectangle(0, -h / 2 + 4, w - 6, 6, rarityColor, 1);

    const rarityText = this.add.text(0, -h / 2 + 24, `[ ${rarityLabel} ]`, {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '13px',
      color: '#' + rarityColor.toString(16).padStart(6, '0'),
    }).setOrigin(0.5);

    // 图标（几何图形）
    const iconGfx = this.drawUpgradeIcon(0, -40, upg);

    const nameText = this.add.text(0, 20, upg.name, {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '22px',
      color: COLOR_STR.WHITE,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const descText = this.add.text(0, 60, upg.desc, {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '15px',
      color: COLOR_STR.CYAN,
      align: 'center',
      wordWrap: { width: w - 30 },
    }).setOrigin(0.5);

    // 已叠加次数
    const taken = this.takenUpgrades[upg.id] ?? 0;
    const stackText = taken > 0 ? this.add.text(0, h / 2 - 24, `已修习 ${taken} 次`, {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '12px',
      color: COLOR_STR.DIM,
    }).setOrigin(0.5) : null;

    const children: Phaser.GameObjects.GameObject[] = [bg, top, rarityText, iconGfx, nameText, descText];
    if (stackText) children.push(stackText);

    const c = this.add.container(x, y, children);
    c.setSize(w, h);
    c.setInteractive({ useHandCursor: true });

    // hover
    c.on('pointerover', () => {
      bg.setFillStyle(COLORS.CARD_HOVER, 0.95);
      c.setScale(1.05);
    });
    c.on('pointerout', () => {
      bg.setFillStyle(COLORS.CARD_BG, 0.95);
      c.setScale(1);
    });

    return c;
  }

  /** 绘制升级图标 */
  private drawUpgradeIcon(x: number, y: number, upg: Upgrade): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.1);
    g.fillCircle(x, y, 28);
    g.lineStyle(2, 0xffffff, 0.3);
    g.strokeCircle(x, y, 28);

    // 根据升级类型画不同图标
    g.fillStyle(0xffeb3b, 1);
    if (upg.id.startsWith('dmg')) {
      // 闪电
      g.fillTriangle(x, y - 14, x - 8, y + 2, x + 2, y + 2);
      g.fillTriangle(x + 2, y + 2, x - 4, y + 2, x, y + 14);
    } else if (upg.id.startsWith('spd')) {
      // 三道速度线
      g.fillRect(x - 12, y - 8, 20, 3);
      g.fillRect(x - 8, y - 1, 20, 3);
      g.fillRect(x - 12, y + 6, 20, 3);
    } else if (upg.id.startsWith('proj')) {
      // 三发雷电
      g.fillCircle(x - 10, y, 4);
      g.fillCircle(x, y - 6, 4);
      g.fillCircle(x + 10, y, 4);
    } else if (upg.id.startsWith('pierce')) {
      // 箭头
      g.fillTriangle(x, y - 12, x - 8, y, x + 8, y);
      g.fillRect(x - 3, y, 6, 12);
    } else if (upg.id.startsWith('aura')) {
      // 同心圆
      g.lineStyle(2, 0xb388ff, 1);
      g.strokeCircle(x, y, 14);
      g.strokeCircle(x, y, 9);
      g.strokeCircle(x, y, 4);
    } else if (upg.id.startsWith('hp')) {
      // 心形（用圆+三角近似）
      g.fillCircle(x - 5, y - 3, 6);
      g.fillCircle(x + 5, y - 3, 6);
      g.fillTriangle(x - 10, y - 1, x + 10, y - 1, x, y + 12);
    } else if (upg.id.startsWith('regen')) {
      // 十字
      g.fillRect(x - 3, y - 12, 6, 24);
      g.fillRect(x - 12, y - 3, 24, 6);
    } else if (upg.id.startsWith('move')) {
      // 风纹
      g.lineStyle(3, 0x4dd0e1, 1);
      g.beginPath();
      g.arc(x, y, 12, 0.3, Math.PI - 0.3, false);
      g.strokePath();
      g.beginPath();
      g.arc(x, y, 7, 0.3, Math.PI - 0.3, false);
      g.strokePath();
    } else if (upg.id.startsWith('pickup')) {
      // 磁铁
      g.fillStyle(0xff5252, 1);
      g.fillRect(x - 10, y - 8, 6, 16);
      g.fillRect(x + 4, y - 8, 6, 16);
      g.fillRect(x - 10, y - 8, 20, 4);
    } else if (upg.id.startsWith('xp')) {
      // 灵石菱形
      g.fillStyle(0x26c6da, 1);
      g.fillTriangle(x, y - 12, x + 10, y, x, y + 12);
      g.fillTriangle(x, y - 12, x - 10, y, x, y + 12);
    } else if (upg.id === 'unlock_chain') {
      // 链
      g.lineStyle(3, 0xb388ff, 1);
      g.strokeCircle(x - 8, y, 6);
      g.strokeCircle(x + 8, y, 6);
    } else if (upg.id === 'unlock_storm') {
      // 漩涡
      g.lineStyle(3, 0xb388ff, 1);
      g.beginPath();
      for (let a = 0; a < Math.PI * 3; a += 0.1) {
        const r = a * 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (a === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.strokePath();
    } else if (upg.id === 'unlock_shield') {
      // 盾
      g.fillStyle(0xb388ff, 1);
      g.fillTriangle(x, y - 14, x - 12, y - 6, x - 12, y + 6);
      g.fillTriangle(x, y - 14, x + 12, y - 6, x + 12, y + 6);
      g.fillTriangle(x, y - 14, x - 12, y + 6, x, y + 14);
      g.fillTriangle(x, y - 14, x + 12, y + 6, x, y + 14);
    } else if (upg.id === 'spell_metal') {
      // 金行：金色剑
      g.fillStyle(ELEMENT_COLORS.metal, 1);
      g.fillTriangle(x, y - 14, x - 4, y - 10, x + 8, y + 8);
      g.fillRect(x - 6, y + 6, 6, 8);
    } else if (upg.id === 'spell_wood') {
      // 木行：绿叶
      g.fillStyle(ELEMENT_COLORS.wood, 1);
      g.fillEllipse(x, y, 18, 10);
      g.lineStyle(2, 0x2e7d32, 1);
      g.lineBetween(x - 9, y, x + 9, y);
    } else if (upg.id === 'spell_water') {
      // 水行：水滴
      g.fillStyle(ELEMENT_COLORS.water, 1);
      g.fillTriangle(x, y - 14, x - 8, y + 4, x + 8, y + 4);
      g.fillCircle(x, y + 4, 8);
    } else if (upg.id === 'spell_fire') {
      // 火行：火焰
      g.fillStyle(ELEMENT_COLORS.fire, 1);
      g.fillTriangle(x, y - 14, x - 10, y + 8, x + 10, y + 8);
      g.fillStyle(0xffeb3b, 1);
      g.fillTriangle(x, y - 8, x - 5, y + 6, x + 5, y + 6);
    } else if (upg.id === 'spell_earth') {
      // 土行：石块
      g.fillStyle(ELEMENT_COLORS.earth, 1);
      g.fillCircle(x - 4, y - 2, 6);
      g.fillCircle(x + 5, y + 2, 7);
      g.fillCircle(x - 2, y + 6, 5);
    }
    return g;
  }

  /** 选择升级 */
  private selectUpgrade(upg: Upgrade): void {
    applyUpgrade(this.stats, upg);
    this.takenUpgrades[upg.id] = (this.takenUpgrades[upg.id] ?? 0) + 1;
    this.player.onUpgrade();

    // 销毁升级 UI
    this.upgradeOverlay?.destroy(true);
    this.upgradeOverlay = undefined;
    this.pendingLevelUps--;

    if (this.pendingLevelUps > 0) {
      // 继续下一个升级
      this.showUpgradeChoices();
    } else {
      this.paused = false;
      this.physics.resume();
    }
  }

  /** 获取玩家当前 debuff 列表 */
  private getPlayerDebuffs(): { name: string; time: number }[] {
    const debuffs: { name: string; time: number }[] = [];
    if (this.player.healBlockTimer > 0) debuffs.push({ name: '禁疗', time: this.player.healBlockTimer });
    if (this.player.poisonTimer > 0) debuffs.push({ name: '中毒', time: this.player.poisonTimer });
    if (this.player.burnTimer > 0) debuffs.push({ name: '燃烧', time: this.player.burnTimer });
    if (this.player.slowTimer > 0) debuffs.push({ name: '减速', time: this.player.slowTimer });
    if (DebuffSystem.hasDebuff(this.player.debuffContainer, 'tear')) {
      const db = this.player.debuffContainer.debuffs.find(d => d.type === 'tear');
      if (db) debuffs.push({ name: '撕裂', time: db.remaining });
    }
    if (DebuffSystem.hasDebuff(this.player.debuffContainer, 'stun')) {
      const db = this.player.debuffContainer.debuffs.find(d => d.type === 'stun');
      if (db) debuffs.push({ name: '眩晕', time: db.remaining });
    }
    if (DebuffSystem.hasDebuff(this.player.debuffContainer, 'weaken')) {
      const db = this.player.debuffContainer.debuffs.find(d => d.type === 'weaken');
      if (db) debuffs.push({ name: '衰弱', time: db.remaining });
    }
    return debuffs;
  }

  /** 获取相机视野中心（世界坐标），用于 UI 定位 */
  private getCameraCenter(): { cx: number; cy: number; w: number; h: number } {
    const cam = this.cameras.main;
    return {
      cx: cam.scrollX + cam.width / 2,
      cy: cam.scrollY + cam.height / 2,
      w: cam.width,
      h: cam.height,
    };
  }

  /** 切换暂停 */
  private togglePause(): void {
    // 有升级/商店/天劫奖励overlay时不响应ESC暂停
    if (this.gameOver || this.upgradeOverlay) return;
    // 天劫奖励或商店面板打开时不响应
    if (this.paused && !this.pauseOverlay) return;
    this.paused = !this.paused;
    if (this.paused) {
      this.physics.pause();
      this.showPauseOverlay();
    } else {
      this.physics.resume();
      this.pauseOverlay?.destroy(true);
      this.pauseOverlay = undefined;
    }
  }

  private showPauseOverlay(): void {
    const { cx, cy, w, h } = this.getCameraCenter();
    const mask = this.add.rectangle(cx, cy, w, h, 0x000000, 0.6);
    const text = this.add.text(cx, cy, '暂  停', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '48px',
      color: COLOR_STR.WHITE,
      fontStyle: 'bold',
    }).setOrigin(0.5);
    const hint = this.add.text(cx, cy + 50, '按 ESC 继续', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '16px',
      color: COLOR_STR.DIM,
    }).setOrigin(0.5);
    this.pauseOverlay = this.add.container(0, 0, [mask, text, hint]);
    this.pauseOverlay.setDepth(200);
  }

  /** 入场提示 */
  private showIntro(): void {
    const { cx, cy } = this.getCameraCenter();
    const text = this.add.text(cx, cy - 80, '群山之中，妖兽来袭……', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '28px',
      color: COLOR_STR.CYAN,
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0).setDepth(150);

    this.tweens.add({
      targets: text,
      alpha: 1,
      duration: 500,
      yoyo: true,
      hold: 1000,
      onComplete: () => text.destroy(),
    });
  }

  /** 玩家死亡 */
  private onPlayerDeath(): void {
    if (this.gameOver) return;
    this.gameOver = true;
    this.paused = true;
    this.physics.pause();

    // 死亡特效
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * 60 + 10;
      const fx = this.add.circle(this.player.x, this.player.y, 5, 0xff5252, 1);
      fx.setDepth(50);
      this.tweens.add({
        targets: fx,
        x: this.player.x + Math.cos(a) * d,
        y: this.player.y + Math.sin(a) * d,
        alpha: 0,
        scale: 0.2,
        duration: 800,
        onComplete: () => fx.destroy(),
      });
    }
    this.cameras.main.shake(500, 0.02);

    // 保存元进度
    SaveSystem.addStats({ totalKills: this.kills, totalRuns: 1, totalGems: this.gemsCollected });
    SaveSystem.updateBest(this.level, this.elapsed);

    // 延迟跳转结算
    this.time.delayedCall(1200, () => {
      this.scene.stop('UI');
      this.scene.start('GameOver', {
        level: this.level,
        kills: this.kills,
        time: this.elapsed,
        gems: this.gemsCollected,
      });
    });
  }

  /** 获取相机视野范围（用于敌人生成） */
  private getCameraView(): { x: number; y: number; w: number; h: number } {
    const cam = this.cameras.main;
    return { x: cam.scrollX, y: cam.scrollY, w: cam.width, h: cam.height };
  }

  /** 在相机视野外缘生成坐标 */
  private spawnPosAtEdge(): { x: number; y: number } {
    const view = this.getCameraView();
    const margin = 40;
    const side = Math.floor(Math.random() * 4);
    let x = 0, y = 0;
    switch (side) {
      case 0: x = view.x + Math.random() * view.w; y = view.y - margin; break;
      case 1: x = view.x + view.w + margin; y = view.y + Math.random() * view.h; break;
      case 2: x = view.x + Math.random() * view.w; y = view.y + view.h + margin; break;
      case 3: x = view.x - margin; y = view.y + Math.random() * view.h; break;
    }
    // 限制在世界范围内
    x = Phaser.Math.Clamp(x, 20, WORLD_W - 20);
    y = Phaser.Math.Clamp(y, 20, WORLD_H - 20);
    return { x, y };
  }

  /** 生成敌人 */
  private spawnEnemy(): void {
    const pos = this.spawnPosAtEdge();

    // 根据时间决定敌人类型权重（难度曲线放缓）
    const t = this.elapsed;
    const roll = Math.random();
    let kind: EnemyKind;
    const hpScale = 1 + t / 180;  // 每 180 秒血量翻倍（移速增长系数减半，放缓难度）

    if (t < 25) {
      kind = roll < 0.7 ? 'rabbit' : 'bat';
    } else if (t < 55) {
      if (roll < 0.4) kind = 'rabbit';
      else if (roll < 0.7) kind = 'bat';
      else if (roll < 0.9) kind = 'wolf';
      else kind = 'snake';
    } else {
      if (roll < 0.25) kind = 'rabbit';
      else if (roll < 0.45) kind = 'bat';
      else if (roll < 0.75) kind = 'wolf';
      else kind = 'snake';
    }

    const enemy = new Enemy(this, pos.x, pos.y, kind, hpScale);
    enemy.magicDesolation = this.magicDesolation;
    this.enemies.add(enemy);
  }

  /** 生成门派弟子（精英怪） */
  private spawnDisciple(): void {
    const pos = this.spawnPosAtEdge();
    // 弟子难度随时间增长（比妖兽更慢的增速，但基础更强）
    const hpScale = 1 + this.elapsed / 100;
    const disciple = new Disciple(this, pos.x, pos.y, hpScale);
    disciple.magicDesolation = this.magicDesolation;
    this.disciples.add(disciple);
  }

  /** 生成商店（随机地点，距玩家适中） */
  private spawnShop(): void {
    // 在玩家周围 300~600 像素范围生成
    const angle = Math.random() * Math.PI * 2;
    const dist = 300 + Math.random() * 300;
    let x = this.player.x + Math.cos(angle) * dist;
    let y = this.player.y + Math.sin(angle) * dist;
    x = Phaser.Math.Clamp(x, 80, WORLD_W - 80);
    y = Phaser.Math.Clamp(y, 80, WORLD_H - 80);
    const shop = new Shop(this, x, y);
    this.shops.add(shop);

    // 商店出现提示（用相机中心）
    const { cx, cy } = this.getCameraCenter();
    const text = this.add.text(cx, cy - 100, '坊市现世', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '24px',
      color: '#ffd54f',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0).setDepth(150);
    this.tweens.add({
      targets: text,
      alpha: 1,
      duration: 300,
      yoyo: true,
      hold: 1200,
      onComplete: () => text.destroy(),
    });
  }

  /** 打开商店 */
  private openShop(shop: Shop): void {
    if (this.paused || this.gameOver) return;
    if (this.shopTipCooldown > 0) return;

    const { cx, cy, w, h } = this.getCameraCenter();

    if (this.kills < this.shopCost) {
      this.shopTipCooldown = 3;
      const tip = this.add.text(cx, cy, `击杀数不足！需要 ${this.shopCost}，当前 ${this.kills}`, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '20px',
        color: '#ff5252',
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 4,
      }).setOrigin(0.5).setAlpha(0).setDepth(150);
      this.tweens.add({ targets: tip, alpha: 1, duration: 200, yoyo: true, hold: 1200, onComplete: () => tip.destroy() });
      return;
    }

    this.paused = true;
    this.physics.pause();

    const mask = this.add.rectangle(cx, cy, w, h, 0x000000, 0.8);
    const title = this.add.text(cx, cy - h * 0.35, '坊  市', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '32px',
      color: '#ffd54f',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 5,
    }).setOrigin(0.5).setDepth(101);

    const subtitle = this.add.text(cx, cy - h * 0.35 + 40, `击杀数：${this.kills}（购买消耗 ${this.shopCost}）`, {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '14px',
      color: '#b0bec5',
    }).setOrigin(0.5).setDepth(101);

    const available = SHOP_SPELL_POOL.filter(u => {
      const takenCount = this.takenUpgrades[u.id] ?? 0;
      return takenCount < u.maxStacks;
    });
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    const choices = shuffled.slice(0, 3);

    const { cardW, cardH, gap } = this.calcCardSize();
    const totalW = cardW * 3 + gap * 2;
    const startX = cx - totalW / 2 + cardW / 2;
    const cardY = cy;

    const cards: UpgradeChoice[] = choices.map((upg, i) => {
      const x = startX + i * (cardW + gap);
      const card = this.createUpgradeCard(x, cardY, cardW, cardH, upg);
      card.setDepth(101);
      return { upgrade: upg, card };
    });

    // 购买提示文字（浮动）
    const purchaseTip = this.add.text(cx, cy + cardH / 2 + 30, '', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '16px',
      color: '#ff5252',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0).setDepth(102);

    // 离开按钮（底部居中，显眼）
    const closeBtn = this.add.text(cx, cy + h * 0.35, '✕ 离开坊市', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '20px',
      color: '#ff5252',
      fontStyle: 'bold',
      backgroundColor: '#37474f',
      padding: { x: 20, y: 8 },
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(102).setInteractive({ useHandCursor: true });

    // 刷新按钮（离开按钮上方居中）
    const refreshBtn = this.add.text(cx, cy + h * 0.35 - 40, `↻ 刷新商品 (${this.shopCost})`, {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '16px',
      color: '#4dd0e1',
      fontStyle: 'bold',
      backgroundColor: '#37474f',
      padding: { x: 12, y: 6 },
      stroke: '#000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(102).setInteractive({ useHandCursor: true });

    this.upgradeOverlay = this.add.container(0, 0, [mask, title, subtitle, ...cards.map(c => c.card), closeBtn, refreshBtn, purchaseTip]);
    this.upgradeOverlay.setDepth(100);

    // 显示购买提示
    const showPurchaseTip = (msg: string) => {
      purchaseTip.setText(msg);
      purchaseTip.setAlpha(1);
      this.tweens.add({ targets: purchaseTip, alpha: 0, duration: 1500, hold: 500 });
    };

    // 卡片购买逻辑
    const bindCardClick = (choice: UpgradeChoice) => {
      choice.card.on('pointerdown', () => {
        if (this.kills >= this.shopCost) {
          this.kills -= this.shopCost;
          this.shopCost = Math.min(2000, Math.ceil(this.shopCost * 1.5));  // 上限2000
          this.selectShopUpgrade(choice.upgrade);
          shop.used = true;
          shop.destroy();
        } else {
          showPurchaseTip(`击杀数不足！需要 ${this.shopCost}，当前 ${this.kills}`);
        }
      });
    };
    for (const choice of cards) bindCardClick(choice);

    // 刷新商品
    refreshBtn.on('pointerdown', () => {
      if (this.kills < this.shopCost) {
        showPurchaseTip(`刷新需要 ${this.shopCost} 击杀数！`);
        return;
      }
      this.kills -= this.shopCost;
      for (const c of cards) c.card.destroy(true);
      cards.length = 0;
      const newAvailable = SHOP_SPELL_POOL.filter(u => {
        const takenCount = this.takenUpgrades[u.id] ?? 0;
        return takenCount < u.maxStacks;
      });
      const newShuffled = [...newAvailable].sort(() => Math.random() - 0.5);
      const newChoices = newShuffled.slice(0, 3);
      for (const upg of newChoices) {
        const i = cards.length;
        const x = startX + i * (cardW + gap);
        const card = this.createUpgradeCard(x, cardY, cardW, cardH, upg);
        card.setDepth(101);
        const newChoice = { upgrade: upg, card };
        bindCardClick(newChoice);
        cards.push(newChoice);
        this.upgradeOverlay!.add(card);
      }
      refreshBtn.setText(`↻ 刷新商品 (${this.shopCost})`);
    });

    const closeShop = () => {
      this.upgradeOverlay?.destroy(true);
      this.upgradeOverlay = undefined;
      this.paused = false;
      this.physics.resume();
      this.input.keyboard?.off('keydown-ESC', closeShop);
    };
    closeBtn.on('pointerdown', closeShop);
    this.input.keyboard?.once('keydown-ESC', closeShop);
  }

  /** 选择商店法术 */
  private selectShopUpgrade(upg: Upgrade): void {
    applyUpgrade(this.stats, upg);
    this.takenUpgrades[upg.id] = (this.takenUpgrades[upg.id] ?? 0) + 1;
    this.player.onUpgrade();

    this.upgradeOverlay?.destroy(true);
    this.upgradeOverlay = undefined;
    this.paused = false;
    this.physics.resume();
  }

  /** 生成 boss（妖兽统领，保留原逻辑） */
  private spawnBoss(): void {
    const pos = this.spawnPosAtEdge();
    const boss = new Enemy(this, pos.x, pos.y, 'boss', 1 + this.elapsed / 120);
    this.enemies.add(boss);
    this.currentBoss = boss;
    this.bossSpawned = true;
    this.events.emit('boss-spawn');

    // boss 入场提示（跟随相机）
    const cam = this.cameras.main;
    const text = this.add.text(cam.scrollX + cam.width / 2, cam.scrollY + cam.height / 2 - 100, '⚠ 妖兽统领降临 ⚠', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '32px',
      color: '#ff5252',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 5,
    }).setOrigin(0.5).setAlpha(0).setDepth(150);
    this.tweens.add({
      targets: text,
      alpha: 1,
      duration: 400,
      yoyo: true,
      hold: 1500,
      onComplete: () => text.destroy(),
    });
  }

  /** 触发天劫：神使降临 */
  /** 触发天劫：神使降临（按金木水火土顺序，每次天劫一个） */
  private spawnEnvoy(): void {
    // 按已击败数量选五行：0=金, 1=木, 2=水, 3=火, 4=土
    const order: Element[] = ['metal', 'wood', 'water', 'fire', 'earth'];
    const element = order[this.envoyRoundKills % 5];
    // 难度随时间增长（每50秒全属性+20%）
    const timeScale = 1 + Math.floor(this.elapsed / 50) * 0.2;
    const hpScale = timeScale * (1 + this.tribulationCount * 0.1);
    const cam = this.cameras.main;
    const x = Phaser.Math.Clamp(this.player.x + (Math.random() - 0.5) * 200, 50, WORLD_W - 50);
    const y = Phaser.Math.Clamp(cam.scrollY - 60, 50, WORLD_H - 50);

    const envoy = new Envoy(this, x, y, element, hpScale);
    // 应用时间缩放到伤害
    envoy.damage = Math.round(envoy.damage * timeScale);
    // 每60秒额外增加300生命
    const bonusHp = Math.floor(this.elapsed / 60) * 300;
    envoy.maxHp = Math.round(envoy.maxHp + bonusHp);
    envoy.hp = envoy.maxHp;
    // 每击败一个神使，所有敌人+3防御（当前神使也加）
    envoy.defense.defense += this.envoyRoundKills * 3;
    envoy.magicDesolation = this.magicDesolation;
    this.envoys.add(envoy);
    this.currentEnvoy = envoy;
    this.tribulationActive = true;
    this.tribulationCount++;

    // 屏幕封锁
    this.createTribulationWalls(800);  // 神使限制框800x800

    // 神使入场提示
    const { cx, cy } = this.getCameraCenter();
    const elemColorStr = '#' + ELEMENT_COLORS[element].toString(16).padStart(6, '0');
    const titleText = this.add.text(cx, cy - 60,
      `⚡ 天劫降临 · ${ELEMENT_NAMES[element]}行神使 ⚡`, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '36px',
        color: elemColorStr,
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 6,
      }).setOrigin(0.5).setAlpha(0).setDepth(150);
    const nameText = this.add.text(cx, cy,
      envoy.name, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '24px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 4,
      }).setOrigin(0.5).setAlpha(0).setDepth(150);
    this.tweens.add({ targets: titleText, alpha: 1, duration: 400, yoyo: true, hold: 1800, onComplete: () => titleText.destroy() });
    this.tweens.add({ targets: nameText, alpha: 1, duration: 400, yoyo: true, hold: 1800, onComplete: () => nameText.destroy() });

    this.events.emit('envoy-spawn', { name: envoy.name, hp: envoy.hp, maxHp: envoy.maxHp, element });
    this.cameras.main.shake(400, 0.015);
  }

  /** 召唤神之手（5神使一轮后） */
  private spawnGodHand(): void {
    const cam = this.cameras.main;
    const x = Phaser.Math.Clamp(this.player.x, 100, WORLD_W - 100);
    const y = Phaser.Math.Clamp(cam.scrollY + 100, 100, WORLD_H - 100);
    // 神之手血量 = 土行神使(1800) × 2 × 时间缩放
    const timeScale = 1 + Math.floor(this.elapsed / 50) * 0.2;
    const hp = Math.min(20000, Math.round(900 * 2 * timeScale * (1 + this.tribulationCount * 0.1)));  // 上限20000
    this.godHand = new GodHand(this, x, y, hp);
    this.godHand.magicDesolation = this.magicDesolation;
    // 应用时间缩放到伤害
    this.godHand.damage = Math.round(this.godHand.damage * timeScale);
    this.tribulationActive = true;
    this.createTribulationWalls(1500);  // 神之手限制框1500x1500

    // 神之手入场提示
    const { cx, cy } = this.getCameraCenter();
    const titleText = this.add.text(cx, cy - 80,
      '⚡⚡ 神之手降临 ⚡⚡', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '42px',
        color: '#ff5252',
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 7,
      }).setOrigin(0.5).setAlpha(0).setDepth(150);
    const nameText = this.add.text(cx, cy - 20,
      '五行齐发，天劫终章', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '22px',
        color: '#ffd54f',
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 4,
      }).setOrigin(0.5).setAlpha(0).setDepth(150);
    this.tweens.add({ targets: titleText, alpha: 1, duration: 500, yoyo: true, hold: 2000, onComplete: () => titleText.destroy() });
    this.tweens.add({ targets: nameText, alpha: 1, duration: 500, yoyo: true, hold: 2000, onComplete: () => nameText.destroy() });

    this.events.emit('envoy-spawn', { name: '神之手', hp: this.godHand.hp, maxHp: this.godHand.maxHp, element: 'none' as Element });
    this.cameras.main.shake(600, 0.02);
  }

  /** 创建天劫封锁墙（视觉 + 物理边界） */
  /** 创建天劫封锁墙（以主角为中心的固定大小） */
  private createTribulationWalls(size: number = 800): void {
    // 清理旧墙
    for (const w of this.tribulationWalls) w.destroy();
    this.tribulationWalls = [];

    // 以主角为中心的固定大小限制框
    const half = size / 2;
    const x1 = this.player.x - half;
    const y1 = this.player.y - half;
    const x2 = this.player.x + half;
    const y2 = this.player.y + half;

    const wallColor = 0xff5252;
    const g = this.add.graphics();
    g.setDepth(60);
    g.lineStyle(6, wallColor, 0.9);
    g.fillStyle(wallColor, 0.15);
    // 四面墙
    g.fillRect(x1 - 10, y1 - 30, size + 20, 30);  // 上
    g.fillRect(x1 - 10, y2, size + 20, 30);        // 下
    g.fillRect(x1 - 30, y1 - 10, 30, size + 20);   // 左
    g.fillRect(x2, y1 - 10, 30, size + 20);         // 右
    // 边线发光
    g.lineStyle(4, 0xffffff, 0.8);
    g.strokeRect(x1, y1, size, size);
    this.tribulationWalls.push(g);

    // 设置玩家物理边界
    this.physics.world.setBounds(x1, y1, size, size);
  }

  /** 天劫结束：解除封锁 */
  private endTribulation(): void {
    this.tribulationActive = false;
    this.currentEnvoy = null;
    // 清理墙
    for (const w of this.tribulationWalls) w.destroy();
    this.tribulationWalls = [];
    // 恢复世界边界
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    // 重置天劫倒计时
    this.tribulationTimer = this.getTribulationInterval();
    // 隐藏神使血条
    this.events.emit('envoy-dead');
  }

  update(time: number, delta: number): void {
    if (this.paused || this.gameOver) return;
    const dt = delta / 1000;
    this.elapsed += dt;

    // 输入
    let mx = 0, my = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) mx -= 1;
    if (this.cursors.right.isDown || this.wasd.D.isDown) mx += 1;
    if (this.cursors.up.isDown || this.wasd.W.isDown) my -= 1;
    if (this.cursors.down.isDown || this.wasd.S.isDown) my += 1;
    // 摇杆输入叠加
    if (this.joystick.isEnabled()) {
      mx += this.joystick.vx;
      my += this.joystick.vy;
    }

    // 找最近敌人（含妖兽、弟子、神使、老祖、神之手）
    let nearest: Phaser.Math.Vector2 | null = null;
    let nearestDist = Infinity;
    const enemies = this.enemies.getChildren() as Enemy[];
    const disciples = this.disciples.getChildren() as Disciple[];
    const envoys = this.envoys.getChildren() as Envoy[];
    const ancestors = this.ancestors.getChildren() as Ancestor[];
    for (const e of enemies) {
      const d = Phaser.Math.Distance.Squared(this.player.x, this.player.y, e.x, e.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = new Phaser.Math.Vector2(e.x, e.y);
      }
    }
    for (const d of disciples) {
      const dd = Phaser.Math.Distance.Squared(this.player.x, this.player.y, d.x, d.y);
      if (dd < nearestDist) {
        nearestDist = dd;
        nearest = new Phaser.Math.Vector2(d.x, d.y);
      }
    }
    for (const en of envoys) {
      const dd = Phaser.Math.Distance.Squared(this.player.x, this.player.y, en.x, en.y);
      if (dd < nearestDist) {
        nearestDist = dd;
        nearest = new Phaser.Math.Vector2(en.x, en.y);
      }
    }
    for (const a of ancestors) {
      const dd = Phaser.Math.Distance.Squared(this.player.x, this.player.y, a.x, a.y);
      if (dd < nearestDist) {
        nearestDist = dd;
        nearest = new Phaser.Math.Vector2(a.x, a.y);
      }
    }
    if (this.godHand) {
      const dd = Phaser.Math.Distance.Squared(this.player.x, this.player.y, this.godHand.x, this.godHand.y);
      if (dd < nearestDist) {
        nearestDist = dd;
        nearest = new Phaser.Math.Vector2(this.godHand.x, this.godHand.y);
      }
    }

    // 更新玩家
    this.player.update(dt, mx, my, nearest);

    // 更新敌人
    for (const e of enemies) {
      e.update(dt, this.player.x, this.player.y);
    }
    // 更新弟子
    for (const d of disciples) {
      d.update(dt, this.player.x, this.player.y);
    }
    // 更新神使
    for (const en of envoys) {
      en.update(dt, this.player.x, this.player.y);
    }

    // 死亡清理：中毒/燃烧等持续伤害致死的情况
    for (const e of enemies) {
      if (e.isDead) this.onEnemyDeath(e);
    }
    for (const d of disciples) {
      if (d.isDead) this.onDiscipleDeath(d);
    }
    if (this.currentEnvoy && this.currentEnvoy.isDead) {
      this.onEnvoyDeath();
    }
    // 老祖更新和死亡检测
    const ancestorList = this.ancestors.getChildren() as Ancestor[];
    for (const a of ancestorList) {
      a.update(dt, this.player.x, this.player.y);
      if (a.isDead) this.onAncestorDeath(a);
    }
    // 神之手更新和死亡检测
    if (this.godHand) {
      this.godHand.update(dt, this.player.x, this.player.y);
      if (this.godHand.isDead) {
        this.onGodHandDeath();
      } else {
        // 更新神之手血条
        this.events.emit('envoy-update', { hp: this.godHand.hp, maxHp: this.godHand.maxHp });
        // 巨石碰撞玩家
        const rockPositions = this.godHand.getRockPositions();
        for (const rp of rockPositions) {
          const d = Phaser.Math.Distance.Between(rp.x, rp.y, this.player.x, this.player.y);
          if (d < 20) {
            this.player.takeDamage(this.godHand.damage * 0.5);
          }
        }
        // 手动检测投射物命中神之手
        const gh = this.godHand;
        const allProjs = [
          ...this.projectiles.getChildren() as Projectile[],
          ...this.spellProjectiles.getChildren() as SpellProjectile[],
        ];
        for (const p of allProjs) {
          if (!(p as any).active) continue;
          if ((p as any).fromEnemy) continue;
          const d = Phaser.Math.Distance.Between(p.x, p.y, gh.x, gh.y);
          if (d < gh.radius) {
            if (p instanceof SpellProjectile) {
              p.onHit(gh as any);
              gh.setAttackElement(p.element);
              gh.takeDamage(p.damage);
              this.onEnemyHit(gh as any, ELEMENT_COLORS[p.element]);
            } else {
              (p as Projectile).onHit(gh as any, []);
              gh.setAttackElement('none');
              gh.takeDamage((p as Projectile).damage);
              this.onEnemyHit(gh as any, 0xffeb3b);
            }
          }
        }
      }
    }

    // 法宝稀有特效触发
    this.updateTreasureSpecials(dt);

    // 法宝自动合成检查（每3秒）
    this.synthesisTimer -= dt;
    if (this.synthesisTimer <= 0) {
      this.synthesisTimer = 3;
      this.checkAutoSynthesis();
    }

    // 法宝移速/防御属性应用（每帧更新）
    this.applyTreasurePassiveStats();

    // 先天灵宝更新
    this.updateSpiritTreasures(dt);

    // 木行游龙更新
    if ((this as any).woodDragons) {
      const dragons = (this as any).woodDragons as WoodDragon[];
      for (let i = dragons.length - 1; i >= 0; i--) {
        const d = dragons[i];
        if (d.isDead) {
          d.destroy();
          dragons.splice(i, 1);
          continue;
        }
        if (this.godHand) d.updateHome(this.godHand.x, this.godHand.y);
        d.update(dt, this.player.x, this.player.y);
        // 冲撞碰撞
        const dist = Phaser.Math.Distance.Between(d.x, d.y, this.player.x, this.player.y);
        if (dist < 20 && !d.hitPlayer) {
          this.player.takeDamage(d.damage);
          d.hitPlayer = true;
        }
        // 玩家投射物 vs 游龙
        const allProjs = [
          ...this.projectiles.getChildren() as Projectile[],
          ...this.spellProjectiles.getChildren() as SpellProjectile[],
        ];
        for (const p of allProjs) {
          if (!(p as any).active) continue;
          if ((p as any).fromEnemy) continue;
          const pd = Phaser.Math.Distance.Between(p.x, p.y, d.x, d.y);
          if (pd < 16) {
            if (p instanceof SpellProjectile) {
              // 木行和土行免疫
              if (p.element === 'wood' || p.element === 'earth') continue;
              p.onHit(d as any);
              const mul = elementMultiplier(p.element, 'wood');
              const dead = d.takeDamage(p.damage * mul);
              if (dead) { d.isDead = true; break; }
            } else {
              (p as Projectile).onHit(d as any, []);
              const dead = d.takeDamage((p as Projectile).damage);
              if (dead) { d.isDead = true; break; }
            }
          }
        }
      }
    }

    // 商店提示冷却
    if (this.shopTipCooldown > 0) this.shopTipCooldown -= dt;

    // 更新投射物（出界判断改用相机视野 + 边距）
    const cam = this.cameras.main;
    const outMinX = cam.scrollX - 60, outMaxX = cam.scrollX + cam.width + 60;
    const outMinY = cam.scrollY - 60, outMaxY = cam.scrollY + cam.height + 60;
    const projs = this.projectiles.getChildren() as Projectile[];
    for (const p of projs) {
      p.update(dt, enemies);
      if (p.active && (p.x < outMinX || p.x > outMaxX || p.y < outMinY || p.y > outMaxY)) {
        p.destroy();
      }
    }

    // 更新五行法术投射物
    const spellProjs = this.spellProjectiles.getChildren() as SpellProjectile[];
    for (const p of spellProjs) {
      p.update(dt);
      if (p.active && (p.x < outMinX || p.x > outMaxX || p.y < outMinY || p.y > outMaxY)) {
        p.destroy();
      }
    }

    // 更新土墙 + 抵挡敌方投射物
    const walls = this.earthWalls.getChildren() as EarthWall[];
    for (const w of walls) {
      w.update(dt);
      // 检测敌方投射物碰撞
      if (w.blockCharges > 0) {
        const spellProjs = this.spellProjectiles.getChildren() as SpellProjectile[];
        for (const p of spellProjs) {
          if (!(p as any).fromEnemy) continue;
          if (!p.active) continue;
          const d = Phaser.Math.Distance.Between(w.x, w.y, p.x, p.y);
          if (d < 24) {
            // 抵挡特效
            const fx = this.add.circle(p.x, p.y, 6, 0xa1887f, 0.8);
            fx.setDepth(16);
            this.tweens.add({ targets: fx, scale: 2, alpha: 0, duration: 300, onComplete: () => fx.destroy() });
            p.destroy();
            w.blockCharges--;
            break;
          }
        }
      }
    }

    // 更新商店
    const shops = this.shops.getChildren() as Shop[];
    for (const s of shops) {
      s.update(dt);
    }

    // 更新火焰漩涡
    const vortices = this.fireVortices.getChildren() as FireVortex[];
    const allEnemiesForVortex = [
      ...enemies, ...disciples, ...envoys,
    ] as any[];
    for (const v of vortices) {
      v.update(dt);
      v.applyEffect(allEnemiesForVortex, dt);
    }

    // 更新灵石
    const gems = this.gems.getChildren() as XPGem[];
    for (const g of gems) {
      g.update(dt, this.player.x, this.player.y, this.stats.pickupRange);
    }

    // 磁场领域持续伤害（对妖兽、弟子、神使都生效）
    const auraDmg = this.stats.auraDamage * dt;
    if (auraDmg > 0) {
      for (const e of enemies) {
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
        if (d < this.stats.auraRange) {
          const dead = e.takeDamage(auraDmg);
          if (dead) this.onEnemyDeath(e);
        }
      }
      for (const d of disciples) {
        const dd = Phaser.Math.Distance.Between(this.player.x, this.player.y, d.x, d.y);
        if (dd < this.stats.auraRange) {
          const dead = d.takeDamage(auraDmg);
          if (dead) this.onDiscipleDeath(d);
        }
      }
      for (const en of envoys) {
        const dd = Phaser.Math.Distance.Between(this.player.x, this.player.y, en.x, en.y);
        if (dd < this.stats.auraRange) {
          const dead = en.takeDamage(auraDmg, true);
          if (dead) this.onEnvoyDeath();
        }
      }
    }

    // ===== 敌人生成（天劫期间/最终阶段停止普通生成） =====
    if (!this.tribulationActive && this.finalPhase !== 'countdown' && this.finalPhase !== 'finalBattle') {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        // 生成间隔随时间缩短（放缓：原 60s 下限，改 90s）
        const interval = Math.max(0.4, 1.8 - this.elapsed / 90);
        this.spawnTimer = interval;
        // 一次生成数量（放缓：原 30s +1，改 40s +1）
        const count = 1 + Math.floor(this.elapsed / 40);
        for (let i = 0; i < count; i++) {
          this.spawnEnemy();
        }
      }

      // 弟子生成（每 12~18 秒一个，天劫期间不生成）
      this.discipleTimer -= dt;
      if (this.discipleTimer <= 0) {
        this.discipleTimer = 12 + Math.random() * 6;
        this.spawnDisciple();
      }

      // boss 生成（每 90 秒，天劫期间不生成）
      this.bossTimer += dt;
      if (this.bossTimer >= 90 && !this.bossSpawned) {
        this.bossTimer = 0;
        this.spawnBoss();
      }

      // 商店生成（每 20 秒，天劫期间不生成）
      this.shopTimer -= dt;
      if (this.shopTimer <= 0) {
        this.shopTimer = 20;
        this.spawnShop();
      }
    }

    // ===== 最终阶段处理 =====
    if (this.finalPhase === 'countdown') {
      this.finalCountdown -= dt;
      if (this.finalCountdown <= 0) {
        this.finalPhase = 'finalBattle';
        // 5个神使一起降临
        const elements: Element[] = ['metal', 'wood', 'water', 'fire', 'earth'];
        for (const el of elements) {
          const timeScale = 1 + Math.floor(this.elapsed / 50) * 0.2;
          const hpScale = timeScale * (1 + this.tribulationCount * 0.1);
          const cam = this.cameras.main;
          const x = Phaser.Math.Clamp(this.player.x + (Math.random() - 0.5) * 400, 50, WORLD_W - 50);
          const y = Phaser.Math.Clamp(cam.scrollY - 60, 50, WORLD_H - 50);
          const envoy = new Envoy(this, x, y, el, hpScale);
          envoy.damage = Math.round(envoy.damage * timeScale);
          const bonusHp = Math.floor(this.elapsed / 60) * 800;
          envoy.maxHp = Math.round(envoy.maxHp + bonusHp);
          envoy.hp = envoy.maxHp;
          envoy.defense.defense += this.envoyRoundKills * 3;
          envoy.magicDesolation = this.magicDesolation;
          this.envoys.add(envoy);
        }
        // 同时生成第三个神之手
        this.time.delayedCall(2000, () => {
          if (this.finalPhase === 'finalBattle') {
            const timeScale = 1 + Math.floor(this.elapsed / 50) * 0.2;
            const hp = Math.min(20000, Math.round(900 * 2 * timeScale * (1 + this.tribulationCount * 0.1)));  // 上限20000
            const cam = this.cameras.main;
            const x = Phaser.Math.Clamp(this.player.x, 100, WORLD_W - 100);
            const y = Phaser.Math.Clamp(cam.scrollY + 100, 100, WORLD_H - 100);
            this.godHand = new GodHand(this, x, y, hp);
            this.godHand.magicDesolation = this.magicDesolation;
            this.godHand.damage = Math.round(this.godHand.damage * timeScale);
            this.godHand.elementReduction = 0.80;
            this.tribulationActive = true;
            this.createTribulationWalls(1500);
          }
        });
      }
    }

    // ===== 天劫系统（最终阶段停止天劫）=====
    if (this.finalPhase === 'none' || this.finalPhase === 'countdown') {
      if (!this.tribulationActive) {
        this.tribulationTimer -= dt;
        if (this.tribulationTimer <= 0 && this.finalPhase === 'none') {
          if (this.envoyRoundKills >= 5) {
            this.spawnGodHand();
          } else {
            this.spawnEnvoy();
          }
        }
      } else {
        if (this.currentEnvoy && !this.currentEnvoy.active) {
          this.onEnvoyDeath();
        } else if (this.currentEnvoy) {
          this.events.emit('envoy-update', { hp: this.currentEnvoy.hp, maxHp: this.currentEnvoy.maxHp });
        }
      }
    }

    // 同步 UI 数据
    this.events.emit('ui-update', {
      hp: this.player.hp,
      maxHp: this.stats.maxHp,
      level: this.level,
      xp: this.xp,
      xpToNext: this.xpToNext,
      time: this.elapsed,
      kills: this.kills,
      boss: this.currentBoss ? { hp: this.currentBoss.hp, maxHp: this.currentBoss.maxHp } : null,
      spells: this.stats.spells.map(s => ({ id: s.id, element: s.element, name: s.name })),
      debuffs: this.getPlayerDebuffs(),
      tribulation: {
        active: this.tribulationActive,
        timer: Math.max(0, this.tribulationTimer),
        count: this.tribulationCount,
        envoy: this.currentEnvoy ? {
          hp: this.currentEnvoy.hp,
          maxHp: this.currentEnvoy.maxHp,
          name: this.currentEnvoy.name,
          element: this.currentEnvoy.element,
        } : null,
      },
    });
  }
}

// 引入颜色字符串（用于升级卡）
import { COLOR_STR } from '../utils/colors';
