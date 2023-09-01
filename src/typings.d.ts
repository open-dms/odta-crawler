interface Entity {
  name: string;
  ds: string;
  currentPage?: number;
  sortSeed?: string;
  pageSize?: number;
  total?: number;
}
