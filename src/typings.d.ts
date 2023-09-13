interface Entity {
  name: string;
  ds: string;
  queue: Array<number>;
  head?: number;
  sortSeed?: string;
  pageSize?: number;
  total?: number;
}
