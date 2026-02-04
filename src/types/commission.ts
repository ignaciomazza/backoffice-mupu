export type CommissionScope = {
  sellerPct?: number | null;
  leaders?: Record<string, number>;
};

export type CommissionOverrides = {
  booking?: CommissionScope;
  currency?: Record<string, CommissionScope>;
  service?: Record<string, CommissionScope>;
};

export type CommissionLeader = {
  userId: number;
  pct: number;
  name?: string;
};

export type CommissionRule = {
  sellerPct: number;
  leaders: CommissionLeader[];
};
