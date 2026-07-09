/**
 * 存档系统 - 基于 localStorage
 * 肉鸽元进度：累计击杀、最高等级、解锁内容、最佳存活时间
 * 单次 run 数据不持久化（死亡即清空，符合肉鸽特性）
 */

const SAVE_KEY = 'lao_lei_save_v1';

export interface SaveData {
  /** 累计击杀妖兽数 */
  totalKills: number;
  /** 累计游玩次数 */
  totalRuns: number;
  /** 历史最高等级 */
  bestLevel: number;
  /** 历史最长存活时间（秒） */
  bestTime: number;
  /** 累计获得灵石 */
  totalGems: number;
  /** 解锁的升级 ID 列表（meta 解锁，初始可用） */
  unlockedUpgrades: string[];
  /** 上次存档时间戳 */
  lastSaved: number;
}

const DEFAULT_SAVE: SaveData = {
  totalKills: 0,
  totalRuns: 0,
  bestLevel: 0,
  bestTime: 0,
  totalGems: 0,
  unlockedUpgrades: [],
  lastSaved: 0,
};

export class SaveSystem {
  private static cache: SaveData | null = null;

  /** 读取存档（带缓存） */
  static load(): SaveData {
    if (this.cache) return this.cache;
    let data: SaveData = { ...DEFAULT_SAVE };
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // 合并默认值，防止旧存档字段缺失
        data = { ...DEFAULT_SAVE, ...parsed };
      }
    } catch (e) {
      console.warn('[SaveSystem] 读取存档失败，使用默认值', e);
    }
    this.cache = data;
    return this.cache;
  }

  /** 写入存档 */
  static save(data: Partial<SaveData>): void {
    const current = this.load();
    this.cache = { ...current, ...data, lastSaved: Date.now() };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.cache));
    } catch (e) {
      console.warn('[SaveSystem] 写入存档失败', e);
    }
  }

  /** 累加统计字段 */
  static addStats(stats: Partial<Pick<SaveData, 'totalKills' | 'totalRuns' | 'totalGems'>>): void {
    const cur = this.load();
    this.save({
      totalKills: cur.totalKills + (stats.totalKills ?? 0),
      totalRuns: cur.totalRuns + (stats.totalRuns ?? 0),
      totalGems: cur.totalGems + (stats.totalGems ?? 0),
    });
  }

  /** 更新最佳记录（取较大值） */
  static updateBest(level: number, time: number): void {
    const cur = this.load();
    this.save({
      bestLevel: Math.max(cur.bestLevel, level),
      bestTime: Math.max(cur.bestTime, time),
    });
  }

  /** 解锁升级 */
  static unlockUpgrade(id: string): void {
    const cur = this.load();
    if (!cur.unlockedUpgrades.includes(id)) {
      this.save({ unlockedUpgrades: [...cur.unlockedUpgrades, id] });
    }
  }

  /** 清空存档（调试用） */
  static reset(): void {
    this.cache = { ...DEFAULT_SAVE };
    localStorage.removeItem(SAVE_KEY);
  }
}
