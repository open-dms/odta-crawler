import { NodeObject } from "jsonld";

export interface ODTAMetaData {
  dsCount: {
    [dsIRI: string]: { count: string; name: { [lang: string]: string } };
  };
  "page-size": number;
  sortSeed: string;
  total: number;
  "current-page": number;
}

export interface ODTAItem extends NodeObject {
  meta: {
    entityName: string;
    lastQueryTime: number;
  };
}
