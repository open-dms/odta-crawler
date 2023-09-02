interface ODTAMetaData {
  dsCount: {
    [dsIRI: string]: { count: string; name: { [lang: string]: string } };
  };
  "page-size": number;
  sortSeed: string;
  total: number;
  "current-page": number;
}
