export type Nullable = number | null;
export interface SnapshotStatus {
  ready: boolean;
  asOf?: string;
  completedAt?: string;
  generation?: string;
  schedule?: string;
  nextRunAt?: string;
  syncing: boolean;
  progress?: string;
  lastError?: string | null;
  readMode: "local-only";
}
export interface Store {
  id: string;
  name: string;
  regionId: string;
  regionName: string;
  province: string;
  provinceCode?: string;
  city: string;
  status?: string;
  lon?: number;
  lat?: number;
}
export interface Fact {
  date: string;
  storeId: string;
  channel: string;
  revenue: Nullable;
  orders: Nullable;
}
export interface Target {
  date: string;
  storeId: string;
  revenue?: Nullable;
  orders?: Nullable;
}
export interface Capacity {
  date: string;
  storeId: string;
  tableUses: Nullable;
  availableTables: Nullable;
}
export interface Activity {
  id: string;
  name: string;
  type: string;
  start: string;
  end: string;
  storeIds: string[];
  coverageLabel?: string;
  attributionMethod?: string;
  dateBasis?: string;
  reportedLabel?: string;
  reportedAmount?: Nullable;
  cost?: Nullable;
  attributedMargin?: Nullable;
  attributedRevenueIncrement?: Nullable;
  daily: {
    date: string;
    storeId: string;
    reportedAmount?: Nullable;
    reportedOrders?: Nullable;
    issued?: Nullable;
    redeemed?: Nullable;
    orders?: Nullable;
    revenue?: Nullable;
  }[];
}
export interface MemberSummary {
  start: string;
  end: string;
  storeIds: string[];
  total?: Nullable;
  newCustomers?: Nullable;
  returningCustomers?: Nullable;
  repeatNumerator?: Nullable;
  repeatDenominator?: Nullable;
  balance?: Nullable;
  newMembers?: Nullable;
  memberAmount?: Nullable;
  memberVisits?: Nullable;
  recharge?: Nullable;
  rechargePrevious?: Nullable;
  rechargeYear?: Nullable;
  registeredNewMembers?: Nullable;
  activeCustomers?: Nullable;
  unclassifiedCustomers?: Nullable;
  unassignedMembers?: Nullable;
  balanceLabel?: string;
  scopeDefinition?: string;
  definition?: string;
  amountLabel?: string;
  visitsLabel?: string;
}
export interface DishFact {
  date: string;
  storeId: string;
  id: string;
  name: string;
  quantity: Nullable;
  revenue: Nullable;
  cost: Nullable;
  signature?: boolean;
  isNew?: boolean;
}
export interface Dataset {
  schemaVersion: 1;
  meta: {
    mode: "demo" | "real";
    source: string;
    title: string;
    revenueLabel: string;
    revenueDefinition: string;
    timezone: "Asia/Shanghai";
    generatedAt: string;
    coverage: { start: string; end: string };
    warnings: string[];
    freshness?: string;
    expectedChannels?: string[];
    coveragePolicy?: string;
    snapshot?: SnapshotStatus;
  };
  stores: Store[];
  facts: Fact[];
  overviewFacts?: Omit<Fact, "channel">[];
  comparisons?: Record<
    string,
    {
      start: string;
      end: string;
      facts: Fact[];
      overviewFacts: Omit<Fact, "channel">[];
    }
  >;
  targets: Target[];
  capacity: Capacity[];
  activities: Activity[];
  members: MemberSummary[];
  dishes: DishFact[];
}
export interface Filters {
  start: string;
  end: string;
  compareMode: "last-month" | "previous-period";
  period?: "month" | "range";
  regionId: string;
  province: string;
  city: string;
  storeId: string;
}
export interface MapAsset {
  key: string;
  url: string;
  source: string;
  license: string;
  reviewNumber: string;
  verified: boolean;
  fullExtentConfirmed: boolean;
  expectedNames?: string[];
  nameMap?: Record<string, string>;
}
