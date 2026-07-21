export type DashboardRecord = {
  id: string; name: string; planned: number | null; actual: number | null; region: string;
};

let sequence = 0;
export function dashboardRecord(overrides: Partial<DashboardRecord> = {}): DashboardRecord {
  sequence += 1;
  return {
    id: `qa-${sequence}`, name: `QA Outlet ${sequence}`, planned: 100, actual: 80,
    region: 'Test Region', ...overrides
  };
}

export const percentageBoundaries = [0, 34.99, 35, 49.99, 50, 64.99, 65, 79.99, 80, 100] as const;

export function paginatedRecords(count: number): DashboardRecord[] {
  return Array.from({ length: count }, (_, index) => dashboardRecord({ name: `Outlet ${index + 1}` }));
}
