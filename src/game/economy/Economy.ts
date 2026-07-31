type Listener = (state: EconomyState) => void;

export interface EconomyState {
  gold: number;
  lives: number;
  wave: number;
}

/** Shared economy for local co-op: both players draw from the same pool. */
export class Economy {
  private state: EconomyState;
  private listeners = new Set<Listener>();

  constructor(startingGold: number, startingLives: number) {
    this.state = { gold: startingGold, lives: startingLives, wave: 0 };
  }

  get gold() {
    return this.state.gold;
  }
  get lives() {
    return this.state.lives;
  }
  get wave() {
    return this.state.wave;
  }

  canAfford(cost: number): boolean {
    return this.state.gold >= cost;
  }

  spend(cost: number): boolean {
    if (!this.canAfford(cost)) return false;
    this.state.gold -= cost;
    this.notify();
    return true;
  }

  earn(amount: number) {
    this.state.gold += amount;
    this.notify();
  }

  loseLife(amount = 1) {
    this.state.lives = Math.max(0, this.state.lives - amount);
    this.notify();
  }

  setWave(wave: number) {
    this.state.wave = wave;
    this.notify();
  }

  get isGameOver(): boolean {
    return this.state.lives <= 0;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    for (const l of this.listeners) l({ ...this.state });
  }
}
