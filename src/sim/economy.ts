import { RNG, clamp, uid } from '../core/rng';
import { GOODS } from '../data/goods';
import { BUILDING_BY_ID } from '../data/buildings';
import type { Business, Faction, Market, MarketGood, NPC, World } from '../core/types';

const MARKET_GOODS = [
  'berries', 'meat', 'fish', 'grain', 'bread', 'water', 'ale', 'wood', 'stone', 'clay',
  'iron', 'copper', 'gold', 'herbs', 'medicine', 'cloth', 'tools', 'weapons', 'pottery', 'salt'
];

export function createMarket(rng: RNG, faction: Faction): Market {
  const goods: Record<string, MarketGood> = {};
  for (const id of MARKET_GOODS) {
    const def = GOODS[id];
    goods[id] = {
      good: id,
      basePrice: def.basePrice,
      stock: rng.int(4, 60),
      demand: rng.int(10, 45)
    };
  }
  return {
    id: uid('mkt'),
    name: `${faction.adjective} market`,
    factionId: faction.id,
    position: {
      x: faction.capital.x + rng.range(-14, 14),
      z: faction.capital.z + rng.range(-14, 14)
    },
    goods,
    wealth: rng.int(60, 220)
  };
}

export function priceOf(market: Market, good: string): number {
  const entry = market.goods[good];
  if (!entry) return GOODS[good]?.basePrice ?? 1;
  const scarcity = clamp(1 + (entry.demand - entry.stock) / Math.max(18, entry.demand), 0.45, 4.2);
  return Math.max(0.5, Math.round(entry.basePrice * scarcity * 10) / 10);
}

export function updateMarket(world: World, market: Market, rng: RNG): void {
  const faction = world.factions.find((f) => f.id === market.factionId);
  const population = faction?.population ?? 10;
  const warFactor = (faction?.wars.length ?? 0) > 0 ? 1.35 : 1;
  const seasonFactor = world.season === 'Winter' ? 1.25 : world.season === 'Autumn' ? 1.1 : 1;
  for (const id of MARKET_GOODS) {
    const entry = market.goods[id];
    if (!entry) continue;
    entry.demand = clamp(entry.demand + rng.range(-2, 2) + population * 0.05, 2, 160);
    // Local production replenishes stock; consumption drains it.
    const produced = marketProduction(world, market.factionId, id);
    entry.stock = clamp(entry.stock + produced * 0.35 - entry.demand * 0.05 * warFactor * seasonFactor, 0, 300);
  }
  const trade = market.goods.bread.stock + market.goods.wood.stock + market.goods.tools.stock;
  market.wealth = Math.round(market.wealth * 0.98 + trade * 0.4 + (faction?.treasury ?? 0) * 0.01);
}

function marketProduction(world: World, factionId: string | null, good: string): number {
  let total = 0;
  for (const building of world.buildings) {
    if (building.factionId !== factionId || !building.built) continue;
    const def = BUILDING_BY_ID.get(building.defId);
    if (def?.produces && def.produces[good]) {
      total += def.produces[good] * (building.workers.length / Math.max(1, def.workers)) * 0.6;
    }
  }
  return total;
}

export function buyFromMarket(
  world: World, buyer: NPC, market: Market, good: string, quantity: number
): { ok: boolean; cost: number; reason?: string } {
  const entry = market.goods[good];
  if (!entry) return { ok: false, cost: 0, reason: 'Good not traded here' };
  if (entry.stock < quantity) return { ok: false, cost: 0, reason: 'Not enough stock' };
  const cost = Math.round(priceOf(market, good) * quantity * 10) / 10;
  if (buyer.money < cost) return { ok: false, cost, reason: 'Not enough coin' };
  buyer.money -= cost;
  buyer.inventory[good] = (buyer.inventory[good] ?? 0) + quantity;
  entry.stock -= quantity;
  entry.demand = clamp(entry.demand + quantity * 0.4, 0, 200);
  market.wealth += cost;
  return { ok: true, cost };
}

export function sellToMarket(
  world: World, seller: NPC, market: Market, good: string, quantity: number
): { ok: boolean; revenue: number; reason?: string } {
  const entry = market.goods[good];
  const have = seller.inventory[good] ?? 0;
  if (!entry) return { ok: false, revenue: 0, reason: 'Nobody here buys that' };
  if (have < quantity) return { ok: false, revenue: 0, reason: 'You do not carry that many' };
  const unit = priceOf(market, good) * 0.78;
  const revenue = Math.round(unit * quantity * 10) / 10;
  seller.money += revenue;
  seller.inventory[good] = have - quantity;
  if (seller.inventory[good] <= 0) delete seller.inventory[good];
  entry.stock += quantity;
  entry.demand = clamp(entry.demand - quantity * 0.5, 0, 200);
  market.wealth = Math.max(0, market.wealth - revenue);
  return { ok: true, revenue };
}

export function openBusiness(world: World, owner: NPC, buildingId: string, name: string): Business | null {
  const building = world.buildings.find((b) => b.id === buildingId);
  if (!building) return null;
  const business: Business = {
    id: uid('biz'),
    name,
    buildingId,
    ownerId: owner.id,
    factionId: owner.factionId,
    employees: [],
    inventory: { ...building.inventory },
    prices: {},
    revenue: 0,
    expenses: 0,
    priceMarkup: 1,
    open: true
  };
  world.businesses.push(business);
  building.businessId = business.id;
  building.ownerId = owner.id;
  owner.businessId = business.id;
  return business;
}

export function hireEmployee(world: World, business: Business, candidate: NPC, wage: number): boolean {
  if (business.employees.length >= 6) return false;
  if (business.employees.includes(candidate.id)) return false;
  business.employees.push(candidate.id);
  candidate.businessId = business.id;
  candidate.occupation = 'employee';
  candidate.history.push(`Hired by ${business.name} at ${wage} coin/day.`);
  return true;
}

export function fireEmployee(world: World, business: Business, employeeId: string): void {
  business.employees = business.employees.filter((id) => id !== employeeId);
  const npc = world.npcs.get(employeeId);
  if (npc) {
    npc.businessId = null;
    npc.occupation = 'unemployed';
    npc.history.push(`Dismissed from ${business.name}.`);
  }
}

/** Player properties: rent in, wages/maintenance/tax out. */
export interface LedgerLine {
  label: string;
  amount: number;
  kind: 'income' | 'expense';
}

export interface Ledger {
  lines: LedgerLine[];
  income: number;
  expenses: number;
  net: number;
  propertyValue: number;
}

export function playerLedger(world: World, player: NPC): Ledger {
  const lines: LedgerLine[] = [];
  const properties = world.buildings.filter((b) => b.ownerId === player.id);
  let propertyValue = 0;
  for (const property of properties) {
    const def = BUILDING_BY_ID.get(property.defId);
    propertyValue += estimateValue(property.defId);
    if (def?.rentable && property.tenantId) {
      lines.push({ label: `Rent — ${property.name}`, amount: property.rent, kind: 'income' });
    }
    if (property.built) {
      lines.push({ label: `Maintenance — ${property.name}`, amount: def?.maintenance ?? 1, kind: 'expense' });
    }
    for (const workerId of property.workers) {
      const worker = world.npcs.get(workerId);
      if (worker?.alive) lines.push({ label: `Wages — ${worker.name}`, amount: 1.2, kind: 'expense' });
    }
  }
  for (const business of world.businesses.filter((b) => b.ownerId === player.id)) {
    lines.push({ label: `Trade — ${business.name}`, amount: Math.round(business.revenue * 0.1), kind: 'income' });
  }
  const income = lines.filter((l) => l.kind === 'income').reduce((s, l) => s + l.amount, 0);
  const expenses = lines.filter((l) => l.kind === 'expense').reduce((s, l) => s + l.amount, 0);
  return {
    lines,
    income: Math.round(income * 10) / 10,
    expenses: Math.round(expenses * 10) / 10,
    net: Math.round((income - expenses) * 10) / 10,
    propertyValue
  };
}

export function estimateValue(defId: string): number {
  const def = BUILDING_BY_ID.get(defId);
  if (!def) return 0;
  return Object.values(def.cost).reduce((sum, n) => sum + n * 3, 0);
}

/** Daily rent collection with debt, disputes and eviction. */
export function collectRents(world: World, rng: RNG): void {
  for (const building of world.buildings) {
    if (!building.tenantId) continue;
    const tenant = world.npcs.get(building.tenantId);
    if (!tenant?.alive) {
      building.tenantId = null;
      continue;
    }
    const rent = building.rent;
    if (tenant.money >= rent) {
      tenant.money -= rent;
      const owner = building.ownerId ? world.npcs.get(building.ownerId) : null;
      if (owner?.alive) owner.money += rent;
    } else {
      tenant.rentDue += rent;
      const owner = building.ownerId ? world.npcs.get(building.ownerId) : null;
      if (owner?.alive) {
        const relationship = owner.relationships[tenant.id] ?? { affinity: 0, trust: 0, fear: 0, lastInteractionTick: world.tick };
        relationship.affinity = clamp(relationship.affinity - 12, -100, 100);
        relationship.trust = clamp(relationship.trust - 15, -100, 100);
        owner.relationships[tenant.id] = relationship;
      }
      tenant.history.push(`Fell behind on rent for ${building.name}.`);
      if (tenant.rentDue > rent * 3 && rng.chance(0.5)) {
        building.tenantId = null;
        tenant.homeId = null;
        tenant.rentDue = 0;
        tenant.needs.happiness = clamp(tenant.needs.happiness - 20, 0, 100);
        tenant.history.push(`Evicted from ${building.name} for unpaid rent.`);
        world.history.unshift({
          id: uid('hist'), tick: world.tick, day: world.day, type: 'eviction',
          text: `${tenant.name} was evicted from ${building.name}.`,
          participants: [tenant.id], factionId: tenant.factionId, location: 'settlement', significant: false
        });
      }
    }
  }
}

/** Daily business operations: production, wages, revenue, failure. */
export function runBusinesses(world: World, rng: RNG): void {
  for (const business of world.businesses) {
    const building = world.buildings.find((b) => b.id === business.buildingId);
    if (!building || !business.open) continue;
    const def = BUILDING_BY_ID.get(building.defId);
    const staff = business.employees.map((id) => world.npcs.get(id)).filter((n): n is NPC => !!n && n.alive);
    const wageCost = staff.length * 1.2;
    let produced = 0;
    if (def?.produces) {
      for (const [good, amount] of Object.entries(def.produces)) {
        const output = amount * (staff.length / Math.max(1, def.workers)) * 0.8;
        business.inventory[good] = (business.inventory[good] ?? 0) + output;
        produced += output;
      }
    }
    const market = world.markets.find((m) => m.factionId === building.factionId);
    let revenue = 0;
    if (market) {
      for (const [good, qty] of Object.entries(business.inventory)) {
        if (qty < 1) continue;
        const sellable = Math.min(qty, 4);
        revenue += priceOf(market, good) * sellable * 0.55;
        business.inventory[good] = qty - sellable;
      }
    }
    const upkeep = def?.maintenance ?? 1;
    business.revenue += revenue;
    business.expenses += wageCost + upkeep;
    const owner = world.npcs.get(business.ownerId);
    if (owner?.alive) {
      const profit = revenue - wageCost - upkeep;
      owner.money = Math.max(0, owner.money + profit);
      for (const employee of staff) employee.money += 0.85;
      if (profit < 0 && rng.chance(0.05)) {
        business.open = false;
        owner.history.push(`${business.name} closed after sustained losses.`);
        world.history.unshift({
          id: uid('hist'), tick: world.tick, day: world.day, type: 'business-failure',
          text: `${business.name} closed its doors, unable to cover its costs.`,
          participants: [owner.id], factionId: owner.factionId, location: 'settlement', significant: false
        });
      }
    }
  }
}
