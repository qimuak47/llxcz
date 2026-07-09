/**
 * 图鉴场景 - 独立模块，查看所有敌人和物品
 * 遵循开闭原则：不修改其他场景，独立运行
 */
import Phaser from 'phaser';
import { COLORS, COLOR_STR } from '../utils/colors';
import { ELEMENT_NAMES, ELEMENT_COLORS } from '../systems/ElementSystem';
import { GRADE_NAMES, GRADE_COLORS, TREASURE_POOL } from '../systems/TreasureSystem';
import { ENEMY_DEFS, EnemyKind } from '../entities/Enemy';
import { ENVOY_CONFIGS } from '../entities/Envoy';

interface CodexEntry {
  id: string;
  name: string;
  category: 'enemy' | 'item';
  icon: () => void;
  details: string[];
}

export class CodexScene extends Phaser.Scene {
  private entries: CodexEntry[] = [];
  private selectedIndex = 0;
  private elements: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('Codex');
  }

  create(): void {
    this.buildEntries();
    this.drawList();
  }

  private buildEntries(): void {
    // 敌人图鉴
    const enemyKinds: EnemyKind[] = ['rabbit', 'snake', 'wolf', 'bat', 'boss'];
    for (const kind of enemyKinds) {
      const def = ENEMY_DEFS[kind];
      this.entries.push({
        id: 'enemy_' + kind,
        name: this.getEnemyName(kind),
        category: 'enemy',
        icon: () => {},
        details: [
          `种类：${this.getEnemyName(kind)}`,
          `五行：${ELEMENT_NAMES[def.element]}`,
          `生命：${def.hp}`,
          `伤害：${def.damage}`,
          `速度：${def.speed}`,
          `经验：${def.xp}`,
          `防御：${kind === 'boss' ? 8 : 3}`,
        ],
      });
    }
    // 弟子
    this.entries.push({
      id: 'disciple', name: '门派弟子', category: 'enemy', icon: () => {},
      details: ['种类：门派弟子（精英怪）', '五行：随机', '生命：200', '伤害：18', '防御：8', '经验：25', '特性：每5秒随机使用五行符箓', '掉落：人品法宝'],
    });
    // 老祖
    this.entries.push({
      id: 'ancestor', name: '宗门老祖', category: 'enemy', icon: () => {},
      details: ['种类：宗门老祖（BOSS）', '五行：随机', '生命：1000', '伤害：90', '防御：12', '经验：150', '特性：每3.5秒随机使用五行符箓', '掉落：地品法宝'],
    });
    // 神使
    const envoyElems = ['metal', 'wood', 'water', 'fire', 'earth'] as const;
    for (const el of envoyElems) {
      const cfg = ENVOY_CONFIGS[el];
      this.entries.push({
        id: 'envoy_' + el, name: cfg.name, category: 'enemy', icon: () => {},
        details: [
          `种类：${cfg.name}（天劫神使）`,
          `五行：${ELEMENT_NAMES[el]}`,
          `生命：${cfg.hp}`,
          `伤害：${cfg.damage}`,
          `防御：15`,
          `五行减伤：25%`,
          `同属性吸收：是`,
          `攻击方式：${this.getAttackTypeName(cfg.attackType)}`,
        ],
      });
    }
    // 神之手
    this.entries.push({
      id: 'godhand', name: '神之手', category: 'enemy', icon: () => {},
      details: ['种类：神之手（最终BOSS）', '五行：全', '生命：土神使×2', '伤害：40', '防御：30', '五行减伤：40%', '特性：5行能力轮流，1分钟后狂暴', '掉落：天品法宝'],
    });
    // 木行游龙
    this.entries.push({
      id: 'wooddragon', name: '木行游龙', category: 'enemy', icon: () => {},
      details: ['种类：木行游龙（神之手召唤）', '五行：木', '生命：300+时间×5', '伤害：20+时间×0.5', '防御：5', '特性：免疫木行和土行，冲撞攻击'],
    });

    // 物品图鉴 - 法宝
    for (const t of TREASURE_POOL) {
      this.entries.push({
        id: 'treasure_' + t.id, name: t.name, category: 'item', icon: () => {},
        details: [
          `名称：${t.name}`,
          `品级：${GRADE_NAMES[t.grade]}品`,
          `描述：${t.desc}`,
        ],
      });
    }
  }

  private getEnemyName(kind: EnemyKind): string {
    const names: Record<EnemyKind, string> = {
      rabbit: '妖兔', snake: '石蟒', wolf: '灵狼', bat: '妖蝠', boss: '妖兽统领',
    };
    return names[kind];
  }

  private getAttackTypeName(type: string): string {
    const names: Record<string, string> = {
      sword: '金行飞剑', talisman: '木行符箓连发', shotgun: '水行散弹', flame: '火行锥形火焰', pillar: '土行石柱',
    };
    return names[type] || type;
  }

  private drawList(): void {
    this.elements.forEach(e => e.destroy());
    this.elements = [];

    const W = this.scale.width;
    const H = this.scale.height;

    // 背景
    const bg = this.add.rectangle(W / 2, H / 2, W, H, 0x0a0e1a, 0.95);
    bg.setDepth(100);
    this.elements.push(bg);

    // 标题
    const title = this.add.text(W / 2, 30, '图  鉴', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '28px',
      color: '#ffd54f',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(101);
    this.elements.push(title);

    // 左侧列表
    const listX = 30;
    const listY = 70;
    const itemH = 24;
    const maxItems = Math.floor((H - 120) / itemH);
    const startIdx = Math.max(0, this.selectedIndex - Math.floor(maxItems / 2));

    for (let i = startIdx; i < Math.min(this.entries.length, startIdx + maxItems); i++) {
      const entry = this.entries[i];
      const y = listY + (i - startIdx) * itemH;
      const isSelected = i === this.selectedIndex;
      const categoryColor = entry.category === 'enemy' ? '#ff5252' : '#4dd0e1';

      const itemBg = this.add.rectangle(listX + 100, y + itemH / 2, 200, itemH - 2,
        isSelected ? 0x37474f : 0x1a2332, 0.9)
        .setStrokeStyle(isSelected ? 2 : 1, isSelected ? 0xffd54f : 0x37474f, 1);
      itemBg.setDepth(101).setInteractive({ useHandCursor: true });
      itemBg.on('pointerdown', () => {
        this.selectedIndex = i;
        this.drawList();
      });
      this.elements.push(itemBg);

      const text = this.add.text(listX, y, `[${entry.category === 'enemy' ? '敌' : '物'}] ${entry.name}`, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '13px',
        color: isSelected ? '#ffd54f' : categoryColor,
      }).setDepth(102);
      this.elements.push(text);
    }

    // 右侧详情
    const selected = this.entries[this.selectedIndex];
    if (selected) {
      const detailX = 280;
      const detailY = 70;

      // 详情背景
      const detailBg = this.add.rectangle(detailX + 200, H / 2, 420, H - 120, 0x1e2a44, 0.9)
        .setStrokeStyle(2, 0x4dd0e1, 0.5);
      detailBg.setDepth(101);
      this.elements.push(detailBg);

      // 详情标题
      const detailTitle = this.add.text(detailX, detailY, selected.name, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '22px',
        color: '#ffd54f',
        fontStyle: 'bold',
      }).setDepth(102);
      this.elements.push(detailTitle);

      // 详情内容
      const detailText = this.add.text(detailX, detailY + 40, selected.details.join('\n'), {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '14px',
        color: '#ffffff',
        lineSpacing: 8,
      }).setDepth(102);
      this.elements.push(detailText);
    }

    // 返回按钮
    const backBtn = this.add.text(W / 2, H - 30, '✕ 返回', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '18px',
      color: '#ff5252',
      fontStyle: 'bold',
      backgroundColor: '#37474f',
      padding: { x: 16, y: 6 },
    }).setOrigin(0.5).setDepth(101).setInteractive({ useHandCursor: true });
    backBtn.on('pointerdown', () => this.scene.start('Menu'));
    this.elements.push(backBtn);

    // 键盘导航
    this.input.keyboard?.once('keydown-UP', () => {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.drawList();
    });
    this.input.keyboard?.once('keydown-DOWN', () => {
      this.selectedIndex = Math.min(this.entries.length - 1, this.selectedIndex + 1);
      this.drawList();
    });
    this.input.keyboard?.once('keydown-ESC', () => this.scene.start('Menu'));
  }
}
